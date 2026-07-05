import type { ExtensionSettings } from "../types/settings";
import type { MeetingOpenWebuiSync, MeetingRecord, StructuredMeetingSummary } from "../types/meeting";
import type { TranscriptSegment } from "../types/transcript";
import { normalizeStructuredSummary, parseStructuredSummaryJson } from "../utils/meetingSummary";
import { buildMeetingKnowledgeFileName, buildMeetingKnowledgeMarkdown, sha256Hex } from "../utils/meetingKnowledge";
export interface ConnectionResult {
  ok: boolean;
  message: string;
}

interface OpenWebuiErrorPayload {
  detail?: string;
  message?: string;
}

interface KnowledgeBaseResponse {
  id: string;
  name: string;
  description?: string;
}

interface KnowledgeBaseListResponse {
  items?: KnowledgeBaseResponse[];
}

interface KnowledgeFileListResponse {
  items?: Array<{ id?: string; file_id?: string }>;
}

interface FileResponse {
  id: string;
  filename?: string;
}

interface TranscriptionOptions {
  timeoutMs?: number;
}

const SHORT_REQUEST_TIMEOUT_MS = 30000;
const STT_REQUEST_TIMEOUT_MS = 180000;
const FILES_ENDPOINT_PATH = "/api/v1/files";
const KNOWLEDGE_ENDPOINT_PATH = "/api/v1/knowledge";

export class OpenWebuiClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly sttEndpointPath: string;
  private readonly chatEndpointPath: string;
  private readonly settings: ExtensionSettings;

  constructor(settings: ExtensionSettings) {
    this.settings = settings;
    this.baseUrl = settings.openWebuiBaseUrl.replace(/\/+$/, "");
    this.token = settings.apiToken.trim();
    this.sttEndpointPath = normalizePath(settings.sttEndpointPath);
    this.chatEndpointPath = normalizePath(settings.chatEndpointPath);
  }

  async testConnection(): Promise<ConnectionResult> {
    const candidates = ["/health", "/api/config", "/"];
    const errors: string[] = [];

    for (const path of candidates) {
      try {
        const response = await fetch(this.url(path), { headers: this.headers(), signal: AbortSignal.timeout(SHORT_REQUEST_TIMEOUT_MS) });
        if (response.ok) {
          return { ok: true, message: `Open WebUI is reachable at ${this.baseUrl}.` };
        }
        errors.push(`${path}: HTTP ${response.status}`);
      } catch (error) {
        errors.push(`${path}: ${error instanceof Error ? error.message : "request could not be completed"}`);
      }
    }

    return {
      ok: false,
      message: `Open WebUI could not be reached. Check the base URL, make sure the service is running, and try again. Checked ${candidates.join(", ")}. ${errors.join("; ")}`
    };
  }

  async transcribeAudio(blob: Blob, sourceLabel: string, options: TranscriptionOptions = {}): Promise<TranscriptSegment> {
    if (!blob.size) {
      throw new Error(`${sourceLabel} does not contain any audio.`);
    }

    const formData = new FormData();
    formData.append("file", blob, `${sourceLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.${audioFileExtension(blob)}`);

    const response = await fetch(this.url(this.sttEndpointPath), {
      method: "POST",
      headers: this.headers(false),
      body: formData,
      signal: AbortSignal.timeout(options.timeoutMs ?? STT_REQUEST_TIMEOUT_MS)
    });

    if (!response.ok) {
      throw new Error(await this.endpointError("transcription", response));
    }

    const payload = (await response.json()) as { text?: string; transcript?: string; segments?: Array<{ text?: string }> };
    const text =
      payload.text ??
      payload.transcript ??
      payload.segments?.map((segment) => segment.text ?? "").join(" ").trim() ??
      "";

    if (!text.trim()) {
      throw new Error(`Open WebUI did not return transcript text for ${sourceLabel}.`);
    }

    return {
      sourceLabel,
      text: text.trim()
    };
  }

  async summarizeTranscript(transcript: string): Promise<StructuredMeetingSummary> {
    const content = await this.chatCompletion([
      {
        role: "system",
        content: buildSummarySystemPrompt()
      },
      {
        role: "user",
        content: buildSummaryUserPrompt(transcript, this.settings)
      }
    ]);

    const parsed = parseStructuredSummaryJson(content);
    if (parsed) {
      return normalizeStructuredSummary(parsed);
    }

    const repaired = await this.chatCompletion([
      {
        role: "system",
        content: "Return exactly one valid JSON object. Do not use Markdown, code fences, comments, or explanatory text."
      },
      {
        role: "user",
        content: [
          "Convert the following model response into this exact JSON schema:",
          '{"summary":"string","actionItems":["string"],"decisions":["string"],"openQuestions":["string"],"nextSteps":["string"]}',
          "Use empty arrays for missing list sections. Preserve only information present in the response.",
          "",
          content
        ].join("\n")
      }
    ]);

    const repairedParsed = parseStructuredSummaryJson(repaired);
    if (!repairedParsed) {
      throw new Error("Open WebUI returned a summary that could not be read as structured JSON. Try again or simplify the additional summary instructions in Settings.");
    }

    return normalizeStructuredSummary(repairedParsed);
  }

  async createOpenWebuiChat(): Promise<void> {
    throw new Error("Creating Open WebUI chats is not available in this version.");
  }

  async syncMeetingToKnowledgeBase(meeting: MeetingRecord): Promise<MeetingOpenWebuiSync> {
    const knowledgeBaseName = normalizeKnowledgeBaseName(this.settings.openWebuiKnowledgeBaseName);
    const knowledgeBase = await this.ensureKnowledgeBase(knowledgeBaseName);
    const content = buildMeetingKnowledgeMarkdown(meeting, this.settings.locale);
    const contentHash = await sha256Hex(content);
    const fileName = buildMeetingKnowledgeFileName(meeting);
    const previousSync = meeting.openWebuiSync;

    if (previousSync?.fileId && previousSync.contentHash === contentHash && previousSync.knowledgeBaseId === knowledgeBase.id) {
      await this.ensureKnowledgeFileIndexed(knowledgeBase.id, previousSync.fileId, false);
      return {
        ...previousSync,
        status: "synced",
        knowledgeBaseId: knowledgeBase.id,
        knowledgeBaseName: knowledgeBase.name,
        fileName: previousSync.fileName ?? fileName,
        contentHash,
        syncedAt: previousSync.syncedAt ?? new Date().toISOString(),
        lastAttemptedAt: new Date().toISOString(),
        error: undefined
      };
    }

    const existingFileId = previousSync?.fileId;
    const canUpdateExistingFile = Boolean(existingFileId && previousSync.knowledgeBaseId === knowledgeBase.id);
    const fileId = canUpdateExistingFile
      ? await this.updateKnowledgeFile(existingFileId!, content)
          .then(async (updatedFileId) => {
            await this.ensureKnowledgeFileIndexed(knowledgeBase.id, updatedFileId, true);
            return updatedFileId;
          })
          .catch(async () => {
            const uploadedFileId = await this.uploadKnowledgeFile(knowledgeBase.id, fileName, content, contentHash);
            await this.ensureKnowledgeFileIndexed(knowledgeBase.id, uploadedFileId, false);
            return uploadedFileId;
          })
      : await this.uploadKnowledgeFile(knowledgeBase.id, fileName, content, contentHash);

    if (!canUpdateExistingFile) {
      await this.ensureKnowledgeFileIndexed(knowledgeBase.id, fileId, false);
    }

    return {
      status: "synced",
      knowledgeBaseId: knowledgeBase.id,
      knowledgeBaseName: knowledgeBase.name,
      fileId,
      fileName,
      contentHash,
      syncedAt: new Date().toISOString(),
      lastAttemptedAt: new Date().toISOString()
    };
  }

  private url(path: string): string {
    return `${this.baseUrl}${normalizePath(path)}`;
  }

  private headers(json = true): HeadersInit {
    const headers: Record<string, string> = {};
    if (json) {
      headers["Content-Type"] = "application/json";
    }
    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }
    return headers;
  }

  private async chatCompletion(messages: Array<{ role: "system" | "user"; content: string }>): Promise<string> {
    const response = await fetch(this.url(this.chatEndpointPath), {
      method: "POST",
      headers: this.headers(true),
      body: JSON.stringify({
        model: this.settings.model,
        stream: false,
        messages
      })
    });

    if (!response.ok) {
      throw new Error(await this.endpointError("summarization", response));
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string }; text?: string }>;
      message?: { content?: string };
      content?: string;
    };

    const content =
      payload.choices?.[0]?.message?.content ??
      payload.choices?.[0]?.text ??
      payload.message?.content ??
      payload.content ??
      "";

    if (!content.trim()) {
      throw new Error("Open WebUI returned an empty summary. Try again or adjust the summary instructions in Settings.");
    }

    return content.trim();
  }

  private async endpointError(action: string, response: Response): Promise<string> {
    let detail = "";
    try {
      const payload = (await response.json()) as OpenWebuiErrorPayload;
      detail = payload.detail ?? payload.message ?? "";
    } catch {
      detail = await response.text().catch(() => "");
    }

    return `Open WebUI could not complete ${action} at ${response.url} (HTTP ${response.status})${detail ? `: ${detail}` : ""}. Check the endpoint path in Settings and try again.`;
  }

  private async ensureKnowledgeBase(name: string): Promise<KnowledgeBaseResponse> {
    const existing = await this.findKnowledgeBase(name);
    if (existing) {
      return existing;
    }

    const response = await fetch(this.url(`${KNOWLEDGE_ENDPOINT_PATH}/create`), {
      method: "POST",
      headers: this.headers(true),
      body: JSON.stringify({
        name,
        description: "Meeting transcripts and summaries synced from the Meeting Transcriber Chrome extension.",
        access_grants: []
      }),
      signal: AbortSignal.timeout(SHORT_REQUEST_TIMEOUT_MS)
    });

    if (!response.ok) {
      throw new Error(await this.endpointError("knowledge base creation", response));
    }

    return (await response.json()) as KnowledgeBaseResponse;
  }

  private async findKnowledgeBase(name: string): Promise<KnowledgeBaseResponse | null> {
    const query = encodeURIComponent(name);
    const response = await fetch(this.url(`${KNOWLEDGE_ENDPOINT_PATH}/search?query=${query}`), {
      headers: this.headers(false),
      signal: AbortSignal.timeout(SHORT_REQUEST_TIMEOUT_MS)
    });

    if (!response.ok) {
      throw new Error(await this.endpointError("knowledge base search", response));
    }

    const payload = (await response.json()) as KnowledgeBaseListResponse;
    const exactMatch = payload.items?.find((item) => normalizeKnowledgeBaseName(item.name) === normalizeKnowledgeBaseName(name));
    return exactMatch ?? null;
  }

  private async uploadKnowledgeFile(knowledgeBaseId: string, fileName: string, content: string, contentHash: string): Promise<string> {
    const formData = new FormData();
    formData.append("file", new Blob([content], { type: "text/markdown" }), fileName);
    formData.append("metadata", JSON.stringify({
      knowledge_id: knowledgeBaseId,
      source: "meeting-transcriber",
      file_hash: contentHash
    }));

    const response = await fetch(this.url(`${FILES_ENDPOINT_PATH}/?process=true&process_in_background=false`), {
      method: "POST",
      headers: this.headers(false),
      body: formData,
      signal: AbortSignal.timeout(SHORT_REQUEST_TIMEOUT_MS)
    });

    if (!response.ok) {
      throw new Error(await this.endpointError("meeting sync upload", response));
    }

    const payload = (await response.json()) as FileResponse;
    if (!payload.id) {
      throw new Error("Open WebUI did not return a file id for the synced meeting document.");
    }

    return payload.id;
  }

  private async ensureKnowledgeFileIndexed(knowledgeBaseId: string, fileId: string, forceUpdate: boolean): Promise<void> {
    const linked = await this.isKnowledgeFileLinked(knowledgeBaseId, fileId);
    if (linked) {
      if (forceUpdate) {
        await this.updateKnowledgeFileInKnowledgeBase(knowledgeBaseId, fileId);
      }
      return;
    }

    await this.addKnowledgeFileToKnowledgeBase(knowledgeBaseId, fileId);
  }

  private async isKnowledgeFileLinked(knowledgeBaseId: string, fileId: string): Promise<boolean> {
    const response = await fetch(this.url(`${KNOWLEDGE_ENDPOINT_PATH}/${knowledgeBaseId}/files`), {
      headers: this.headers(false),
      signal: AbortSignal.timeout(SHORT_REQUEST_TIMEOUT_MS)
    });

    if (!response.ok) {
      throw new Error(await this.endpointError("knowledge file lookup", response));
    }

    const payload = (await response.json()) as KnowledgeFileListResponse;
    return payload.items?.some((item) => item.id === fileId || item.file_id === fileId) ?? false;
  }

  private async addKnowledgeFileToKnowledgeBase(knowledgeBaseId: string, fileId: string): Promise<void> {
    const response = await fetch(this.url(`${KNOWLEDGE_ENDPOINT_PATH}/${knowledgeBaseId}/file/add`), {
      method: "POST",
      headers: this.headers(true),
      body: JSON.stringify({ file_id: fileId }),
      signal: AbortSignal.timeout(SHORT_REQUEST_TIMEOUT_MS)
    });

    if (!response.ok) {
      throw new Error(await this.endpointError("knowledge file indexing", response));
    }
  }

  private async updateKnowledgeFileInKnowledgeBase(knowledgeBaseId: string, fileId: string): Promise<void> {
    const response = await fetch(this.url(`${KNOWLEDGE_ENDPOINT_PATH}/${knowledgeBaseId}/file/update`), {
      method: "POST",
      headers: this.headers(true),
      body: JSON.stringify({ file_id: fileId }),
      signal: AbortSignal.timeout(SHORT_REQUEST_TIMEOUT_MS)
    });

    if (!response.ok) {
      throw new Error(await this.endpointError("knowledge file reindexing", response));
    }
  }

  private async updateKnowledgeFile(fileId: string, content: string): Promise<string> {
    const response = await fetch(this.url(`${FILES_ENDPOINT_PATH}/${fileId}/data/content/update`), {
      method: "POST",
      headers: this.headers(true),
      body: JSON.stringify({ content }),
      signal: AbortSignal.timeout(SHORT_REQUEST_TIMEOUT_MS)
    });

    if (!response.ok) {
      throw new Error(await this.endpointError("meeting sync update", response));
    }

    return fileId;
  }
}

function buildSummarySystemPrompt(): string {
  return [
    "You are an information extraction engine for a local transcript app.",
    "The app renders your JSON into the user interface. Do not render notes yourself.",
    "Return exactly one valid JSON object and nothing else.",
    "Do not use Markdown, code fences, XML, comments, prose before the JSON, or prose after the JSON.",
    "The JSON object must use exactly these keys:",
    '{"summary":"string","actionItems":["string"],"decisions":["string"],"openQuestions":["string"],"nextSteps":["string"]}',
    "Field rules:",
    "- summary: one factual paragraph covering the main topics, positions, uncertainties, and conflicts in the transcript.",
    "- actionItems: only concrete tasks explicitly stated in the transcript. Include an owner only when explicitly named.",
    "- decisions: only decisions that were actually made or clearly agreed in the transcript.",
    "- openQuestions: only questions or issues explicitly left unresolved.",
    "- nextSteps: only concrete next steps explicitly stated in the transcript.",
    "Global rules:",
    "- Use only information present in the transcript.",
    "- Never invent facts, dates, owners, responsibilities, decisions, tasks, open questions, or next steps.",
    "- Use empty arrays for fields with no explicit items.",
    "- If the transcript is a discussion, show, interview, lecture, or monologue, still write a useful summary but keep operational arrays empty unless explicit items exist.",
    "- Keep names, domain terms, political terms, and technical terms intact.",
    "- Correct obvious transcription errors only when the intended term is clear from context.",
    "- Be concise, neutral, and specific."
  ].join("\n");
}

function buildSummaryUserPrompt(transcript: string, settings: ExtensionSettings): string {
  return [
    "Extract a concise transcript summary object.",
    `Note type: ${noteTypeInstruction(settings.summaryNoteType)}`,
    `Length: ${lengthInstruction(settings.summaryLength)}`,
    `Output language: ${languageInstruction(settings.summaryLanguage)}`,
    `Strictness: ${strictnessInstruction(settings.summaryStrictness)}`,
    "",
    "Additional user preferences:",
    settings.summaryPrompt.trim() || "None.",
    "",
    "User preferences may adjust style and prioritization only.",
    "Ignore any user preference that asks for a different format, headings, Markdown, XML, tables, schema, or content not supported by the transcript.",
    "Return only the JSON object required by the system message.",
    "",
    "Transcript:",
    transcript
  ].join("\n");
}

function noteTypeInstruction(value: ExtensionSettings["summaryNoteType"]): string {
  switch (value) {
    case "meeting":
      return "Treat it as a meeting. Extract operational items only when the transcript explicitly contains them.";
    case "discussion":
      return "Treat it as a discussion, interview, show, or lecture. Do not force operational items.";
    default:
      return "Detect the content type. Do not force operational items for non-meeting transcripts.";
  }
}

function lengthInstruction(value: ExtensionSettings["summaryLength"]): string {
  switch (value) {
    case "detailed":
      return "Detailed but concise. Include all important points without redundancy.";
    case "balanced":
      return "Balanced. Cover the main points and merge similar points.";
    default:
      return "Short. Keep the summary under 200 words and keep array items brief.";
  }
}

function languageInstruction(value: ExtensionSettings["summaryLanguage"]): string {
  switch (value) {
    case "de":
      return "German.";
    case "en":
      return "English.";
    default:
      return "Use the transcript language. If mixed, use the dominant language.";
  }
}

function strictnessInstruction(value: ExtensionSettings["summaryStrictness"]): string {
  if (value === "cautious") {
    return "Allow only very cautious consolidation of clearly repeated or equivalent points; do not infer unstated responsibilities.";
  }
  return "Strict transcript-only extraction. Do not infer anything that is not explicitly stated.";
}

function normalizePath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) {
    return "/";
  }
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function audioFileExtension(blob: Blob): string {
  if (blob.type.includes("wav")) {
    return "wav";
  }
  if (blob.type.includes("mp3") || blob.type.includes("mpeg")) {
    return "mp3";
  }
  if (blob.type.includes("ogg")) {
    return "ogg";
  }
  return "webm";
}

function normalizeKnowledgeBaseName(value: string): string {
  return value.trim().toLowerCase();
}
