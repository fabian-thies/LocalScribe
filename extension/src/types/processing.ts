export type ProcessingStatus = "idle" | "transcribing" | "summarizing" | "complete" | "error";

export interface ProcessingState {
  status: ProcessingStatus;
  message: string;
  meetingId?: string;
  error?: string;
  updatedAt: string;
}
