/**
 * Site profiles for editors WriteRight cannot support inline (§5.1 Tier C/D).
 *
 * A handful of extremely common editors render their document to a `<canvas>`
 * and take keystrokes through an off-screen `<iframe>` — Google Docs is the
 * archetype. There is no DOM text to read and no text geometry to underline, so
 * an inline adapter is impossible without reverse-engineering a private,
 * frequently-changing editor model. The honest product (§31 Rule 1) says so and
 * points the user at the paste-and-analyse sidebar, rather than showing nothing
 * or — worse — attaching to the stray title `<input>` and pretending the whole
 * document is covered.
 *
 * This is a small, data-driven allowlist. Adding a site is one table row.
 */

export interface SiteProfile {
  /** Stable id, surfaced in {@link PageStatus.siteProfileId} for tests / UI. */
  readonly id: string;
  /** Human name of the editor, e.g. `Google Docs`. */
  readonly label: string;
  /**
   * One honest sentence for the popup + sidebar: what this editor is, why
   * inline help is off here, and what to do instead.
   */
  readonly detail: string;
}

/** The parts of `Location` a profile rule looks at. */
export interface PageLocation {
  readonly hostname: string;
  readonly pathname: string;
}

interface ProfileRule extends SiteProfile {
  readonly match: (loc: PageLocation) => boolean;
}

/** `docs.google.com`, incl. the rare `docs.sandbox.google.com` staging host. */
function isGoogleDocsHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === 'docs.google.com' || h.endsWith('.docs.google.com');
}

const RULES: readonly ProfileRule[] = [
  {
    id: 'google-docs',
    label: 'Google Docs',
    detail:
      'Google Docs draws your document on a canvas, so WriteRight can’t ' +
      'check it inline. Open the WriteRight sidebar and paste your text for a ' +
      'full spelling, grammar, readability and tone review.',
    // The editor always has `/document/d/<id>` (optionally behind a
    // `/u/<n>/` account segment). The bare `/document/` list view does not,
    // so it is left alone.
    match: (loc) =>
      isGoogleDocsHost(loc.hostname) &&
      /^\/document\/(u\/\d+\/)?d\//.test(loc.pathname),
  },
];

/**
 * The profile for the current page, or `null` when WriteRight's normal
 * field detection should decide.
 */
export function resolveSiteProfile(loc: PageLocation): SiteProfile | null {
  for (const rule of RULES) {
    try {
      if (rule.match(loc)) {
        const { id, label, detail } = rule;
        return { id, label, detail };
      }
    } catch {
      // A malformed location must never break page-status computation.
    }
  }
  return null;
}
