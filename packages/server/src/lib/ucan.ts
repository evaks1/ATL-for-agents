/**
 * UCAN-compatible delegation tokens.
 *
 * We use a JWT-style signed token with UCAN semantics.
 * The payload follows the UCAN spec fields (iss, aud, exp, att, prf).
 * Signature is Ed25519 over canonical JSON of header.payload (base64url).
 *
 * This gives us UCAN-compatible structure while keeping the implementation
 * auditable and dependency-light.
 */

import { canonicalize, sign, verify, generateKeyPair, type KeyPair } from "./crypto.js";

export interface UCANCapability {
  resource: string;
  action: string;
  constraints?: {
    max_amount?: number;
    monthly_cap?: number;
    allowed_counterparties?: string[];
    step_up_threshold?: number;
    frequency_limit?: { count: number; window_seconds: number };
  };
}

export interface UCANPayload {
  ucv: "0.9.0";
  iss: string; // DID of issuer (principal)
  aud: string; // DID of audience (agent)
  exp: number; // Unix timestamp
  iat: number;
  att: UCANCapability[];
  fct: Record<string, unknown>[];
  prf: string[]; // proof chain (empty for root delegation)
}

export interface UCANToken {
  header: string;   // base64url
  payload: string;  // base64url
  signature: string; // base64url
  raw: string;       // header.payload.signature
}

const HEADER = { alg: "EdDSA", typ: "JWT", ucv: "0.9.0" };
const HEADER_B64 = Buffer.from(canonicalize(HEADER)).toString("base64url");

function publicKeyToDid(publicKeyHex: string): string {
  return `did:key:z${publicKeyHex}`;
}

export function issueUCAN(
  issuerKey: KeyPair,
  audiencePublicKeyHex: string,
  capabilities: UCANCapability[],
  expirySeconds: number
): UCANToken {
  const now = Math.floor(Date.now() / 1000);
  const payload: UCANPayload = {
    ucv: "0.9.0",
    iss: publicKeyToDid(issuerKey.publicKey),
    aud: publicKeyToDid(audiencePublicKeyHex),
    exp: now + expirySeconds,
    iat: now,
    att: capabilities,
    fct: [],
    prf: [],
  };

  const payloadB64 = Buffer.from(canonicalize(payload)).toString("base64url");
  const signingInput = `${HEADER_B64}.${payloadB64}`;
  const signature = sign(issuerKey.privateKey, signingInput);

  return {
    header: HEADER_B64,
    payload: payloadB64,
    signature,
    raw: `${signingInput}.${signature}`,
  };
}

export interface ParsedUCAN {
  payload: UCANPayload;
  isExpired: boolean;
}

export function parseUCAN(token: string): ParsedUCAN {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid UCAN token format");

  const [headerB64, payloadB64, signature] = parts;
  const payload = JSON.parse(
    Buffer.from(payloadB64, "base64url").toString("utf8")
  ) as UCANPayload;

  // Re-derive issuer public key from DID
  const issuerPubKeyHex = payload.iss.replace("did:key:z", "");
  const signingInput = `${headerB64}.${payloadB64}`;
  const valid = verify(issuerPubKeyHex, signingInput, signature);
  if (!valid) throw new Error("UCAN signature invalid");

  const now = Math.floor(Date.now() / 1000);
  return {
    payload,
    isExpired: payload.exp < now,
  };
}

export { generateKeyPair, publicKeyToDid };
