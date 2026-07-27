import { createClient } from "@supabase/supabase-js";

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
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
  });
  return client;
}

export async function getCurrentSession() {
  const supabase = await getClient();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export function watchSession(callback) {
  return getClient().then((supabase) => {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
    return () => data.subscription.unsubscribe();
  });
}

export async function signIn(email, password) {
  const supabase = await getClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) throw new Error("邮箱或密码不正确");
  return data.session;
}

export async function signOut() {
  const supabase = await getClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function loadCloudPlans(userId) {
  const supabase = await getClient();
  const { data, error } = await supabase
    .from("calendar_plans")
    .select("plans, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error("读取云端计划失败");
  if (!data) return null;
  return {
    plans: data.plans || {},
    updatedAt: Date.parse(data.updated_at) || 0,
  };
}

export async function saveCloudPlans(userId, plans, updatedAt = Date.now()) {
  const supabase = await getClient();
  const { error } = await supabase
    .from("calendar_plans")
    .upsert(
      {
        user_id: userId,
        plans,
        updated_at: new Date(updatedAt).toISOString(),
      },
      { onConflict: "user_id" },
    );

  if (error) throw new Error("保存云端计划失败");
}
