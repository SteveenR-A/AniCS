/**
 * Servicio Criptográfico Web Crypto API para AniCS.
 * Implementa PBKDF2 (100,000 iteraciones SHA-256) y cifrado AES-GCM de 256 bits.
 */

// ─── Verificación de soporte en el entorno (WebView / Browser) ───

export async function checkCryptoSupport(): Promise<boolean> {
  try {
    if (typeof window === 'undefined' || !window.crypto || !window.crypto.subtle) {
      return false;
    }
    const testKey = await window.crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
    return !!testKey;
  } catch {
    return false;
  }
}

// ─── Utilidades de Salt y Base64 ───

export function generateRandomSalt(length = 16): Uint8Array {
  const salt = new Uint8Array(length);
  window.crypto.getRandomValues(salt);
  return salt;
}

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ─── Derivación de Clave (PBKDF2) ───

export async function deriveKeyFromPin(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(pin),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as ArrayBuffer,
      iterations: 100_000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// ─── Cifrado AES-GCM (256 bits, IV de 12 bytes) ───

export async function encryptText(plainText: string, key: CryptoKey): Promise<string> {
  const iv = new Uint8Array(12);
  window.crypto.getRandomValues(iv);

  const enc = new TextEncoder();
  const encodedData = enc.encode(plainText);

  const cipherBuffer = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encodedData
  );

  // Formato: [12 bytes IV] + [Ciphertext + Auth Tag]
  const cipherBytes = new Uint8Array(cipherBuffer);
  const result = new Uint8Array(iv.length + cipherBytes.length);
  result.set(iv, 0);
  result.set(cipherBytes, iv.length);

  return uint8ArrayToBase64(result);
}

// ─── Descifrado AES-GCM ───

export async function decryptText(cipherBase64: string, key: CryptoKey): Promise<string> {
  const combined = base64ToUint8Array(cipherBase64);
  if (combined.length < 12) {
    throw new Error('Ciphertext demasiado corto: falta IV');
  }

  const iv = combined.slice(0, 12);
  const cipherBytes = combined.slice(12);

  const plainBuffer = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    cipherBytes
  );

  const dec = new TextDecoder();
  return dec.decode(plainBuffer);
}

// ─── Hashes Deterministas SHA-256 ───

export async function computeSha256(content: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(content);
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
