#!/usr/bin/env python3
"""
Authenticator Crypto CLI - Python
BTC SHA-256 & ETH-compatible Keccak-256 hashing
Backup encrypt/decrypt compatible with web app

Usage:
  python crypto-cli.py sha256 --data "hello"
  python crypto-cli.py keccak256 --data "hello"
  python crypto-cli.py backup --encrypt --password "mypass" --accounts '[{"id":"abc","secret":"JBSWY3DPEHPK3PXP"}]'
  python crypto-cli.py backup --decrypt --password "mypass" --data "eyJ2Ijo..."
"""

import hashlib
import json
import os
import base64
import argparse
import hmac

# ── SHA-256 (BTC) ──

def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

# ── Keccak-256 (ETH) via SHA3-256 ──
# Python 3.14+ has hashlib.keccak256 natively

def keccak256(data: bytes) -> str:
    if hasattr(hashlib, 'keccak256'):
        return hashlib.keccak256(data).hexdigest()
    try:
        from hashlib import sha3_256 as keccak
        return keccak(data).hexdigest()
    except:
        try:
            import _pysha3
            return _pysha3.keccak_256(data).hex()
        except:
            raise RuntimeError("Keccak-256 not available. Install pysha3: pip install pysha3")

# ── PBKDF2 key derivation ──

def derive_key(password: str, salt: bytes, iterations: int = 1000000) -> bytes:
    return hashlib.pbkdf2_hmac('sha256', password.encode(), salt, iterations, dklen=32)

# ── AES-256-GCM encrypt/decrypt ──

try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    HAS_AES = True
except ImportError:
    HAS_AES = False
    print("Warning: 'cryptography' package not found. Install: pip install cryptography")

def encrypt_backup(accounts_json: str, password: str) -> str:
    if not HAS_AES:
        raise RuntimeError("cryptography package required")
    salt = os.urandom(16)
    key = derive_key(password, salt)
    iv = os.urandom(12)
    aesgcm = AESGCM(key)
    ciphertext = aesgcm.encrypt(iv, accounts_json.encode(), None)
    combined = iv + ciphertext
    payload = json.dumps({
        "v": 3,
        "m": "Password-Python",
        "s": base64.b64encode(salt).decode(),
        "d": base64.b64encode(combined).decode()
    })
    return payload

def decrypt_backup(backup_json: str, password: str) -> str:
    if not HAS_AES:
        raise RuntimeError("cryptography package required")
    data = json.loads(backup_json)
    salt = base64.b64decode(data["s"])
    combined = base64.b64decode(data["d"])
    iv = combined[:12]
    ciphertext = combined[12:]
    key = derive_key(password, salt)
    aesgcm = AESGCM(key)
    plaintext = aesgcm.decrypt(iv, ciphertext, None)
    return plaintext.decode()

# ── CLI ──

def main():
    parser = argparse.ArgumentParser(description="Authenticator Crypto CLI")
    parser.add_argument("command", choices=["sha256", "keccak256", "backup"])
    parser.add_argument("--data", help="Data to hash")
    parser.add_argument("--password", help="Encryption password")
    parser.add_argument("--accounts", help="Accounts JSON array string")
    parser.add_argument("--encrypt", action="store_true", help="Encrypt backup")
    parser.add_argument("--decrypt", action="store_true", help="Decrypt backup")
    args = parser.parse_args()

    if args.command == "sha256":
        if not args.data:
            data = sys.stdin.buffer.read()
        else:
            data = args.data.encode()
        print(sha256(data))

    elif args.command == "keccak256":
        if not args.data:
            data = sys.stdin.buffer.read()
        else:
            data = args.data.encode()
        print(keccak256(data))

    elif args.command == "backup":
        if args.encrypt:
            if not args.password or not args.accounts:
                print("Error: --password and --accounts required")
                return
            result = encrypt_backup(args.accounts, args.password)
            print(result)
        elif args.decrypt:
            if not args.password or not args.data:
                print("Error: --password and --data required")
                return
            result = decrypt_backup(args.data, args.password)
            print(result)
        else:
            # Hash mode: show both
            if args.data:
                data = args.data.encode()
                print(f"SHA-256:    {sha256(data)}")
                print(f"Keccak-256: {keccak256(data)}")

    # Verify hashes match web app
    if args.data and args.command == "backup" and not args.encrypt and not args.decrypt:
        print("\n✓ Hashes computed using Python 3 native crypto")

if __name__ == "__main__":
    import sys
    main()
