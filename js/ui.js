window.Authenticator = window.Authenticator || {};

(function() {
  const CIRCUMFERENCE = 113.09;

  Authenticator.dom = {
    toast: document.getElementById('toast'),
    themeToggle: document.getElementById('themeToggle'),
    searchInput: document.getElementById('searchInput'),
    accountList: document.getElementById('accountList'),
    emptyState: document.getElementById('emptyState'),
    accountCount: document.getElementById('accountCount'),
    dropZone: document.getElementById('dropZone'),
    fileInput: document.getElementById('fileInput'),
    secretInput: document.getElementById('secretInput'),
    issuerInput: document.getElementById('issuerInput'),
    setSecretBtn: document.getElementById('setSecretBtn'),
    cameraBtn: document.getElementById('cameraBtn'),
    cameraModal: document.getElementById('cameraModal'),
    cameraFeed: document.getElementById('cameraFeed'),
    camStatus: document.getElementById('camStatus'),
    camClose: document.getElementById('camClose'),
    backupTrigger: document.getElementById('backupTrigger'),
    backupModal: document.getElementById('backupModal'),
    backupClose: document.getElementById('backupClose'),
    previewSection: document.getElementById('previewSection'),
    otpValue: document.getElementById('otpValue'),
    otpDisplay: document.getElementById('otpDisplay'),
    otpIssuer: document.getElementById('otpIssuer'),
    tpFill: document.getElementById('tpFill'),
    tpText: document.getElementById('tpText')
  };

  const $ = Authenticator.dom;

  Authenticator.accounts = [];
  Authenticator.totpTimers = {};
  Authenticator.updateTimer = null;
  Authenticator.previewTimer = null;
  Authenticator.previewSecret = null;
  Authenticator.prevCountdown = null;
  Authenticator.cameraStream = null;
  Authenticator.cameraScanTimer = null;
  Authenticator.toastTimer = null;

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  Authenticator.addAccount = function(secret, issuer) {
    const account = {
      id: generateId(),
      secret: secret.toUpperCase(),
      issuer: issuer || 'My Account',
      createdAt: Date.now()
    };
    Authenticator.accounts.push(account);
    Authenticator.saveAccounts();
    Authenticator.renderList();
    Authenticator.showToast('Added ' + account.issuer, 'success');
  };

  Authenticator.deleteAccount = function(id) {
    Authenticator.accounts = Authenticator.accounts.filter(a => a.id !== id);
    delete Authenticator.totpTimers[id];
    Authenticator.saveAccounts();
    Authenticator.renderList();
    Authenticator.showToast('Account removed.', 'info');
  };

  Authenticator.saveAccounts = function() {
    try {
      const data = Authenticator.accounts.map(a => ({
        id: a.id, secret: a.secret, issuer: a.issuer, createdAt: a.createdAt
      }));
      localStorage.setItem('2fa_accounts', JSON.stringify(data));
      $.accountCount.textContent = data.length + ' account' + (data.length !== 1 ? 's' : '');
    } catch {}
  };

  Authenticator.loadAccounts = function() {
    try {
      const raw = localStorage.getItem('2fa_accounts');
      if (raw) {
        Authenticator.accounts = JSON.parse(raw);
      }
    } catch {
      Authenticator.accounts = [];
    }
  };

  Authenticator.renderList = function() {
    const query = $.searchInput.value.toLowerCase().trim();
    let filtered = Authenticator.accounts;
    if (query) {
      filtered = Authenticator.accounts.filter(a =>
        a.issuer.toLowerCase().includes(query)
      );
    }

    $.accountList.innerHTML = '';

    if (filtered.length === 0) {
      const clone = $.emptyState.cloneNode(true);
      $.accountList.appendChild(clone);
      return;
    }

    for (const account of filtered) {
      const el = document.createElement('div');
      el.className = 'account-row';
      el.dataset.id = account.id;

      el.innerHTML = `
        <div class="account-avatar">${account.issuer.charAt(0).toUpperCase()}</div>
        <div class="account-info">
          <div class="account-issuer">${Authenticator.escapeHtml(account.issuer)}</div>
          <div class="account-code" id="code-${account.id}">— — —</div>
        </div>
        <div class="account-timer" id="timer-${account.id}">
          <svg viewBox="0 0 20 20" width="20" height="20">
            <circle class="tm-track" cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="2" opacity="0.15"/>
            <circle class="tm-fill" id="tmfill-${account.id}" cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
              stroke-dasharray="50.27" stroke-dashoffset="0" transform="rotate(-90,10,10)"/>
          </svg>
          <span class="tm-text" id="tmtext-${account.id}">30</span>
        </div>
        <button class="account-copy" data-id="${account.id}" title="Copy code">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="7" width="10" height="10" rx="1.5"/><path d="M5 15H4a1.5 1.5 0 0 1-1.5-1.5V4A1.5 1.5 0 0 1 4 2.5h9A1.5 1.5 0 0 1 14.5 4v1"/></svg>
        </button>
        <button class="account-delete" data-id="${account.id}" title="Delete account">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 17 6"/><path d="M7.5 6V4.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V6"/><path d="M16 6l-.86 10.34A1.5 1.5 0 0 1 13.65 18H6.35a1.5 1.5 0 0 1-1.49-1.66L4 6"/></svg>
        </button>
      `;

      const codeEl = el.querySelector('.account-code');
      codeEl.addEventListener('click', function(e) {
        e.stopPropagation();
        Authenticator.copyCode(account.id);
      });
      el.querySelector('.account-copy').addEventListener('click', function(e) {
        e.stopPropagation();
        Authenticator.copyCode(account.id);
      });
      el.querySelector('.account-delete').addEventListener('click', function(e) {
        e.stopPropagation();
        Authenticator.deleteAccount(account.id);
      });
      el.addEventListener('dblclick', function() {
        Authenticator.copyCode(account.id);
      });

      $.accountList.appendChild(el);
    }

    Authenticator.refreshCodes();
    Authenticator.startGlobalTimer();
  };

  Authenticator.escapeHtml = function(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  };

  Authenticator.refreshCodes = async function() {
    for (const account of Authenticator.accounts) {
      const codeEl = document.getElementById('code-' + account.id);
      if (!codeEl) continue;
      const code = await Authenticator.generateTOTP(account.secret);
      codeEl.textContent = code.slice(0, 3) + ' ' + code.slice(3);
    }
  };

  Authenticator.updateTimers = function() {
    const rem = Authenticator.getTimeRemaining();
    for (const account of Authenticator.accounts) {
      const fill = document.getElementById('tmfill-' + account.id);
      const text = document.getElementById('tmtext-' + account.id);
      if (fill) {
        const offset = 50.27 * (1 - rem / 30);
        fill.setAttribute('stroke-dashoffset', offset);
        fill.style.stroke = rem <= 5 ? 'var(--red)' : rem <= 10 ? 'var(--yellow)' : '';
      }
      if (text) text.textContent = rem;
    }
  };

  Authenticator.startGlobalTimer = function() {
    if (Authenticator.updateTimer) return;
    Authenticator.updateTimers();
    Authenticator.updateTimer = setInterval(() => {
      const rem = Authenticator.getTimeRemaining();
      Authenticator.updateTimers();
      if (rem === 29 || rem === 30) {
        Authenticator.refreshCodes();
      }
    }, 1000);
  };

  Authenticator.copyCode = async function(id) {
    const account = Authenticator.accounts.find(a => a.id === id);
    if (!account) return;
    const code = await Authenticator.generateTOTP(account.secret);
    navigator.clipboard.writeText(code)
      .then(() => Authenticator.showToast('Copied ' + account.issuer, 'success'))
      .catch(() => {
        const t = document.createElement('textarea');
        t.value = code;
        document.body.appendChild(t);
        t.select();
        document.execCommand('copy');
        document.body.removeChild(t);
        Authenticator.showToast('Copied ' + account.issuer, 'success');
      });
  };

  Authenticator.showToast = function(msg, type) {
    $.toast.textContent = msg;
    $.toast.className = 'toast ' + (type || 'info');
    void $.toast.offsetWidth;
    $.toast.classList.add('show');
    clearTimeout(Authenticator.toastTimer);
    Authenticator.toastTimer = setTimeout(() => $.toast.classList.remove('show'), 3000);
  };

  Authenticator.toggleTheme = function() {
    const dark = document.body.classList.toggle('dark');
    $.themeToggle.innerHTML = dark
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
    try { localStorage.setItem('2fa_theme', dark ? 'dark' : 'light'); } catch {}
  };

  Authenticator.loadTheme = function() {
    try {
      if (localStorage.getItem('2fa_theme') === 'dark') {
        document.body.classList.add('dark');
        $.themeToggle.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
      }
    } catch {}
  };

  /* ── Preview TOTP (live when typing secret) ── */

  Authenticator.startPreview = function() {
    const raw = $.secretInput.value.replace(/[= \t\r\n]/g, '').toUpperCase();
    const valid = /^[A-Z2-7]{16,}$/.test(raw);

    if (!valid) {
      $.previewSection.classList.remove('show');
      Authenticator.previewSecret = null;
      clearInterval(Authenticator.previewTimer);
      clearInterval(Authenticator.prevCountdown);
      return;
    }

    Authenticator.previewSecret = raw;
    $.previewSection.classList.add('show');
    Authenticator.updatePreviewCode();
    Authenticator.startPreviewTimer();
  };

  Authenticator.updatePreviewCode = async function() {
    if (!Authenticator.previewSecret) return;
    const code = await Authenticator.generateTOTP(Authenticator.previewSecret);
    $.otpValue.textContent = code.slice(0, 3) + ' \u00a0' + code.slice(3);
    $.otpValue.classList.remove('blur');
  };

  Authenticator.startPreviewTimer = function() {
    clearInterval(Authenticator.previewTimer);
    clearInterval(Authenticator.prevCountdown);

    function tick() {
      const rem = Authenticator.getTimeRemaining();
      $.tpText.textContent = rem;
      const offset = 113.09 * (1 - rem / 30);
      $.tpFill.setAttribute('stroke-dashoffset', offset);
      $.tpFill.classList.toggle('danger', rem <= 5);
      $.tpFill.classList.toggle('warning', rem > 5 && rem <= 10);
    }
    tick();
    Authenticator.prevCountdown = setInterval(tick, 1000);

    const ms = 30000 - (Date.now() % 30000);
    setTimeout(() => {
      Authenticator.updatePreviewCode();
      Authenticator.previewTimer = setInterval(Authenticator.updatePreviewCode, 30000);
    }, ms);
  };

  Authenticator.copyPreviewCode = function() {
    const code = $.otpValue.textContent.replace(/[\s\u00a0]/g, '');
    if (code && code.length === 6) {
      navigator.clipboard.writeText(code)
        .then(() => Authenticator.showToast('Copied!', 'success'))
        .catch(() => {
          const t = document.createElement('textarea');
          t.value = code; document.body.appendChild(t); t.select();
          document.execCommand('copy'); document.body.removeChild(t);
          Authenticator.showToast('Copied!', 'success');
        });
    }
  };
})();
