import { describe, it, expect } from 'vitest';
import {
  detectBrowserCapabilities,
  CAPABILITY_MATRIX,
} from '@/platform/browser-capabilities';

describe('browser capability detection (§5.2)', () => {
  it('detects a Chromium-shaped namespace', () => {
    const caps = detectBrowserCapabilities({
      browserNs: {
        sidePanel: {},
        commands: { onCommand: {} },
        storage: { session: {}, local: {} },
        permissions: { request: () => {}, contains: () => {} },
        action: {},
      },
      globalScope: { LanguageModel: {} },
    });
    expect(caps).toMatchObject({
      nativeSidePanel: true,
      nativeSidebarAction: false,
      keyboardCommands: true,
      sessionStorage: true,
      runtimePermissions: true,
      promptApi: true,
      action: true,
    });
  });

  it('detects a Firefox-shaped namespace (sidebarAction, no sidePanel)', () => {
    const caps = detectBrowserCapabilities({
      browserNs: {
        sidebarAction: {},
        commands: {},
        storage: { local: {} },
        permissions: { request: () => {} },
        browserAction: {},
      },
      globalScope: {},
    });
    expect(caps.nativeSidebarAction).toBe(true);
    expect(caps.nativeSidePanel).toBe(false);
    expect(caps.sessionStorage).toBe(false);
    expect(caps.promptApi).toBe(false);
    expect(caps.action).toBe(true); // browserAction counts
  });

  it('a minimal / Safari-shaped namespace degrades to the universal baseline', () => {
    const caps = detectBrowserCapabilities({
      browserNs: { storage: { local: {} }, runtime: {} },
      globalScope: {},
    });
    expect(caps).toEqual({
      nativeSidePanel: false,
      nativeSidebarAction: false,
      keyboardCommands: false,
      sessionStorage: false,
      runtimePermissions: false,
      promptApi: false,
      action: false,
    });
  });

  it('picks up the legacy self.ai.languageModel Prompt API shape', () => {
    const caps = detectBrowserCapabilities({
      browserNs: {},
      globalScope: { ai: { languageModel: {} } },
    });
    expect(caps.promptApi).toBe(true);
  });

  it('the documented capability matrix is well-formed', () => {
    expect(CAPABILITY_MATRIX.length).toBeGreaterThan(5);
    for (const row of CAPABILITY_MATRIX) {
      expect(row.feature).toBeTruthy();
      for (const col of ['chrome', 'edge', 'firefox', 'safari'] as const) {
        expect(['A', 'B', 'C', 'D', 'yes', 'no', 'conditional']).toContain(
          row[col],
        );
      }
    }
    // Every conditional cell must carry a note explaining the condition (§5.2).
    for (const row of CAPABILITY_MATRIX) {
      const conditional = (
        ['chrome', 'edge', 'firefox', 'safari'] as const
      ).some((c) => row[c] === 'conditional');
      if (conditional) expect(row.note, row.feature).toBeTruthy();
    }
  });
});
