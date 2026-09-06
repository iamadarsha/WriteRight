import { describe, it, expect } from 'vitest';
import { checkLoopback, requireLoopback } from '@/ai/loopback';

describe('loopback guard (§6.3)', () => {
  it('accepts localhost and 127.0.0.0/8 over http/ws', () => {
    for (const url of [
      'http://localhost:11434',
      'http://localhost',
      'http://127.0.0.1:1234/v1',
      'http://127.4.5.6:8080',
      'ws://localhost:1234',
    ]) {
      expect(checkLoopback(url).ok).toBe(true);
    }
    expect(checkLoopback('http://localhost:11434').origin).toBe(
      'http://localhost:11434',
    );
    expect(checkLoopback('http://127.0.0.1:1234/v1').endpoint).toBe(
      '127.0.0.1:1234',
    );
  });

  it('rejects every non-loopback host', () => {
    for (const url of [
      'http://api.openai.com/v1',
      'http://example.com',
      'http://192.168.1.10:11434',
      'http://10.0.0.5:1234',
      'http://169.254.1.1',
      'http://[fe80::1]:11434',
      'http://evil.localhost.attacker.com',
      'http://localhost.attacker.com',
    ]) {
      expect(checkLoopback(url).ok).toBe(false);
    }
  });

  it('rejects https/wss even to a loopback name (likely a remote host)', () => {
    expect(checkLoopback('https://localhost:11434').ok).toBe(false);
    expect(checkLoopback('wss://127.0.0.1').ok).toBe(false);
  });

  it('rejects garbage input', () => {
    expect(checkLoopback('not a url').ok).toBe(false);
    expect(checkLoopback('').ok).toBe(false);
    expect(checkLoopback('ftp://localhost').ok).toBe(false);
  });

  it('requireLoopback throws for a non-loopback endpoint', () => {
    expect(() => requireLoopback('http://api.example.com')).toThrow(
      /loopback/i,
    );
    expect(requireLoopback('http://localhost:11434/api/tags')).toBe(
      'http://localhost:11434',
    );
  });
});
