import "../styles/global.css";
import { createRoot } from "react-dom/client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  CircleStop,
  Clipboard,
  Download,
  FileText,
  History,
  Mic2,
  Play,
  Plus,
  Save,
  Settings,
  ShieldCheck,
  Sparkles,
  TextSearch
} from "lucide-react";
import { AppHeader } from "../components/AppHeader";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { EmptyState } from "../components/EmptyState";
import { FormattedMarkdown } from "../components/FormattedMarkdown";
import { Notice } from "../components/Notice";
import { ProgressBar } from "../components/ProgressBar";
import { StatusBadge } from "../components/StatusBadge";
import { Toggle } from "../components/Toggle";
import { OpenWebuiClient } from "../services/openWebuiClient";
import { getLocalStorage, setLocalStorage } from "../services/chromeStorage";
import {
  getRecordingStatus,
  resetRecording,
  startRecording,
  stopRecording,
  startMicPreview,
  stopMicPreview,
  type RecordedAudioPayload,
  type RecordingSnapshot,
  type RecordingStatus
} from "../services/recordingService";
import {
  clearCurrentMeetingId,
  clearRecordingDraft,
  getCurrentMeetingId,
  getMeeting,
  getRecordingDraft,
  saveMeeting,
  saveRecordingDraft,
  setCurrentMeetingId
} from "../services/meetingStorage";
import { getBackgroundProcessingState, startBackgroundSummary, startBackgroundTranscription } from "../services/processingService";
import { clearProcessingState, LIVE_TRANSCRIPT_KEY, PROCESSING_STATE_KEY } from "../services/processingStorage";
import { syncMeetingToOpenWebuiIfEnabled } from "../services/openWebuiSync";
import { getSettings } from "../services/settingsStorage";
import type { ExtensionSettings } from "../types/settings";
import type { MeetingRecord, MeetingStatus, StructuredMeetingSummary } from "../types/meeting";
import type { ProcessingState } from "../types/processing";
import type { CombinedTranscript, LiveTranscriptUpdate } from "../types/transcript";
import { formatDuration } from "../utils/formatDuration";
import { getErrorMessage } from "../utils/errors";
import { downloadMarkdown } from "../utils/downloadMarkdown";
import { setLocale, t } from "../services/i18n";

type ResultView = "summary" | "transcript";
type WorkflowState = "done" | "active" | "waiting";

function Popup() {
  const [settings, setSettings] = useState<ExtensionSettings | null>(null);
  const [includeMic, setIncludeMic] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [startedAt, setStartedAt] = useState<number | undefined>();
  const [duration, setDuration] = useState(0);
  const [micLevel, setMicLevel] = useState(0);
  const [micTrackActive, setMicTrackActive] = useState(false);
  const [micError, setMicError] = useState("");
  const [recording, setRecording] = useState<RecordedAudioPayload | null>(null);
  const [transcript, setTranscript] = useState<CombinedTranscript | null>(null);
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState<"recording" | "transcribing" | "summarizing" | "saving" | null>(null);
  const [connection, setConnection] = useState<"unknown" | "checking" | "ok" | "failed">("unknown");
  const [processingState, setProcessingState] = useState<ProcessingState | null>(null);
  const [liveTranscript, setLiveTranscript] = useState<LiveTranscriptUpdate | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [savedMeeting, setSavedMeeting] = useState<MeetingRecord | null>(null);
  const [copied, setCopied] = useState(false);
  const [resultView, setResultView] = useState<ResultView>("summary");
  const copyTimer = useRef<ReturnType<typeof setTimeout>>();
  const includeMicInitialized = useRef(false);
  const recordingStatusRef = useRef<RecordingStatus>("idle");

  const client = useMemo(() => (settings ? new OpenWebuiClient(settings) : null), [settings]);
  const liveTranscriptionEnabled = settings?.liveTranscriptionEnabled ?? false;

  useEffect(() => {
    getSettings()
      .then((s) => {
        setLocale(s.locale);
        setSettings(s);
      })
      .catch((loadError) => setError(getErrorMessage(loadError)));

    restoreCurrentMeeting();
    restoreRecordingDraft();
    void refreshProcessingState();

    getRecordingStatus()
      .then((snapshot) => applyRecordingSnapshot(snapshot))
      .catch(() => undefined);

    getLocalStorage("includeMic").then((result) => {
      setIncludeMic(Boolean(result.includeMic));
      includeMicInitialized.current = true;
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (typeof chrome === "undefined" || !chrome.storage?.onChanged) {
      return;
    }

    const listener = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
      if (areaName !== "local") {
        return;
      }
      if (changes[PROCESSING_STATE_KEY]) {
        void refreshProcessingState(changes[PROCESSING_STATE_KEY].newValue as ProcessingState | undefined);
      }
      if (changes[LIVE_TRANSCRIPT_KEY]) {
        setLiveTranscript(changes[LIVE_TRANSCRIPT_KEY].newValue as LiveTranscriptUpdate | null);
      }
    };

    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  useEffect(() => {
    if (!isRecording || !liveTranscriptionEnabled) {
      setLiveTranscript(null);
      return;
    }

    const poll = async () => {
      try {
        const result = await getLocalStorage(LIVE_TRANSCRIPT_KEY);
        const update = result[LIVE_TRANSCRIPT_KEY] as LiveTranscriptUpdate | undefined;
        if (update) {
          setLiveTranscript(update);
        }
      } catch { /* ignore */ }
    };
    void poll();
    const interval = setInterval(poll, 2000);
    return () => clearInterval(interval);
  }, [isRecording, liveTranscriptionEnabled]);

  useEffect(() => {
    if (!isRecording || !startedAt) {
      return;
    }

    const interval = window.setInterval(() => {
      setDuration(Math.round((Date.now() - startedAt) / 1000));
    }, 500);
    return () => window.clearInterval(interval);
  }, [isRecording, startedAt]);

  useEffect(() => {
    if (!isRecording && !includeMic) {
      setMicLevel(0);
      setMicTrackActive(false);
      setMicError("");
      return;
    }

    let isCurrent = true;
    const refreshMicLevel = async () => {
      try {
        const snapshot = await getRecordingStatus();
        if (!isCurrent) {
          return;
        }

        applyRecordingSnapshot(snapshot);
        if (snapshot.micError || snapshot.error) {
          setMessage(snapshot.micError ?? snapshot.error ?? "");
        }
      } catch {
        if (isCurrent) {
          setMicLevel(0);
          setMicTrackActive(false);
          setMicError("");
        }
      }
    };

    void refreshMicLevel();
    const interval = window.setInterval(refreshMicLevel, 250);
    return () => {
      isCurrent = false;
      window.clearInterval(interval);
    };
  }, [isRecording, includeMic]);

  useEffect(() => {
    if (!isRecording) {
      if (includeMic) {
        startMicPreview()
          .then((snapshot) => {
            setMicError(snapshot.micError ?? "");
            setMicLevel(snapshot.micLevel);
            setMicTrackActive(snapshot.micTrackActive);
          })
          .catch((error) => setMicError(getErrorMessage(error)));
      } else {
        stopMicPreview().catch(() => {});
      }
    }
  }, [includeMic, isRecording]);

  useEffect(() => {
    if (!includeMicInitialized.current) {
      return;
    }
    void setLocalStorage({ includeMic }).catch(() => undefined);
  }, [includeMic]);

  useEffect(() => {
    if (!client) {
      return;
    }

    let isCurrent = true;
    setConnection("checking");
    client
      .testConnection()
      .then((result) => {
        if (!isCurrent) {
          return;
        }
        setConnection(result.ok ? "ok" : "failed");
      })
      .catch(() => {
        if (!isCurrent) {
          return;
        }
        setConnection("failed");
      });

    return () => {
      isCurrent = false;
    };
  }, [client]);

  useEffect(() => {
    if (summary) {
      setResultView("summary");
    } else if (transcript?.text) {
      setResultView("transcript");
    }
  }, [summary, transcript?.text]);

  useEffect(() => {
    return () => clearTimeout(copyTimer.current);
  }, []);

  async function restoreCurrentMeeting() {
    try {
      const currentId = await getCurrentMeetingId();
      if (!currentId) {
        return;
      }

      const currentMeeting = await getMeeting(currentId);
      if (!currentMeeting) {
        await clearCurrentMeetingId();
        return;
      }

      setSavedMeeting(currentMeeting);
      setTranscript(currentMeeting.transcript);
      setSummary(currentMeeting.summary);
      setDuration(currentMeeting.durationSeconds);
      setMessage(t("restored.last.draft"));
    } catch (restoreError) {
      setError(getErrorMessage(restoreError));
    }
  }

  async function applyMeeting(meeting: MeetingRecord) {
    setSavedMeeting(meeting);
    setTranscript(meeting.transcript);
    setSummary(meeting.summary);
    setDuration(meeting.durationSeconds);
  }

  async function restoreRecordingDraft() {
    try {
      const draft = await getRecordingDraft();
      if (!draft) {
        return;
      }

      setRecording(draft);
      setDuration(draft.durationSeconds);
      setIncludeMic(Boolean(draft.micAudioDataUrl));
      setMessage(t("restored.audio.draft"));
    } catch (restoreError) {
      setError(getErrorMessage(restoreError));
    }
  }

  function applyRecordingSnapshot(snapshot: RecordingSnapshot) {
    const previousStatus = recordingStatusRef.current;
    recordingStatusRef.current = snapshot.status;

    setIsRecording(snapshot.status === "recording" || snapshot.status === "stopping");
    setStartedAt(snapshot.startedAt);
    setMicLevel(snapshot.micLevel);
    setMicTrackActive(snapshot.micTrackActive);
    setMicError(snapshot.micError ?? "");

    if (snapshot.status === "stopping") {
      setBusy("recording");
    } else if (snapshot.status === "idle" && previousStatus === "stopping") {
      setBusy((current) => (current === "recording" ? null : current));
      void restoreCurrentMeeting();
      void restoreRecordingDraft();
    }

    if (snapshot.error) {
      setMessage(snapshot.error);
    }
  }

  async function refreshProcessingState(nextState?: ProcessingState) {
    try {
      const state = nextState ?? (await getBackgroundProcessingState());
      setProcessingState(state);

      if (state.status === "idle") {
        return;
      }

      if (state.status === "error") {
        setMessage("");
        setError(state.error ?? state.message);
        return;
      }

      if (state.status === "transcribing" || state.status === "summarizing") {
        setMessage("");
      } else {
        setMessage(state.message);
      }
      if ((state.status === "complete" || state.status === "transcribing" || state.status === "summarizing") && state.meetingId) {
        const meeting = await getMeeting(state.meetingId);
        if (meeting) {
          await applyMeeting(meeting);
        }
      }
    } catch (processingError) {
      setError(getErrorMessage(processingError));
    }
  }

  async function handleStart() {
    setBusy("recording");
    setError("");
    try {
      let microphoneDeviceId: string | undefined;
      if (includeMic) {
        setMessage(t("requesting.mic.permission"));
        microphoneDeviceId = await requestMicrophoneAccess();
      }

      setMessage("");
      setMicError("");
      setRecording(null);
      setTranscript(null);
      setSummary("");
      setSavedMeeting(null);
      setLiveTranscript(null);
      await clearCurrentMeetingId();
      await clearRecordingDraft();
      await clearProcessingState();
      setProcessingState(null);
      const snapshot = await startRecording(includeMic, microphoneDeviceId);
      applyRecordingSnapshot(snapshot);
      setIncludeMic(snapshot.includeMic);
      setDuration(0);
      if (snapshot.micError || snapshot.error) {
        setMessage(snapshot.micError ?? snapshot.error ?? "");
      }
    } catch (startError) {
      setError(getErrorMessage(startError));
    } finally {
      setBusy(null);
    }
  }

  async function handleOpenSavedMeeting() {
    if (!savedMeeting) {
      return;
    }

    await chrome.tabs.create({ url: chrome.runtime.getURL(`src/pages/detail.html?id=${savedMeeting.id}`) });
  }

  async function handlePrepareNewRecording() {
    setBusy("recording");
    setError("");
    try {
      await resetRecording();
      await clearRecordingDraft();
      await clearCurrentMeetingId();
      await clearProcessingState();
      setIsRecording(false);
      recordingStatusRef.current = "idle";
      setStartedAt(undefined);
      setMicLevel(0);
      setMicTrackActive(false);
      setMicError("");
      setDuration(0);
      setRecording(null);
      setTranscript(null);
      setSummary("");
      setSavedMeeting(null);
      setLiveTranscript(null);
      setProcessingState(null);
      setResultView("summary");
      setMessage(t("new.recording.ready"));
    } catch (resetError) {
      setError(getErrorMessage(resetError));
    } finally {
      setBusy(null);
    }
  }

  async function handleDiscardRecordingDraft() {
    if (!recording || transcript?.text) {
      return;
    }

    await handlePrepareNewRecording();
  }

  async function requestMicrophoneAccess(): Promise<string | undefined> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(t("microphone.not.available"));
    }

    let permissionStream: MediaStream | undefined;
    try {
      permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      return permissionStream.getAudioTracks()[0]?.getSettings().deviceId;
    } catch (permissionError) {
      throw new Error(`${t("microphone.access.blocked")} ${getErrorMessage(permissionError)}`);
    } finally {
      permissionStream?.getTracks().forEach((track) => track.stop());
    }
  }

  async function handleStop() {
    setBusy("recording");
    setError("");
    try {
      const payload = await stopRecording();
      setRecording(payload);
      setIsRecording(false);
      setStartedAt(undefined);
      setMicLevel(0);
      setMicTrackActive(false);
      setMicError("");
      setDuration(payload.durationSeconds);
      recordingStatusRef.current = "idle";
      await saveStoppedRecording(payload);
    } catch (stopError) {
      setError(getErrorMessage(stopError));
    } finally {
      setBusy(null);
    }
  }

  async function handleReset() {
    setBusy("recording");
    setError("");
    try {
      await resetRecording();
      await clearRecordingDraft();
      await clearCurrentMeetingId();
      await clearProcessingState();
      setIsRecording(false);
      recordingStatusRef.current = "idle";
      setStartedAt(undefined);
      setMicLevel(0);
      setMicTrackActive(false);
      setMicError("");
      setDuration(0);
      setRecording(null);
      setTranscript(null);
      setSummary("");
      setSavedMeeting(null);
      setLiveTranscript(null);
      setProcessingState(null);
      setMessage(t("recorder.reset"));
    } catch (resetError) {
      setError(getErrorMessage(resetError));
    } finally {
      setBusy(null);
    }
  }

  async function handleTranscribe() {
    if (!recording) {
      return;
    }

    setBusy("transcribing");
    setError("");
    try {
      const state = await startBackgroundTranscription();
      setProcessingState(state);
      setMessage("");
    } catch (transcribeError) {
      setError(getErrorMessage(transcribeError));
    } finally {
      setBusy(null);
    }
  }

  async function handleSummarize() {
    if (!transcript?.text) {
      return;
    }

    setBusy("summarizing");
    setError("");
    try {
      const state = await startBackgroundSummary();
      setProcessingState(state);
      setMessage("");
    } catch (summarizeError) {
      setError(getErrorMessage(summarizeError));
    } finally {
      setBusy(null);
    }
  }

  async function saveStoppedRecording(payload: RecordedAudioPayload) {
    try {
      await saveRecordingDraft(payload);

      if (settings) {
        const persistedMeeting = await getPersistedStoppedRecordingMeeting(payload);
        const meeting = buildMeetingRecord({
          settings,
          recording: payload,
          transcript: emptyTranscript(),
          summary: "",
          structuredSummary: undefined,
          previous: persistedMeeting ?? savedMeeting,
          status: "recorded",
          error: ""
        });
        await saveMeeting(meeting);
        await setCurrentMeetingId(meeting.id);
        setSavedMeeting(meeting);
      }

      setMessage(t("recording.captured"));
    } catch (saveError) {
      setMessage(t("recording.captured.keep"));
      setError(`${t("could.not.save.draft")} ${getErrorMessage(saveError)}`);
    }
  }

  async function getPersistedStoppedRecordingMeeting(payload: RecordedAudioPayload): Promise<MeetingRecord | null> {
    const currentId = await getCurrentMeetingId();
    if (!currentId) {
      return null;
    }

    const currentMeeting = await getMeeting(currentId);
    if (!currentMeeting || currentMeeting.status !== "recorded") {
      return null;
    }

    const createdAt = Date.parse(currentMeeting.createdAt);
    return Number.isFinite(createdAt) && Math.abs(createdAt - payload.startedAt) < 1000 ? currentMeeting : null;
  }

  async function handleSave() {
    if (!settings || !transcript) {
      return;
    }

    setBusy("saving");
    setError("");
    try {
      const meeting = buildMeetingRecord({
        settings,
        recording,
        transcript,
        summary,
        structuredSummary: savedMeeting?.structuredSummary,
        previous: savedMeeting,
        status: summary ? "summarized" : "transcribed",
        error
      });
      const syncResult = await syncMeetingToOpenWebuiIfEnabled(meeting, settings);
      await saveMeeting(syncResult.meeting);
      await setCurrentMeetingId(syncResult.meeting.id);
      setSavedMeeting(syncResult.meeting);
      setMessage(
        syncResult.warning
          ? `${t("meeting.saved.sync.warning")} ${syncResult.warning}`
          : syncResult.synced
            ? t("meeting.saved.synced")
            : t("meeting.saved")
      );
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setBusy(null);
    }
  }

  async function handleCopySummary() {
    const text = summary.trim();
    if (!text) {
      setMessage(t("no.summary.to.copy"));
      return;
    }

    setError("");
    try {
      await navigator.clipboard.writeText(text);
      setMessage(t("summary.copied"));
      setCopied(true);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1500);
    } catch (copyError) {
      setError(`${t("could.not.copy.summary")} ${getErrorMessage(copyError)}`);
    }
  }

  async function handlePrimaryAction() {
    if (isRecording) {
      await handleStop();
      return;
    }
    if (!recording && !transcript?.text) {
      await handleStart();
      return;
    }
    if (recording && !transcript?.text) {
      await handleTranscribe();
      return;
    }
    if (transcript?.text && !summary.trim()) {
      await handleSummarize();
      return;
    }
    await handlePrepareNewRecording();
  }

  const displayDuration = isRecording && startedAt ? Math.round((Date.now() - startedAt) / 1000) : duration;
  const micLevelPercent = Math.round(micLevel * 100);
  const micMeterLabel = !includeMic
    ? t("mic.off")
    : micError
      ? t("mic.unavailable")
      : !micTrackActive
      ? t("mic.no.stream")
      : micLevel > 0.06
        ? t("mic.receiving")
        : t("mic.live.low");
  const canTranscribe = Boolean(recording && !isRecording);
  const canSummarize = Boolean(transcript?.text);
  const canSave = Boolean(transcript?.text);
  const isTranscribing = processingState?.status === "transcribing";
  const isSummarizing = processingState?.status === "summarizing";
  const isBackgroundBusy = isTranscribing || isSummarizing;
  const busyLabel = busy ? t(`busy.${busy}`) : "";
  const connectionLabel =
    connection === "ok"
      ? t("backend.online")
      : connection === "failed"
        ? t("backend.offline")
        : connection === "checking"
          ? t("backend.checking")
          : t("backend.unknown");
  const connectionTone = connection === "ok" ? "success" : connection === "failed" ? "danger" : "warning";
  const primary = getPrimaryAction({
    isRecording,
    recording,
    hasTranscript: Boolean(transcript?.text),
    hasSummary: Boolean(summary.trim())
  });
  const primaryBusyLabel = getPrimaryBusyLabel({ busy, busyLabel, processingState });
  const primaryDisabled =
    busy !== null ||
    isBackgroundBusy ||
    (!isRecording && !recording && Boolean(transcript?.text) && !summary.trim() && !canSummarize);

  const workflow = [
    { label: t("workflow.record"), state: getWorkflowState(Boolean(recording || transcript?.text || isRecording), isRecording) },
    { label: t("workflow.transcribe"), state: getWorkflowState(Boolean(transcript?.text), isTranscribing) },
    { label: t("workflow.review"), state: getWorkflowState(Boolean(transcript?.text), Boolean(transcript?.text && !summary && !isSummarizing)) },
    { label: t("workflow.summarize"), state: getWorkflowState(Boolean(summary), isSummarizing) },
    { label: t("workflow.export"), state: getWorkflowState(Boolean(savedMeeting && summary), Boolean(summary && savedMeeting)) }
  ];

  return (
    <main className="popup-shell">
      <AppHeader
        compact
        title={t("app.title")}
        description={t("app.subtitle")}
        actions={<StatusBadge label={connectionLabel} tone={connectionTone} dot />}
      />

      <div className="grid gap-3.5">
        <Card raised className="grid gap-3">
          <div className="rounded-[12px] bg-[#17342f] p-4 text-white">
            <div className="flex items-start justify-between gap-3">
              <div className="grid gap-1">
                <div className="flex items-center gap-2 text-[12px] font-semibold text-[#c8ddd8]">
                  <ShieldCheck size={15} />
                  <span>{t("privacy.local.badge")}</span>
                </div>
                <div className="font-mono text-[38px] font-semibold leading-none tracking-normal" aria-label={t("recording.duration")}>
                  {formatDuration(displayDuration)}
                </div>
              </div>
              <StatusBadge label={isRecording ? t("recording") : t("idle")} tone={isRecording ? "danger" : "success"} dot />
            </div>
            <p className="mt-3 max-w-[36ch] text-[13px] leading-[1.45] text-[#dcebe8]">{t("privacy.local.description")}</p>
            <div className="mt-4">
              <ProgressBar value={isRecording ? (displayDuration % 60) * 1.67 : recording ? 100 : 0} />
            </div>
          </div>

          <div className="grid gap-3">
            <Button
              variant={primary.variant}
              size="lg"
              fullWidth
              icon={primary.icon}
              loading={busy !== null || isBackgroundBusy}
              onClick={handlePrimaryAction}
              disabled={primaryDisabled}
              aria-label={primary.label}
            >
              {busy || isBackgroundBusy ? primaryBusyLabel : primary.label}
            </Button>

            <Toggle
              label={t("record.microphone")}
              description={t("record.microphone.description")}
              checked={includeMic}
              disabled={isRecording}
              onChange={setIncludeMic}
            />

            {includeMic ? (
              <div className={`rounded-[12px] border border-border bg-surface p-3 ${isRecording && micTrackActive ? "mic-meter active" : "mic-meter"}`}>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Mic2 size={16} className="text-muted" />
                    <strong className="text-[13px]">{t("microphone.level")}</strong>
                  </div>
                  <span className="text-right text-xs leading-[1.35] text-muted">{micMeterLabel}</span>
                </div>
                <div className="mic-meter-bars" aria-label={`Microphone level ${micLevelPercent}%`}>
                  {Array.from({ length: 12 }, (_, index) => (
                    <span key={index} className={micLevelPercent >= (index + 1) * 8 ? "filled" : ""} />
                  ))}
                </div>
                {micError ? <Notice tone="danger" className="mt-2">{micError}</Notice> : null}
              </div>
            ) : null}
          </div>
        </Card>

        <Card className="p-3">
          <ol className="grid grid-cols-5 gap-1.5" aria-label={t("workflow.label")}>
            {workflow.map((step) => (
              <WorkflowStep key={step.label} label={step.label} state={step.state} />
            ))}
          </ol>
        </Card>

        {busy || isBackgroundBusy || message || error ? (
          <div className="grid gap-2" aria-live="polite">
            {busy ? <Notice tone="loading">{t("working.on", { busy: busyLabel })}</Notice> : null}
            {isBackgroundBusy ? <Notice tone="loading">{processingState.message}</Notice> : null}
            {message ? <Notice tone={error ? "warning" : "success"}>{message}</Notice> : null}
            {error ? (
              <Notice tone="danger">
                <div className="grid gap-2">
                  <span>{error}</span>
                  <Button variant="secondary" size="sm" onClick={handleReset} disabled={busy !== null || isBackgroundBusy}>
                    {t("reset.recorder")}
                  </Button>
                </div>
              </Notice>
            ) : null}
          </div>
        ) : null}

        {isRecording && liveTranscriptionEnabled ? (
          <Card className="grid gap-3">
            <SectionHeader title={t("live.transcript")} description={t("live.transcript.description")} />
            <div className="scroll-panel max-h-[170px]">
              {liveTranscript?.text ? (
                <p className="mb-0 whitespace-pre-wrap break-words text-muted-strong">{liveTranscript.text}</p>
              ) : (
                <SkeletonText label={t("no.live.transcript")} />
              )}
            </div>
          </Card>
        ) : null}

        <Card className="grid gap-3">
          <SectionHeader
            title={t("process")}
            description={recording || transcript?.text ? t("process.description.ready") : t("process.description.empty")}
          />
          {recording && !transcript?.text ? (
            <Notice tone="info" className="py-2.5">
              {t("recording.ready.to.transcribe")}
            </Notice>
          ) : null}
          <div className="grid grid-cols-3 gap-2">
            <Button variant="secondary" size="sm" icon={<TextSearch size={15} />} onClick={handleTranscribe} disabled={!canTranscribe || busy !== null || isBackgroundBusy} aria-label={t("transcribe")}>
              {t("transcribe.short")}
            </Button>
            <Button variant="secondary" size="sm" icon={<Sparkles size={15} />} onClick={handleSummarize} disabled={!canSummarize || busy !== null || isBackgroundBusy} aria-label={t("summarize")}>
              {t("summarize.short")}
            </Button>
            <Button variant="secondary" size="sm" icon={<Save size={15} />} onClick={handleSave} disabled={!canSave || busy !== null || isBackgroundBusy} aria-label={t("save")}>
              {t("save.short")}
            </Button>
          </div>
          {(recording || transcript?.text || summary.trim()) ? (
            <Button
              variant="secondary"
              size="sm"
              fullWidth
              icon={<Plus size={15} />}
              onClick={recording && !transcript?.text ? handleDiscardRecordingDraft : handlePrepareNewRecording}
              disabled={busy !== null || isBackgroundBusy}
              aria-label={recording && !transcript?.text ? t("discard.and.new.recording") : t("new.recording")}
            >
              {recording && !transcript?.text ? t("discard.and.new.recording") : t("new.recording")}
            </Button>
          ) : null}
        </Card>

        {summary || transcript ? (
          <Card className="grid gap-3">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
              <SectionHeader title={t("workspace")} description={summary ? t("workspace.description.done") : t("workspace.description.review")} />
              {savedMeeting ? (
                <div className="shrink-0 pt-0.5">
                  <StatusBadge label={t(`status.${savedMeeting.status}`)} tone={savedMeeting.status === "error" ? "danger" : "success"} />
                </div>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-2 rounded-[12px] bg-surface-soft p-1">
              <button
                className={`rounded-[9px] px-3 py-2 text-sm font-semibold transition focus-visible:[box-shadow:0_0_0_3px_rgba(11,107,95,0.22)] ${resultView === "summary" ? "bg-white text-text shadow-sm" : "text-muted-strong hover:text-text"}`}
                type="button"
                onClick={() => setResultView("summary")}
                aria-pressed={resultView === "summary"}
              >
                {t("summary")}
              </button>
              <button
                className={`rounded-[9px] px-3 py-2 text-sm font-semibold transition focus-visible:[box-shadow:0_0_0_3px_rgba(11,107,95,0.22)] ${resultView === "transcript" ? "bg-white text-text shadow-sm" : "text-muted-strong hover:text-text"}`}
                type="button"
                onClick={() => setResultView("transcript")}
                aria-pressed={resultView === "transcript"}
              >
                {t("transcript")}
              </button>
            </div>

            {resultView === "summary" ? (
              <div className="scroll-panel">
                <FormattedMarkdown text={summary} emptyText={t("no.summary.available")} />
              </div>
            ) : (
              <div className="scroll-panel">
                <p className="mb-0 whitespace-pre-wrap break-words text-muted-strong">{transcript?.text || t("no.transcript.saved")}</p>
              </div>
            )}

            {savedMeeting && transcript?.text && !summary.trim() ? (
              <Notice tone="success" className="py-2.5">
                {t("transcript.saved.later.summary")}
              </Notice>
            ) : null}

            {savedMeeting ? (
              summary.trim() ? (
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="secondary" icon={copied ? <Check size={16} /> : <Clipboard size={16} />} onClick={handleCopySummary}>
                    {copied ? t("copied") : t("copy.summary.short")}
                  </Button>
                  <Button variant="secondary" icon={<Download size={16} />} onClick={() => downloadMarkdown(savedMeeting)}>
                    {t("export.markdown.short")}
                  </Button>
                </div>
              ) : (
                <div className="grid gap-2">
                  <Button variant="secondary" fullWidth icon={<History size={16} />} onClick={handleOpenSavedMeeting}>
                    {t("open.later")}
                  </Button>
                </div>
              )
            ) : null}
          </Card>
        ) : (
          <Card>
            <EmptyState
              icon={<FileText size={20} />}
              title={t("process.empty.title")}
              description={t("process.empty.state")}
            />
          </Card>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Button variant="ghost" icon={<Settings size={16} />} onClick={() => chrome.runtime.openOptionsPage()}>
            {t("settings")}
          </Button>
          <Button variant="ghost" icon={<History size={16} />} onClick={() => chrome.tabs.create({ url: chrome.runtime.getURL("src/pages/history.html") })}>
            {t("meeting.history")}
          </Button>
        </div>
      </div>
    </main>
  );
}

function WorkflowStep({ label, state }: { label: string; state: WorkflowState }) {
  const classes = {
    done: "border-accent bg-accent text-white",
    active: "border-accent bg-accent-soft text-accent-strong",
    waiting: "border-border bg-white text-muted"
  };

  return (
    <li
      className={`flex min-h-[36px] items-center justify-center rounded-[9px] border px-1.5 text-center text-[10px] font-semibold leading-none ${classes[state]}`}
      aria-current={state === "active" ? "step" : undefined}
      title={label}
    >
      {label}
    </li>
  );
}

function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="grid gap-0.5">
      <h2 className="mb-0">{title}</h2>
      {description ? <p className="text-[13px] leading-[1.4] text-muted">{description}</p> : null}
    </div>
  );
}

function SkeletonText({ label }: { label: string }) {
  return (
    <div className="grid gap-2" role="status" aria-label={label}>
      <div className="skeleton-line w-full" />
      <div className="skeleton-line w-[84%]" />
      <p className="mt-1 text-xs text-muted">{label}</p>
    </div>
  );
}

function getWorkflowState(done: boolean, active: boolean): WorkflowState {
  if (active) {
    return "active";
  }
  return done ? "done" : "waiting";
}

function getPrimaryAction({
  isRecording,
  recording,
  hasTranscript,
  hasSummary
}: {
  isRecording: boolean;
  recording: RecordedAudioPayload | null;
  hasTranscript: boolean;
  hasSummary: boolean;
}): { label: string; icon: JSX.Element; variant: "primary" | "danger" } {
  if (isRecording) {
    return { label: t("stop"), icon: <CircleStop size={18} />, variant: "danger" };
  }
  if (!recording && !hasTranscript) {
    return { label: t("record"), icon: <Play size={18} />, variant: "primary" };
  }
  if (recording && !hasTranscript) {
    return { label: t("transcribe"), icon: <TextSearch size={18} />, variant: "primary" };
  }
  if (hasTranscript && !hasSummary) {
    return { label: t("summarize"), icon: <Sparkles size={18} />, variant: "primary" };
  }
  return { label: t("new.recording"), icon: <Plus size={18} />, variant: "primary" };
}

function getPrimaryBusyLabel({
  busy,
  busyLabel,
  processingState
}: {
  busy: "recording" | "transcribing" | "summarizing" | "saving" | null;
  busyLabel: string;
  processingState: ProcessingState | null;
}): string {
  if (processingState?.status === "transcribing") {
    return t("busy.transcribing.short");
  }
  if (processingState?.status === "summarizing") {
    return t("busy.summarizing.short");
  }
  if (busy === "recording") {
    return t("busy.recording.short");
  }
  if (busy === "saving") {
    return t("busy.saving.short");
  }
  return busyLabel || t("busy.connection");
}

function emptyTranscript(): CombinedTranscript {
  return { segments: [], text: "" };
}

function buildMeetingRecord({
  settings,
  recording,
  transcript,
  summary,
  structuredSummary,
  previous,
  status,
  error
}: {
  settings: ExtensionSettings;
  recording: RecordedAudioPayload | null;
  transcript: CombinedTranscript;
  summary: string;
  structuredSummary?: StructuredMeetingSummary;
  previous: MeetingRecord | null;
  status: MeetingStatus;
  error: string;
}): MeetingRecord {
  const startedAt = recording?.startedAt ?? (previous ? Date.parse(previous.createdAt) : Date.now());
  const safeStartedAt = Number.isFinite(startedAt) ? startedAt : Date.now();

  return {
    id: previous?.id ?? crypto.randomUUID(),
    title: previous?.title ?? `Meeting ${new Date(safeStartedAt).toLocaleString()}`,
    createdAt: previous?.createdAt ?? new Date(safeStartedAt).toISOString(),
    durationSeconds: recording?.durationSeconds ?? previous?.durationSeconds ?? 0,
    backendUrl: settings.openWebuiBaseUrl,
    model: settings.model,
    transcript,
    summary,
    structuredSummary,
    sources: recording
      ? {
          tabAudio: Boolean(recording.tabAudioDataUrl),
          micAudio: Boolean(recording.micAudioDataUrl)
        }
      : previous?.sources ?? {
          tabAudio: false,
          micAudio: false
        },
    status,
    errors: error ? [error] : previous?.errors ?? [],
    openWebuiSync: previous?.openWebuiSync
  };
}

createRoot(document.getElementById("root")!).render(<Popup />);
