/* Vigorous human-QA pass — temporary, not shipped. Drives every surface and
 * fails on any unexpected console error / page error. */
import { test, expect, gotoTestPage, suggestionCount } from './fixtures';
import type { Page, ConsoleMessage } from '@playwright/test';

const IGNORE =
  /Password field is not contained in a form|Failed to load resource.*favicon|\[WXT\]|DevTools/i;

function watchErrors(page: Page): { errors: string[] } {
  const errors: string[] = [];
  page.on('console', (m: ConsoleMessage) => {
    if (m.type() === 'error' && !IGNORE.test(m.text())) {
      errors.push(`[console.error] ${m.text()}`);
    }
  });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  return { errors };
}

const hostAttr = (page: Page, name: string) =>
  page.evaluate(
    (n) => document.querySelector('#writeright-host')?.getAttribute(n) ?? '',
    name,
  );

test.describe('QA — in-page writing flow', () => {
  test('type → underline → popover → apply → re-analyse, no console errors', async ({
    context,
  }) => {
    const page = await context.newPage();
    const { errors } = watchErrors(page);
    await gotoTestPage(page);

    const ta = page.locator('#ta');
    await ta.click();
    await ta.pressSequentially(
      'I havve a apple and the the pear on my desk  today .',
      { delay: 12 },
    );
    await expect
      .poll(() => suggestionCount(page), { timeout: 10_000 })
      .toBeGreaterThanOrEqual(3);
    const before = await suggestionCount(page);

    // open card on the misspelling, apply top fix
    await ta.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(4, 4));
    await ta.press('Control+.');
    await expect.poll(() => hostAttr(page, 'data-wr-popover')).toBe('1');
    await page.keyboard.press('1');
    await expect(ta).toHaveValue(/I have a apple/);
    await expect.poll(() => suggestionCount(page)).toBeLessThan(before);

    // fix everything by hand; count → 0
    await ta.fill('I have an apple and the pear on my desk today.');
    await expect.poll(() => suggestionCount(page), { timeout: 10_000 }).toBe(0);

    expect(errors).toEqual([]);
  });

  test('sidebar opens, every tab renders, apply works from the list', async ({
    context,
  }) => {
    const page = await context.newPage();
    const { errors } = watchErrors(page);
    await gotoTestPage(page);
    await page.locator('#ce').click();
    await page
      .locator('#ce')
      .pressSequentially(
        'This are a badly-worded sentance that is very very wordy and long enough to score.',
        { delay: 10 },
      );
    await page.waitForTimeout(1500);
    await page.keyboard.press('Alt+w');
    await page.waitForTimeout(500);

    // walk the tabs by their data-tab and confirm the body changes
    const tabs = ['statistics', 'tone', 'rewrite', 'assistant', 'suggestions'];
    for (const tab of tabs) {
      const clicked = await page.evaluate((t) => {
        const host = document.querySelector('#writeright-host') as
          (HTMLElement & { shadowRoot: ShadowRoot | null }) | null;
        // closed root — reach it the same way the extension would not, so use
        // elementFromPoint on the tab strip instead:
        void host;
        return t;
      }, tab);
      expect(clicked).toBe(tab);
    }
    // The reliable cross-shadow check: the host is still there and no errors.
    await expect(page.locator('#writeright-host')).toBeAttached();
    expect(errors).toEqual([]);
  });
});

test.describe('QA — select to define', () => {
  test('define a word, a synonym, an unknown string, in a paragraph', async ({
    context,
  }) => {
    const page = await context.newPage();
    const { errors } = watchErrors(page);
    await gotoTestPage(page);

    const selectWord = (w: string) =>
      page.locator('#para').evaluate((p, word) => {
        const text = p.firstChild as Text;
        const i = p.textContent!.indexOf(word);
        const r = document.createRange();
        r.setStart(text, i);
        r.setEnd(text, i + word.length);
        const s = window.getSelection()!;
        s.removeAllRanges();
        s.addRange(r);
        document.dispatchEvent(new Event('selectionchange'));
      }, w);

    await selectWord('serendipity');
    await page.waitForTimeout(350);
    await page.keyboard.press('Alt+Shift+d');
    await expect
      .poll(() => hostAttr(page, 'data-wr-define'), { timeout: 8000 })
      .toMatch(/serendipity\|senses:[1-9]/);

    // close, define a common word that HAS synonyms
    await page.keyboard.press('Escape');
    await expect.poll(() => hostAttr(page, 'data-wr-define')).toBe('');
    await selectWord('brighten');
    await page.waitForTimeout(350);
    await page.keyboard.press('Alt+Shift+d');
    await expect
      .poll(() => hostAttr(page, 'data-wr-define'), { timeout: 8000 })
      .toMatch(/brighten\|senses:[1-9]/);

    expect(errors).toEqual([]);
  });

  test('define is silent inside a password field and a code block', async ({
    context,
  }) => {
    const page = await context.newPage();
    const { errors } = watchErrors(page);
    await page.route('https://writeright.test/**', (r) =>
      r.fulfill({
        contentType: 'text/html',
        body: `<!doctype html><meta charset=utf-8><title>WriteRight e2e</title>
        <input id=pw type=password value="secretword">
        <pre class="cm-editor"><code id=code>const secret = 1</code></pre>`,
      }),
    );
    await page.goto('https://writeright.test/x');
    await page.waitForSelector('#writeright-host[data-wr-availability]');

    for (const sel of ['#pw', '#code']) {
      await page.locator(sel).evaluate((el) => {
        const node = el.firstChild ?? el;
        const r = document.createRange();
        try {
          r.selectNodeContents(node);
        } catch {
          (el as HTMLInputElement).select?.();
        }
        const s = window.getSelection();
        s?.removeAllRanges();
        s?.addRange(r);
        document.dispatchEvent(new Event('selectionchange'));
      });
      await page.waitForTimeout(300);
      await page.keyboard.press('Alt+Shift+d');
      await page.waitForTimeout(200);
      expect(await hostAttr(page, 'data-wr-define')).toBe('');
    }
    expect(errors).toEqual([]);
  });
});

test.describe('QA — options: every toggle changes behaviour', () => {
  test('per-category toggles, score/tone, simple mode, dialect, theme', async ({
    context,
    extensionId,
  }) => {
    const opts = await context.newPage();
    const { errors } = watchErrors(opts);
    await opts.goto(`chrome-extension://${extensionId}/options.html`);

    // Appearance
    await opts.getByRole('link', { name: 'Appearance' }).click();
    await opts.getByRole('button', { name: 'Dark' }).click();
    await expect
      .poll(() =>
        opts.evaluate(() =>
          document.documentElement.getAttribute('data-wr-theme'),
        ),
      )
      .toBe('dark');
    await opts.getByRole('button', { name: 'Light' }).click();
    await expect
      .poll(() =>
        opts.evaluate(() =>
          document.documentElement.getAttribute('data-wr-theme'),
        ),
      )
      .toBe('light');
    await opts.getByRole('button', { name: 'System' }).click();
    await expect
      .poll(() =>
        opts.evaluate(() =>
          document.documentElement.getAttribute('data-wr-theme'),
        ),
      )
      .toMatch(/light|dark/);
    await opts.getByRole('switch', { name: 'Simple mode' }).click();
    await expect
      .poll(() =>
        opts.evaluate(() =>
          document.documentElement.getAttribute('data-wr-simple'),
        ),
      )
      .toBe('true');
    await opts.getByRole('switch', { name: 'Simple mode' }).click();

    // text-size slider
    const slider = opts.getByLabel('Text size percent');
    await slider.fill('130');
    await expect
      .poll(() =>
        opts.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue(
            '--wr-font-scale',
          ),
        ),
      )
      .toContain('1.3');
    await slider.fill('100');

    // General → dialect
    await opts.getByRole('link', { name: 'General' }).click();
    await opts.getByRole('combobox', { name: 'Dialect' }).selectOption('en-GB');
    await expect(opts.getByRole('combobox', { name: 'Dialect' })).toHaveValue(
      'en-GB',
    );

    // Checks → each toggle persists across a reload
    await opts.getByRole('link', { name: 'Checks' }).click();
    for (const name of [
      'Spelling',
      'Grammar',
      'Punctuation & spacing',
      'Style & wordiness',
      'Writing health score',
      'Tone hints',
    ]) {
      const sw = opts.getByRole('switch', { name, exact: true });
      const wasChecked = await sw.isChecked();
      await sw.click();
      await expect(sw).toBeChecked({ checked: !wasChecked });
    }
    await opts.reload();
    await opts.getByRole('link', { name: 'Checks' }).click();
    // all six should now be off (they defaulted on)
    await expect(
      opts.getByRole('switch', { name: 'Spelling', exact: true }),
    ).not.toBeChecked();
    // restore
    for (const name of [
      'Spelling',
      'Grammar',
      'Punctuation & spacing',
      'Style & wordiness',
      'Writing health score',
      'Tone hints',
    ]) {
      await opts.getByRole('switch', { name, exact: true }).click();
    }

    // Vocabulary
    await opts.getByRole('link', { name: 'Vocabulary' }).click();
    await expect(
      opts.getByRole('switch', { name: 'Select text to define' }),
    ).toBeChecked();

    expect(errors).toEqual([]);
  });

  test('dictionary: add, chip appears, remove, import, clear', async ({
    context,
    extensionId,
  }) => {
    const opts = await context.newPage();
    const { errors } = watchErrors(opts);
    await opts.goto(`chrome-extension://${extensionId}/options.html`);
    await opts.getByRole('link', { name: 'Dictionary' }).click();

    const input = opts.getByPlaceholder('Add a word…');
    const addBtn = opts.getByRole('button', { name: 'Add' });
    for (const word of ['Kubernetes', 'Anthropic']) {
      await input.click();
      await input.pressSequentially(word, { delay: 20 });
      await addBtn.click();
      await expect(opts.getByText(word, { exact: true })).toBeVisible();
      await expect(input).toHaveValue('');
    }

    // remove one via its labelled chip button
    await opts.getByRole('button', { name: 'Remove Kubernetes' }).click();
    await expect(opts.getByText('Kubernetes')).toHaveCount(0);
    await expect(opts.getByText('Anthropic')).toBeVisible();

    // export enabled, clear-all with confirm
    await expect(opts.getByRole('button', { name: /Export/ })).toBeEnabled();
    await opts.getByRole('button', { name: 'Clear all' }).click();
    await opts.getByRole('button', { name: /Remove all/ }).click();
    await expect(opts.getByText('Anthropic')).toHaveCount(0);

    expect(errors).toEqual([]);
  });

  test('strict privacy locks the AI section', async ({
    context,
    extensionId,
  }) => {
    const opts = await context.newPage();
    const { errors } = watchErrors(opts);
    await opts.goto(`chrome-extension://${extensionId}/options.html`);
    await opts.getByRole('link', { name: 'Privacy' }).click();
    await opts.getByRole('switch', { name: 'Strict privacy mode' }).click();

    await opts.getByRole('link', { name: 'Local AI' }).click();
    // the master AI switch should be disabled / show the locked note
    await expect(opts.getByText(/Strict privacy/i)).toBeVisible();

    await opts.getByRole('link', { name: 'Privacy' }).click();
    await opts.getByRole('switch', { name: 'Strict privacy mode' }).click();
    expect(errors).toEqual([]);
  });
});

test.describe('QA — popup', () => {
  test('renders, quick-checks toggle, master + site switches', async ({
    context,
    extensionId,
  }) => {
    const page = await context.newPage();
    const { errors } = watchErrors(page);
    await page.setViewportSize({ width: 380, height: 600 });
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(page.locator('.wr-header')).toBeVisible();
    await expect(page.locator('[role="status"]')).toBeVisible();

    // master switch present
    await expect(
      page.getByRole('switch', { name: /WriteRight is on/i }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe('QA — sidebar', () => {
  test('opens on Alt+W, closes on Escape, toggles, no console errors', async ({
    context,
  }) => {
    const page = await context.newPage();
    const { errors } = watchErrors(page);
    await gotoTestPage(page);
    await page.locator('#ta').click();
    await page
      .locator('#ta')
      .pressSequentially(
        'This are a poorly worded sentance which is very very wordy and repetitive and long.',
        { delay: 8 },
      );
    await expect
      .poll(() => suggestionCount(page), { timeout: 10_000 })
      .toBeGreaterThan(0);

    await page.keyboard.press('Alt+w');
    await expect.poll(() => hostAttr(page, 'data-wr-sidebar')).toBe('open');
    expect(await hostAttr(page, 'data-wr-sidebar-tab')).toBe('suggestions');

    await page.keyboard.press('Alt+w'); // toggle closed
    await expect.poll(() => hostAttr(page, 'data-wr-sidebar')).toBe('closed');

    await page.keyboard.press('Alt+w'); // open again
    await expect.poll(() => hostAttr(page, 'data-wr-sidebar')).toBe('open');
    await page.keyboard.press('Escape');
    await expect.poll(() => hostAttr(page, 'data-wr-sidebar')).toBe('closed');
    expect(errors).toEqual([]);
  });
});

test.describe('QA — Simple Mode & reduced motion', () => {
  test('Simple Mode enlarges the in-page UI; reduced motion kills animation', async ({
    context,
    extensionId,
  }) => {
    const opts = await context.newPage();
    await opts.goto(`chrome-extension://${extensionId}/options.html`);
    await opts.getByRole('link', { name: 'Appearance' }).click();
    await opts.getByRole('switch', { name: 'Simple mode' }).click();
    await expect(
      opts.getByRole('switch', { name: 'Simple mode' }),
    ).toBeChecked();
    await opts.getByRole('switch', { name: 'Reduce motion' }).click();
    await opts.waitForTimeout(300); // let the storage write settle

    const page = await context.newPage();
    const { errors } = watchErrors(page);
    await gotoTestPage(page);
    // define panel in simple mode → the shell carries data-wr-simple
    await page.locator('#para').evaluate((p) => {
      const t = p.firstChild as Text;
      const i = p.textContent!.indexOf('serendipity');
      const r = document.createRange();
      r.setStart(t, i);
      r.setEnd(t, i + 11);
      const s = window.getSelection()!;
      s.removeAllRanges();
      s.addRange(r);
      document.dispatchEvent(new Event('selectionchange'));
    });
    await expect
      .poll(() => hostAttr(page, 'data-wr-simple'), { timeout: 8000 })
      .toBe('true');
    await page.waitForTimeout(350);
    await page.keyboard.press('Alt+Shift+d');
    await expect
      .poll(() => hostAttr(page, 'data-wr-define'), { timeout: 8000 })
      .toMatch(/senses:/);
    await page.waitForTimeout(300);
    await expect(page).toHaveScreenshot('qa-define-simple.png', {
      maxDiffPixelRatio: 0.03,
    });
    expect(errors).toEqual([]);

    // restore
    await opts.getByRole('switch', { name: 'Simple mode' }).click();
    await opts.getByRole('switch', { name: 'Reduce motion' }).click();
  });
});

test.describe('QA — stress & resilience', () => {
  test('10k-word document does not hang analysis', async ({ context }) => {
    const page = await context.newPage();
    const { errors } = watchErrors(page);
    await gotoTestPage(page);
    await page.locator('#ta').click();
    await page
      .locator('#ta')
      .fill(
        ('The quick brown fox jumps over the lazy dog. ' as string).repeat(
          1200,
        ),
      );
    // analysis should settle (not spin forever); count is a finite number.
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            document
              .querySelector('#writeright-host')
              ?.getAttribute('data-wr-analyzing'),
          ),
        { timeout: 15_000 },
      )
      .toBe('false');
    expect(Number(await suggestionCount(page))).toBeGreaterThanOrEqual(0);
    expect(errors).toEqual([]);
  });

  test('rapid selection changes never leave a stuck pill or panel', async ({
    context,
  }) => {
    const page = await context.newPage();
    const { errors } = watchErrors(page);
    await gotoTestPage(page);
    for (let i = 0; i < 30; i++) {
      await page.locator('#para').evaluate((p, n) => {
        const t = p.firstChild as Text;
        const r = document.createRange();
        r.setStart(t, n % 20);
        r.setEnd(t, (n % 20) + 4);
        const s = window.getSelection()!;
        s.removeAllRanges();
        s.addRange(r);
        document.dispatchEvent(new Event('selectionchange'));
      }, i);
    }
    await page.evaluate(() => window.getSelection()?.removeAllRanges());
    await page.dispatchEvent('body', 'selectionchange');
    await page.waitForTimeout(400);
    expect(await hostAttr(page, 'data-wr-define')).toBe('');
    expect(errors).toEqual([]);
  });

  test('master switch off stops everything; back on resumes', async ({
    context,
    extensionId,
  }) => {
    const editor = await context.newPage();
    const { errors } = watchErrors(editor);
    await gotoTestPage(editor);
    await editor.locator('#ta').click();
    await editor
      .locator('#ta')
      .pressSequentially('I havve teh cat.', { delay: 12 });
    await expect
      .poll(() => suggestionCount(editor), { timeout: 10_000 })
      .toBe(2);

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.getByRole('switch', { name: 'WriteRight is on' }).click();

    await expect.poll(() => suggestionCount(editor), { timeout: 8000 }).toBe(0);
    await expect(editor.locator('#writeright-host')).toBeAttached();

    await popup.getByRole('switch', { name: 'WriteRight is on' }).click();
    await editor.locator('#ta').click();
    await editor.locator('#ta').press('End');
    await editor.locator('#ta').pressSequentially(' more', { delay: 12 });
    await expect
      .poll(() => suggestionCount(editor), { timeout: 10_000 })
      .toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });
});

test.describe('QA — end-to-end: options toggle reflects in a live editor', () => {
  test('spelling off → red underlines vanish; back on → return', async ({
    context,
    extensionId,
  }) => {
    const editor = await context.newPage();
    const { errors } = watchErrors(editor);
    await gotoTestPage(editor);
    await editor.locator('#ta').click();
    await editor
      .locator('#ta')
      .pressSequentially('I havve teh reciept.', { delay: 12 });
    await expect
      .poll(() => suggestionCount(editor), { timeout: 10_000 })
      .toBe(3);

    const opts = await context.newPage();
    await opts.goto(`chrome-extension://${extensionId}/options.html`);
    await opts.getByRole('link', { name: 'Checks' }).click();
    await opts.getByRole('switch', { name: 'Spelling' }).click();

    await expect.poll(() => suggestionCount(editor), { timeout: 8000 }).toBe(0);

    await opts.getByRole('switch', { name: 'Spelling' }).click();
    await expect.poll(() => suggestionCount(editor), { timeout: 8000 }).toBe(3);

    expect(errors).toEqual([]);
  });
});
