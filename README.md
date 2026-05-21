# Authenticator

> **World's most secure client-side TOTP 2FA authenticator** — Argon2id + AES-256-GCM + WebAuthn + MetaMask + Google Sign-In.

A fully client-side, zero-server, **Progressive Web App (PWA)** for managing Time-based One-Time Password (TOTP) codes. All secrets are encrypted at rest using military-grade cryptography and never leave your device.

## Features

- **Multi-Account TOTP** — Add unlimited accounts, each with live 30-second rotating codes and visual timer rings.
- **QR Scan** — Upload, drag-and-drop, paste, or live camera scan to add accounts instantly.
- **Manual Entry** — Type or paste Base32 secrets. Live OTP preview as you type.
- **Search & Filter** — Quickly find accounts by name.
- **World-Class Security** — Argon2id (64MB memory-hard KDF), AES-256-GCM encryption, WebAuthn FIDO2 hardware keys.
- **Multiple Backup Methods:**
  - **MetaMask** — Sign with your wallet, encrypted backup via Argon2id + AES-256-GCM.
  - **Google Sign-In** — Backup encrypted with your Google identity.
  - **Password** — Strong password → Argon2id → encrypted backup.
  - **WebAuthn / FIDO2** — Windows Hello, Touch ID, Face ID, YubiKey.
- **Open Source (MIT)** — Fully auditable. No hidden code, no telemetry, no servers.
- **PWA** — Install as a native app. Works offline.
- **Wake Lock** — Screen stays on while viewing codes.
- **macOS-Style UI** — Frosted glass backdrop, pill buttons, deep dark mode, smooth animations.

## Security Architecture

```
User Secret (MetaMask signature / Google token / Password / WebAuthn assertion)
    │
    ▼
┌──────────────────────────────────────┐
│  Argon2id KDF                        │
│  Memory: 64MB | Iterations: 3        │
│  Parallelism: 1 | Salt: 16 bytes     │
│  (Falls back to PBKDF2-1M if WASM    │
│   unavailable)                        │
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
|  Auto-clears from clipboard in 30s   │
└──────────────────────────────────────┘
```

- **Session auto-locks** after 5 minutes of inactivity.
- **Clipboard auto-clears** 30 seconds after copying backup.
- **Subresource Integrity (SRI)** on all external CDN scripts.
- **No servers.** All crypto runs in your browser. No data leaves your device.

## Getting Started

### Online
Open **[https://ImranDev3.github.io/2fa-Authenticator-](https://ImranDev3.github.io/2fa-Authenticator-)** in any modern browser.

### Offline (local)
```bash
git clone https://github.com/ImranDev3/2fa-Authenticator-.git
cd 2fa-Authenticator-
# Open index.html in your browser
```

Or serve with any HTTP server:
```bash
npx serve .
```

### Install as PWA
1. Open the app in Chrome/Edge.
2. Click the install icon in the address bar (or ⋮ → Install Authenticator).
3. Launch from your desktop/start menu — works offline.

## Usage

1. **Add an account** — Scan a QR code, paste an image, or type a Base32 secret.
2. **View codes** — 6-digit codes refresh every 30 seconds with visual timer.
3. **Copy a code** — Click the code, click the copy button, or double-click the row.
4. **Backup your accounts** — Click the 🔒 shield icon in the header.
   - Connect MetaMask → Export
   - Sign in with Google → Export
   - Set a password → Export
   - Register a hardware key → Unlock → Export
5. **Restore** — Same shield icon, choose Import, paste your encrypted JSON.

## Google Client ID (optional)

For Google Sign-In backup, you need a Google OAuth Client ID:
1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create a new OAuth 2.0 Client ID (Web application)
3. Add `http://localhost` and your production URL to Authorized JavaScript origins
4. Paste the Client ID in the app

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Crypto KDF | Argon2id (WASM) / PBKDF2-SHA256 (1M iterations) |
| Encryption | AES-256-GCM (Web Crypto API) |
| Hardware Auth | WebAuthn / FIDO2 (platform authenticator) |
| Wallet | MetaMask via ethers.js |
| Google Auth | Google Identity Services (GIS) |
| QR | jsQR — pure JS QR decoder |
| UI | Vanilla JS, CSS (macOS-style) |
| PWA | Service Worker + Web App Manifest |
| Wake Lock | Screen Wake Lock API |
| Format | TOTP (RFC 6238) — SHA-1, 30s interval, 6 digits |

## Browser Support

Chrome, Edge, Firefox, Safari, and any Chromium-based browser. Requires:
- `Web Cryptography API` for encryption
- `WebAuthn API` for hardware key support
- `Service Worker` for PWA offline support
- `Screen Wake Lock API` for always-on display

## Project Structure

```
├── index.html          # Main HTML
├── manifest.json       # PWA manifest
├── sw.js               # Service worker
├── LICENSE             # MIT license
├── js/
│   ├── totp.js         # TOTP generation (RFC 6238)
│   ├── qr.js           # QR scan, camera, paste
│   ├── ui.js           # UI rendering, timers, theme
│   ├── backup.js       # Auth, encryption, WebAuthn
│   └── app.js          # Events, boot
└── css/
    └── style.css       # macOS-style stylesheet
```

## Security Auditing

All code is inspectable from browser DevTools via the global `window.Authenticator` namespace. Every function, variable, and key is fully exposed for independent security auditing.

## License

MIT — see [LICENSE](LICENSE).

---

**GitHub:** [github.com/ImranDev3/2fa-Authenticator-](https://github.com/ImranDev3/2fa-Authenticator-)
