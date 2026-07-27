import { createClient } from "@supabase/supabase-js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
let client;
let configurationPromise;

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
  return parameters.get("sync") || "";
}

export function createPrivateSyncLink() {
  const syncKey = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const url = new URL(window.location.href);
  url.hash = new URLSearchParams({ sync: syncKey }).toString();
  window.history.replaceState(null, "", url);
  return syncKey;
}

export function clearPrivateSyncLink() {
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
