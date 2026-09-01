import { describe, it, expect } from 'vitest';
import {
  checkCryptoSupport,
  generateRandomSalt,
  deriveKeyFromPin,
  encryptText,
  decryptText,
  computeSha256,
  uint8ArrayToBase64,
  base64ToUint8Array,
} from '../cryptoService';

describe('cryptoService', () => {
  it('detecta soporte de Web Crypto API', async () => {
    const isSupported = await checkCryptoSupport();
    expect(isSupported).toBe(true);
  });

  it('genera salt aleatorio y convierte a base64 correctamente', () => {
    const salt = generateRandomSalt(16);
    expect(salt.length).toBe(16);

    const b64 = uint8ArrayToBase64(salt);
    expect(typeof b64).toBe('string');

    const restored = base64ToUint8Array(b64);
    expect(restored).toEqual(salt);
  });

  it('deriva clave con PBKDF2 y cifra/descifra texto plano con AES-GCM', async () => {
    const pin = '7890';
    const salt = generateRandomSalt(16);
    const key = await deriveKeyFromPin(pin, salt);

    const secretData = JSON.stringify({
      history: [{ id: '1', animeTitle: 'Naruto', watchProgress: 0.85 }],
      favorites: ['https://jkanime.net/naruto/'],
    });

    const encrypted = await encryptText(secretData, key);
    expect(typeof encrypted).toBe('string');
    expect(encrypted).not.toBe(secretData);

    const decrypted = await decryptText(encrypted, key);
    expect(decrypted).toBe(secretData);
  });

  it('falla al intentar descifrar con PIN incorrecto', async () => {
    const correctPin = '1234';
    const wrongPin = '0000';
    const salt = generateRandomSalt(16);

    const keyCorrect = await deriveKeyFromPin(correctPin, salt);
    const keyWrong = await deriveKeyFromPin(wrongPin, salt);

    const secretMessage = 'Mis animes secretos';
    const encrypted = await encryptText(secretMessage, keyCorrect);

    await expect(decryptText(encrypted, keyWrong)).rejects.toThrow();
  });

  it('calcula SHA-256 determinista', async () => {
    const text = 'AniCS Test Data Payload';
    const hash1 = await computeSha256(text);
    const hash2 = await computeSha256(text);

    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(64); // 256 bits hex
  });
});
