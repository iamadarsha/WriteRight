import { test, expect, gotoTestPage, suggestionCount } from './fixtures';
import type { BrowserContext, Page } from '@playwright/test';

/**
 * §5.6 / §9.2 visual regression. Snapshots of the critical surfaces in every
 * state the design contract calls out: light, dark, high-contrast,
 * reduced-motion, narrow popup, long-content, and keyboard-focus.
 *
 * First run writes baselines into `e2e/__screenshots__/`; review and commit
 * them. Later runs fail on an unexpected diff — re-baseline deliberately with
 * `npx playwright test --project=visual --update-snapshots`.
 *
 * The in-page surfaces render inside a closed shadow root, so these capture the
 * viewport rather than a shadow element; they still catch layout, colour and
 * motion regressions.
 */

const DIFF = { maxDiffPixelRatio: 0.02 } as const;

type Media = Parameters<Page['emulateMedia']>[0];

async function popup(
  context: BrowserContext,
  id: string,
  media: Media = {},
): Promise<Page> {
  const page = await context.newPage();
  await page.setViewportSize({ width: 380, height: 600 });
  await page.emulateMedia(media);
  await page.goto(`chrome-extension://${id}/popup.html`);
  await page.waitForLoadState('networkidle');
  return page;
}

async function options(
  context: BrowserContext,
  id: string,
  media: Media = {},
  width = 900,
): Promise<Page> {
  const page = await context.newPage();
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia(media);
  await page.goto(`chrome-extension://${id}/options.html`);
  await page.waitForLoadState('networkidle');
  return page;
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`popup — ${colorScheme}`, async ({ context, extensionId }) => {
    const page = await popup(context, extensionId, { colorScheme });
    await expect(page).toHaveScreenshot(`popup-${colorScheme}.png`, DIFF);
  });

  test(`options — ${colorScheme}`, async ({ context, extensionId }) => {
    const page = await options(context, extensionId, { colorScheme });
    await expect(page).toHaveScreenshot(`options-${colorScheme}.png`, {
      ...DIFF,
      fullPage: true,
    });
  });
}

// `prefers-contrast: more` is what Playwright can actually apply to the render
// (its `forced-colors` emulation only flips the media query, not the palette).
// The `@media (forced-colors: active)` rules in the stylesheets carry the
// Windows-high-contrast / system-colours story and are verified by inspection.
test('popup — high contrast', async ({ context, extensionId }) => {
  const page = await popup(context, extensionId, { contrast: 'more' });
  await expect(page).toHaveScreenshot('popup-contrast.png', DIFF);
});

test('options — high contrast', async ({ context, extensionId }) => {
  const page = await options(context, extensionId, { contrast: 'more' });
  await expect(page).toHaveScreenshot('options-contrast.png', {
    ...DIFF,
    fullPage: true,
  });
});

test('popup — reduced motion (settled)', async ({ context, extensionId }) => {
  const page = await popup(context, extensionId, { reducedMotion: 'reduce' });
  await expect(page).toHaveScreenshot('popup-reduced-motion.png', DIFF);
});

test('popup — keyboard focus', async ({ context, extensionId }) => {
  const page = await popup(context, extensionId);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(page).toHaveScreenshot('popup-focus.png', DIFF);
});

test('options — narrow viewport', async ({ context, extensionId }) => {
  const page = await options(context, extensionId, {}, 420);
  await expect(page).toHaveScreenshot('options-narrow.png', {
    ...DIFF,
    fullPage: true,
  });
});

test('in-page — idle state, nothing focused, nothing visible', async ({
  context,
}) => {
  // Regression guard: the define pill and launcher both set an unconditional
  // `display` in their CSS, which out-ranks the User-Agent default
  // `[hidden] { display: none }` rule — so `el.hidden = true` alone did NOT
  // hide them; they rendered at their default position from first mount.
  // Both live in a closed shadow root, so no locator can inspect their
  // computed style directly — a pixel snapshot of the idle page (nothing
  // clicked, nothing selected) is the only thing that actually catches this.
  const page = await context.newPage();
  await page.setViewportSize({ width: 900, height: 600 });
  await gotoTestPage(page);
  await page.waitForTimeout(400);
  await expect(page).toHaveScreenshot('inpage-idle-nothing-visible.png', DIFF);
});

/**
 * Screenshot just the field's own box (plus a small margin). The in-page
 * underline sits inside a closed shadow root — no locator can read its
 * computed style — and a full-page shot dilutes a few-pixel underline band
 * far below `maxDiffPixelRatio`, so a wrong underline (a filled block over the
 * text, a wavy line, the wrong colour) sails through. Clipping tight makes the
 * underline a large fraction of the compared pixels, so it actually gets caught.
 */
async function shotOfField(
  page: Page,
  selector: string,
  name: string,
): Promise<void> {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`no box for ${selector}`);
  const clip = {
    x: Math.max(0, box.x - 8),
    y: Math.max(0, box.y - 8),
    width: box.width + 16,
    height: box.height + 16,
  };
  await expect(page).toHaveScreenshot(name, { ...DIFF, clip });
}

/**
 * Wait for the debounced analysis to actually land (≥ `min` suggestions) and
 * for the geometry tracker's rAF + 1s poll to settle, rather than a fixed
 * `waitForTimeout` that races the last reposition and shifts the underline
 * band a sub-pixel between runs.
 */
async function waitForUnderlines(page: Page, min: number): Promise<void> {
  await expect
    .poll(() => suggestionCount(page), { timeout: 10_000 })
    .toBeGreaterThanOrEqual(min);
  await page.waitForTimeout(1100); // past one poll tick
  await page.evaluate(
    () =>
      new Promise<void>((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => r())),
      ),
  );
}

test('in-page — underlines on a textarea', async ({ context }) => {
  // Guards the regression a user hit on a real search box: the mirror wraps
  // each flag in `<span class="wr-u wr-u-error">` around the *mirrored text*,
  // so a `background-color` on that class paints a solid block the full height
  // of the line, right over the field — hiding everything typed.
  const page = await context.newPage();
  await page.setViewportSize({ width: 900, height: 600 });
  await gotoTestPage(page);
  await page.locator('#ta').click();
  await page
    .locator('#ta')
    .pressSequentially('I havve teh reciept for the meetign.', { delay: 20 });
  await waitForUnderlines(page, 3);
  await shotOfField(page, '#ta', 'inpage-underlines.png');
});

test('in-page — underlines on a single-line text input', async ({
  context,
}) => {
  // The `<input type="text">` path (a search box) — the exact field type and
  // renderer where the "block hides the text" regression was reported.
  const page = await context.newPage();
  await page.setViewportSize({ width: 900, height: 600 });
  await gotoTestPage(page);
  await page.locator('#search').click();
  await page
    .locator('#search')
    .pressSequentially('viewsonic teh moniter', { delay: 25 });
  await expect(page.locator('#search')).toHaveValue('viewsonic teh moniter');
  await waitForUnderlines(page, 2);
  await shotOfField(page, '#search', 'inpage-underlines-input.png');
});

test('in-page — underlines on a roomy search box (no strike-through)', async ({
  context,
}) => {
  // A real search box has generous vertical padding, so the browser centres
  // its single line. The mirror <div> top-aligns text, so without matching
  // that centring the underline lands mid-glyph and looks like a strike
  // (magsafe repro). The clip makes any vertical mis-placement obvious.
  const page = await context.newPage();
  await page.setViewportSize({ width: 900, height: 600 });
  await gotoTestPage(page);
  await page.locator('#search-tall').click();
  await page
    .locator('#search-tall')
    .pressSequentially('magsafe chargr accesories', { delay: 25 });
  await waitForUnderlines(page, 2);
  await shotOfField(page, '#search-tall', 'inpage-underlines-input-tall.png');
});

test('in-page — underlines on a contenteditable field', async ({ context }) => {
  // Regression guard for a real CSS bug (§18.3): `.wr-ce-mark[data-wavy]` is
  // `height: 0` with a transparent border and an entirely background-image-
  // driven wavy line. Its default `background-origin: padding-box` anchored
  // that gradient to a zero-height box positioned outside the (default
  // border-box) clip region, so it computed correctly and painted nothing —
  // on every contenteditable field, always. This is the one that actually
  // exercises ContentEditableRangeRenderer.
  const page = await context.newPage();
  await page.setViewportSize({ width: 900, height: 600 });
  await gotoTestPage(page);
  await page.locator('#ce').click();
  await page
    .locator('#ce')
    .pressSequentially('I havve teh reciept for the meetign.', { delay: 20 });
  await waitForUnderlines(page, 3);
  await shotOfField(page, '#ce', 'inpage-underlines-contenteditable.png');
});

test('in-page — a scrolled contenteditable does not scatter marks outside it (§18.3 chatgpt.com repro)', async ({
  context,
}) => {
  // ChatGPT's composer: a contenteditable that grows tall inside a short
  // `overflow:auto` parent that scrolls it. `Range.getClientRects()` still
  // reports the full laid-out position of every line, so marks for lines
  // scrolled out of the small window landed all over the page (over the
  // message history). They must be clipped to the field's visible box.
  const page = await context.newPage();
  await page.setViewportSize({ width: 900, height: 950 });
  await gotoTestPage(page);
  const ce = page.locator('#scrollce');
  await ce.click();
  const lines = Array.from(
    { length: 12 },
    () => 'Teh studnet recieved thier reciept seperately yesterdey.',
  );
  await ce.evaluate((el, text) => {
    el.focus();
    document.execCommand('insertText', false, text);
  }, lines.join('\n'));
  await waitForUnderlines(page, 12);
  // Scroll the little window to the middle so lines exist both above and below.
  await page.locator('#scroll-wrap').evaluate((w) => {
    w.scrollTop = w.scrollHeight / 2;
    document.dispatchEvent(new Event('scroll'));
  });
  await page.waitForTimeout(1100);
  await page.evaluate(
    () =>
      new Promise<void>((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => r())),
      ),
  );

  // The band directly ABOVE the field (an empty editor sits there) must be
  // clean. Before the fix, marks for the composer's scrolled-out lines rendered
  // here in a dense scattered grid — so any red at all in this strip is the
  // regression.
  const box = await page.locator('#scroll-wrap').boundingBox();
  if (!box) throw new Error('no box for #scroll-wrap');
  await expect(page).toHaveScreenshot('inpage-scrollce-no-scatter.png', {
    maxDiffPixelRatio: 0.004,
    clip: {
      x: Math.max(0, box.x - 8),
      y: Math.max(0, box.y - 190),
      width: box.width + 16,
      height: 170,
    },
  });
});

test('in-page — sidebar open', async ({ context }) => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1100, height: 720 });
  await gotoTestPage(page);
  await page.locator('#ta').click();
  await page
    .locator('#ta')
    .pressSequentially('This sentence are wrong and its very very wordy.', {
      delay: 15,
    });
  await page.waitForTimeout(1200);
  await page.keyboard.press('Alt+w');
  await page.waitForTimeout(600);
  await expect(page).toHaveScreenshot('inpage-sidebar.png', DIFF);
});

test('in-page — define panel', async ({ context }) => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 900, height: 560 });
  await gotoTestPage(page);
  await page.locator('#para').evaluate((p) => {
    const text = p.firstChild as Text;
    const idx = p.textContent!.indexOf('serendipity');
    const range = document.createRange();
    range.setStart(text, idx);
    range.setEnd(text, idx + 'serendipity'.length);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await page.waitForTimeout(400);
  await page.keyboard.press('Alt+Shift+d');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document
            .querySelector('#writeright-host')
            ?.getAttribute('data-wr-define') ?? '',
      ),
    )
    .toMatch(/senses:/);
  await page.waitForTimeout(300);
  await expect(page).toHaveScreenshot('inpage-define.png', DIFF);
});
