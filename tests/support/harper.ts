/**
 * Test-only Harper binary provider.
 *
 * In Node/vitest we use the WASM packaged with `harper.js` (its `binary`
 * subpath resolves the file relative to the module). The extension build never
 * imports this — it fetches the synced `.wasm` via `runtime.getURL` (§2.1).
 */
import { binary } from 'harper.js/binary';
import { HarperLinter } from '@/engine/harper/harper-linter';
import type { Dialect } from '@/types/settings';

export function createTestHarperLinter(
  dialect: Dialect = 'en-US',
): HarperLinter {
  return new HarperLinter({ binary, dialect });
}
