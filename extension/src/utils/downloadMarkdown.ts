import type { MeetingRecord } from "../types/meeting";
import { formatDuration } from "./formatDuration";
import { t } from "../services/i18n";
import { getMeetingStructuredSummary, parseMeetingSummary } from "./meetingSummary";

function sanitizeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim() || "meeting";
}

export { parseMeetingSummary };

export function meetingToMarkdown(meeting: MeetingRecord): string {
  const parsed = getMeetingStructuredSummary(meeting);
  const date = new Date(meeting.createdAt).toLocaleString();

  return [
    `# ${t("download.meeting", { title: meeting.title })}`,
    "",
    `${t("download.date", { date })}`,
    `${t("download.duration", { duration: formatDuration(meeting.durationSeconds) })}`,
    `${t("download.model", { model: meeting.model })}`,
    `${t("download.backend", { url: meeting.backendUrl })}`,
    "",
    `## ${t("download.summary")}`,
    "",
    parsed.summary || t("download.no.summary"),
    "",
    `## ${t("download.decisions")}`,
    "",
    parsed.decisions.length ? parsed.decisions.map((item) => `- ${item}`).join("\n") : t("download.none.recorded"),
    "",
    `## ${t("download.action.items")}`,
    "",
    parsed.actionItems.length ? parsed.actionItems.map((item) => `- ${item}`).join("\n") : t("download.none.recorded"),
    "",
    `## ${t("download.open.questions")}`,
    "",
    parsed.openQuestions.length ? parsed.openQuestions.map((item) => `- ${item}`).join("\n") : t("download.none.recorded"),
    "",
    `## ${t("download.next.steps")}`,
    "",
    parsed.nextSteps.length ? parsed.nextSteps.map((item) => `- ${item}`).join("\n") : t("download.none.recorded"),
    "",
    `## ${t("download.transcript")}`,
    "",
    meeting.transcript.text || t("download.no.transcript"),
    ""
  ].join("\n");
}

export function downloadMarkdown(meeting: MeetingRecord): void {
  const blob = new Blob([meetingToMarkdown(meeting)], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${sanitizeFileName(meeting.title)}.md`;
  anchor.click();
  URL.revokeObjectURL(url);
}
