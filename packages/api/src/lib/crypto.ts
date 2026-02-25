/**
 * AES-256-GCM encryption for sensitive values (RCON passwords).
 * Key must be 32 bytes, supplied as a 64-char hex string via ENCRYPTION_KEY env.
 */

function getKey(): Uint8Array {
  const hex = process.env["ENCRYPTION_KEY"];
  if (!hex || hex.length !== 64)
    throw new Error("ENCRYPTION_KEY must be a 64-char hex string (32 bytes)");
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

const IV_BYTES = 12;
const TAG_BYTES = 16;

async function importKey(raw: Uint8Array): Promise<CryptoKey> {
  // Ensure a fresh ArrayBuffer (byteOffset must be 0 for crypto.subtle)
  const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
  return crypto.subtle.importKey("raw", buf, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encrypt(plaintext: string): Promise<Buffer> {
  const key = await importKey(getKey());
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  const result = Buffer.alloc(IV_BYTES + ct.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(ct), IV_BYTES);
  return result;
}

export async function decrypt(data: Buffer): Promise<string> {
  const key = await importKey(getKey());
  const iv = data.subarray(0, IV_BYTES);
  const ct = data.subarray(IV_BYTES);
  // Use .slice() to get a fresh ArrayBuffer respecting byteOffset
  // (Buffer from SQLite may have byteOffset > 0; passing .buffer directly passes wrong bytes)
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength) as ArrayBuffer },
    key,
    ct.buffer.slice(ct.byteOffset, ct.byteOffset + ct.byteLength) as ArrayBuffer
  );
  return new TextDecoder().decode(pt);
}
