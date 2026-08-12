import type { MeetingRecord } from "../types/meeting";
import type { Locale } from "../types/settings";
import { formatDuration } from "./formatDuration";
import { getMeetingStructuredSummary } from "./meetingSummary";

export function buildMeetingKnowledgeMarkdown(meeting: MeetingRecord, locale: Locale): string {
  const summary = getMeetingStructuredSummary(meeting);
  const labels = locale === "de"
    ? {
        title: "Meeting",
        metadata: "Metadaten",
        createdAt: "Erstellt am",
        duration: "Dauer",
        status: "Status",
        sources: "Quellen",
        model: "Zusammenfassungsmodell",
        backend: "Backend",
        summary: "Zusammenfassung",
        structuredNotes: "Strukturierte Notizen",
        actionItems: "Aufgaben",
        decisions: "Entscheidungen",
        openQuestions: "Offene Fragen",
        nextSteps: "Nächste Schritte",
        transcript: "Transkript",
        none: "Keine Einträge vorhanden.",
        pendingSummary: "Noch keine Zusammenfassung gespeichert.",
        noTranscript: "Noch kein Transkript gespeichert.",
        tabAudio: "Tab-Audio",
        micAudio: "Mikrofon-Audio",
        noSources: "Keine Audioquelle gespeichert"
      }
    : {
        title: "Meeting",
        metadata: "Metadata",
        createdAt: "Created at",
        duration: "Duration",
        status: "Status",
        sources: "Sources",
        model: "Summary model",
        backend: "Backend",
        summary: "Summary",
        structuredNotes: "Structured Notes",
        actionItems: "Action Items",
        decisions: "Decisions",
        openQuestions: "Open Questions",
        nextSteps: "Next Steps",
        transcript: "Transcript",
        none: "No entries yet.",
        pendingSummary: "No summary saved yet.",
        noTranscript: "No transcript saved yet.",
        tabAudio: "Tab audio",
        micAudio: "Microphone audio",
        noSources: "No audio source saved"
      };

  return [
    `# ${labels.title}: ${meeting.title}`,
    "",
    `## ${labels.metadata}`,
    `- ${labels.createdAt}: ${new Date(meeting.createdAt).toLocaleString(locale === "de" ? "de-DE" : "en-US")}`,
    `- ${labels.duration}: ${formatDuration(meeting.durationSeconds)}`,
    `- ${labels.status}: ${meeting.status}`,
    `- ${labels.sources}: ${formatSources(meeting, labels)}`,
    `- ${labels.model}: ${meeting.model}`,
    `- ${labels.backend}: ${meeting.backendUrl}`,
    "",
    `## ${labels.summary}`,
    summary.summary || meeting.summary.trim() || labels.pendingSummary,
    "",
    `## ${labels.structuredNotes}`,
    `### ${labels.actionItems}`,
    listSection(summary.actionItems, labels.none),
    "",
    `### ${labels.decisions}`,
    listSection(summary.decisions, labels.none),
    "",
    `### ${labels.openQuestions}`,
    listSection(summary.openQuestions, labels.none),
    "",
    `### ${labels.nextSteps}`,
    listSection(summary.nextSteps, labels.none),
    "",
    `## ${labels.transcript}`,
    meeting.transcript.text.trim() || labels.noTranscript
  ].join("\n");
}

export function buildMeetingKnowledgeFileName(meeting: MeetingRecord): string {
  const datePart = meeting.createdAt.slice(0, 10);
  const slug = slugify(meeting.title) || "meeting";
  return `${datePart}-${slug}-${meeting.id.slice(0, 8)}.md`;
}

export async function sha256Hex(value: string): Promise<string> {
  const input = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function listSection(items: string[], emptyLabel: string): string {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : `- ${emptyLabel}`;
}

function formatSources(
  meeting: MeetingRecord,
  labels: {
    tabAudio: string;
    micAudio: string;
    noSources: string;
  }
): string {
  const sources = [
    meeting.sources.tabAudio ? labels.tabAudio : "",
    meeting.sources.micAudio ? labels.micAudio : ""
  ].filter(Boolean);

  return sources.join(", ") || labels.noSources;
}
