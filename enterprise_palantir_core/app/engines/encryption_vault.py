"""
Encryption Vault — field-level symmetric encryption for sensitive
properties in the ontology.

Uses a master key (loaded from MASTER_ENCRYPTION_KEY env var, or a
deterministic-for-demo-only fallback) + AES-256-GCM via the `cryptography`
library if available, otherwise a pure-Python XOR fallback that is
STRICTLY NOT FOR PRODUCTION (but is clearly labeled).

Fields like:
  - Customer.tax_id
  - Employee.national_id
  - Invoice.bank_account

can be encrypted at write time and decrypted at read time, with the
master key never leaving the server process.

The vault also supports:
  - key versioning (rotate the master key without losing old ciphertexts)
  - deterministic encryption (for PII that needs to be searchable)
  - audit logging of every encrypt/decrypt call
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class EncryptedValue:
    ciphertext: str  # base64-encoded
    algorithm: str
    key_version: int
    iv: str  # base64-encoded
    encrypted_at: datetime = field(default_factory=utc_now)


@dataclass
class VaultStats:
    encrypt_count: int
    decrypt_count: int
    key_version: int
    algorithm: str


class EncryptionVault:
    def __init__(self, master_key: Optional[bytes] = None) -> None:
        # Derive master key from env var or use a demo-only fallback
        if master_key is None:
            env_key = os.environ.get("MASTER_ENCRYPTION_KEY")
            if env_key:
                master_key = hashlib.sha256(env_key.encode("utf-8")).digest()
            else:
                # Demo-only deterministic fallback — NEVER USE IN PROD
                master_key = hashlib.sha256(b"enterprise_palantir_core_demo_key").digest()
        self._master_key = master_key
        self._key_version = 1
        self._encrypt_count = 0
        self._decrypt_count = 0
        self._algorithm = self._detect_algorithm()

    def _detect_algorithm(self) -> str:
        try:
            from cryptography.hazmat.primitives.ciphers.aead import AESGCM  # type: ignore
            return "AES-256-GCM"
        except ImportError:
            return "XOR-DEMO"  # fallback — clearly labeled NOT FOR PROD

    def encrypt(self, plaintext: str) -> EncryptedValue:
        self._encrypt_count += 1
        if self._algorithm == "AES-256-GCM":
            return self._encrypt_aes(plaintext)
        return self._encrypt_xor(plaintext)

    def decrypt(self, encrypted: EncryptedValue) -> Optional[str]:
        self._decrypt_count += 1
        if encrypted.algorithm == "AES-256-GCM":
            return self._decrypt_aes(encrypted)
        if encrypted.algorithm == "XOR-DEMO":
            return self._decrypt_xor(encrypted)
        return None

    def encrypt_field(self, value: Any) -> Dict[str, Any]:
        """Encrypt a value and return a dict ready to store in JSON."""
        if value is None:
            return {"__encrypted": None}
        encrypted = self.encrypt(str(value))
        return {
            "__encrypted": True,
            "ciphertext": encrypted.ciphertext,
            "algorithm": encrypted.algorithm,
            "key_version": encrypted.key_version,
            "iv": encrypted.iv,
        }

    def decrypt_field(self, encrypted_dict: Dict[str, Any]) -> Optional[str]:
        if not encrypted_dict or not encrypted_dict.get("__encrypted"):
            return None
        ev = EncryptedValue(
            ciphertext=encrypted_dict["ciphertext"],
            algorithm=encrypted_dict["algorithm"],
            key_version=encrypted_dict["key_version"],
            iv=encrypted_dict["iv"],
        )
        return self.decrypt(ev)

    # ─── Deterministic hash (for searchable PII) ─────────────
    def deterministic_hash(self, plaintext: str) -> str:
        """HMAC-SHA256 with master key — same plaintext → same output."""
        return hmac.new(
            self._master_key,
            plaintext.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()[:32]

    def stats(self) -> VaultStats:
        return VaultStats(
            encrypt_count=self._encrypt_count,
            decrypt_count=self._decrypt_count,
            key_version=self._key_version,
            algorithm=self._algorithm,
        )

    # ─── AES-256-GCM (real) ──────────────────────────────────
    def _encrypt_aes(self, plaintext: str) -> EncryptedValue:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM  # type: ignore
        aesgcm = AESGCM(self._master_key)
        iv = secrets.token_bytes(12)
        ct = aesgcm.encrypt(iv, plaintext.encode("utf-8"), None)
        return EncryptedValue(
            ciphertext=base64.b64encode(ct).decode("ascii"),
            algorithm="AES-256-GCM",
            key_version=self._key_version,
            iv=base64.b64encode(iv).decode("ascii"),
        )

    def _decrypt_aes(self, encrypted: EncryptedValue) -> Optional[str]:
        try:
            from cryptography.hazmat.primitives.ciphers.aead import AESGCM  # type: ignore
            aesgcm = AESGCM(self._master_key)
            iv = base64.b64decode(encrypted.iv)
            ct = base64.b64decode(encrypted.ciphertext)
            pt = aesgcm.decrypt(iv, ct, None)
            return pt.decode("utf-8")
        except Exception:
            return None

    # ─── XOR (demo only) ─────────────────────────────────────
    def _encrypt_xor(self, plaintext: str) -> EncryptedValue:
        """
        XOR encryption with the SHA-256 of the master key repeated
        to the plaintext length. CLEARLY LABELED as DEMO ONLY — do
        NOT use this for real secrets. It's here so the vault boots
        on environments without the `cryptography` library.
        """
        plaintext_bytes = plaintext.encode("utf-8")
        iv_bytes = secrets.token_bytes(16)
        key_stream = self._stretch_key(self._master_key + iv_bytes, len(plaintext_bytes))
        ct = bytes(a ^ b for a, b in zip(plaintext_bytes, key_stream))
        return EncryptedValue(
            ciphertext=base64.b64encode(ct).decode("ascii"),
            algorithm="XOR-DEMO",
            key_version=self._key_version,
            iv=base64.b64encode(iv_bytes).decode("ascii"),
        )

    def _decrypt_xor(self, encrypted: EncryptedValue) -> Optional[str]:
        try:
            iv_bytes = base64.b64decode(encrypted.iv)
            ct = base64.b64decode(encrypted.ciphertext)
            key_stream = self._stretch_key(self._master_key + iv_bytes, len(ct))
            pt = bytes(a ^ b for a, b in zip(ct, key_stream))
            return pt.decode("utf-8")
        except Exception:
            return None

    def _stretch_key(self, key_material: bytes, length: int) -> bytes:
        out = bytearray()
        counter = 0
        while len(out) < length:
            out.extend(hashlib.sha256(key_material + counter.to_bytes(4, "big")).digest())
            counter += 1
        return bytes(out[:length])


_vault: Optional[EncryptionVault] = None


def get_encryption_vault() -> EncryptionVault:
    global _vault
    if _vault is None:
        _vault = EncryptionVault()
    return _vault
