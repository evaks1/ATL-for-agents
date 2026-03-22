"""Cryptographic primitives for ATL SDK — Ed25519 signing."""

import json
import os
from base64 import urlsafe_b64encode, urlsafe_b64decode
from typing import Any

from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)
from cryptography.hazmat.primitives.serialization import (
    Encoding,
    PublicFormat,
    PrivateFormat,
    NoEncryption,
)


def generate_keypair() -> dict[str, str]:
    """Generate an Ed25519 key pair. Returns {"private_key": hex, "public_key": hex}."""
    private_key = Ed25519PrivateKey.generate()
    public_key = private_key.public_key()

    priv_bytes = private_key.private_bytes(Encoding.Raw, PrivateFormat.Raw, NoEncryption())
    pub_bytes = public_key.public_bytes(Encoding.Raw, PublicFormat.Raw)

    return {
        "private_key": priv_bytes.hex(),
        "public_key": pub_bytes.hex(),
    }


def sign_message(private_key_hex: str, message: str) -> str:
    """Sign a message with an Ed25519 private key. Returns base64url signature."""
    priv_bytes = bytes.fromhex(private_key_hex)
    private_key = Ed25519PrivateKey.from_private_bytes(priv_bytes)
    sig = private_key.sign(message.encode("utf-8"))
    # base64url without padding
    return urlsafe_b64encode(sig).rstrip(b"=").decode("ascii")


def verify_signature(public_key_hex: str, message: str, signature_b64url: str) -> bool:
    """Verify an Ed25519 signature. Returns True if valid."""
    try:
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
        from cryptography.exceptions import InvalidSignature

        pub_bytes = bytes.fromhex(public_key_hex)
        public_key = Ed25519PublicKey.from_public_bytes(pub_bytes)

        # Re-pad base64url
        padding = 4 - len(signature_b64url) % 4
        if padding != 4:
            signature_b64url += "=" * padding
        sig = urlsafe_b64decode(signature_b64url)

        public_key.verify(sig, message.encode("utf-8"))
        return True
    except Exception:
        return False


def canonicalize(obj: Any) -> str:
    """Canonical JSON — keys sorted recursively, no extra whitespace."""
    if obj is None or not isinstance(obj, (dict, list)):
        return json.dumps(obj, separators=(",", ":"), ensure_ascii=False)
    if isinstance(obj, list):
        return "[" + ",".join(canonicalize(v) for v in obj) + "]"
    sorted_keys = sorted(obj.keys())
    pairs = [json.dumps(k, separators=(",", ":")) + ":" + canonicalize(obj[k]) for k in sorted_keys]
    return "{" + ",".join(pairs) + "}"
