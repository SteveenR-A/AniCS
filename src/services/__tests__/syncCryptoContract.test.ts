import { afterEach, describe, expect, it, vi } from 'vitest';
import fixtureJson from '../../../docs/android-native/fixtures/crypto-v1.json?raw';
import {
  base64ToUint8Array, computeSha256, decryptText, deriveKeyFromPin,
  encryptText, uint8ArrayToBase64,
} from '../cryptoService';

const fixture = JSON.parse(fixtureJson);
afterEach(() => vi.restoreAllMocks());

describe('portable sync encryption vector', () => {
  it('decrypts the fixed PBKDF2/AES-GCM vector produced with Node crypto', async () => {
    const key = await deriveKeyFromPin(fixture.pin, base64ToUint8Array(fixture.saltBase64));
    expect(await decryptText(fixture.ciphertextBase64, key)).toBe(fixture.plaintext);
  });

  it('produces the same IV + ciphertext + tag layout with a fixed test IV', async () => {
    const key = await deriveKeyFromPin(fixture.pin, base64ToUint8Array(fixture.saltBase64));
    const iv = base64ToUint8Array(fixture.ivBase64);
    // This nonce is fixed exclusively in the test. Production stays random.
    vi.spyOn(window.crypto, 'getRandomValues').mockImplementation((target: any) => {
      expect(target.byteLength).toBe(12);
      target.set(iv);
      return target;
    });
    expect(await encryptText(fixture.plaintext, key)).toBe(fixture.ciphertextBase64);
  });

  it('rejects a wrong PIN and a modified authentication tag', async () => {
    const salt = base64ToUint8Array(fixture.saltBase64);
    const wrongKey = await deriveKeyFromPin(fixture.wrongPin, salt);
    await expect(decryptText(fixture.ciphertextBase64, wrongKey)).rejects.toThrow();
    const correctKey = await deriveKeyFromPin(fixture.pin, salt);
    const modified = base64ToUint8Array(fixture.ciphertextBase64);
    modified[modified.length - 1] ^= 1;
    await expect(decryptText(uint8ArrayToBase64(modified), correctKey)).rejects.toThrow();
  });

  it('hashes the exact UTF-8 plaintext bytes without normalizing Unicode', async () => {
    expect(await computeSha256(fixture.plaintext)).toBe(fixture.plaintextSha256);
  });
});
