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

/** Accepts the production arguments and forgets them: the cloud is not a target. */
function ignoreCloudArguments(...args: unknown[]): void {
  void args;
}

export const supabase = {
  auth: {
    // Mirrors the real client's "no session, no error" response down to the
    // `error` field, so call sites destructuring it see the same shape.
    async getSession(): Promise<{ data: { session: null }; error: null }> {
      return { data: { session: null }, error: null };
    },
    // The callback is accepted and never invoked: without a cloud there are no
    // auth events, so nothing can become "signed in" in the test build. Its
    // parameters are typed `never` because that is exactly the set of arguments
    // this build will ever pass to it.
    onAuthStateChange(
      callback: (event: never, session: never) => void
    ): { data: { subscription: { unsubscribe: () => void } } } {
      ignoreCloudArguments(callback);
      return { data: { subscription: { unsubscribe: () => {} } } };
    },
    async signInWithPassword(credentials: {
      email: string;
      password: string;
    }): Promise<{ error: Error }> {
      ignoreCloudArguments(credentials);
      return { error: new Error(`${CLOUD_STUB_MARKER}: облако отключено в тестовой сборке`) };
    },
    async signOut(): Promise<{ error: null }> {
      return { error: null };
    },
  },
  from(table: string): never {
    ignoreCloudArguments(table);
    throw new Error(
      `${CLOUD_STUB_MARKER}: обращения к Supabase запрещены в тестовой сборке`
    );
  },
};
