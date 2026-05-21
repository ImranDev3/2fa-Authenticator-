(function() {
  'use strict';

  const otpDisplay = document.getElementById('otpDisplay');
  const otpValue = document.getElementById('otpValue');
  const otpIssuer = document.getElementById('otpIssuer');
  const timerFill = document.getElementById('timerFill');
  const timerText = document.getElementById('timerText');
  const timerLabel = document.getElementById('timerLabel');
  const copyBtn = document.getElementById('copyBtn');
  const resetBtn = document.getElementById('resetBtn');
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  const secretInput = document.getElementById('secretInput');
  const setSecretBtn = document.getElementById('setSecretBtn');
  const lastUsedEl = document.getElementById('lastUsed');
  const toast = document.getElementById('toast');
  const themeToggle = document.getElementById('themeToggle');
  const cameraBtn = document.getElementById('cameraBtn');
  const cameraModal = document.getElementById('cameraModal');
  const cameraFeed = document.getElementById('cameraFeed');
  const camStatus = document.getElementById('camStatus');
  const camClose = document.getElementById('camClose');

  const CIRCUMFERENCE = 113.09;
  let currentSecret = '';
  let totpTimer = null;
  let countdownTimer = null;
  let cameraStream = null;
  let cameraScanTimer = null;

  const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

  function base32Decode(str) {
    const cleaned = str.replace(/[= \t\r\n]/g, '').toUpperCase();
    const bytes = [];
    let buf = 0, bits = 0;
    for (const ch of cleaned) {
      const idx = BASE32.indexOf(ch);
      if (idx === -1) continue;
      buf = (buf << 5) | idx;
      bits += 5;
      if (bits >= 8) {
        bits -= 8;
        bytes.push((buf >>> bits) & 0xff);
      }
    }
    return new Uint8Array(bytes);
  }

  async function generateTOTP(secret, step = 30) {
    const key = await crypto.subtle.importKey('raw', base32Decode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
    const counter = Math.floor(Date.now() / 1000 / step);
    const buf = new ArrayBuffer(8);
    new DataView(buf).setBigUint64(0, BigInt(counter), false);
    const hmac = new Uint8Array(await crypto.subtle.sign('HMAC', key, buf));
    const off = hmac[19] & 0x0f;
    const code = ((hmac[off] & 0x7f) << 24) | ((hmac[off + 1] & 0xff) << 16) | ((hmac[off + 2] & 0xff) << 8) | (hmac[off + 3] & 0xff);
    return String(code % 1000000).padStart(6, '0');
  }

  function decodeQR(data, w, h) {
    const r = jsQR(data, w, h, { inversionAttempts: 'dontInvert' });
    return r ? r.data : null;
  }

  function extractSecret(url) {
    try {
      const u = url.trim();
      if (!u.startsWith('otpauth://') && !u.startsWith('http')) return null;
      const q = u.indexOf('?');
      if (q === -1) return null;
      const s = new URLSearchParams(u.slice(q)).get('secret');
      return s ? s.toUpperCase() : null;
    } catch { return null; }
  }

  function extractIssuer(url) {
    try {
      const u = url.trim();
      const s = new URLSearchParams(u.slice(u.indexOf('?')));
      const i = s.get('issuer');
      if (i) return decodeURIComponent(i);
      const m = u.match(/otpauth:\/\/totp\/(.+?)(\?|$)/);
      if (m) return decodeURIComponent(m[1]).replace(/:.*$/, '');
      return '';
    } catch { return ''; }
  }

  function processQR(data) {
    const s = extractSecret(data);
    if (s) { setSecret(s, extractIssuer(data)); showToast('QR scanned! Secret extracted.', 'success'); return true; }
    showToast('No valid secret found.', 'error');
    return false;
  }

  function setSecret(secret, issuer) {
    currentSecret = secret;
    secretInput.value = secret;
    if (issuer) otpIssuer.textContent = issuer;
    try {
      localStorage.setItem('2fa_secret', secret);
      localStorage.setItem('2fa_issuer', issuer || '');
    } catch {}
    updateLastUsed();
    startTOTP();
  }

  async function updateOTP() {
    if (!currentSecret) return;
    const c = await generateTOTP(currentSecret);
    if (c) {
      otpValue.textContent = c.slice(0, 3) + ' \u00a0' + c.slice(3);
      otpDisplay.classList.remove('blur');
    } else {
      otpValue.textContent = '\u2014 \u2014 \u2014 \u00a0\u2014 \u2014 \u2014';
      otpDisplay.classList.add('blur');
    }
  }

  function startCountdown() {
    let r = 30 - (Math.floor(Date.now() / 1000) % 30);
    function tick() {
      r--;
      if (r < 0) r = 29;
      updateTimer(r);
    }
    updateTimer(r);
    clearInterval(countdownTimer);
    countdownTimer = setInterval(tick, 1000);
  }

  function updateTimer(rem) {
    timerText.textContent = rem;
    timerFill.setAttribute('stroke-dashoffset', CIRCUMFERENCE * (1 - rem / 30));
    timerFill.classList.toggle('danger', rem <= 5);
    timerFill.classList.toggle('warning', rem > 5 && rem <= 10);
  }

  function startTOTP() {
    clearInterval(totpTimer);
    updateOTP();
    startCountdown();
    const ms = 30000 - (Date.now() % 30000);
    setTimeout(() => { updateOTP(); totpTimer = setInterval(updateOTP, 30000); }, ms);
  }

  function resetAll() {
    currentSecret = '';
    secretInput.value = '';
    otpValue.textContent = '\u2014 \u2014 \u2014 \u00a0\u2014 \u2014 \u2014';
    otpDisplay.classList.add('blur');
    otpIssuer.textContent = '';
    clearInterval(totpTimer);
    clearInterval(countdownTimer);
    clearTimeout(totpTimer);
    updateTimer(0);
    try { localStorage.removeItem('2fa_secret'); localStorage.removeItem('2fa_issuer'); } catch {}
    lastUsedEl.classList.remove('show');
    showToast('Reset complete.', 'info');
  }

  function updateLastUsed() {
    try {
      const s = localStorage.getItem('2fa_secret');
      if (s) {
        const i = localStorage.getItem('2fa_issuer') || '';
        lastUsedEl.textContent = 'Last used: ' + (i ? i + ' \u00b7 ' : '') + s.slice(0, 8) + '\u2026';
        lastUsedEl.classList.add('show');
      }
    } catch {}
  }

  function restoreLast() {
    try {
      const s = localStorage.getItem('2fa_secret');
      const i = localStorage.getItem('2fa_issuer') || '';
      if (s) { setSecret(s, i); showToast('Restored last secret.', 'info'); }
    } catch {}
  }

  let toastTimer = null;

  function showToast(msg, type) {
    toast.textContent = msg;
    toast.className = 'toast ' + (type || 'info');
    void toast.offsetWidth;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
  }

  function processFile(file) {
    const r = new FileReader();
    r.onload = function(e) {
      const img = new Image();
      img.onload = function() {
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const d = ctx.getImageData(0, 0, c.width, c.height);
        const res = decodeQR(d.data, d.width, d.height);
        if (res) processQR(res);
        else showToast('No QR code found.', 'error');
      };
      img.src = e.target.result;
    };
    r.readAsDataURL(file);
  }

  async function handlePaste(e) {
    const items = (e.clipboardData || window.clipboardData).items;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const f = item.getAsFile();
        if (f) { processFile(f); showToast('Processing pasted image\u2026', 'info'); return; }
      }
    }
    const text = (e.clipboardData || window.clipboardData).getData('text');
    if (text) {
      const s = extractSecret(text);
      if (s) { setSecret(s, extractIssuer(text)); showToast('Secret pasted!', 'success'); return; }
      const clean = text.replace(/[ \t\r\n]/g, '').toUpperCase();
      if (/^[A-Z2-7]{16,}$/.test(clean)) { setSecret(clean, ''); showToast('Secret pasted.', 'success'); return; }
    }
  }

  async function startCamera() {
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } } });
      cameraFeed.srcObject = cameraStream;
      cameraModal.classList.add('open');
      camStatus.textContent = 'Scanning for QR code\u2026';
      scanFrame();
    } catch { showToast('Camera unavailable.', 'error'); }
  }

  function stopCamera() {
    if (cameraStream) { cameraStream.getTracks().forEach(t => t.stop()); cameraStream = null; }
    clearTimeout(cameraScanTimer);
    cameraModal.classList.remove('open');
  }

  function scanFrame() {
    if (!cameraModal.classList.contains('open')) return;
    if (cameraFeed.readyState >= 2) {
      const c = document.createElement('canvas');
      c.width = cameraFeed.videoWidth; c.height = cameraFeed.videoHeight;
      const ctx = c.getContext('2d');
      ctx.drawImage(cameraFeed, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height);
      const r = decodeQR(d.data, d.width, d.height);
      if (r && processQR(r)) { stopCamera(); return; }
    }
    cameraScanTimer = setTimeout(scanFrame, 400);
  }

  function getOTP() {
    return otpValue.textContent.replace(/[\s\u00a0]/g, '');
  }

  function copyOTP() {
    const code = getOTP();
    if (code && code.length === 6) {
      navigator.clipboard.writeText(code).then(() => showToast('Copied!', 'success')).catch(() => {
        const t = document.createElement('textarea');
        t.value = code; document.body.appendChild(t); t.select();
        document.execCommand('copy'); document.body.removeChild(t);
        showToast('Copied!', 'success');
      });
    } else showToast('No code to copy.', 'error');
  }

  function toggleTheme() {
    const light = document.body.classList.toggle('dark');
    themeToggle.innerHTML = light
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
    try { localStorage.setItem('2fa_theme', light ? 'dark' : 'light'); } catch {}
  }

  function loadTheme() {
    try {
      if (localStorage.getItem('2fa_theme') === 'dark') {
        document.body.classList.add('dark');
        themeToggle.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
      }
    } catch {}
  }

  themeToggle.addEventListener('click', toggleTheme);

  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length) processFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', () => {
    if (fileInput.files.length) { processFile(fileInput.files[0]); fileInput.value = ''; }
  });

  setSecretBtn.addEventListener('click', () => {
    const v = secretInput.value.trim().toUpperCase();
    if (/^[A-Z2-7]{16,}$/.test(v)) { setSecret(v, ''); showToast('Secret set.', 'success'); }
    else showToast('Invalid secret.', 'error');
  });
  secretInput.addEventListener('keydown', e => { if (e.key === 'Enter') setSecretBtn.click(); });
  lastUsedEl.addEventListener('click', restoreLast);
  document.addEventListener('paste', handlePaste);
  copyBtn.addEventListener('click', copyOTP);
  otpDisplay.addEventListener('click', copyOTP);
  resetBtn.addEventListener('click', resetAll);
  cameraBtn.addEventListener('click', startCamera);
  camClose.addEventListener('click', stopCamera);
  cameraModal.addEventListener('click', e => { if (e.target === cameraModal) stopCamera(); });

  loadTheme();
  updateLastUsed();

  try {
    const s = localStorage.getItem('2fa_secret');
    const i = localStorage.getItem('2fa_issuer') || '';
    if (s) {
      currentSecret = s;
      secretInput.value = s;
      if (i) otpIssuer.textContent = i;
      startTOTP();
    } else otpDisplay.classList.add('blur');
  } catch { otpDisplay.classList.add('blur'); }

  document.addEventListener('keydown', e => {
    if ((e.key === 'c' || e.key === 'C') && !e.ctrlKey && !e.metaKey) copyOTP();
    if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey) resetAll();
  });
})();
