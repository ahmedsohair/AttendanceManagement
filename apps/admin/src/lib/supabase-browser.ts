"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null = null;

function getSupabaseBrowserConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY?.trim();

  if (!url || !publishableKey) {
    throw new Error(
      "Supabase browser auth is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY."
    );
  }

  return { url, publishableKey };
}

export function getSupabaseBrowserClient() {
  if (!cachedClient) {
    const { url, publishableKey } = getSupabaseBrowserConfig();
    cachedClient = createBrowserClient(url, publishableKey);
  }

  return cachedClient;
}
