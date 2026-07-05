type BackgroundRequest =
  | { type: "START_RECORDING"; includeMic: boolean; microphoneDeviceId?: string }
  | { type: "STOP_RECORDING" }
  | { type: "RESET_RECORDING" }
  | { type: "GET_RECORDING_STATUS" }
  | { type: "START_TRANSCRIPTION" }
  | { type: "START_SUMMARY"; meetingId?: string }
  | { type: "GET_PROCESSING_STATUS" }
  | { type: "GET_LIVE_TRANSCRIPT" }
  | { type: "STORAGE_GET"; keys: string | string[] | Record<string, unknown> | null }
  | { type: "STORAGE_SET"; values: Record<string, unknown> }
  | { type: "STORAGE_REMOVE"; keys: string | string[] }
  | { type: "START_MIC_PREVIEW"; microphoneDeviceId?: string }
  | { type: "STOP_MIC_PREVIEW" }
  | { type: "RECORDING_STOPPED" };

interface BackgroundResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

const OFFSCREEN_DOCUMENT_PATH = "src/offscreen/offscreen.html";

const ICON_DEFAULT = { "16": "icons/icon16.png", "48": "icons/icon48.png", "128": "icons/icon128.png" };
const ICON_RECORDING = { "16": "icons/recording-icon16.png", "48": "icons/recording-icon48.png", "128": "icons/recording-icon128.png" };
const RECORDING_BADGE_TEXT = "REC";
const RECORDING_BADGE_COLOR = "#d93025";

async function setActionIcon(paths: Record<string, string>): Promise<void> {
  const imageData: Record<string, ImageData> = {};
  for (const [size, relativePath] of Object.entries(paths)) {
    const response = await fetch(chrome.runtime.getURL(relativePath));
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
    const dimension = Number(size);
    const canvas = new OffscreenCanvas(dimension, dimension);
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0, dimension, dimension);
    imageData[size] = ctx.getImageData(0, 0, dimension, dimension);
    bitmap.close();
  }
  await chrome.action.setIcon({ imageData });
}

async function setActionState(paths: Record<string, string>, badgeText = ""): Promise<void> {
  await setActionIcon(paths);
  if (badgeText) {
    await chrome.action.setBadgeBackgroundColor({ color: RECORDING_BADGE_COLOR });
  }
  await chrome.action.setBadgeText({ text: badgeText });
}

chrome.runtime.onMessage.addListener((message: BackgroundRequest, _sender, sendResponse) => {
  if (!isBackgroundRequest(message)) {
    return false;
  }

  handleMessage(message)
    .then((data) => sendResponse({ ok: true, data } satisfies BackgroundResponse))
    .catch((error: unknown) =>
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "The extension could not complete the requested action."
      } satisfies BackgroundResponse)
    );

  return true;
});

async function handleMessage(message: BackgroundRequest): Promise<unknown> {
  if (message.type === "STORAGE_GET") {
    return getLocalStorageArea().get(message.keys);
  }

  if (message.type === "STORAGE_SET") {
    await getLocalStorageArea().set(message.values);
    return undefined;
  }

  if (message.type === "STORAGE_REMOVE") {
    await getLocalStorageArea().remove(message.keys);
    return undefined;
  }

  if (message.type === "GET_RECORDING_STATUS") {
    await ensureOffscreenDocument();
    return sendOffscreenMessage({ type: "GET_STATUS" });
  }

  if (message.type === "START_MIC_PREVIEW") {
    await ensureOffscreenDocument();
    return sendOffscreenMessage({ type: "MIC_PREVIEW_START", microphoneDeviceId: message.microphoneDeviceId });
  }

  if (message.type === "STOP_MIC_PREVIEW") {
    await ensureOffscreenDocument();
    return sendOffscreenMessage({ type: "MIC_PREVIEW_STOP" });
  }

  if (message.type === "GET_LIVE_TRANSCRIPT") {
    await ensureOffscreenDocument();
    return sendOffscreenMessage({ type: "GET_LIVE_TRANSCRIPT" });
  }

  if (message.type === "GET_PROCESSING_STATUS") {
    await ensureOffscreenDocument();
    return sendOffscreenMessage({ type: "GET_PROCESSING_STATE" });
  }

  if (message.type === "START_RECORDING") {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.id) {
      throw new Error("No active tab is available. Open the meeting tab and start the recording again.");
    }

    await ensureOffscreenDocument();
    const currentStatus = await sendOffscreenMessage({ type: "GET_STATUS" });
    if (isRecordingSnapshot(currentStatus)) {
      if (currentStatus.status === "recording" || currentStatus.status === "stopping") {
        throw new Error("A recording is already in progress. Stop it before starting a new one.");
      }
      if (currentStatus.status === "error") {
        await sendOffscreenMessage({ type: "RESET" });
      }
    }

    const streamId = await getTabMediaStreamId(tab.id);
    const result = await sendOffscreenMessage({
      type: "START",
      streamId,
      includeMic: message.includeMic,
      microphoneDeviceId: message.microphoneDeviceId
    });
    await setActionState(ICON_RECORDING, RECORDING_BADGE_TEXT);
    return result;
  }

  if (message.type === "STOP_RECORDING") {
    await ensureOffscreenDocument();
    const result = await sendOffscreenMessage({ type: "STOP" });
    await setActionState(ICON_DEFAULT);
    return result;
  }

  if (message.type === "RECORDING_STOPPED") {
    await setActionState(ICON_DEFAULT);
    return undefined;
  }

  if (message.type === "RESET_RECORDING") {
    await ensureOffscreenDocument();
    const result = await sendOffscreenMessage({ type: "RESET" });
    await setActionState(ICON_DEFAULT);
    return result;
  }

  if (message.type === "START_TRANSCRIPTION") {
    await ensureOffscreenDocument();
    return sendOffscreenMessage({ type: "PROCESS_TRANSCRIPTION" });
  }

  if (message.type === "START_SUMMARY") {
    await ensureOffscreenDocument();
    return sendOffscreenMessage({ type: "PROCESS_SUMMARY", meetingId: message.meetingId });
  }

  throw new Error("The recording action is not supported.");
}

let creatingOffscreenDocument: Promise<void> | null = null;

async function ensureOffscreenDocument(): Promise<void> {
  if (creatingOffscreenDocument) {
    return creatingOffscreenDocument;
  }

  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH);
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [offscreenUrl]
  });

  if (contexts.length > 0) {
    return;
  }

  const promise = chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT_PATH,
    reasons: [chrome.offscreen.Reason.USER_MEDIA],
    justification: "Record the active browser tab and optional microphone for local meeting transcription."
  }).finally(() => {
    creatingOffscreenDocument = null;
  });

  creatingOffscreenDocument = promise;
  return promise;
}

function getTabMediaStreamId(targetTabId: number): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.tabCapture.getMediaStreamId({ targetTabId }, (streamId) => {
      const error = chrome.runtime.lastError;
      if (error) {
        const runtimeMessage = error.message ?? "Tab audio could not be captured.";
        const message = runtimeMessage.includes("active stream")
          ? "Chrome still detects an active capture stream for this tab. Stop any running recording, reopen the target tab if needed, and try again."
          : runtimeMessage;
        reject(new Error(message));
        return;
      }
      resolve(streamId);
    });
  });
}

async function sendOffscreenMessage(message: unknown): Promise<unknown> {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) {
    throw new Error(response?.error ?? "The recording service could not be reached. Please try again.");
  }
  return response.data;
}

function getLocalStorageArea(): chrome.storage.LocalStorageArea {
  const storageArea = chrome.storage?.local;
  if (!storageArea) {
    throw new Error("Local Chrome storage is unavailable. Check that the extension has the storage permission and reload it.");
  }
  return storageArea;
}

function isBackgroundRequest(message: unknown): message is BackgroundRequest {
  if (!message || typeof message !== "object" || !("type" in message)) {
    return false;
  }

  return [
    "START_RECORDING",
    "STOP_RECORDING",
    "RESET_RECORDING",
    "GET_RECORDING_STATUS",
    "START_TRANSCRIPTION",
    "START_SUMMARY",
    "GET_PROCESSING_STATUS",
    "GET_LIVE_TRANSCRIPT",
    "STORAGE_GET",
    "STORAGE_SET",
    "STORAGE_REMOVE",
    "START_MIC_PREVIEW",
    "STOP_MIC_PREVIEW",
    "RECORDING_STOPPED"
  ].includes(String((message as { type: unknown }).type));
}

function isRecordingSnapshot(value: unknown): value is { status: string } {
  return Boolean(value && typeof value === "object" && "status" in value);
}
