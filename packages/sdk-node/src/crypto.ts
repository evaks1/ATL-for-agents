import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { randomBytes } from "crypto";

ed.etc.sha512Sync = (...m) => sha512(...m);

export interface KeyPair {
  publicKey: string; // hex
  privateKey: string; // hex
}

export function generateKeyPair(): KeyPair {
  const buf = randomBytes(32);
  const priv = new Uint8Array(buf.buffer, buf.byteOffset, 32);
  const pub = ed.getPublicKey(priv);
  return { privateKey: bytesToHex(priv), publicKey: bytesToHex(pub) };
}

export function sign(privateKeyHex: string, message: string): string {
  const priv = hexToBytes(privateKeyHex);
  const msg = new TextEncoder().encode(message);
  const sig = ed.sign(msg, priv);
  return Buffer.from(sig).toString("base64url");
}

export function verify(publicKeyHex: string, message: string, sig: string): boolean {
  try {
    const pub = hexToBytes(publicKeyHex);
    const msg = new TextEncoder().encode(message);
    const sigBytes = Buffer.from(sig, "base64url");
    return ed.verify(sigBytes, msg, pub);
  } catch {
    return false;
  }
}

export function canonicalize(obj: unknown): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(canonicalize).join(",") + "]";
  const sorted = Object.keys(obj as Record<string, unknown>)
    .sort()
    .map((k) => JSON.stringify(k) + ":" + canonicalize((obj as Record<string, unknown>)[k]))
    .join(",");
  return "{" + sorted + "}";
}
