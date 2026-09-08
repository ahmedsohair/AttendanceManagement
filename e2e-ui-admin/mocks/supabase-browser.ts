export function getSupabaseBrowserClient() {
  return { auth: { signOut: async () => ({ error: null }) } };
}
