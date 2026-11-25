const encoder = new TextEncoder();
const decoder = new TextDecoder();
const wrappingContext = encoder.encode("md.therama.dev/workspace-key/v1");

function asBufferSource(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

export type KeyEnvelope = {
  version: 1;
  kdfSalt: string;
  wrapIv: string;
  wrappedKey: string;
};

export type EncryptedPayload = {
  payloadCiphertext: string;
  payloadIv: string;
};

export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

export function fromBase64Url(value: string): Uint8Array {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function recoveryWrappingKey(recoveryKey: string, salt: Uint8Array): Promise<CryptoKey> {
  const recoveryMaterial = await crypto.subtle.importKey(
    "raw",
    asBufferSource(fromBase64Url(recoveryKey)),
    "HKDF",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: asBufferSource(salt),
      info: asBufferSource(wrappingContext),
    },
    recoveryMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function createDataKeyEnvelope(): Promise<{
  dataKey: string;
  recoveryKey: string;
  envelope: KeyEnvelope;
}> {
  const dataKeyBytes = crypto.getRandomValues(new Uint8Array(32));
  const recoveryKey = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const envelope = await wrapDataKeyEnvelope(toBase64Url(dataKeyBytes), recoveryKey);

  return { dataKey: toBase64Url(dataKeyBytes), recoveryKey, envelope };
}

export async function wrapDataKeyEnvelope(
  dataKey: string,
  recoveryKey: string,
): Promise<KeyEnvelope> {
  const kdfSalt = crypto.getRandomValues(new Uint8Array(16));
  const wrapIv = crypto.getRandomValues(new Uint8Array(12));
  const kek = await recoveryWrappingKey(recoveryKey, kdfSalt);
  const wrapped = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: asBufferSource(wrapIv) },
    kek,
    asBufferSource(fromBase64Url(dataKey)),
  );
  return {
    version: 1,
    kdfSalt: toBase64Url(kdfSalt),
    wrapIv: toBase64Url(wrapIv),
    wrappedKey: toBase64Url(new Uint8Array(wrapped)),
  };
}

export async function unwrapDataKey(recoveryKey: string, envelope: KeyEnvelope): Promise<string> {
  if (envelope.version !== 1)
    throw new Error("This encrypted workspace key version is unsupported.");
  const kek = await recoveryWrappingKey(recoveryKey.trim(), fromBase64Url(envelope.kdfSalt));
  const rawKey = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: asBufferSource(fromBase64Url(envelope.wrapIv)) },
    kek,
    asBufferSource(fromBase64Url(envelope.wrappedKey)),
  );
  return toBase64Url(new Uint8Array(rawKey));
}

export async function encryptDocumentPayload(
  dataKey: string,
  documentId: string,
  payload: unknown,
): Promise<EncryptedPayload> {
  const key = await crypto.subtle.importKey(
    "raw",
    asBufferSource(fromBase64Url(dataKey)),
    "AES-GCM",
    false,
    ["encrypt"],
  );
  const payloadIv = crypto.getRandomValues(new Uint8Array(12));
  const additionalData = encoder.encode(`md-document-v1:${documentId}`);
  const encrypted = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: asBufferSource(payloadIv),
      additionalData: asBufferSource(additionalData),
    },
    key,
    asBufferSource(encoder.encode(JSON.stringify(payload))),
  );
  return {
    payloadCiphertext: toBase64Url(new Uint8Array(encrypted)),
    payloadIv: toBase64Url(payloadIv),
  };
}

export async function decryptDocumentPayload<T>(
  dataKey: string,
  documentId: string,
  encrypted: EncryptedPayload,
): Promise<T> {
  const key = await crypto.subtle.importKey(
    "raw",
    asBufferSource(fromBase64Url(dataKey)),
    "AES-GCM",
    false,
    ["decrypt"],
  );
  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: asBufferSource(fromBase64Url(encrypted.payloadIv)),
      additionalData: asBufferSource(encoder.encode(`md-document-v1:${documentId}`)),
    },
    key,
    asBufferSource(fromBase64Url(encrypted.payloadCiphertext)),
  );
  return JSON.parse(decoder.decode(decrypted)) as T;
}

export async function hashPayload(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(JSON.stringify(value)));
  return toBase64Url(new Uint8Array(digest));
}
