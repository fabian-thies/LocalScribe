import type { MeetingRecord } from "../types/meeting";
import type { ExtensionSettings } from "../types/settings";
import { OpenWebuiClient } from "./openWebuiClient";

export interface MeetingSyncResult {
  meeting: MeetingRecord;
  synced: boolean;
  warning?: string;
}

export async function syncMeetingToOpenWebuiIfEnabled(
  meeting: MeetingRecord,
  settings: ExtensionSettings
): Promise<MeetingSyncResult> {
  if (!settings.openWebuiKnowledgeSyncEnabled || !meeting.transcript.text.trim()) {
    return { meeting, synced: false };
  }

  try {
    const openWebuiSync = await new OpenWebuiClient(settings).syncMeetingToKnowledgeBase(meeting);
    return {
      meeting: {
        ...meeting,
        openWebuiSync
      },
      synced: true
    };
  } catch (error) {
    const warning = error instanceof Error ? error.message : "Open WebUI knowledge sync could not be completed.";
    return {
      meeting: {
        ...meeting,
        openWebuiSync: {
          ...meeting.openWebuiSync,
          status: "error",
          knowledgeBaseName: settings.openWebuiKnowledgeBaseName.trim() || settings.openWebuiKnowledgeBaseName,
          lastAttemptedAt: new Date().toISOString(),
          error: warning
        }
      },
      synced: false,
      warning
    };
  }
}
