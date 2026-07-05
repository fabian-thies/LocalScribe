type StorageKeys = string | string[] | Record<string, unknown> | null;

type StorageProxyRequest =
  | { type: "STORAGE_GET"; keys: StorageKeys }
  | { type: "STORAGE_SET"; values: Record<string, unknown> }
  | { type: "STORAGE_REMOVE"; keys: string | string[] };

interface StorageProxyResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

function getDirectStorageArea(): chrome.storage.LocalStorageArea | undefined {
  return typeof chrome !== "undefined" ? chrome.storage?.local : undefined;
}

function hasRuntimeMessaging(): boolean {
  return typeof chrome !== "undefined" && Boolean(chrome.runtime?.sendMessage);
}

export async function getLocalStorage(keys: StorageKeys): Promise<Record<string, unknown>> {
  const storageArea = getDirectStorageArea();
  if (storageArea) {
    return storageArea.get(keys);
  }

  return sendStorageProxy<Record<string, unknown>>({ type: "STORAGE_GET", keys });
}

export async function setLocalStorage(values: Record<string, unknown>): Promise<void> {
  const storageArea = getDirectStorageArea();
  if (storageArea) {
    await storageArea.set(values);
    return;
  }

  await sendStorageProxy<void>({ type: "STORAGE_SET", values });
}

export async function removeLocalStorage(keys: string | string[]): Promise<void> {
  const storageArea = getDirectStorageArea();
  if (storageArea) {
    await storageArea.remove(keys);
    return;
  }

  await sendStorageProxy<void>({ type: "STORAGE_REMOVE", keys });
}

async function sendStorageProxy<T>(message: StorageProxyRequest): Promise<T> {
  if (!hasRuntimeMessaging()) {
    throw new Error("Local Chrome storage is unavailable in this context. Open this page from the installed extension and try again.");
  }

  const response = (await chrome.runtime.sendMessage(message)) as StorageProxyResponse<T> | undefined;
  if (!response?.ok) {
    throw new Error(response?.error ?? "Local Chrome storage could not be updated. Please try again.");
  }

  return response.data as T;
}
