import { test as base, chromium, type BrowserContext } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = resolve(here, '..', '.output', 'chrome-mv3');

/**
 * A persistent context with the built extension loaded (MV3 requires a
 * non-headless / `--headless=new` persistent context for extensions).
 */
export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
}>({
  context: async ({}, use) => {
    if (!existsSync(EXTENSION_PATH)) {
      throw new Error(
        `Built extension not found at ${EXTENSION_PATH}. Run \`npm run build\` first.`,
      );
    }
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      args: [
        '--headless=new',
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
      ],
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    let [sw] = context.serviceWorkers();
    sw ??= await context.waitForEvent('serviceworker');
    const id = new URL(sw.url()).host;
    await use(id);
  },
});

export const expect = test.expect;

/**
 * Content scripts match http/https origins only, never `data:` URLs, so the
 * fixture page is served from a fake https origin via request interception.
 */
export const TEST_PAGE = 'https://writeright.test/editors';

const TEST_PAGE_HTML = `
<!doctype html><meta charset="utf-8"><title>WriteRight e2e</title>
<body style="font:16px system-ui;padding:2rem;max-width:52rem;margin:0 auto">
  <h1>Editor fixtures</h1>
  <p id="para">Type into either field. The password field must stay untouched.
     A moment of serendipity can brighten the whole day.</p>
  <textarea id="ta" rows="5" cols="60" style="width:100%;font:inherit;padding:10px"></textarea>
  <div id="ce" contenteditable="true"
       style="border:1px solid #ccc;padding:10px;min-height:5em;margin-top:1rem"></div>
  <input id="pw" type="password" placeholder="password" style="margin-top:1rem">
  <input id="search" type="text" placeholder="search"
       style="display:block;margin-top:1rem;width:420px;font:inherit;padding:8px 10px">
</body>`;

/** Navigate to the fixture page with the content script active. */
export async function gotoTestPage(
  page: import('@playwright/test').Page,
): Promise<void> {
  await page.route('https://writeright.test/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: TEST_PAGE_HTML }),
  );
  await page.goto(TEST_PAGE);
  await waitForWriteRight(page);
}

/**
 * A stand-in for the Google Docs editor: text on a `<canvas>`, keystrokes via
 * an off-screen iframe, and a stray title `<input>` in the top DOM. WriteRight
 * must call the page unsupported and steer to the sidebar regardless (§5.1).
 */
const GDOCS_STUB_HTML = `
<!doctype html><meta charset="utf-8"><title>Untitled document - Google Docs</title>
<body style="margin:0">
  <input class="docs-title-input" type="text" value="Untitled document"
         style="font:15px system-ui;border:none;padding:6px 8px;width:280px">
  <canvas width="800" height="600" style="display:block;margin:16px auto;border:1px solid #ddd"></canvas>
  <iframe class="docs-texteventtarget-iframe" aria-hidden="true"
          style="position:absolute;top:-1px;left:-1px;width:1px;height:1px"></iframe>
</body>`;

export const GDOCS_PAGE =
  'https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQr/edit';

/** Navigate to the Google Docs stub with the content script active. */
export async function gotoGoogleDocsStub(
  page: import('@playwright/test').Page,
): Promise<void> {
  await page.route('https://docs.google.com/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: GDOCS_STUB_HTML }),
  );
  await page.goto(GDOCS_PAGE);
  await waitForWriteRight(page);
}

/** Wait until the content script has mounted its host and reported page status. */
export async function waitForWriteRight(page: import('@playwright/test').Page) {
  await page.waitForSelector('#writeright-host[data-wr-availability]', {
    state: 'attached',
    timeout: 10_000,
  });
}

/** Current suggestion count the content script reflects onto the light DOM. */
export function suggestionCount(
  page: import('@playwright/test').Page,
): Promise<number> {
  return page.evaluate(() =>
    Number(
      document
        .querySelector('#writeright-host')
        ?.getAttribute('data-wr-suggestions') ?? '0',
    ),
  );
}
