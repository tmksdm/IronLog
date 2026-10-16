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

/**
 * Stable marker for the CI artifact check. Nothing imports this module by name:
 * the marker can only reach the bundle if the resolver replaced the real client
 * module, which is the isolation mechanism being verified.
 */
export const CLOUD_STUB_MARKER = 'ironlog-cloud-stub';

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
      return { error: new Error(`${CLOUD_STUB_MARKER}: облако отключено в тестовой сборке`) };
    },
    async signOut(): Promise<{ error: null }> {
      return { error: null };
    },
  },
  from(): never {
    throw new Error(
      `${CLOUD_STUB_MARKER}: обращения к Supabase запрещены в тестовой сборке`
    );
  },
};
