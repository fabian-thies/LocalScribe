export type TranscriptSourceLabel = "User/Mic" | "Meeting/Tab" | "Speaker 1" | "Speaker 2" | string;

export interface TranscriptSegment {
  sourceLabel: TranscriptSourceLabel;
  text: string;
  startedAt?: number;
  endedAt?: number;
}

export interface CombinedTranscript {
  segments: TranscriptSegment[];
  text: string;
}

export interface LiveTranscriptUpdate {
  segments: TranscriptSegment[];
  text: string;
}
