/**
 * generate-principal-key.ts
 *
 * Generates an Ed25519 keypair for use as a HAEL principal (human identity).
 *
 * This script makes NO network calls. It can be run completely offline.
 * The private key is printed once and never stored anywhere by this script.
 *
 * Run:
 *   pnpm --filter server generate-principal-key
 *
 * Output:
 *   PRINCIPAL_PRIVATE_KEY=<hex>   ← store this securely, never share it
 *   PRINCIPAL_PUBLIC_KEY=<hex>    ← safe to share; goes in UCAN delegations
 */

import { generateKeyPair } from "../src/lib/crypto.js";

const { privateKey, publicKey } = generateKeyPair();

console.log("\nHAEL — Principal Keypair Generator");
console.log("=".repeat(50));
console.log("\nGenerated offline. No network calls were made.\n");
console.log("Store the private key securely (password manager, hardware key).");
console.log("It is shown exactly once:\n");
console.log(`PRINCIPAL_PRIVATE_KEY=${privateKey}`);
console.log(`PRINCIPAL_PUBLIC_KEY=${publicKey}`);
console.log("\nThe public key is safe to share and will be embedded in");
console.log("your UCAN delegation as proof of your identity.\n");
