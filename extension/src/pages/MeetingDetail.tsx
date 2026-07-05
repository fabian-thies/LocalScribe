import "../styles/global.css";
import { createRoot } from "react-dom/client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { ArrowLeft, BookMarked, Check, Clipboard, Clock3, Download, FileText, Loader2, Pencil, Sparkles, Volume2 } from "lucide-react";
import { AppHeader } from "../components/AppHeader";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { EmptyState } from "../components/EmptyState";
import { FormattedMarkdown } from "../components/FormattedMarkdown";
import { Notice } from "../components/Notice";
import { StatusBadge } from "../components/StatusBadge";
import { getMeeting, saveMeeting } from "../services/meetingStorage";
import { getSettings } from "../services/settingsStorage";
import { syncMeetingToOpenWebuiIfEnabled } from "../services/openWebuiSync";
import { startBackgroundSummary, getBackgroundProcessingState } from "../services/processingService";
import { PROCESSING_STATE_KEY } from "../services/processingStorage";
import type { MeetingRecord } from "../types/meeting";
import type { ProcessingState } from "../types/processing";
import type { ExtensionSettings } from "../types/settings";
import { downloadMarkdown } from "../utils/downloadMarkdown";
import { getMeetingStructuredSummary } from "../utils/meetingSummary";
import { formatDuration } from "../utils/formatDuration";
import { getErrorMessage } from "../utils/errors";
import { setLocale, t } from "../services/i18n";

const inputClass = "field-control";

function MeetingDetail() {
  const [meeting, setMeeting] = useState<MeetingRecord | null>(null);
  const [error, setError] = useState("");
  const [copiedSection, setCopiedSection] = useState<"summary" | "transcript" | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState("");
  const [settings, setSettings] = useState<ExtensionSettings | null>(null);
  const [knowledgeSyncMessage, setKnowledgeSyncMessage] = useState("");
  const [knowledgeSyncing, setKnowledgeSyncing] = useState(false);
  const [summaryDone, setSummaryDone] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const copyTimer = useRef<ReturnType<typeof setTimeout>>();
  const summaryTimer = useRef<ReturnType<typeof setTimeout>>();
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      clearTimeout(copyTimer.current);
      clearTimeout(summaryTimer.current);
    };
  }, []);

  useEffect(() => {
    if (editingTitle && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingTitle]);

  function handleCopy(text: string, section: "summary" | "transcript") {
    navigator.clipboard.writeText(text);
    setCopiedSection(section);
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopiedSection(null), 1500);
  }

  async function handleSummarize(meetingId: string) {
    setSummarizing(true);
    setSummaryError("");
    try {
      await startBackgroundSummary(meetingId);
    } catch (e) {
      setSummarizing(false);
      setSummaryError(getErrorMessage(e));
    }
  }

  async function handleKnowledgeSync() {
    if (!meeting?.transcript.text.trim()) {
      return;
    }

    setKnowledgeSyncing(true);
    setKnowledgeSyncMessage("");
    try {
      const settings = await getSettings();
      if (!settings.openWebuiKnowledgeSyncEnabled) {
        setKnowledgeSyncMessage(t("knowledge.sync.disabled.detail"));
        return;
      }

      const result = await syncMeetingToOpenWebuiIfEnabled(meeting, settings);
      await saveMeeting(result.meeting);
      setMeeting(result.meeting);
      setKnowledgeSyncMessage(result.warning ? `${t("knowledge.sync.failed")} ${result.warning}` : t("knowledge.sync.complete"));
    } catch (syncError) {
      setKnowledgeSyncMessage(`${t("knowledge.sync.failed")} ${getErrorMessage(syncError)}`);
    } finally {
      setKnowledgeSyncing(false);
    }
  }

  function startTitleEdit() {
    if (!meeting) return;
    setDraftTitle(meeting.title);
    setEditingTitle(true);
  }

  function commitTitleEdit() {
    const trimmed = draftTitle.trim();
    if (meeting && trimmed && trimmed !== meeting.title) {
      const updated = { ...meeting, title: trimmed };
      void saveMeeting(updated);
      setMeeting(updated);
    }
    setEditingTitle(false);
  }

  function cancelTitleEdit() {
    setEditingTitle(false);
  }

  function handleTitleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      commitTitleEdit();
    } else if (event.key === "Escape") {
      cancelTitleEdit();
    }
  }

  useEffect(() => {
    getSettings()
      .then((s) => {
        setLocale(s.locale);
        setSettings(s);
      })
      .catch(() => undefined);

    const id = new URLSearchParams(location.search).get("id");
    if (!id) {
      setError(t("missing.meeting.id"));
      return;
    }

    getMeeting(id)
      .then((record) => {
        if (!record) {
          setError(t("meeting.not.found"));
          return;
        }
        setMeeting(record);
      })
      .catch((loadError) => setError(getErrorMessage(loadError)));

    getBackgroundProcessingState()
      .then((state) => {
        if (state.status === "summarizing" && state.meetingId === id) {
          setSummarizing(true);
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const id = meeting?.id;
    if (!id || typeof chrome === "undefined" || !chrome.storage?.onChanged) {
      return;
    }

    const listener = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
      if (areaName !== "local" || !changes[PROCESSING_STATE_KEY]) {
        return;
      }

      const state = changes[PROCESSING_STATE_KEY].newValue as ProcessingState | undefined;
      if (!state || state.meetingId !== id) {
        return;
      }

      if (state.status === "complete") {
        setSummarizing(false);
        setSummaryError("");
        getMeeting(id).then((updated) => {
          if (updated) {
            setMeeting(updated);
          }
        });
        setSummaryDone(true);
        clearTimeout(summaryTimer.current);
        summaryTimer.current = setTimeout(() => setSummaryDone(false), 2000);
      } else if (state.status === "error") {
        setSummarizing(false);
        setSummaryError(state.error ?? t("unknown.error"));
      } else if (state.status === "summarizing") {
        setSummarizing(true);
        setSummaryError("");
      }
    };

    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [meeting?.id]);

  const parsed = useMemo(() => (meeting ? getMeetingStructuredSummary(meeting) : null), [meeting]);

  if (error) {
    return (
      <main className="app-page">
        <div className="app-container">
          <Card className="grid gap-3">
            <Notice tone="danger">{error}</Notice>
            <Button variant="secondary" icon={<ArrowLeft size={16} />} onClick={() => chrome.tabs.update({ url: chrome.runtime.getURL("src/pages/history.html") })}>
              {t("back.to.history")}
            </Button>
          </Card>
        </div>
      </main>
    );
  }

  if (!meeting || !parsed) {
    return (
      <main className="app-page">
        <div className="app-container">
          <Card>
            <EmptyState icon={<Loader2 size={20} className="animate-spin" />} title={t("loading.meeting")} description={t("loading.meeting.description")} />
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="app-page">
      <div className="app-container">
        <AppHeader
          title={
            editingTitle ? (
              <input
                ref={editInputRef}
                className={`${inputClass} max-w-[520px]`}
                value={draftTitle}
                onChange={(event) => setDraftTitle(event.target.value)}
                onKeyDown={handleTitleKeyDown}
                onBlur={commitTitleEdit}
              />
            ) : (
              <button
                className="flex min-w-0 cursor-pointer items-center gap-2 rounded-[10px] text-left text-[23px] font-[760] leading-[1.15] text-text hover:text-accent-strong focus-visible:[box-shadow:0_0_0_3px_rgba(11,107,95,0.22)]"
                type="button"
                onClick={startTitleEdit}
                title={t("click.to.edit.title")}
              >
                <span className="truncate">{meeting.title}</span>
                <Pencil size={16} className="shrink-0 text-muted" />
              </button>
            )
          }
          description={new Date(meeting.createdAt).toLocaleString()}
          actions={
            <>
              <Button variant="secondary" icon={<ArrowLeft size={16} />} onClick={() => chrome.tabs.update({ url: chrome.runtime.getURL("src/pages/history.html") })}>
                {t("history")}
              </Button>
              {meeting.transcript.text ? (
                <Button
                  variant="secondary"
                  icon={summaryDone ? <Check size={16} /> : summarizing ? undefined : <Sparkles size={16} />}
                  loading={summarizing && !summaryDone}
                  onClick={() => handleSummarize(meeting.id)}
                >
                  {summaryDone ? t("summary.done") : summarizing ? t("busy.summarizing") : t("summarize")}
                </Button>
              ) : null}
              <Button variant="secondary" icon={<Download size={16} />} onClick={() => downloadMarkdown(meeting)}>
                {t("export")}
              </Button>
            </>
          }
        />

        <Card raised className="overflow-hidden p-0">
          <dl className="grid grid-cols-[0.8fr_0.6fr_1.2fr_1fr] divide-x divide-border max-[1080px]:grid-cols-2 max-[1080px]:divide-x-0 max-[1080px]:divide-y max-[560px]:grid-cols-1">
            <MetadataItem icon={<Sparkles size={16} />} label={t("metadata.status")}>
              <StatusBadge label={t(`status.${meeting.status}`)} tone={meeting.status === "error" ? "danger" : "success"} dot />
            </MetadataItem>
            <MetadataItem icon={<Clock3 size={16} />} label={t("metadata.duration")}>
              <strong className="text-[15px] leading-none text-text">{formatDuration(meeting.durationSeconds)}</strong>
            </MetadataItem>
            <MetadataItem icon={<Volume2 size={16} />} label={t("metadata.sources")}>
              <div className="flex min-w-0 flex-wrap gap-2">
                <SourceIndicator label={t("tab.audio")} active={meeting.sources.tabAudio} />
                <SourceIndicator label={t("mic.audio")} active={meeting.sources.micAudio} />
              </div>
            </MetadataItem>
            <MetadataItem icon={<BookMarked size={16} />} label={t("knowledge.sync.status")}>
              <div className="grid min-w-0 gap-1.5">
                <StatusBadge
                  label={knowledgeSyncStatusLabel(meeting, settings)}
                  tone={knowledgeSyncStatusTone(meeting, settings)}
                  dot
                />
                {canRetryKnowledgeSync(meeting, settings) ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={knowledgeSyncing}
                    onClick={handleKnowledgeSync}
                  >
                    {knowledgeSyncing ? t("knowledge.sync.running") : t("knowledge.sync.retry")}
                  </Button>
                ) : null}
              </div>
            </MetadataItem>
          </dl>
        </Card>

        {summaryError ? <Notice tone="danger">{summaryError}</Notice> : null}
        {knowledgeSyncMessage ? (
          <Notice tone={knowledgeSyncMessage.startsWith(t("knowledge.sync.complete")) ? "success" : "warning"}>
            {knowledgeSyncMessage}
          </Notice>
        ) : null}
        {meeting.openWebuiSync?.error ? <Notice tone="warning">{meeting.openWebuiSync.error}</Notice> : null}

        <div className="grid grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)] items-start gap-[18px] max-[860px]:grid-cols-1">
          <Card className="grid gap-3">
            <div className="flex items-start justify-between gap-3">
              <SectionHeader title={t("summary")} description={t("summary.detail.description")} />
              <Button
                variant="secondary"
                size="sm"
                icon={copiedSection === "summary" ? <Check size={16} /> : <Clipboard size={16} />}
                onClick={() => handleCopy(meeting.summary, "summary")}
                disabled={!meeting.summary.trim()}
              >
                {copiedSection === "summary" ? t("copied") : t("copy")}
              </Button>
            </div>
            <div className="scroll-panel max-h-[420px] bg-white">
              {meeting.summary.trim() ? (
                <FormattedMarkdown text={meeting.summary} emptyText={t("no.summary.saved")} />
              ) : (
                <EmptyState
                  icon={<Sparkles size={20} />}
                  title={t("summary.later.title")}
                  description={t("summary.later.description")}
                  action={
                    meeting.transcript.text.trim() ? (
                      <Button
                        variant="primary"
                        size="sm"
                        icon={summarizing ? undefined : <Sparkles size={16} />}
                        loading={summarizing}
                        onClick={() => handleSummarize(meeting.id)}
                      >
                        {summarizing ? t("busy.summarizing.short") : t("summarize")}
                      </Button>
                    ) : null
                  }
                />
              )}
            </div>
          </Card>

          <Card className="grid gap-4">
            <SectionHeader title={t("structured.notes")} description={t("structured.notes.description")} />
            <StructuredGroup title={t("action.items")} items={parsed.actionItems} />
            <StructuredGroup title={t("decisions")} items={parsed.decisions} />
            <StructuredGroup title={t("open.questions")} items={parsed.openQuestions} />
            <StructuredGroup title={t("next.steps")} items={parsed.nextSteps} />
          </Card>
        </div>

        <Card className="grid gap-3">
          <div className="flex items-start justify-between gap-3">
            <SectionHeader title={t("transcript")} description={t("transcript.detail.description")} />
            <Button
              variant="secondary"
              size="sm"
              icon={copiedSection === "transcript" ? <Check size={16} /> : <Clipboard size={16} />}
              onClick={() => handleCopy(meeting.transcript.text, "transcript")}
              disabled={!meeting.transcript.text.trim()}
            >
              {copiedSection === "transcript" ? t("copied") : t("copy")}
            </Button>
          </div>
          <div className="scroll-panel max-h-[360px]">
            {meeting.transcript.text ? (
              <p className="mb-0 whitespace-pre-wrap break-words">{meeting.transcript.text}</p>
            ) : (
              <EmptyState icon={<FileText size={20} />} title={t("no.transcript.saved")} />
            )}
          </div>
        </Card>
      </div>
    </main>
  );
}

function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="grid gap-1">
      <h2 className="mb-0">{title}</h2>
      {description ? <p className="text-[13px] leading-[1.45] text-muted">{description}</p> : null}
    </div>
  );
}

function StructuredGroup({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="grid gap-2 rounded-[12px] border border-border bg-surface p-3">
      <h3 className="mb-0">{title}</h3>
      {items.length ? <List items={items} /> : <p className="text-muted text-xs leading-[1.35]">{t("none.recorded")}</p>}
    </section>
  );
}

function MetadataItem({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 content-center gap-1.5 bg-white px-3 py-2">
      <dt className="flex min-w-0 items-center gap-2 text-muted">
        <span className="shrink-0">{icon}</span>
        <span className="truncate text-[11px] font-semibold leading-none">{label}</span>
      </dt>
      <dd className="m-0 min-w-0">{children}</dd>
    </div>
  );
}

function SourceIndicator({ label, active }: { label: string; active: boolean }) {
  return (
    <span
      className={`inline-flex min-h-[25px] max-w-full items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-semibold leading-none ${
        active
          ? "border-[#7fbfa3] bg-[#d7eee4] text-[#064b32]"
          : "border-border bg-surface-soft text-muted-strong"
      }`}
      title={label}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${active ? "bg-success" : "bg-muted"}`} aria-hidden="true" />
      <span className="min-w-0 truncate">{label}</span>
    </span>
  );
}

function knowledgeSyncStatusLabel(meeting: MeetingRecord, settings: ExtensionSettings | null): string {
  if (!settings?.openWebuiKnowledgeSyncEnabled) {
    return t("knowledge.sync.status.disabled");
  }
  if (meeting.openWebuiSync?.status === "synced") {
    return t("knowledge.sync.status.synced");
  }
  if (meeting.openWebuiSync?.status === "error") {
    return t("knowledge.sync.status.error");
  }
  if (meeting.transcript.text.trim()) {
    return t("knowledge.sync.status.pending");
  }
  return t("knowledge.sync.status.unavailable");
}

function knowledgeSyncStatusTone(meeting: MeetingRecord, settings: ExtensionSettings | null): "neutral" | "success" | "warning" | "danger" {
  if (!settings?.openWebuiKnowledgeSyncEnabled || !meeting.transcript.text.trim()) {
    return "neutral";
  }
  if (meeting.openWebuiSync?.status === "synced") {
    return "success";
  }
  if (meeting.openWebuiSync?.status === "error") {
    return "danger";
  }
  return "warning";
}

function canRetryKnowledgeSync(meeting: MeetingRecord, settings: ExtensionSettings | null): boolean {
  return Boolean(settings?.openWebuiKnowledgeSyncEnabled && meeting.transcript.text.trim() && meeting.openWebuiSync?.status !== "synced");
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="m-0 grid gap-1.5 pl-[18px] text-[13px] leading-[1.5]">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

createRoot(document.getElementById("root")!).render(<MeetingDetail />);
