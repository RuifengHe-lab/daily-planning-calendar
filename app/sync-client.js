import { createClient } from "@supabase/supabase-js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const STORED_SYNC_KEY = "daily-planning-calendar-private-sync-key";
const SYNC_DB_NAME = "daily-planning-calendar-private";
const SYNC_DB_STORE = "local-secrets";
const SYNC_DB_KEY = "private-sync-key";
let client;
let configurationPromise;

function openSyncDatabase() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const request = window.indexedDB.open(SYNC_DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(SYNC_DB_STORE)) {
        request.result.createObjectStore(SYNC_DB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function writeSyncKeyBackup(syncKey) {
  try {
    const database = await openSyncDatabase();
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(SYNC_DB_STORE, "readwrite");
      transaction.objectStore(SYNC_DB_STORE).put(syncKey, SYNC_DB_KEY);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
    await navigator.storage?.persist?.();
  } catch {
    // localStorage remains the primary local copy when IndexedDB is unavailable.
  }
}

async function readSyncKeyBackup() {
  try {
    const database = await openSyncDatabase();
    const value = await new Promise((resolve, reject) => {
      const transaction = database.transaction(SYNC_DB_STORE, "readonly");
      const request = transaction.objectStore(SYNC_DB_STORE).get(SYNC_DB_KEY);
      request.onsuccess = () => resolve(request.result || "");
      request.onerror = () => reject(request.error);
    });
    database.close();
    return value;
  } catch {
    return "";
  }
}

async function clearSyncKeyBackup() {
  try {
    const database = await openSyncDatabase();
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(SYNC_DB_STORE, "readwrite");
      transaction.objectStore(SYNC_DB_STORE).delete(SYNC_DB_KEY);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  } catch {
    // Nothing else is required when the optional backup is unavailable.
  }
}

async function getConfiguration() {
  if (!configurationPromise) {
    configurationPromise = fetch("/api/sync-config", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("无法读取同步配置");
        return response.json();
      })
      .catch(() => ({ configured: false }));
  }
  return configurationPromise;
}

export async function isSyncConfigured() {
  const configuration = await getConfiguration();
  return Boolean(configuration.configured);
}

async function getClient() {
  if (client) return client;
  const configuration = await getConfiguration();
  if (!configuration.configured) throw new Error("云同步尚未配置");
  client = createClient(configuration.url, configuration.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function base64UrlToBytes(value) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function validateSyncKey(value) {
  const syncKey = value.trim();
  if (!syncKey || base64UrlToBytes(syncKey).length !== 32) {
    throw new Error("私人同步链接无效");
  }
  return syncKey;
}

function putSyncKeyInAddress(syncKey) {
  const url = new URL(window.location.href);
  url.hash = new URLSearchParams({ sync: syncKey }).toString();
  window.history.replaceState(null, "", url);
}

function rememberSyncKey(syncKey) {
  const validKey = validateSyncKey(syncKey);
  window.localStorage.setItem(STORED_SYNC_KEY, validKey);
  putSyncKeyInAddress(validKey);
  void writeSyncKeyBackup(validKey);
  return validKey;
}

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function sha256(value) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function deriveSecrets(syncKey) {
  const raw = base64UrlToBytes(syncKey);
  if (raw.length !== 32) throw new Error("私人同步链接无效");
  const material = bytesToBase64(raw);
  const [idBytes, writeBytes, encryptionBytes] = await Promise.all([
    sha256(`calendar-id:${material}`),
    sha256(`calendar-write:${material}`),
    sha256(`calendar-encryption:${material}`),
  ]);
  return {
    id: bytesToHex(idBytes),
    writeToken: bytesToHex(writeBytes),
    encryptionKey: await crypto.subtle.importKey(
      "raw",
      encryptionBytes,
      { name: "AES-GCM" },
      false,
      ["encrypt", "decrypt"],
    ),
  };
}

async function encryptPlans(plans, encryptionKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    encryptionKey,
    encoder.encode(JSON.stringify(plans)),
  );
  return JSON.stringify({
    version: 1,
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(encrypted)),
  });
}

async function decryptPlans(payload, encryptionKey) {
  const parsed = JSON.parse(payload);
  if (parsed.version !== 1) throw new Error("无法识别云端计划格式");
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(parsed.iv) },
    encryptionKey,
    base64ToBytes(parsed.data),
  );
  return JSON.parse(decoder.decode(decrypted));
}

export function getPrivateSyncKey() {
  if (typeof window === "undefined") return "";
  const parameters = new URLSearchParams(window.location.hash.slice(1));
  const linkedKey = parameters.get("sync") || "";
  if (linkedKey) {
    try {
      return rememberSyncKey(linkedKey);
    } catch {
      return "";
    }
  }

  const storedKey = window.localStorage.getItem(STORED_SYNC_KEY) || "";
  if (storedKey) {
    try {
      return rememberSyncKey(storedKey);
    } catch {
      window.localStorage.removeItem(STORED_SYNC_KEY);
    }
  }
  return "";
}

export async function recoverPrivateSyncKey() {
  const immediateKey = getPrivateSyncKey();
  if (immediateKey) return immediateKey;

  const backedUpKey = await readSyncKeyBackup();
  if (!backedUpKey) return "";
  try {
    return rememberSyncKey(backedUpKey);
  } catch {
    await clearSyncKeyBackup();
    return "";
  }
}

export function importPrivateSyncLink(value) {
  const input = value.trim();
  if (!input) throw new Error("请粘贴原来的完整私人链接");

  let syncKey = input;
  try {
    const url = new URL(input);
    syncKey = new URLSearchParams(url.hash.slice(1)).get("sync") || "";
  } catch {
    if (input.startsWith("#")) {
      syncKey = new URLSearchParams(input.slice(1)).get("sync") || "";
    }
  }
  return rememberSyncKey(syncKey);
}

export function createPrivateSyncLink() {
  const syncKey = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  return rememberSyncKey(syncKey);
}

export function clearPrivateSyncLink() {
  window.localStorage.removeItem(STORED_SYNC_KEY);
  void clearSyncKeyBackup();
  const url = new URL(window.location.href);
  url.hash = "";
  window.history.replaceState(null, "", url);
}

export function getPrivateSyncUrl() {
  return window.location.href;
}

export async function loadCloudPlans(syncKey) {
  const supabase = await getClient();
  const { id, encryptionKey } = await deriveSecrets(syncKey);
  const { data, error } = await supabase.rpc("read_calendar", { p_id: id });
  if (error) throw new Error("读取云端计划失败");
  const record = data?.[0];
  if (!record) return null;
  return {
    plans: await decryptPlans(record.payload, encryptionKey),
    updatedAt: Date.parse(record.updated_at) || 0,
  };
}

export async function saveCloudPlans(syncKey, plans, updatedAt = Date.now()) {
  const supabase = await getClient();
  const { id, writeToken, encryptionKey } = await deriveSecrets(syncKey);
  const payload = await encryptPlans(plans, encryptionKey);
  const { data, error } = await supabase.rpc("write_calendar", {
    p_id: id,
    p_write_token: writeToken,
    p_payload: payload,
    p_updated_at: new Date(updatedAt).toISOString(),
  });
  if (error || data !== true) throw new Error("保存云端计划失败");
}

export async function deleteCloudPlans(syncKey) {
  const supabase = await getClient();
  const { id, writeToken } = await deriveSecrets(syncKey);
  const { data, error } = await supabase.rpc("delete_calendar", {
    p_id: id,
    p_write_token: writeToken,
  });
  if (error || data !== true) throw new Error("旧私人链接停用失败");
}
