import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type ExpoExtra = {
  apiBaseUrl?: string;
  supabaseUrl?: string;
  supabasePublishableKey?: string;
};

const runtimeEnv =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ||
  {};
const extra = (Constants.expoConfig?.extra || {}) as ExpoExtra;

const supabaseUrl =
  extra.supabaseUrl ||
  runtimeEnv.EXPO_PUBLIC_SUPABASE_URL ||
  runtimeEnv.NEXT_PUBLIC_SUPABASE_URL ||
  "";

const supabasePublishableKey =
  extra.supabasePublishableKey ||
  runtimeEnv.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  runtimeEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
  "";

let cachedClient: SupabaseClient | null = null;

export function isSupabaseAuthConfigured() {
  return Boolean(supabaseUrl && supabasePublishableKey);
}

export function getMobileSupabaseClient() {
  if (!isSupabaseAuthConfigured()) {
    throw new Error(
      "Supabase mobile auth is not configured. Set the publishable Supabase URL and key in the Expo config."
    );
  }

  if (!cachedClient) {
    cachedClient = createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false
      }
    });
  }

  return cachedClient;
}

export async function signInInvigilator(email: string, password: string) {
  const supabase = getMobileSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function requestPasswordReset(email: string, redirectTo: string) {
  const supabase = getMobileSupabaseClient();
  const { error } = await supabase.auth.resetPasswordForEmail(
    email.trim().toLowerCase(),
    { redirectTo }
  );

  if (error) {
    throw new Error(error.message);
  }
}

export async function signOutInvigilator() {
  if (!isSupabaseAuthConfigured()) {
    return;
  }

  const supabase = getMobileSupabaseClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw new Error(error.message);
  }
}

export async function getAccessToken() {
  if (!isSupabaseAuthConfigured()) {
    return null;
  }

  const supabase = getMobileSupabaseClient();
  const {
    data: { session }
  } = await supabase.auth.getSession();

  return session?.access_token || null;
}

export async function hasActiveSession() {
  if (!isSupabaseAuthConfigured()) {
    return false;
  }

  const token = await getAccessToken();
  return Boolean(token);
}
