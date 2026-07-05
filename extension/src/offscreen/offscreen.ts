import type { RecordingSnapshot, RecordedAudioPayload, RecordingStatus } from "../services/recordingService";
import { getSettings } from "../services/settingsStorage";
import { EmptyTranscriptError, OpenWebuiClient } from "../services/openWebuiClient";
import {
  clearRecordingDraft,
  getCurrentMeetingId,
  getMeeting,
  getRecordingDraft,
  saveMeeting,
  saveRecordingDraft,
  setCurrentMeetingId
} from "../services/meetingStorage";
import { setLocalStorage } from "../services/chromeStorage";
import { getProcessingState, LIVE_TRANSCRIPT_KEY, setProcessingState } from "../services/processingStorage";
import { syncMeetingToOpenWebuiIfEnabled } from "../services/openWebuiSync";
import type { ProcessingState, ProcessingStatus } from "../types/processing";
import type { ExtensionSettings } from "../types/settings";
import type { MeetingRecord, MeetingStatus, StructuredMeetingSummary } from "../types/meeting";
import type { CombinedTranscript, LiveTranscriptUpdate, TranscriptSegment } from "../types/transcript";
import { structuredSummaryToMarkdown } from "../utils/meetingSummary";
import liveAudioCaptureProcessorUrl from "./liveAudioCaptureProcessor?url";

type OffscreenRequest =
  | { type: "START"; streamId: string; includeMic: boolean; microphoneDeviceId?: string }
  | { type: "STOP" }
  | { type: "RESET" }
  | { type: "GET_STATUS" }
  | { type: "GET_PROCESSING_STATE" }
  | { type: "PROCESS_TRANSCRIPTION" }
  | { type: "PROCESS_SUMMARY"; meetingId?: string }
  | { type: "MIC_PREVIEW_START"; microphoneDeviceId?: string }
  | { type: "MIC_PREVIEW_STOP" }
  | { type: "GET_LIVE_TRANSCRIPT" };

interface RecorderBundle {
  recorder: MediaRecorder;
  stream: MediaStream;
  chunks: Blob[];
}

interface LiveTranscriptionSource {
  sourceLabel: string;
  stream: MediaStream;
  audioContext?: AudioContext;
  audioSource?: MediaStreamAudioSourceNode;
  processor?: AudioWorkletNode;
  silentGain?: GainNode;
  samples: Float32Array[];
  sampleCount: number;
  sampleRate?: number;
  segments: TranscriptSegment[];
}

interface LiveAudioBlob {
  source: LiveTranscriptionSource;
  blob: Blob;
}

let status: RecordingStatus = "idle";
let includeMic = false;
let startedAt: number | undefined;
let tabRecorder: RecorderBundle | undefined;
let micRecorder: RecorderBundle | undefined;
let tabAudioContext: AudioContext | undefined;
let tabAudioSource: MediaStreamAudioSourceNode | undefined;
let micAudioContext: AudioContext | undefined;
let micAudioSource: MediaStreamAudioSourceNode | undefined;
let micAnalyser: AnalyserNode | undefined;
let micLevelTimer: number | undefined;
let micLevel = 0;
let lastError: string | undefined;
let lastMicError: string | undefined;
let micPreviewStream: MediaStream | undefined;
let activeProcessing: Promise<void> | undefined;
let liveSources: LiveTranscriptionSource[] = [];
let liveTimer: ReturnType<typeof setInterval> | undefined;
let activeLiveTranscription: Promise<void> | undefined;
let liveTranscriptionFailures = 0;
const liveAudioCaptureModuleUrl = new URL(liveAudioCaptureProcessorUrl, globalThis.location.href).href;

chrome.runtime.onMessage.addListener((message: OffscreenRequest, _sender, sendResponse) => {
  if (!isOffscreenRequest(message)) {
    return false;
  }

  handleMessage(message)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error: unknown) => {
      lastError = error instanceof Error ? error.message : "The recording could not be completed.";
      status = "error";
      sendResponse({ ok: false, error: lastError });
    });

  return true;
});

async function handleMessage(message: OffscreenRequest): Promise<RecordingSnapshot | RecordedAudioPayload | ProcessingState | LiveTranscriptUpdate> {
  if (message.type === "GET_STATUS") {
    return snapshot();
  }

  if (message.type === "GET_PROCESSING_STATE") {
    return getLiveProcessingState();
  }

  if (message.type === "START") {
    await start(message.streamId, message.includeMic, message.microphoneDeviceId);
    return snapshot();
  }

  if (message.type === "STOP") {
    return stop();
  }

  if (message.type === "RESET") {
    await reset();
    return snapshot();
  }

  if (message.type === "MIC_PREVIEW_START") {
    await startMicPreview(message.microphoneDeviceId);
    return snapshot();
  }

  if (message.type === "MIC_PREVIEW_STOP") {
    stopMicPreview();
    return snapshot();
  }

  if (message.type === "GET_LIVE_TRANSCRIPT") {
    return buildLiveTranscriptUpdate();
  }

  if (message.type === "PROCESS_TRANSCRIPTION") {
    return startProcessing("transcribing", runTranscription);
  }

  if (message.type === "PROCESS_SUMMARY") {
    return startProcessing("summarizing", () => runSummary(message.meetingId));
  }

  throw new Error("The requested recording action is not supported.");
}

async function start(streamId: string, shouldIncludeMic: boolean, microphoneDeviceId?: string): Promise<void> {
  if (status === "recording") {
    throw new Error("A recording is already in progress. Stop it before starting a new one.");
  }

  await reset();
  includeMic = shouldIncludeMic;
  startedAt = Date.now();
  status = "recording";
  lastError = undefined;
  lastMicError = undefined;
  const settings = await getSettings().catch(() => undefined);
  const locale = settings?.locale ?? "en";
  const liveTranscriptionEnabled = settings?.liveTranscriptionEnabled ?? false;

  try {
    const tabStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: "tab",
          chromeMediaSourceId: streamId
        }
      } as MediaTrackConstraints,
      video: false
    });

    tabRecorder = createRecorder(tabStream);
    if (liveTranscriptionEnabled) {
      createLiveSource(locale === "de" ? "Tab-Audio" : "Tab audio", tabStream);
    }
    await playCapturedTabAudio(tabStream);
    tabRecorder.recorder.start(1000);

    if (shouldIncludeMic) {
      try {
        let micStream: MediaStream;
        if (micPreviewStream) {
          micStream = micPreviewStream;
          micPreviewStream = undefined;
        } else {
          micStream = await navigator.mediaDevices.getUserMedia({
            audio: microphoneDeviceId ? { deviceId: { exact: microphoneDeviceId } } : true,
            video: false
          });
          await startMicLevelMeter(micStream);
        }
        micRecorder = createRecorder(micStream);
        if (liveTranscriptionEnabled) {
          createLiveSource(locale === "de" ? "Mikrofon" : "Microphone", micStream);
        }
        micRecorder.recorder.start(1000);
      } catch (error) {
        lastMicError = `Microphone audio was not recorded: ${error instanceof Error ? error.message : "permission was denied"}`;
        throw new Error(lastMicError);
      }
    }

    if (liveTranscriptionEnabled) {
      startLiveTranscription();
    }
  } catch (error) {
    await reset();
    throw error;
  }
}

async function stop(): Promise<RecordedAudioPayload> {
  if (status !== "recording" || !startedAt) {
    throw new Error("There is no active recording to stop.");
  }

  status = "stopping";
  stopLiveTranscription();

  const stoppedAt = Date.now();
  const [tabBlob, micBlob] = await Promise.all([stopBundle(tabRecorder), stopBundle(micRecorder)]);

  const payload: RecordedAudioPayload = {
    tabAudioDataUrl: tabBlob ? await blobToDataUrl(tabBlob) : undefined,
    micAudioDataUrl: micBlob ? await blobToDataUrl(micBlob) : undefined,
    startedAt,
    stoppedAt,
    durationSeconds: Math.round((stoppedAt - startedAt) / 1000)
  };

  try {
    await persistStoppedRecording(payload);
  } catch (error) {
    lastError = error instanceof Error ? error.message : "The stopped recording could not be saved.";
    console.error("[Recording] Stopped recording could not be saved:", lastError);
  }

  cleanup();
  status = "idle";
  notifyRecordingStopped();
  flushStoppedLiveTranscript();
  return payload;
}

async function persistStoppedRecording(recording: RecordedAudioPayload): Promise<void> {
  await saveRecordingDraft(recording);

  const settings = await getSettings().catch(() => undefined);
  if (!settings) {
    return;
  }

  const previous = await getCurrentMeeting();
  const meeting = buildMeetingRecord({
    settings,
    recording,
    transcript: emptyTranscript(),
    summary: "",
    structuredSummary: undefined,
    previous,
    status: "recorded",
    error: ""
  });

  await saveMeeting(meeting);
  await setCurrentMeetingId(meeting.id);
}

function emptyTranscript(): CombinedTranscript {
  return { segments: [], text: "" };
}

function notifyRecordingStopped(): void {
  chrome.runtime.sendMessage({ type: "RECORDING_STOPPED" }).catch(() => undefined);
}

function flushStoppedLiveTranscript(): void {
  flushLiveTranscription()
    .then(() => saveLiveTranscript())
    .catch((error: unknown) => {
      console.error("[LiveTranscription] Final flush failed:", error instanceof Error ? error.message : String(error));
    });
}

function createRecorder(stream: MediaStream): RecorderBundle {
  const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
  const recorder = new MediaRecorder(stream, { mimeType });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      chunks.push(event.data);
    }
  };

  return { recorder, stream, chunks };
}

async function stopBundle(bundle: RecorderBundle | undefined): Promise<Blob | undefined> {
  if (!bundle) {
    return undefined;
  }

  await new Promise<void>((resolve) => {
    if (bundle.recorder.state === "inactive") {
      resolve();
      return;
    }

    bundle.recorder.onstop = () => resolve();
    bundle.recorder.stop();
  });

  bundle.stream.getTracks().forEach((track) => track.stop());
  return new Blob(bundle.chunks, { type: bundle.recorder.mimeType || "audio/webm" });
}

function cleanup(): void {
  tabAudioSource?.disconnect();
  void tabAudioContext?.close();
  tabAudioSource = undefined;
  tabAudioContext = undefined;
  stopMicPreview();
  stopLiveTranscription();
  stopLiveAudioCapture();

  [tabRecorder, micRecorder].forEach((bundle) => {
    if (bundle?.recorder.state === "recording" || bundle?.recorder.state === "paused") {
      bundle.recorder.stop();
    }
    bundle?.stream.getTracks().forEach((track) => track.stop());
  });
  tabRecorder = undefined;
  micRecorder = undefined;
  startedAt = undefined;
}

async function startMicLevelMeter(stream: MediaStream): Promise<void> {
  stopMicLevelMeter();

  micAudioContext = new AudioContext();
  micAudioSource = micAudioContext.createMediaStreamSource(stream);
  micAnalyser = micAudioContext.createAnalyser();
  micAnalyser.fftSize = 256;
  micAnalyser.smoothingTimeConstant = 0.75;
  micAudioSource.connect(micAnalyser);

  const samples = new Uint8Array(micAnalyser.frequencyBinCount);
  const updateLevel = () => {
    if (!micAnalyser) {
      return;
    }

    micAnalyser.getByteTimeDomainData(samples);
    let sumSquares = 0;
    for (const sample of samples) {
      const normalized = (sample - 128) / 128;
      sumSquares += normalized * normalized;
    }

    const rms = Math.sqrt(sumSquares / samples.length);
    const scaledLevel = Math.min(1, Math.max(0, (rms - 0.004) * 22));
    micLevel = micLevel * 0.55 + scaledLevel * 0.45;
  };

  if (micAudioContext.state === "suspended") {
    await micAudioContext.resume();
  }

  updateLevel();
  micLevelTimer = window.setInterval(updateLevel, 100);
}

function stopMicLevelMeter(): void {
  if (micLevelTimer !== undefined) {
    window.clearInterval(micLevelTimer);
  }

  micAudioSource?.disconnect();
  void micAudioContext?.close();
  micAudioContext = undefined;
  micAudioSource = undefined;
  micAnalyser = undefined;
  micLevelTimer = undefined;
  micLevel = 0;
}

async function playCapturedTabAudio(stream: MediaStream): Promise<void> {
  tabAudioContext = new AudioContext();
  tabAudioSource = tabAudioContext.createMediaStreamSource(stream);
  tabAudioSource.connect(tabAudioContext.destination);

  if (tabAudioContext.state === "suspended") {
    await tabAudioContext.resume();
  }
}

async function startMicPreview(deviceId?: string): Promise<void> {
  stopMicPreview();

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: deviceId ? { deviceId: { exact: deviceId } } : true,
    video: false
  });
  micPreviewStream = stream;
  await startMicLevelMeter(stream);
}

function stopMicPreview(): void {
  stopMicLevelMeter();
  if (micPreviewStream) {
    micPreviewStream.getTracks().forEach((track) => track.stop());
    micPreviewStream = undefined;
  }
}

async function reset(): Promise<void> {
  cleanup();
  status = "idle";
  includeMic = false;
  lastError = undefined;
  lastMicError = undefined;
  liveSources = [];
}

const LIVE_INTERVAL_MS = 15000;
const LIVE_STT_TIMEOUT_MS = 90000;
const MAX_LIVE_TRANSCRIPTION_FAILURES = 3;

function startLiveTranscription(): void {
  if (liveTimer) {
    return;
  }
  activeLiveTranscription = undefined;
  liveTranscriptionFailures = 0;
  console.log("[LiveTranscription] Started, interval=" + LIVE_INTERVAL_MS + "ms");
  void startLiveAudioCapture();
  void saveLiveTranscript();
  liveTimer = setInterval(() => {
    void processLiveInterval();
  }, LIVE_INTERVAL_MS);
}

function stopLiveTranscription(): void {
  if (liveTimer !== undefined) {
    clearInterval(liveTimer);
    liveTimer = undefined;
  }
}

async function flushLiveTranscription(): Promise<void> {
  if (activeLiveTranscription) {
    await activeLiveTranscription;
  }
  const blobs = drainLiveAudioBlobs();
  if (blobs.length === 0) {
    return;
  }
  await transcribeLiveBlobs(blobs);
}

async function processLiveInterval(): Promise<void> {
  if (activeLiveTranscription) {
    console.log("[LiveTranscription] Skipping, previous still in progress");
    return;
  }
  const blobs = drainLiveAudioBlobs();
  if (blobs.length === 0) {
    console.log("[LiveTranscription] Skipping, buffer empty");
    return;
  }

  activeLiveTranscription = transcribeLiveBlobs(blobs).finally(() => {
    activeLiveTranscription = undefined;
  });
  await activeLiveTranscription;
}

async function transcribeLiveBlobs(blobs: LiveAudioBlob[]): Promise<void> {
  console.log("[LiveTranscription] Processing " + blobs.length + " complete segment(s)");
  try {
    const settings = await getSettings();
    const client = new OpenWebuiClient(settings);
    let successfulSegments = 0;

    for (const { source, blob } of blobs) {
      try {
        console.log("[LiveTranscription] Sending " + source.sourceLabel + ": " + blob.size + " bytes to STT");
        const segment = await client.transcribeAudio(blob, source.sourceLabel, { timeoutMs: LIVE_STT_TIMEOUT_MS });
        source.segments.push(segment);
        successfulSegments += 1;
        console.log("[LiveTranscription] " + source.sourceLabel + " result: '" + segment.text.slice(0, 80) + "...'");
      } catch (error) {
        liveTranscriptionFailures += 1;
        console.warn("[LiveTranscription] " + source.sourceLabel + " STT skipped:", liveTranscriptionErrorMessage(error));
      }
    }

    if (successfulSegments > 0) {
      liveTranscriptionFailures = 0;
    } else if (liveTranscriptionFailures >= MAX_LIVE_TRANSCRIPTION_FAILURES) {
      stopLiveTranscription();
      console.warn("[LiveTranscription] Disabled for this recording after repeated STT timeouts. Final transcription still works after stopping.");
    }

    await saveLiveTranscript();
  } catch (error) {
    liveTranscriptionFailures += 1;
    console.warn("[LiveTranscription] STT skipped:", liveTranscriptionErrorMessage(error));
  }
}

function createLiveSource(sourceLabel: string, stream: MediaStream): LiveTranscriptionSource {
  const source: LiveTranscriptionSource = {
    sourceLabel,
    stream,
    samples: [],
    sampleCount: 0,
    segments: []
  };
  liveSources.push(source);
  return source;
}

async function startLiveAudioCapture(): Promise<void> {
  for (const source of liveSources) {
    if (source.audioContext || !source.stream.active) {
      continue;
    }

    const audioContext = new AudioContext();
    const audioSource = audioContext.createMediaStreamSource(source.stream);
    await audioContext.audioWorklet.addModule(liveAudioCaptureModuleUrl);
    const processor = new AudioWorkletNode(audioContext, "live-audio-capture-processor", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 1,
      outputChannelCount: [1]
    });
    const silentGain = audioContext.createGain();
    silentGain.gain.value = 0;

    processor.port.onmessage = (event: MessageEvent<Float32Array>) => {
      const input = event.data;
      if (!input?.length) {
        return;
      }

      source.samples.push(input);
      source.sampleCount += input.length;
    };

    audioSource.connect(processor);
    processor.connect(silentGain);
    silentGain.connect(audioContext.destination);

    source.audioContext = audioContext;
    source.audioSource = audioSource;
    source.processor = processor;
    source.silentGain = silentGain;
    source.sampleRate = audioContext.sampleRate;

    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }
  }
}

function stopLiveAudioCapture(): void {
  for (const source of liveSources) {
    source.processor?.disconnect();
    source.audioSource?.disconnect();
    source.silentGain?.disconnect();
    void source.audioContext?.close();
    source.audioContext = undefined;
    source.audioSource = undefined;
    source.processor = undefined;
    source.silentGain = undefined;
  }
}

function drainLiveAudioBlobs(): LiveAudioBlob[] {
  return liveSources.flatMap((source) => {
    if (source.sampleCount === 0 || !source.sampleRate) {
      return [];
    }

    const samples = mergeFloatSamples(source.samples, source.sampleCount);
    source.samples = [];
    source.sampleCount = 0;

    return [{
      source,
      blob: encodeWav(samples, source.sampleRate)
    }];
  });
}

function mergeFloatSamples(chunks: Float32Array[], totalLength: number): Float32Array {
  const merged = new Float32Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = 2;
  const headerSize = 44;
  const buffer = new ArrayBuffer(headerSize + samples.length * bytesPerSample);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * bytesPerSample, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 8 * bytesPerSample, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, samples.length * bytesPerSample, true);

  let offset = headerSize;
  for (const sample of samples) {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += bytesPerSample;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let index = 0; index < text.length; index += 1) {
    view.setUint8(offset + index, text.charCodeAt(index));
  }
}

async function saveLiveTranscript(): Promise<void> {
  try {
    await setLocalStorage({ [LIVE_TRANSCRIPT_KEY]: buildLiveTranscriptUpdate() });
  } catch (error) {
    console.error("[LiveTranscription] Live transcript could not be saved:", error instanceof Error ? error.message : String(error));
  }
}

function liveTranscriptionErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message === "signal timed out"
    ? "Open WebUI did not finish the live STT chunk before the timeout."
    : message;
}

function buildLiveTranscriptUpdate(): LiveTranscriptUpdate {
  const segments = liveSources
    .map((source): TranscriptSegment => ({
      sourceLabel: source.sourceLabel,
      text: source.segments.map((segment) => segment.text).join(" ").trim()
    }))
    .filter((segment) => segment.text);
  return combineSegments(segments);
}

function snapshot(): RecordingSnapshot {
  const micTrack = micRecorder?.stream.getAudioTracks()[0] ?? micPreviewStream?.getAudioTracks()[0];
  return {
    status,
    startedAt,
    includeMic,
    micLevel,
    micTrackActive: Boolean(micTrack && micTrack.readyState === "live"),
    micError: lastMicError,
    error: lastError
  };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("The recorded audio could not be read."));
    reader.readAsDataURL(blob);
  });
}

async function startProcessing(status: Extract<ProcessingStatus, "transcribing" | "summarizing">, runner: () => Promise<void>): Promise<ProcessingState> {
  if (activeProcessing) {
    return getLiveProcessingState();
  }

  const locale = await getProcessingLocale();
  const state = processingState(status, processingMessage(locale, status === "transcribing" ? "transcriptionStarted" : "summaryStarted"));
  await setProcessingState(state);

  activeProcessing = runner()
    .catch(async (error: unknown) => {
      const errorLocale = await getProcessingLocale();
      await setProcessingState(
        processingState("error", processingMessage(errorLocale, "processingFailed"), undefined, error instanceof Error ? error.message : processingMessage(errorLocale, "processingFailed"))
      );
    })
    .finally(() => {
      activeProcessing = undefined;
    });

  return state;
}

async function getLiveProcessingState(): Promise<ProcessingState> {
  const state = await getProcessingState();
  if ((state.status === "transcribing" || state.status === "summarizing") && !activeProcessing) {
    const interruptedState = processingState(
      "error",
      processingMessage((await getProcessingLocale()), "processingInterrupted"),
      state.meetingId,
      processingMessage((await getProcessingLocale()), "processingInterruptedAction")
    );
    await setProcessingState(interruptedState);
    return interruptedState;
  }

  return state;
}

async function runTranscription(): Promise<void> {
  const settings = await getSettings();
  const recording = await getRecordingDraft();
  if (!recording) {
    throw new Error(processingMessage(settings.locale, "missingRecordingForTranscription"));
  }

  const previous = await getCurrentMeeting();
  const client = new OpenWebuiClient(settings);
  const segments: TranscriptSegment[] = [];

  if (recording.tabAudioDataUrl) {
    await setProcessingState(processingState("transcribing", processingMessage(settings.locale, "transcribingTab"), previous?.id));
    const tabSegment = await transcribeRecordingSource(
      client,
      recording.tabAudioDataUrl,
      settings.locale === "de" ? "Tab-Audio" : "Tab audio"
    );
    if (tabSegment) {
      segments.push(tabSegment);
    }
  }

  if (recording.micAudioDataUrl) {
    await setProcessingState(processingState("transcribing", processingMessage(settings.locale, "transcribingMicrophone"), previous?.id));
    const micSegment = await transcribeRecordingSource(
      client,
      recording.micAudioDataUrl,
      settings.locale === "de" ? "Mikrofon" : "Microphone"
    );
    if (micSegment) {
      segments.push(micSegment);
    }
  }

  const transcript = combineSegments(segments);
  if (!transcript.text.trim()) {
    throw new Error(processingMessage(settings.locale, "emptyTranscript"));
  }

  const meeting = buildMeetingRecord({
    settings,
    recording,
    transcript,
    summary: previous?.summary ?? "",
    structuredSummary: previous?.structuredSummary,
    previous,
    status: previous?.summary ? "summarized" : "transcribed",
    error: ""
  });

  const syncResult = await syncMeetingToOpenWebuiIfEnabled(meeting, settings);
  await saveMeeting(syncResult.meeting);
  await setCurrentMeetingId(syncResult.meeting.id);
  await clearRecordingDraft();
  const completeMessage = syncResult.warning
    ? `${processingMessage(settings.locale, "transcriptionCompleteSyncWarning")} ${syncResult.warning}`
    : syncResult.synced
      ? processingMessage(settings.locale, "transcriptionCompleteSynced")
      : processingMessage(settings.locale, "transcriptionComplete");
  await setProcessingState(processingState("complete", completeMessage, syncResult.meeting.id));
}

async function transcribeRecordingSource(
  client: OpenWebuiClient,
  audioDataUrl: string,
  sourceLabel: string
): Promise<TranscriptSegment | null> {
  try {
    return await client.transcribeAudio(await dataUrlToBlob(audioDataUrl), sourceLabel);
  } catch (error) {
    if (error instanceof EmptyTranscriptError) {
      console.info("[Transcription] Skipping empty transcript for " + sourceLabel);
      return null;
    }

    throw error;
  }
}

async function runSummary(meetingId?: string): Promise<void> {
  const settings = await getSettings();
  const meeting = meetingId
    ? (await getMeeting(meetingId)) ?? null
    : await getCurrentMeeting();
  if (!meeting?.transcript.text.trim()) {
    throw new Error(processingMessage(settings.locale, "missingTranscriptForSummary"));
  }

  await setProcessingState(processingState("summarizing", processingMessage(settings.locale, "summarizing"), meeting.id));
  const client = new OpenWebuiClient(settings);
  const structuredSummary = await client.summarizeTranscript(meeting.transcript.text);
  const summary = structuredSummaryToMarkdown(structuredSummary, settings.locale);
  const updatedMeeting: MeetingRecord = {
    ...meeting,
    summary,
    structuredSummary,
    status: "summarized"
  };

  const syncResult = await syncMeetingToOpenWebuiIfEnabled(updatedMeeting, settings);
  await saveMeeting(syncResult.meeting);
  await setCurrentMeetingId(syncResult.meeting.id);
  const completeMessage = syncResult.warning
    ? `${processingMessage(settings.locale, "summaryCompleteSyncWarning")} ${syncResult.warning}`
    : syncResult.synced
      ? processingMessage(settings.locale, "summaryCompleteSynced")
      : processingMessage(settings.locale, "summaryComplete");
  await setProcessingState(processingState("complete", completeMessage, syncResult.meeting.id));
}

async function getCurrentMeeting(): Promise<MeetingRecord | null> {
  const currentId = await getCurrentMeetingId();
  return currentId ? (await getMeeting(currentId)) ?? null : null;
}

function processingState(status: ProcessingStatus, message: string, meetingId?: string, error?: string): ProcessingState {
  return {
    status,
    message,
    meetingId,
    error,
    updatedAt: new Date().toISOString()
  };
}

function combineSegments(segments: TranscriptSegment[]): CombinedTranscript {
  const cleanSegments = segments
    .map((segment) => ({ ...segment, text: segment.text.trim() }))
    .filter((segment) => segment.text && !isLikelySilentTranscript(segment.text));
  const multipleSources = cleanSegments.length > 1;
  const text = cleanSegments
    .map((segment) => multipleSources ? `[${segment.sourceLabel}]\n${segment.text}` : segment.text)
    .join("\n\n");
  return { segments: cleanSegments, text };
}

function isLikelySilentTranscript(text: string): boolean {
  const normalized = text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return true;
  }

  return new Set([
    "you",
    "you you"
  ]).has(normalized);
}

async function getProcessingLocale(): Promise<ExtensionSettings["locale"]> {
  return (await getSettings().catch(() => undefined))?.locale ?? "en";
}

function processingMessage(locale: ExtensionSettings["locale"], key: keyof typeof processingMessages.en): string {
  return processingMessages[locale][key];
}

const processingMessages = {
  en: {
    transcriptionStarted: "Transcription is running in the background.",
    summaryStarted: "The summary is being generated in the background.",
    processingFailed: "Background processing could not be completed.",
    processingInterrupted: "Background processing was interrupted.",
    processingInterruptedAction: "The previous background job is no longer running. Start it again.",
    transcribingTab: "Transcribing tab audio.",
    transcribingMicrophone: "Transcribing microphone audio.",
    transcriptionComplete: "Transcription complete and saved to Meeting History.",
    transcriptionCompleteSynced: "Transcription complete, saved to Meeting History, and synced to Open WebUI Knowledge.",
    transcriptionCompleteSyncWarning: "Transcription complete and saved to Meeting History, but Open WebUI sync failed.",
    summarizing: "Generating summary.",
    summaryComplete: "Summary generated and saved to Meeting History.",
    summaryCompleteSynced: "Summary generated, saved to Meeting History, and synced to Open WebUI Knowledge.",
    summaryCompleteSyncWarning: "Summary generated and saved to Meeting History, but Open WebUI sync failed.",
    missingRecordingForTranscription: "There is no saved recording available to transcribe.",
    emptyTranscript: "No transcript was created. Check the recording and try again.",
    missingTranscriptForSummary: "There is no saved transcript available to summarize."
  },
  de: {
    transcriptionStarted: "Die Transkription läuft im Hintergrund.",
    summaryStarted: "Die Zusammenfassung wird im Hintergrund erstellt.",
    processingFailed: "Die Verarbeitung konnte nicht abgeschlossen werden.",
    processingInterrupted: "Die Hintergrundverarbeitung wurde unterbrochen.",
    processingInterruptedAction: "Der vorherige Hintergrundvorgang läuft nicht mehr. Starten Sie ihn erneut.",
    transcribingTab: "Tab-Audio wird transkribiert.",
    transcribingMicrophone: "Mikrofon-Audio wird transkribiert.",
    transcriptionComplete: "Transkription abgeschlossen und im Meeting-Verlauf gespeichert.",
    transcriptionCompleteSynced: "Transkription abgeschlossen, im Meeting-Verlauf gespeichert und nach Open WebUI Knowledge synchronisiert.",
    transcriptionCompleteSyncWarning: "Transkription abgeschlossen und lokal gespeichert, aber die Open-WebUI-Synchronisierung ist fehlgeschlagen.",
    summarizing: "Zusammenfassung wird erstellt.",
    summaryComplete: "Zusammenfassung erstellt und im Meeting-Verlauf gespeichert.",
    summaryCompleteSynced: "Zusammenfassung erstellt, im Meeting-Verlauf gespeichert und nach Open WebUI Knowledge synchronisiert.",
    summaryCompleteSyncWarning: "Zusammenfassung erstellt und lokal gespeichert, aber die Open-WebUI-Synchronisierung ist fehlgeschlagen.",
    missingRecordingForTranscription: "Es ist keine gespeicherte Aufzeichnung für die Transkription vorhanden.",
    emptyTranscript: "Es wurde kein Transkript erstellt. Prüfen Sie die Aufzeichnung und versuchen Sie es erneut.",
    missingTranscriptForSummary: "Es ist kein gespeichertes Transkript für die Zusammenfassung vorhanden."
  }
};

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

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}

function isOffscreenRequest(message: unknown): message is OffscreenRequest {
  if (!message || typeof message !== "object" || !("type" in message)) {
    return false;
  }

  return ["START", "STOP", "RESET", "GET_STATUS", "GET_PROCESSING_STATE", "PROCESS_TRANSCRIPTION", "PROCESS_SUMMARY", "MIC_PREVIEW_START", "MIC_PREVIEW_STOP", "GET_LIVE_TRANSCRIPT"].includes(String((message as { type: unknown }).type));
}
