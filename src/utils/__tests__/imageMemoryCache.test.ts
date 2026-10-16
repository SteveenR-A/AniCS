import { describe, expect, it } from 'vitest';
import { ImageMemoryCache } from '../imageMemoryCache';

describe('image memory budget', () => {
  it('evicts the least recently read image when the byte budget is exceeded', () => {
    const cache = new ImageMemoryCache(20, 10);
    cache.set('a', '1234');
    cache.set('b', '5678');
    expect(cache.get('a')).toBe('1234');
    cache.set('c', '9012');
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe('1234');
    expect(cache.get('c')).toBe('9012');
  });

  it('does not retain an oversized image or evict valid entries to fit it', () => {
    const cache = new ImageMemoryCache(20);
    cache.set('a', '1234');
    cache.set('big', 'x'.repeat(20));
    expect(cache.has('big')).toBe(false);
    expect(cache.get('a')).toBe('1234');
  });

  it('accounts for replacements, entry limits and clearing', () => {
    const cache = new ImageMemoryCache(40, 2);
    cache.set('a', '12345678');
    cache.set('a', '1');
    cache.set('b', '12345678');
    expect(cache.get('a')).toBe('1');
    cache.set('c', '1');
    expect(cache.has('b')).toBe(false);
    cache.clear();
    cache.set('d', 'x'.repeat(19));
    expect(cache.get('d')).toBe('x'.repeat(19));
  });
});
