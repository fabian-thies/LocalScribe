import type { LiveTranscriptUpdate } from "../types/transcript";

export type RecordingStatus = "idle" | "recording" | "stopping" | "error";

export interface RecordingSnapshot {
  status: RecordingStatus;
  startedAt?: number;
  includeMic: boolean;
  micLevel: number;
  micTrackActive: boolean;
  micError?: string;
  error?: string;
}

export interface MicActivityStats {
  peakLevel: number;
  activeDurationMs: number;
  speechDetected: boolean;
}

export interface RecordedAudioPayload {
  tabAudioDataUrl?: string;
  micAudioDataUrl?: string;
  micActivity?: MicActivityStats;
  startedAt: number;
  stoppedAt: number;
  durationSeconds: number;
}

export async function startRecording(includeMic: boolean, microphoneDeviceId?: string): Promise<RecordingSnapshot> {
  return sendMessage<RecordingSnapshot>({ type: "START_RECORDING", includeMic, microphoneDeviceId });
}

export async function stopRecording(): Promise<RecordedAudioPayload> {
  return sendMessage<RecordedAudioPayload>({ type: "STOP_RECORDING" });
}

export async function resetRecording(): Promise<RecordingSnapshot> {
  return sendMessage<RecordingSnapshot>({ type: "RESET_RECORDING" });
}

export async function getRecordingStatus(): Promise<RecordingSnapshot> {
  return sendMessage<RecordingSnapshot>({ type: "GET_RECORDING_STATUS" });
}

export async function getLiveTranscript(): Promise<LiveTranscriptUpdate> {
  return sendMessage<LiveTranscriptUpdate>({ type: "GET_LIVE_TRANSCRIPT" });
}

export async function startMicPreview(microphoneDeviceId?: string): Promise<RecordingSnapshot> {
  return sendMessage<RecordingSnapshot>({ type: "START_MIC_PREVIEW", microphoneDeviceId });
}

export async function stopMicPreview(): Promise<RecordingSnapshot> {
  return sendMessage<RecordingSnapshot>({ type: "STOP_MIC_PREVIEW" });
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}

async function sendMessage<T>(message: unknown): Promise<T> {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) {
    throw new Error(response?.error ?? "The recording action could not be completed. Please try again.");
  }
  return response.data as T;
}
