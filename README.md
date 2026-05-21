# Authenticator 2FA

**Next-generation client-side TOTP authenticator** with hardware-backed encryption, multi-wallet backup, and PWA offline support.

[**→ Launch App**](https://2faotp.vercel.app)  
[GitHub](https://github.com/ImranDev3/2fa-Authenticator-) · [MIT License](LICENSE)

---

## Overview

Authenticator 2FA is a fully client-side, zero-server Progressive Web App for managing Time-based One-Time Password (TOTP) codes. All secrets are encrypted at rest using military-grade cryptography — Argon2id + AES-256-GCM — and never leave your device.

### Multi-Language Crypto Stack

| Layer | Technology |
|-------|-----------|
| **SHA-256 Core** | Rust / AssemblyScript → WASM |
| **Key Derivation** | Argon2id (WASM, 64MB memory-hard, 3 rounds) / PBKDF2-SHA256 fallback |
| **Encryption** | AES-256-GCM (Web Crypto API) |
| **Hardware Auth** | WebAuthn / FIDO2 (platform authenticator) |
| **Wallet Backup** | MetaMask (Ethereum) / Leather · Xverse · Unisat · OKX (Bitcoin) |
| **Identity Backup** | Google Sign-In (GIS) |
| **Password Backup** | Password → Argon2id → encrypted export |
| **QR Decoding** | jsQR — pure JavaScript |
| **CLI Tool** | Python (`crypto-cli.py`) — compatible encrypt/decrypt |

---

## Key Features

- **Unlimited Accounts** — Add as many TOTP accounts as you need, with live 30-second rotating codes and visual timer rings.
- **QR Scan** — Upload, drag-and-drop, paste, or live camera scan. Scans only fill input fields — you control when to save.
- **5 Backup Methods** — MetaMask, Bitcoin wallets, WebAuthn (YubiKey / Touch ID / Face ID / Windows Hello), Google Sign-In, or password. All use Argon2id + AES-256-GCM.
- **Session Auto-Lock** — Locks after 5 minutes of inactivity. All derived keys cleared from memory.
- **Clipboard Auto-Clear** — Copied backup JSON auto-deletes from clipboard after 30 seconds.
- **macOS-Style UI** — Frosted glass backdrop, pill buttons, deep dark mode, smooth animations.
- **PWA Offline** — Works fully offline once loaded. Installable as a native app.
- **Wake Lock** — Screen stays on while viewing codes.
- **Subresource Integrity (SRI)** — All CDN scripts integrity-checked before execution.
- **Auditable** — Every function exposed via `window.Authenticator`. No minified code. No telemetry. No servers.

---

## Security Architecture

```
User Secret (MetaMask sig / BTC sig / Google token / Password / WebAuthn assertion)
    │
    ▼
┌──────────────────────────────────────┐
│  Rust / AssemblyScript / WASM        │
│  Argon2id KDF                        │
│  Memory: 64MB | Iterations: 3        │
│  Parallelism: 1 | Salt: 16 bytes     │
│  (Falls back to PBKDF2-1M SHA-256)   │
└──────────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────────┐
│  AES-256-GCM Encryption              │
│  Key: 256-bit derived key            │
│  IV: 96-bit random per encryption    │
│  Tag: 128-bit authentication         │
└──────────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────────┐
│  Encrypted Backup JSON               │
│  { v: 3, m: "method", s: "salt",    │
│    d: "iv + ciphertext + tag" }      │
│  Auto-clears from clipboard in 30s   │
└──────────────────────────────────────┘
```

---

## Quick Start

### Web App
Open **[https://2faotp.vercel.app](https://2faotp.vercel.app)** in Chrome, Edge, or Safari.

### Local Development
```bash
git clone https://github.com/ImranDev3/2fa-Authenticator-.git
cd 2fa-Authenticator-
npm install -g serve
serve .
```

### PWA Install
Chrome/Edge address bar → Install icon → Launch from desktop — works fully offline.

---

## Usage Guide

1. **Add an account** — Scan a QR, paste an image, or type a Base32 secret. Values only fill the fields; click **Add** to save.
2. **View codes** — 6-digit codes refresh every 30 seconds. Mini timer rings show remaining time.
3. **Copy** — Click a code or the copy button. Double-click any row to copy instantly.
4. **Search** — Filter accounts by name in real time.
5. **Backup** — Click shield icon → choose method (MetaMask / BTC / WebAuthn / Google / Password) → Export. JSON auto-copies.
6. **Restore** — Shield icon → same method → Import → paste JSON.

---

## Project Structure

```
├── index.html              # Application shell
├── manifest.json           # PWA manifest
├── vercel.json             # Vercel deployment config
├── sw.js                   # Service worker (offline cache)
├── js/
│   ├── totp.js             # TOTP (RFC 6238) — Base32 decode, HMAC-SHA1
│   ├── qr.js               # QR scan (jsQR), camera, paste, file upload
│   ├── ui.js               # Account list, timer rings, theme, copy, toasts
│   ├── backup.js           # Auth (MetaMask/BTC/WebAuthn/Google/Password),
│   │                       #   Argon2id KDF, AES-256-GCM encrypt/decrypt
│   ├── wasm-loader.js      # AssemblyScript→WASM loader with JS fallback
│   └── app.js              # Event bindings, boot init, Wake Lock
├── css/
│   └── style.css           # macOS-style frosted-glass UI
├── crypto-core/
│   ├── assembly/index.ts   # AssemblyScript SHA-256 source
│   └── build/              # Pre-compiled WASM binary (8.9KB)
├── python/
│   └── crypto-cli.py       # CLI: SHA-256, AES-256-GCM backup (web-compatible)
├── rust/
│   ├── Cargo.toml          # Rust project config
│   └── src/lib.rs          # Rust SHA-256 engine, PBKDF2, HMAC
└── LICENSE                 # MIT
```

---

## Browser Support

| Feature | Support |
|---------|---------|
| PWA / Service Worker | Chrome 45+, Edge 79+, Firefox 44+, Safari 11.1+ |
| Web Crypto API | Chrome 37+, Edge 79+, Firefox 34+, Safari 7+ |
| WebAuthn / FIDO2 | Chrome 67+, Edge 79+, Firefox 60+, Safari 13+ |
| Screen Wake Lock | Chrome 84+, Edge 84+, Firefox 126+, Safari 16.4+ |

---

## Google Client ID (Optional)

Required only for Google Sign-In backup:
1. [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → Create OAuth 2.0 Client ID (Web)
2. Add `https://2faotp.vercel.app` to Authorized JavaScript origins
3. Paste the Client ID in the app

---

## License

MIT — see [LICENSE](LICENSE).

---

**Website:** [2faotp.vercel.app](https://2faotp.vercel.app)  
**GitHub:** [github.com/ImranDev3/2fa-Authenticator-](https://github.com/ImranDev3/2fa-Authenticator-)
