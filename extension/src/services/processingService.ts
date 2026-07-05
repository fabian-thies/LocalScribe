import type { ProcessingState } from "../types/processing";

export async function startBackgroundTranscription(): Promise<ProcessingState> {
  return sendMessage<ProcessingState>({ type: "START_TRANSCRIPTION" });
}

export async function startBackgroundSummary(meetingId?: string): Promise<ProcessingState> {
  return sendMessage<ProcessingState>({ type: "START_SUMMARY", meetingId });
}

export async function getBackgroundProcessingState(): Promise<ProcessingState> {
  return sendMessage<ProcessingState>({ type: "GET_PROCESSING_STATUS" });
}

async function sendMessage<T>(message: unknown): Promise<T> {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) {
    throw new Error(response?.error ?? "The processing action could not be completed. Please try again.");
  }
  return response.data as T;
}
