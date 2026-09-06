import { ContentController } from '@/core/content-controller';
import { createLogger } from '@/utils/logger';

const log = createLogger('entry:content');

/**
 * Content-script entrypoint (§1.2, §0.4).
 *
 * Runs on all normal http/https pages. Privileged pages never load a content
 * script, and `ContentController` additionally no-ops on browser-store hosts.
 * All logic is in {@link ContentController} for testability; teardown is wired
 * to `ctx.onInvalidated` so an extension reload leaves no residue (§5.3).
 */
export default defineContentScript({
  matches: ['*://*/*'],
  runAt: 'document_idle',
  // Keep to the top frame in Phase 1; cross-frame support is assessed later (§1.3).
  allFrames: false,
  async main(ctx) {
    const controller = new ContentController();
    ctx.onInvalidated(() => controller.stop());

    try {
      await controller.start();
    } catch (err) {
      // Fail soft — never break the host page (§31 Rule 13).
      log.error('content controller failed to start', err);
      controller.stop();
    }
  },
});
