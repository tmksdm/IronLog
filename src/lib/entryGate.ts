// src/lib/entryGate.ts

/**
 * Entry gate: the host check runs before the application module is imported.
 *
 * `HostGuard` checks the same decision again at render time and stays as the
 * second line of defence. This gate is what keeps the application, the local
 * database and the service-worker registration from being
 * loaded at all on a hostname that does not belong to the build — see
 * src/main.tsx, which reaches App only through `resolveEntry`.
 *
 * The policy itself is not duplicated: `decideHost` from ./buildTarget remains
 * the single source of truth for which hostnames a build may run on.
 */

import {
  decideHost,
  type BuildKind,
  type HostGuardDecision,
  type HostGuardOptions,
} from './buildTarget';

export interface EntryResolution<T> {
  decision: HostGuardDecision;
  /** The loaded application module; null when the host is blocked or loading failed. */
  module: T | null;
  /** Why loading failed; null when the host is blocked or loading succeeded. */
  error: unknown | null;
}

/**
 * Resolves the entry. On a blocked hostname `load` is never called; on an allowed
 * hostname it runs exactly once and its failure is returned instead of thrown, so
 * the caller always renders a final screen rather than waiting forever.
 */
export async function resolveEntry<T>(
  hostname: string,
  buildKind: BuildKind,
  load: () => Promise<T>,
  options: HostGuardOptions = {}
): Promise<EntryResolution<T>> {
  const decision = decideHost(hostname, buildKind, options);

  if (!decision.allowed) {
    return { decision, module: null, error: null };
  }

  try {
    return { decision, module: await load(), error: null };
  } catch (error) {
    return { decision, module: null, error };
  }
}
