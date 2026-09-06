/**
 * Monotonically increasing document version numbers (§17.3, §19).
 *
 * Every analysis request is tagged with the version of the document it was
 * computed against. Results for stale versions are discarded (§31 Rule 12).
 */
export class DocumentVersion {
  #value: number;

  constructor(initial = 0) {
    this.#value = initial;
  }

  get value(): number {
    return this.#value;
  }

  /** Advance and return the new version. */
  bump(): number {
    this.#value += 1;
    return this.#value;
  }

  /** True when `candidate` is the current version. */
  isCurrent(candidate: number): boolean {
    return candidate === this.#value;
  }
}
