import { describe, it, expect } from 'vitest';
import { tryParseJson } from '../json.js';

describe('tryParseJson', () => {
  it('parses valid JSON', () => {
    expect(tryParseJson('{"a":[1,2]}')).toEqual({
      ok: true,
      value: { a: [1, 2] },
    });
  });

  it('accepts JSON that is falsy or null', () => {
    expect(tryParseJson('null')).toEqual({ ok: true, value: null });
    expect(tryParseJson('0')).toEqual({ ok: true, value: 0 });
  });

  it.each(['', '{', '<html>', "{'a':1}"])('returns an error for %j', (text) => {
    const result = tryParseJson(text);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toBeInstanceOf(SyntaxError);
  });
});
