import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const SYNC_CONFIGURED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

let client;

function getClient() {
  if (!SYNC_CONFIGURED) throw new Error("云同步尚未配置");
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}

export async function getCurrentSession() {
  const { data, error } = await getClient().auth.getSession();
  if (error) throw error;
  return data.session;
}

export function watchSession(callback) {
  const { data } = getClient().auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
  return () => data.subscription.unsubscribe();
}

export async function signIn(email, password) {
  const { data, error } = await getClient().auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) throw new Error("邮箱或密码不正确");
  return data.session;
}

export async function signOut() {
  const { error } = await getClient().auth.signOut();
  if (error) throw error;
}

export async function loadCloudPlans(userId) {
  const { data, error } = await getClient()
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
  const { error } = await getClient()
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
