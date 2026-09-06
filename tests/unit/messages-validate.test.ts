import { describe, it, expect } from 'vitest';
import {
  isRequestMessage,
  isBroadcastMessage,
  isSettingsPatch,
} from '@/messaging/validate';

describe('message validation (§26)', () => {
  it('accepts well-formed requests', () => {
    expect(isRequestMessage({ type: 'GET_SETTINGS' })).toBe(true);
    expect(
      isRequestMessage({
        type: 'SET_SITE_ENABLED',
        origin: 'https://a',
        enabled: true,
      }),
    ).toBe(true);
    expect(
      isRequestMessage({ type: 'SET_SETTINGS', patch: { enabled: false } }),
    ).toBe(true);
  });

  it('rejects unknown message types', () => {
    expect(isRequestMessage({ type: 'DROP_TABLE_USERS' })).toBe(false);
    expect(isRequestMessage({ type: 'EVAL', code: 'x' })).toBe(false);
    expect(isRequestMessage('not even an object')).toBe(false);
    expect(isRequestMessage(null)).toBe(false);
  });

  it('rejects requests with malformed payloads', () => {
    expect(isRequestMessage({ type: 'SET_SITE_ENABLED', origin: 5 })).toBe(
      false,
    );
    expect(
      isRequestMessage({
        type: 'SET_SITE_ENABLED',
        origin: 'a',
        enabled: 'yes',
      }),
    ).toBe(false);
    expect(isRequestMessage({ type: 'SET_SETTINGS' })).toBe(false);
    expect(
      isRequestMessage({ type: 'SET_SETTINGS', patch: { unknownKey: 1 } }),
    ).toBe(false);
  });

  it('isSettingsPatch validates shape and feature keys', () => {
    expect(isSettingsPatch({ features: { ai: true } })).toBe(true);
    expect(isSettingsPatch({ features: { ai: 'yes' } })).toBe(false);
    expect(isSettingsPatch({ features: { bogus: true } })).toBe(false);
    expect(isSettingsPatch({ fontScale: 'big' })).toBe(false);
    expect(isSettingsPatch({ extraIgnorePatterns: ['a', 2] })).toBe(false);
  });

  it('validates the Phase 4 AI messages (§4, §26)', () => {
    expect(isRequestMessage({ type: 'AI_GET_CAPABILITY' })).toBe(true);
    expect(isRequestMessage({ type: 'AI_GET_CAPABILITY', force: true })).toBe(
      true,
    );
    expect(isRequestMessage({ type: 'AI_GET_CAPABILITY', force: 'x' })).toBe(
      false,
    );
    expect(
      isRequestMessage({
        type: 'AI_RUN',
        requestId: 'r',
        task: 'simplify',
        selection: 'hello',
        whole: false,
      }),
    ).toBe(true);
    // missing `whole` rejected
    expect(
      isRequestMessage({
        type: 'AI_RUN',
        requestId: 'r',
        task: 'simplify',
        selection: 'hello',
      }),
    ).toBe(false);
    // unknown task rejected
    expect(
      isRequestMessage({
        type: 'AI_RUN',
        requestId: 'r',
        task: 'delete-everything',
        selection: 'hello',
        whole: false,
      }),
    ).toBe(false);
    // oversized selection rejected
    expect(
      isRequestMessage({
        type: 'AI_RUN',
        requestId: 'r',
        task: 'simplify',
        selection: 'x'.repeat(20_000),
        whole: false,
      }),
    ).toBe(false);
    expect(
      isRequestMessage({
        type: 'AI_TEST_CONNECTION',
        provider: 'ollama',
        endpoint: 'http://localhost:11434',
      }),
    ).toBe(true);
    expect(
      isRequestMessage({ type: 'AI_TEST_CONNECTION', provider: 'skynet' }),
    ).toBe(false);
    expect(
      isRequestMessage({
        type: 'AI_CHAT',
        requestId: 'r',
        message: 'hi',
        history: [{ role: 'user', content: 'earlier' }],
      }),
    ).toBe(true);
    expect(
      isRequestMessage({
        type: 'AI_CHAT',
        requestId: 'r',
        message: 'hi',
        history: [{ role: 'system', content: 'nope' }],
      }),
    ).toBe(false);
  });

  it('isSettingsPatch validates the ai block and only loopback-shaped strings', () => {
    expect(isSettingsPatch({ ai: { provider: 'ollama' } })).toBe(true);
    expect(
      isSettingsPatch({ ai: { ollamaEndpoint: 'http://localhost:11434' } }),
    ).toBe(true);
    expect(isSettingsPatch({ ai: { provider: 'cloud' } })).toBe(false);
    expect(isSettingsPatch({ ai: { bogusKey: true } })).toBe(false);
    expect(isSettingsPatch({ ai: { enhancedReview: 'yes' } })).toBe(false);
    expect(isSettingsPatch({ ai: { ollamaEndpoint: 'x'.repeat(300) } })).toBe(
      false,
    );
  });

  it('validates the dictionary-management messages (§11.4, §26)', () => {
    expect(isRequestMessage({ type: 'GET_DICTIONARY' })).toBe(true);
    expect(isRequestMessage({ type: 'CLEAR_DICTIONARY' })).toBe(true);
    expect(
      isRequestMessage({ type: 'REMOVE_DICTIONARY_WORD', word: 'Kubernetes' }),
    ).toBe(true);
    expect(isRequestMessage({ type: 'REMOVE_DICTIONARY_WORD' })).toBe(false);
    expect(
      isRequestMessage({
        type: 'REMOVE_DICTIONARY_WORD',
        word: 'x'.repeat(129),
      }),
    ).toBe(false);
    expect(
      isRequestMessage({ type: 'IMPORT_DICTIONARY', text: 'alpha\nbeta' }),
    ).toBe(true);
    expect(isRequestMessage({ type: 'IMPORT_DICTIONARY' })).toBe(false);
    expect(
      isRequestMessage({
        type: 'IMPORT_DICTIONARY',
        text: 'x'.repeat(200_001),
      }),
    ).toBe(false);
  });

  it('isSettingsPatch accepts the strictPrivacy boolean only', () => {
    expect(isSettingsPatch({ strictPrivacy: true })).toBe(true);
    expect(isSettingsPatch({ strictPrivacy: false })).toBe(true);
    expect(isSettingsPatch({ strictPrivacy: 'yes' })).toBe(false);
    expect(isSettingsPatch({ strictPrivacy: 1 })).toBe(false);
  });

  it('isSettingsPatch accepts simpleMode + the v2 per-category feature keys', () => {
    expect(isSettingsPatch({ simpleMode: true })).toBe(true);
    expect(isSettingsPatch({ simpleMode: 'x' })).toBe(false);
    expect(
      isSettingsPatch({
        features: {
          spelling: true,
          grammar: false,
          punctuation: true,
          styleWordiness: false,
          defineOnSelect: true,
          synonyms: false,
        },
      }),
    ).toBe(true);
    // old keys are gone
    expect(isSettingsPatch({ features: { inlineSuggestions: true } })).toBe(
      false,
    );
    expect(isSettingsPatch({ features: { styleChecks: true } })).toBe(false);
  });

  it('validates the vocabulary messages (§11.3, §26)', () => {
    expect(isRequestMessage({ type: 'DEFINE', text: 'serendipity' })).toBe(
      true,
    );
    expect(isRequestMessage({ type: 'DEFINE' })).toBe(false);
    expect(isRequestMessage({ type: 'DEFINE', text: 'x'.repeat(81) })).toBe(
      false,
    );
    expect(isRequestMessage({ type: 'LOOKUP_SYNONYMS', word: 'happy' })).toBe(
      true,
    );
    expect(isRequestMessage({ type: 'LOOKUP_SYNONYMS' })).toBe(false);
    expect(
      isRequestMessage({ type: 'LOOKUP_SYNONYMS', word: 'x'.repeat(81) }),
    ).toBe(false);
  });

  it('validates broadcasts', () => {
    expect(isBroadcastMessage({ type: 'ALL_DATA_RESET' })).toBe(true);
    expect(
      isBroadcastMessage({
        type: 'SITE_STATE_CHANGED',
        origin: 'a',
        siteEnabled: true,
      }),
    ).toBe(true);
    expect(
      isBroadcastMessage({ type: 'SITE_STATE_CHANGED', origin: 'a' }),
    ).toBe(false);
    expect(isBroadcastMessage({ type: 'WAT' })).toBe(false);
  });
});
