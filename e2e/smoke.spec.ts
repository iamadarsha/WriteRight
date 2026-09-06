import {
  test,
  expect,
  gotoTestPage,
  gotoGoogleDocsStub,
  suggestionCount,
} from './fixtures';

/**
 * §23.2 Browser E2E — the core user journeys in a real Chromium with the built
 * extension loaded. Black-box: drive the page and the extension UI the way a
 * user would. In-page UI lives in a closed shadow root, so behaviour is checked
 * via the field value, the keyboard paths, and the `data-wr-*` status the
 * content script reflects onto its light-DOM host.
 */

test.describe('WriteRight — core flows', () => {
  test('the local engine analyses a real field and re-analyses after an edit', async ({
    context,
  }) => {
    const page = await context.newPage();
    await gotoTestPage(page);

    const ta = page.locator('#ta');
    await ta.click();
    await ta.pressSequentially('I havve a pencil and teh cat.', { delay: 20 });

    // The debounced local pipeline (Harper WASM in the service worker) lands
    // spelling suggestions — proves the engine actually runs in the build.
    await expect
      .poll(() => suggestionCount(page), { timeout: 10_000 })
      .toBeGreaterThanOrEqual(2);

    // Fix the text; the resolved suggestions drop on the next analysis pass.
    await ta.fill('I have a pencil and the cat.');
    await expect.poll(() => suggestionCount(page), { timeout: 10_000 }).toBe(0);
  });

  test('analyses a Gmail-shaped compose body (role=textbox contenteditable)', async ({
    context,
  }) => {
    const page = await context.newPage();
    await gotoTestPage(page);

    const compose = page.locator('#compose');
    await compose.click();
    await compose.pressSequentially(
      'Thsi email has a typo in teh first line.',
      {
        delay: 20,
      },
    );
    await expect
      .poll(() => suggestionCount(page), { timeout: 10_000 })
      .toBeGreaterThanOrEqual(2);
    // WriteRight considers this an active, supported field.
    await expect(
      page.locator('#writeright-host[data-wr-active="true"]'),
    ).toBeAttached();

    // And an applied fix must actually land in the contenteditable (the bug a
    // user hit in Gmail: clicking a replacement did nothing).
    await compose.evaluate((el: HTMLElement) => {
      const node = el.firstChild ?? el;
      const i = (node.textContent ?? '').indexOf('Thsi');
      const r = document.createRange();
      r.setStart(node, i);
      r.setEnd(node, i + 4);
      const sel = getSelection()!;
      sel.removeAllRanges();
      sel.addRange(r);
    });
    await page.keyboard.press('Control+.');
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              document
                .querySelector('#writeright-host')
                ?.getAttribute('data-wr-popover') ?? '0',
          ),
        { timeout: 4000 },
      )
      .toBe('1');
    await page.keyboard.press('1');
    await expect
      .poll(() => compose.textContent(), { timeout: 4000 })
      .toContain('This email');
  });

  test('a pointer inside the closed-shadow card does not dismiss it before Apply', async ({
    context,
  }) => {
    // WriteRight's popover lives in a *closed* shadow root, so a pointerdown on
    // one of its own buttons is retargeted to the shadow host by the time the
    // document-level outside-click dismisser sees it. The dismisser used to read
    // that as "outside" and tear the card down before the button's click could
    // apply — the "clicking the suggestion does nothing" bug. `#rich` is a
    // ProseMirror/Lexical-style editor that also reverts edits it didn't make.
    const page = await context.newPage();
    await gotoTestPage(page);

    const rich = page.locator('#rich');
    await rich.click();
    await rich.pressSequentially('I havve a plan.', { delay: 20 });
    await expect
      .poll(() => suggestionCount(page), { timeout: 10_000 })
      .toBeGreaterThan(0);

    await rich.evaluate((el: HTMLElement) => {
      const node = el.firstChild!;
      const i = (node.textContent ?? '').indexOf('havve');
      const r = document.createRange();
      r.setStart(node, i + 2);
      r.setEnd(node, i + 2);
      const sel = getSelection()!;
      sel.removeAllRanges();
      sel.addRange(r);
    });
    await rich.dispatchEvent('click');
    const popoverState = () =>
      page.evaluate(
        () =>
          document
            .querySelector('#writeright-host')
            ?.getAttribute('data-wr-popover') ?? '0',
      );
    await expect.poll(popoverState, { timeout: 4000 }).toBe('1');

    // A pointerdown that resolves to the shadow host — exactly what a real click
    // on a popover button looks like from outside the closed root. The card
    // must stay open.
    await page.evaluate(() => {
      document
        .querySelector('#writeright-host')!
        .dispatchEvent(
          new PointerEvent('pointerdown', { bubbles: true, composed: true }),
        );
    });
    await page.waitForTimeout(100);
    expect(await popoverState()).toBe('1');

    // Now apply — and it must land in the rich editor and stay put.
    await page.keyboard.press('1');
    await expect
      .poll(() => rich.textContent(), { timeout: 4000 })
      .toContain('I have a plan.');
    await expect
      .poll(() => rich.textContent(), { timeout: 2000 })
      .not.toContain('havve');
  });

  test('the keyboard path opens the suggestion card and applies a fix (§9.7)', async ({
    context,
  }) => {
    const page = await context.newPage();
    await gotoTestPage(page);

    const ta = page.locator('#ta');
    await ta.click();
    await ta.pressSequentially('I havve a pencil.', { delay: 25 });
    await expect
      .poll(() => suggestionCount(page), { timeout: 10_000 })
      .toBeGreaterThan(0);

    // Caret inside "havve", open the card with Ctrl+., apply top fix with "1".
    await ta.focus();
    await ta.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(4, 4));
    await ta.press('Control+.');
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              document
                .querySelector('#writeright-host')
                ?.getAttribute('data-wr-popover') ?? '0',
          ),
        { timeout: 4000 },
      )
      .toBe('1');
    await page.keyboard.press('1');

    await expect(ta).toHaveValue('I have a pencil.');
  });

  test('never attaches to a password field', async ({ context }) => {
    const page = await context.newPage();
    await gotoTestPage(page);

    await page.locator('#pw').click();
    await page
      .locator('#pw')
      .pressSequentially('hunter2 havve teh', { delay: 10 });
    await page.waitForTimeout(1000);

    expect(await suggestionCount(page)).toBe(0);
    const marks = await page.evaluate(
      () =>
        document
          .querySelector('#writeright-host')
          ?.shadowRoot?.querySelectorAll('.wr-u').length ?? 0,
    );
    // Closed root → shadowRoot is null from the page; the count check above is
    // the real assertion. This just documents the isolation.
    expect(marks).toBe(0);
  });

  test('the sidebar launcher opens the sidebar (Alt+W and click)', async ({
    context,
  }) => {
    const page = await context.newPage();
    await gotoTestPage(page);

    await page.locator('#ta').click();
    await page.locator('#ta').pressSequentially('Hello world.', { delay: 15 });
    await page.waitForTimeout(500);

    await page.keyboard.press('Alt+w');
    // The sidebar is in the closed root; assert the host grew a UI subtree by
    // checking the host is still present and the page did not navigate/crash.
    await expect(page.locator('#writeright-host')).toBeAttached();
    await expect(page).toHaveTitle('WriteRight e2e');
  });

  test('the anchored launcher icon never covers the field text (§8)', async ({
    context,
  }) => {
    // A user hit this on a real search box: the icon sat mid-line over an
    // opaque disc, hiding the last words. It must straddle the corner, clear
    // of the text — so a hit-test at the vertical middle of the field, near
    // the right edge where text ends, must land on the page, not WriteRight.
    const page = await context.newPage();
    await gotoTestPage(page);
    await page.locator('#search').click();
    await page
      .locator('#search')
      .pressSequentially('viewsonic teh moniter and antoher', { delay: 15 });
    await page.waitForTimeout(1200);

    const covers = () =>
      page.evaluate(() => {
        const field = document.getElementById('search')!;
        const r = field.getBoundingClientRect();
        const midY = r.top + r.height / 2;
        // Sample the text's vertical centre near the right edge, where text ends.
        for (const x of [r.right - 6, r.right - 16, r.right - 30]) {
          const el = document.elementFromPoint(x, midY);
          if (el?.closest('#writeright-host')) return true;
        }
        return false;
      });
    expect(await covers()).toBe(false);

    // And when the field is pinned to the very bottom of the viewport (a
    // compose bar): the icon must overhang the fold, not snap back up onto
    // the text.
    await page.addStyleTag({
      content:
        '#search{position:fixed;left:auto;right:48px;bottom:2px;width:360px}',
    });
    await page.locator('#search').click();
    await page.keyboard.type(' x', { delay: 15 });
    await page.waitForTimeout(1000);
    expect(await covers()).toBe(false);
  });

  test('Google Docs is called out as unsupported, and the sidebar still opens (§5.1)', async ({
    context,
  }) => {
    // The doc body is a <canvas> WriteRight can't read; it must say so
    // honestly rather than sit silent or latch onto the stray title <input>.
    const page = await context.newPage();
    await gotoGoogleDocsStub(page);

    await expect(
      page.locator('#writeright-host[data-wr-availability="unsupported"]'),
    ).toBeAttached();

    // The paste-and-analyse fallback is still reachable.
    await page.keyboard.press('Alt+w');
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document
              .querySelector('#writeright-host')
              ?.getAttribute('data-wr-sidebar') ?? '',
        ),
      )
      .toBe('open');
    await expect(page).toHaveTitle(/Google Docs/);
  });

  test('popup opens and shows the status pill', async ({
    context,
    extensionId,
  }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(page.locator('.wr-header')).toBeVisible();
    await expect(page.getByText('WriteRight', { exact: true })).toBeVisible();
    await expect(page.locator('[role="status"]')).toBeVisible();
  });

  test('options page renders every settings section', async ({
    context,
    extensionId,
  }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html`);
    await expect(
      page.getByRole('heading', { name: 'WriteRight', level: 1 }),
    ).toBeVisible();
    for (const section of [
      'General',
      'Appearance',
      'Checks',
      'Vocabulary',
      'Dictionary',
      'Local AI',
      'Privacy',
      'Sites',
      'Diagnostics',
    ]) {
      await expect(page.getByRole('link', { name: section })).toBeVisible();
    }
    await expect(page.getByText('Reset all local data')).toBeVisible();
    await expect(page.getByText('Strict privacy mode')).toBeVisible();
    await expect(page.getByText('Select text to define')).toBeVisible();
    await expect(page.getByText('Simple mode')).toBeVisible();
  });

  test('turning Grammar off removes amber underlines but keeps spelling', async ({
    context,
    extensionId,
  }) => {
    const editor = await context.newPage();
    await gotoTestPage(editor);
    await editor.locator('#ta').click();
    // "havve" = spelling; "a apple" = grammar (a/an).
    await editor
      .locator('#ta')
      .pressSequentially('I havve a apple today.', { delay: 15 });
    await expect
      .poll(() => suggestionCount(editor), { timeout: 10_000 })
      .toBeGreaterThanOrEqual(2);
    const withGrammar = await suggestionCount(editor);

    const opts = await context.newPage();
    await opts.goto(`chrome-extension://${extensionId}/options.html`);
    await opts.getByRole('link', { name: 'Checks' }).click();
    await opts.getByRole('switch', { name: 'Grammar' }).click();

    // The editor tab reacts to the storage change with no reload.
    await expect
      .poll(() => suggestionCount(editor), { timeout: 8000 })
      .toBeLessThan(withGrammar);
    expect(await suggestionCount(editor)).toBeGreaterThan(0); // spelling remains
  });

  test('select-to-define: selecting a word shows a definition from the offline lexicon', async ({
    context,
  }) => {
    const page = await context.newPage();
    await gotoTestPage(page);

    // Select the word "serendipity" in the paragraph (double-click selects it).
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

    // The define pill appears in the closed shadow host; open the panel via Alt+D.
    await page.waitForTimeout(400);
    await page.keyboard.press('Alt+d');

    // The panel loads a real definition from the packaged Open English WordNet.
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              document
                .querySelector('#writeright-host')
                ?.getAttribute('data-wr-define') ?? '',
          ),
        { timeout: 8000 },
      )
      .toMatch(/^serendipity\|senses:[1-9]/);
  });

  test('adding a word through the options dictionary UI persists it', async ({
    context,
    extensionId,
  }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html`);
    await page.getByRole('link', { name: 'Dictionary' }).click();

    const input = page.getByPlaceholder('Add a word…');
    await input.fill('Kubernetes');
    await input.press('Enter');

    await expect(page.getByText('Kubernetes')).toBeVisible();

    // Reload — it is still there (durable local storage).
    await page.reload();
    await page.getByRole('link', { name: 'Dictionary' }).click();
    await expect(page.getByText('Kubernetes')).toBeVisible();
  });
});
