// src/lib/cloudStubContract.ts
//
// Compile-time contract between the production cloud modules and the stubs that
// replace them in the test build.
//
// `npm run build:test` swaps three modules for stubs at resolve time (see
// vite.config.ts, TEST_BUILD_MODULE_STUBS). TypeScript knows nothing about that
// substitution: `tsc -b` always resolves the real modules, so without this file a
// stub could quietly fall behind the interface the application calls and the test
// build would only fail at runtime.
//
// The application never imports this file. It is type-level evidence only, and
// `tsc -b` checks it in all four builds, which is what makes it part of the
// standard CI instead of a separate step.

import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import type { ReactNode } from 'react';

import type { CloudDeletionType } from './sync';
import * as realSync from './sync';
import * as stubSync from './sync.disabled';
import { SyncDiagnostics as RealSyncDiagnostics } from '../components/settings/SyncDiagnostics';
import { SyncDiagnostics as StubSyncDiagnostics } from '../components/settings/SyncDiagnostics.disabled';
import {
  CLOUD_ENABLED as realCloudEnabled,
  SUPABASE_PROJECT_REF as realProjectRef,
  supabase as realSupabase,
} from './supabase';
import {
  CLOUD_ENABLED as stubCloudEnabled,
  CLOUD_STUB_MARKER,
  SUPABASE_PROJECT_REF as stubProjectRef,
  supabase as stubSupabase,
} from './supabase.disabled';

// --------------------------------------------------------------- sync module
//
// Every cloud operation takes and returns primitives, so the whole module can be
// compared strictly. Parameters are checked contravariantly, which also covers
// the duplication of `CloudDeletionType`: the union is declared twice, and a
// member added to the production copy makes the stub's narrower copy fail here.

export const syncModuleContract: typeof realSync = stubSync;

// ------------------------------------------------------ diagnostics component
//
// Not a strict module comparison: a component may legally return `null`, and the
// stub does, so comparing the inferred return types would report a difference
// that does not exist for any caller. What the application depends on is that
// both components stay callable without props and keep returning renderable
// output, so that is what the contract states.

export const diagnosticsSurface: {
  real: () => ReactNode;
  stub: () => ReactNode;
} = { real: RealSyncDiagnostics, stub: StubSyncDiagnostics };

// ------------------------------------------------------------- supabase client
//
// The client is compared through an explicit surface instead of a strict module
// comparison, for two reasons:
//
//   - the stub is deliberately a narrow object rather than a SupabaseClient, so
//     it can never be assignable to the real client type;
//   - `AuthError` declares a `protected` member, which makes it nominal, so it
//     cannot be produced without the SDK — and the SDK must stay out of the test
//     build.
//
// Both sides are asserted against the same surface. The real side keeps the
// contract honest (a member production loses fails here), the stub side keeps the
// test build honest.
//
// `error` is typed `unknown` on purpose: the field is part of the shape callers
// destructure, but its SDK type is the nominal `AuthError`. No payload accuracy
// is lost by that, because application code compiles against the real modules and
// gets the real domain types there.

export interface SupabaseAuthSurface {
  getSession(): Promise<{ data: { session: Session | null }; error: unknown }>;
  onAuthStateChange(
    callback: (event: AuthChangeEvent, session: Session | null) => void
  ): { data: { subscription: { unsubscribe(): void } } };
  signInWithPassword(credentials: {
    email: string;
    password: string;
  }): Promise<{ error: unknown }>;
  signOut(): Promise<{ error: unknown }>;
}

export interface SupabaseClientSurface {
  auth: SupabaseAuthSurface;
}

export const realSupabaseSurface: SupabaseClientSurface = realSupabase;
export const stubSupabaseSurface: SupabaseClientSurface = stubSupabase;

// ------------------------------------------------------------ build identity
//
// These values are meant to differ between the builds, so they are asserted one
// by one rather than compared with each other.

export const realCloudFlag: boolean = realCloudEnabled;
/** The test build must never enable cloud code paths. */
export const stubCloudFlag: false = stubCloudEnabled;
export const realProjectRefIsString: string = realProjectRef;
/** An empty ref is what stops the test build from finding a cached session. */
export const stubProjectRefIsEmpty: '' = stubProjectRef;
/** The artifact check in CI searches the test bundle for exactly this string. */
export const stubMarkerIsStable: 'ironlog-cloud-stub' = CLOUD_STUB_MARKER;

// -------------------------------------------------------- negative assertions
//
// Each block below is a shape the contract must reject. The value is derived from
// the real stub, so the only error `@ts-expect-error` can consume is the contract
// mismatch itself, and the corrected twin next to it shows that.
//
// These directives are also the guard against a vacuous contract: if the checks
// above are ever weakened (widened to `any`, replaced by a cast, or made
// optional), the corresponding directive stops being needed and TypeScript
// reports TS2578 in the same standard build.

function withoutPullupDelete(mod: typeof stubSync) {
  const { deletePullupLogsFromCloud: dropped, ...rest } = mod;
  void dropped;
  return rest;
}

// @ts-expect-error — a module that lost an export is not a drop-in replacement
export const missingExportRejected: typeof realSync = withoutPullupDelete(stubSync);

/** Production-shaped declaration: both parameters are the ones ./sync declares. */
declare const queueCloudDeletionWithStringId: (
  entityType: CloudDeletionType,
  entityId: string
) => Promise<void>;

/** The same call with its second parameter narrowed to a number. */
declare const queueCloudDeletionWithNumberId: (
  entityType: CloudDeletionType,
  entityId: number
) => Promise<void>;

export const narrowedParameterRejected: typeof realSync = {
  ...stubSync,
  // @ts-expect-error — a narrowed parameter type cannot stand in for the real one
  queueCloudDeletion: queueCloudDeletionWithNumberId,
};
// The corrected twin compiles, so the error above is the parameter type alone.
export const matchingParameterAccepted: typeof realSync = {
  ...stubSync,
  queueCloudDeletion: queueCloudDeletionWithStringId,
};

function withVoidFlush(mod: typeof stubSync) {
  return { ...mod, flushPendingCloudDeletions: async () => {} };
}

function withNumericFlush(mod: typeof stubSync) {
  return { ...mod, flushPendingCloudDeletions: async () => 0 };
}

// @ts-expect-error — a changed return type breaks the callers that read it
export const changedReturnTypeRejected: typeof realSync = withVoidFlush(stubSync);
export const matchingReturnTypeAccepted: typeof realSync = withNumericFlush(stubSync);

function withoutSessionField(auth: SupabaseAuthSurface) {
  return { ...auth, getSession: async () => ({ data: {}, error: null }) };
}

export const missingSessionRejected: SupabaseClientSurface = {
  // @ts-expect-error — a stub that stopped reporting a session is not compatible
  auth: withoutSessionField(stubSupabase.auth),
};
export const sessionReportingAccepted: SupabaseClientSurface = {
  auth: {
    ...stubSupabase.auth,
    getSession: async () => ({ data: { session: null }, error: null }),
  },
};

interface SurfaceWithInventedMember extends SupabaseClientSurface {
  auth: SupabaseAuthSurface & { disconnectAllDevices(): void };
}

export const inventedMemberRejected: SurfaceWithInventedMember = {
  // @ts-expect-error — the surface must not require a member the real client lacks
  auth: realSupabase.auth,
};

declare const componentWithRequiredProp: (props: { sessionId: string }) => ReactNode;
declare const componentReturningUnrenderable: () => { kind: 'not-a-node' };

// @ts-expect-error — a component that needs a prop no longer matches the call sites
export const componentWithPropRejected: () => ReactNode = componentWithRequiredProp;
// @ts-expect-error — a component must still return something React can render
export const componentReturningNonNodeRejected: () => ReactNode =
  componentReturningUnrenderable;
