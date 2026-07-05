import type { ProcessingState } from "../types/processing";
import { getLocalStorage, removeLocalStorage, setLocalStorage } from "./chromeStorage";

export const PROCESSING_STATE_KEY = "meetingTranscriber.processingState";
export const LIVE_TRANSCRIPT_KEY = "meetingTranscriber.liveTranscript";

export function idleProcessingState(): ProcessingState {
  return {
    status: "idle",
    message: "",
    updatedAt: new Date().toISOString()
  };
}

export async function getProcessingState(): Promise<ProcessingState> {
  const result = await getLocalStorage(PROCESSING_STATE_KEY);
  return (result[PROCESSING_STATE_KEY] as ProcessingState | undefined) ?? idleProcessingState();
}

export async function setProcessingState(state: ProcessingState): Promise<void> {
  await setLocalStorage({ [PROCESSING_STATE_KEY]: state });
}

export async function clearProcessingState(): Promise<void> {
  await removeLocalStorage(PROCESSING_STATE_KEY);
}
