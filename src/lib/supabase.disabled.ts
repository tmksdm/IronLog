// src/lib/supabase.disabled.ts
//
// Test build stub. Replaces ./supabase when the app is built with
// `npm run build:test` (see vite.config.ts, mode "testdeploy").
//
// No SDK, no URL, no key, no session, no background requests. The production
// module is not part of the test bundle at all: the substitution happens at
// resolve time, and the build fails if any production credential reaches the
// artifact.

/** The test build has no cloud and therefore no authentication. */
export const CLOUD_ENABLED = false;

/** No Supabase project is configured in the test build. */
export const SUPABASE_PROJECT_REF = '';

export const supabase = {
  auth: {
    async getSession(): Promise<{ data: { session: null } }> {
      return { data: { session: null } };
    },
    onAuthStateChange(): { data: { subscription: { unsubscribe: () => void } } } {
      return { data: { subscription: { unsubscribe: () => {} } } };
    },
    async signInWithPassword(): Promise<{ error: Error }> {
      return { error: new Error('Облако отключено в тестовой сборке') };
    },
    async signOut(): Promise<{ error: null }> {
      return { error: null };
    },
  },
  from(): never {
    throw new Error('Облако отключено в тестовой сборке: обращения к Supabase запрещены');
  },
};
