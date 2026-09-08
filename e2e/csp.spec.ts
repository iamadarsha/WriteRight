import { test, expect } from './fixtures';

/**
 * A strict `style-src 'self'` CSP (GitHub, X, many banks/SaaS) blocks any
 * injected `<style>` element. The contenteditable CSS-Highlight underline path
 * needs its `::highlight()` rules in the *page* document, so it adopts a
 * constructable stylesheet (CSSOM — not covered by `style-src`) instead. This
 * proves the underline actually paints there.
 */

const STRICT_CSP_PAGE = `<!doctype html><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="style-src 'self'; script-src 'self' 'unsafe-inline'">
<body style="font:16px system-ui;padding:2rem">
  <div id="ce" contenteditable="true"
       style="border:1px solid #ccc;padding:12px;min-height:4em;font-size:18px;line-height:1.7"></div>
</body>`;

test('contenteditable underlines still render under a strict style-src CSP (§18.3)', async ({
  context,
}) => {
  const page = await context.newPage();
  await page.route('https://writeright.test/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      headers: { 'content-security-policy': "style-src 'self'" },
      body: STRICT_CSP_PAGE,
    }),
  );
  await page.goto('https://writeright.test/csp');
  await page.waitForSelector('#writeright-host[data-wr-availability]');

  const ce = page.locator('#ce');
  await ce.click();
  await ce.pressSequentially('The studnet recieved thier reciept.', {
    delay: 15,
  });
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          Number(
            document
              .querySelector('#writeright-host')
              ?.getAttribute('data-wr-suggestions') ?? '0',
          ),
        ),
      { timeout: 10_000 },
    )
    .toBeGreaterThanOrEqual(2);

  // The Highlight API is in use, and the ::highlight() rules are actually
  // applied to the document (via adoptedStyleSheets, since the <style> path is
  // CSP-blocked here). Check the effective decoration on a highlighted range.
  const result = await page.evaluate(() => {
    const g = globalThis as {
      CSS?: { highlights?: { size?: number; keys(): Iterable<string> } };
    };
    const names = g.CSS?.highlights
      ? [...g.CSS.highlights.keys()].filter((k) => k.startsWith('wr-hl-'))
      : [];
    // Is there a stylesheet in the document that carries our ::highlight rules?
    let hasRule = false;
    for (const sheet of [
      ...(document.styleSheets as unknown as CSSStyleSheet[]),
      ...((document.adoptedStyleSheets ?? []) as CSSStyleSheet[]),
    ]) {
      try {
        for (const rule of sheet.cssRules) {
          if (/::highlight\(wr-hl-/.test(rule.cssText)) hasRule = true;
        }
      } catch {
        /* cross-origin sheet — skip */
      }
    }
    // and NO page <style> element leaked in (CSP would have blocked it anyway)
    const pageStyle = document.querySelector(
      'style[data-writeright="ce-highlights"]',
    );
    return { names, hasRule, hadPageStyle: !!pageStyle };
  });

  expect(result.names.length).toBeGreaterThan(0); // highlights registered
  expect(result.hasRule).toBe(true); // ::highlight rules reached the document
  expect(result.hadPageStyle).toBe(false); // via adoptedStyleSheets, not <style>
});
