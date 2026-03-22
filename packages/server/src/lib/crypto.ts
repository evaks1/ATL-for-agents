import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { createHash, randomBytes } from "crypto";

// noble/ed25519 v2 requires sha512 to be configured
ed.etc.sha512Sync = (...m) => sha512(...m);

export interface KeyPair {
  publicKey: string; // hex
  privateKey: string; // hex
}

export function generateKeyPair(): KeyPair {
  // Use Node.js crypto.randomBytes directly to avoid globalThis.crypto dependency
  const privBytes = randomBytes(32);
  const privateKey = new Uint8Array(privBytes.buffer, privBytes.byteOffset, 32);
  const publicKey = ed.getPublicKey(privateKey);
  return {
    privateKey: bytesToHex(privateKey),
    publicKey: bytesToHex(publicKey),
  };
}

export function sign(privateKeyHex: string, message: string): string {
  const privateKey = hexToBytes(privateKeyHex);
  const msgBytes = new TextEncoder().encode(message);
  const sig = ed.sign(msgBytes, privateKey);
  return Buffer.from(sig).toString("base64url");
}

export function verify(
  publicKeyHex: string,
  message: string,
  signatureBase64url: string
): boolean {
  try {
    const publicKey = hexToBytes(publicKeyHex);
    const msgBytes = new TextEncoder().encode(message);
    const sig = Buffer.from(signatureBase64url, "base64url");
    return ed.verify(sig, msgBytes, publicKey);
  } catch {
    return false;
  }
}

/**
 * Canonical JSON: keys sorted recursively, no extra whitespace.
 * Required for deterministic signing.
 */
export function canonicalize(obj: unknown): string {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map(canonicalize).join(",") + "]";
  }
  const sorted = Object.keys(obj as Record<string, unknown>)
    .sort()
    .map((k) => {
      const val = (obj as Record<string, unknown>)[k];
      return JSON.stringify(k) + ":" + canonicalize(val);
    })
    .join(",");
  return "{" + sorted + "}";
}

export function hashSha256(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}
