import { describe, it, expect } from 'vitest';
import {
  SETTINGS_MIGRATIONS,
  migrationsAreConsistent,
} from '@/storage/migrations';
import { SETTINGS_SCHEMA_VERSION } from '@/types/settings';

const v1to2 = SETTINGS_MIGRATIONS[2]!;

describe('settings migration v1 → v2 (§1.2.0, §20.4)', () => {
  it('the migration table is consistent', () => {
    expect(migrationsAreConsistent()).toBe(true);
    expect(SETTINGS_SCHEMA_VERSION).toBe(2);
  });

  it('inline suggestions ON → every inline category on; style follows styleChecks', () => {
    const out = v1to2({
      schemaVersion: 1,
      features: { inlineSuggestions: true, styleChecks: true },
    });
    expect(out.features.spelling).toBe(true);
    expect(out.features.grammar).toBe(true);
    expect(out.features.punctuation).toBe(true);
    expect(out.features.styleWordiness).toBe(true);
  });

  it('inline suggestions OFF → every inline category off (intent preserved)', () => {
    const out = v1to2({
      schemaVersion: 1,
      features: { inlineSuggestions: false, styleChecks: true },
    });
    expect(out.features.spelling).toBe(false);
    expect(out.features.grammar).toBe(false);
    expect(out.features.punctuation).toBe(false);
    expect(out.features.styleWordiness).toBe(false);
  });

  it('styleChecks OFF but inline ON → only style off', () => {
    const out = v1to2({
      schemaVersion: 1,
      features: { inlineSuggestions: true, styleChecks: false },
    });
    expect(out.features.spelling).toBe(true);
    expect(out.features.styleWordiness).toBe(false);
  });

  it('carries writingScore / toneHints / ai and adds the new keys', () => {
    const out = v1to2({
      schemaVersion: 1,
      features: { writingScore: false, toneHints: false, ai: true },
    });
    expect(out.features.writingScore).toBe(false);
    expect(out.features.toneHints).toBe(false);
    expect(out.features.ai).toBe(true);
    expect(out.features.defineOnSelect).toBe(true);
    expect(out.features.synonyms).toBe(true);
    expect(out.simpleMode).toBe(false);
    expect(out.schemaVersion).toBe(2);
  });

  it('preserves unrelated top-level fields', () => {
    const out = v1to2({
      schemaVersion: 1,
      enabled: false,
      dialect: 'en-GB',
      fontScale: 1.25,
      defaultPresetId: 'academic',
      features: {},
    });
    expect(out.enabled).toBe(false);
    expect(out.dialect).toBe('en-GB');
    expect(out.fontScale).toBe(1.25);
    expect(out.defaultPresetId).toBe('academic');
  });

  it('is idempotent-by-shape on an empty / missing value', () => {
    expect(() => v1to2({})).not.toThrow();
    expect(() => v1to2(null)).not.toThrow();
    expect(() => v1to2(undefined)).not.toThrow();
    const out = v1to2({});
    expect(out.features.spelling).toBe(true);
  });

  it('drops the stale v1 feature keys', () => {
    const out = v1to2({
      schemaVersion: 1,
      features: { inlineSuggestions: true, styleChecks: true },
    });
    expect('inlineSuggestions' in out.features).toBe(false);
    expect('styleChecks' in out.features).toBe(false);
  });
});
