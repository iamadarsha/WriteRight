/**
 * Opt-in local AI chat transcript (§4.7, §28).
 *
 * Stored only while `settings.ai.keepChatHistory` is on. Plain `storage.local`,
 * capped, never synced. "Reset all local data" removes it (§28).
 */

import { storage } from '#imports';
import type { AiChatTurn } from '@/ai/ai-types';
import { STORAGE_KEYS } from './keys';

const MAX_TURNS = 40;
const MAX_TURN_CHARS = 8000;

function sanitize(turns: readonly AiChatTurn[]): AiChatTurn[] {
  return turns
    .filter(
      (t): t is AiChatTurn =>
        !!t &&
        (t.role === 'user' || t.role === 'assistant') &&
        typeof t.content === 'string',
    )
    .slice(-MAX_TURNS)
    .map((t) => ({
      role: t.role,
      content: t.content.slice(0, MAX_TURN_CHARS),
    }));
}

export async function getChatHistory(): Promise<AiChatTurn[]> {
  const raw = await storage.getItem<AiChatTurn[]>(STORAGE_KEYS.aiChat);
  return Array.isArray(raw) ? sanitize(raw) : [];
}

export async function setChatHistory(
  turns: readonly AiChatTurn[],
): Promise<void> {
  const clean = sanitize(turns);
  if (clean.length === 0) {
    await storage.removeItem(STORAGE_KEYS.aiChat);
    return;
  }
  await storage.setItem(STORAGE_KEYS.aiChat, clean);
}

export async function clearChatHistory(): Promise<void> {
  await storage.removeItem(STORAGE_KEYS.aiChat);
}
