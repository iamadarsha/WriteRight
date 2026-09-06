import { BackgroundController } from '@/core/background-controller';
import { EngineService } from '@/core/engine-service';
import { AiService } from '@/ai/ai-service';
import { LexiconService } from '@/core/lexicon-service';
import { createLogger } from '@/utils/logger';

const log = createLogger('entry:background');

/**
 * Background entrypoint (§1.2, §2.2, §4.5).
 *
 * Hosts the message router ({@link BackgroundController}), the local linguistic
 * engine ({@link EngineService} — Harper/WASM + custom rules) and the optional
 * local-AI service ({@link AiService} — on-device / loopback adapters).
 * Running everything here keeps it off every page's main thread with one
 * implementation across Chromium and Firefox; the MV3 service worker
 * re-initializes on a cold wake, which the content layer tolerates (§5.3).
 * The AI service does nothing until the user turns on `features.ai`.
 */
export default defineBackground(() => {
  const controller = new BackgroundController({
    engine: new EngineService(),
    ai: new AiService(),
    lexicon: new LexiconService(),
  });
  controller.start().catch((err) => {
    log.error('background failed to start', err);
  });
});
