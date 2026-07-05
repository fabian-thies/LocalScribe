import type { MeetingRecord, StructuredMeetingSummary } from "../types/meeting";
import type { Locale } from "../types/settings";

const EMPTY_SUMMARY: StructuredMeetingSummary = {
  summary: "",
  actionItems: [],
  decisions: [],
  openQuestions: [],
  nextSteps: []
};

type SummarySection = keyof StructuredMeetingSummary;

export function normalizeStructuredSummary(value: unknown): StructuredMeetingSummary {
  if (!value || typeof value !== "object") {
    return emptyStructuredSummary();
  }

  const record = value as Record<string, unknown>;
  return {
    summary: stringValue(record.summary),
    actionItems: arrayValue(record.actionItems ?? record.tasks),
    decisions: arrayValue(record.decisions),
    openQuestions: arrayValue(record.openQuestions),
    nextSteps: arrayValue(record.nextSteps)
  };
}

export function parseStructuredSummaryJson(text: string): StructuredMeetingSummary | null {
  const json = extractJsonObject(text);
  if (!json) {
    return null;
  }

  try {
    return normalizeStructuredSummary(JSON.parse(json));
  } catch {
    return null;
  }
}

export function getMeetingStructuredSummary(meeting: MeetingRecord): StructuredMeetingSummary {
  return meeting.structuredSummary ? normalizeStructuredSummary(meeting.structuredSummary) : parseMeetingSummary(meeting.summary);
}

export function parseMeetingSummary(summary: string): StructuredMeetingSummary {
  const result = emptyStructuredSummary();
  const summaryLines: string[] = [];
  let section: SummarySection | null = null;
  let sawHeading = false;

  for (const rawLine of summary.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const heading = line.match(/^#{1,6}\s+(.+)$/);
    if (heading) {
      const nextSection = sectionFromHeading(heading[1]);
      if (nextSection) {
        section = nextSection;
        sawHeading = true;
        continue;
      }
    }

    if (section === "summary") {
      summaryLines.push(stripBullet(line));
      continue;
    }

    if (section) {
      const item = stripBullet(line);
      if (item && !isNoneItem(item)) {
        result[section].push(item);
      }
      continue;
    }

    summaryLines.push(line);
  }

  result.summary = summaryLines.join("\n").trim() || (sawHeading ? "" : summary.trim());
  return result;
}

export function structuredSummaryToMarkdown(summary: StructuredMeetingSummary, locale: Locale): string {
  const normalized = normalizeStructuredSummary(summary);
  const headings = locale === "de"
    ? {
        summary: "Kurzfassung",
        actionItems: "Aufgaben",
        decisions: "Entscheidungen",
        openQuestions: "Offene Fragen",
        nextSteps: "Nächste Schritte",
        none: "Keine"
      }
    : {
        summary: "Summary",
        actionItems: "Action Items",
        decisions: "Decisions",
        openQuestions: "Open Questions",
        nextSteps: "Next Steps",
        none: "None"
      };

  return [
    `## ${headings.summary}`,
    normalized.summary || `- ${headings.none}`,
    "",
    `## ${headings.actionItems}`,
    listSection(normalized.actionItems, headings.none),
    "",
    `## ${headings.decisions}`,
    listSection(normalized.decisions, headings.none),
    "",
    `## ${headings.openQuestions}`,
    listSection(normalized.openQuestions, headings.none),
    "",
    `## ${headings.nextSteps}`,
    listSection(normalized.nextSteps, headings.none)
  ].join("\n");
}

function extractJsonObject(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  return start >= 0 && end > start ? candidate.slice(start, end + 1) : null;
}

function sectionFromHeading(value: string): SummarySection | null {
  const normalized = value.toLowerCase().replace(/[:：]/g, "").trim();
  if (normalized.includes("kurzfassung") || normalized === "summary") {
    return "summary";
  }
  if (normalized.includes("aufgabe") || normalized.includes("action item") || normalized === "tasks") {
    return "actionItems";
  }
  if (normalized.includes("entscheidung") || normalized.includes("decision")) {
    return "decisions";
  }
  if (normalized.includes("offene frage") || normalized.includes("open question")) {
    return "openQuestions";
  }
  if (normalized.includes("nächste schritte") || normalized.includes("naechste schritte") || normalized.includes("next step")) {
    return "nextSteps";
  }
  return null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function arrayValue(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(stringValue).filter((item) => item && !isNoneItem(item));
}

function stripBullet(value: string): string {
  return value.replace(/^[-*]\s+/, "").trim();
}

function isNoneItem(value: string): boolean {
  return ["keine", "kein", "none", "n/a", "na"].includes(value.toLowerCase().replace(/[.!]+$/g, "").trim());
}

function listSection(items: string[], noneLabel: string): string {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : `- ${noneLabel}`;
}

function emptyStructuredSummary(): StructuredMeetingSummary {
  return {
    summary: EMPTY_SUMMARY.summary,
    actionItems: [],
    decisions: [],
    openQuestions: [],
    nextSteps: []
  };
}
