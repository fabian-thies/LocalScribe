import type { CombinedTranscript } from "./transcript";

export type MeetingStatus = "draft" | "recorded" | "transcribed" | "summarized" | "error";

export interface MeetingSources {
  tabAudio: boolean;
  micAudio: boolean;
}

export interface MeetingOpenWebuiSync {
  status: "synced" | "error";
  knowledgeBaseId?: string;
  knowledgeBaseName?: string;
  fileId?: string;
  fileName?: string;
  contentHash?: string;
  syncedAt?: string;
  lastAttemptedAt?: string;
  error?: string;
}

export interface MeetingRecord {
  id: string;
  title: string;
  createdAt: string;
  durationSeconds: number;
  backendUrl: string;
  model: string;
  transcript: CombinedTranscript;
  summary: string;
  structuredSummary?: StructuredMeetingSummary;
  sources: MeetingSources;
  status: MeetingStatus;
  errors: string[];
  openWebuiSync?: MeetingOpenWebuiSync;
}

export interface StructuredMeetingSummary {
  summary: string;
  actionItems: string[];
  decisions: string[];
  openQuestions: string[];
  nextSteps: string[];
}

export type ParsedMeetingSummary = StructuredMeetingSummary;
