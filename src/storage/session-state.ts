/**
 * Ephemeral per-tab state (§6.7).
 *
 * Uses `storage.session` where available (in-memory, cleared on reload/restart)
 * and a plain in-memory Map fallback on browsers that don't expose it. Never
 * falls back to durable storage — ephemeral editor-adjacent state must not
 * become persistent (§6.7, §28).
 */

import { storage } from '#imports';
import type { PageStatus } from '@/types/capability';
import type { DocumentInsights } from '@/types/insights';
import { SESSION_KEYS } from './keys';
import { browserCapabilities } from '@/platform/browser-capabilities';
import { createLogger } from '@/utils/logger';

const log = createLogger('storage:session');

const memory = new Map<string, unknown>();
let sessionAvailable: boolean | null = null;

async function hasSessionArea(): Promise<boolean> {
  if (sessionAvailable !== null) return sessionAvailable;
  // Fast path: the API isn't even present (older Firefox, some Safari builds).
  if (!browserCapabilities().sessionStorage) {
    log.warn('storage.session API absent — using in-memory fallback');
    return (sessionAvailable = false);
  }
  // Present, but a runtime read can still throw — confirm before trusting it.
  try {
    await storage.getItem('session:__probe__');
    sessionAvailable = true;
  } catch {
    log.warn('storage.session unavailable — using in-memory fallback');
    sessionAvailable = false;
  }
  return sessionAvailable;
}

async function sessionSet<T>(key: string, value: T): Promise<void> {
  if (await hasSessionArea()) {
    await storage.setItem(`session:${key}`, value);
  } else {
    memory.set(key, value);
  }
}

async function sessionGet<T>(key: string): Promise<T | null> {
  if (await hasSessionArea()) {
    return (await storage.getItem<T>(`session:${key}`)) ?? null;
  }
  return (memory.get(key) as T | undefined) ?? null;
}

export async function setTabStatus(
  tabId: number,
  status: PageStatus,
): Promise<void> {
  await sessionSet(`${SESSION_KEYS.tabStatusPrefix}${tabId}`, status);
}

export async function getTabStatus(tabId: number): Promise<PageStatus | null> {
  return sessionGet<PageStatus>(`${SESSION_KEYS.tabStatusPrefix}${tabId}`);
}

export async function clearTabStatus(tabId: number): Promise<void> {
  for (const prefix of [
    SESSION_KEYS.tabStatusPrefix,
    SESSION_KEYS.tabInsightsPrefix,
  ]) {
    if (await hasSessionArea()) {
      await storage.removeItem(`session:${prefix}${tabId}`);
    } else {
      memory.delete(`${prefix}${tabId}`);
    }
  }
}

export async function setTabInsights(
  tabId: number,
  insights: DocumentInsights | null,
): Promise<void> {
  await sessionSet(`${SESSION_KEYS.tabInsightsPrefix}${tabId}`, insights);
}

export async function getTabInsights(
  tabId: number,
): Promise<DocumentInsights | null> {
  return sessionGet<DocumentInsights>(
    `${SESSION_KEYS.tabInsightsPrefix}${tabId}`,
  );
}

/** Test-only: reset the in-memory fallback + availability probe. */
export function __resetSessionStateForTests(): void {
  memory.clear();
  sessionAvailable = null;
}
