import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";

ed.etc.sha512Sync = (...m: Parameters<typeof sha512>) => sha512(...m);

export interface KeyPair {
  publicKey: string;  // hex
  privateKey: string; // hex
}

export function generateKeyPair(): KeyPair {
  const privateKeyBytes = crypto.getRandomValues(new Uint8Array(32));
  const publicKeyBytes = ed.getPublicKey(privateKeyBytes);
  return {
    privateKey: bytesToHex(privateKeyBytes),
    publicKey: bytesToHex(publicKeyBytes),
  };
}

/** Canonical JSON: keys sorted recursively, no extra whitespace. */
export function canonicalize(obj: unknown): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + (obj as unknown[]).map(canonicalize).join(",") + "]";
  const sorted = Object.keys(obj as Record<string, unknown>)
    .sort()
    .map((k) => JSON.stringify(k) + ":" + canonicalize((obj as Record<string, unknown>)[k]))
    .join(",");
  return "{" + sorted + "}";
}

/** Sign a string with an Ed25519 private key, returns base64url. */
export function sign(privateKeyHex: string, message: string): string {
  const privateKey = hexToBytes(privateKeyHex);
  const msgBytes = new TextEncoder().encode(message);
  const sig = ed.sign(msgBytes, privateKey);
  return btoa(String.fromCharCode(...sig))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}
