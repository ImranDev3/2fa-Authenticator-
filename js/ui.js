window.Authenticator = window.Authenticator || {};

(function() {
  const CIRCUMFERENCE = 113.09;

  Authenticator.dom = {
    otpDisplay: document.getElementById('otpDisplay'),
    otpValue: document.getElementById('otpValue'),
    otpIssuer: document.getElementById('otpIssuer'),
    timerFill: document.getElementById('timerFill'),
    timerText: document.getElementById('timerText'),
    timerLabel: document.getElementById('timerLabel'),
    copyBtn: document.getElementById('copyBtn'),
    resetBtn: document.getElementById('resetBtn'),
    dropZone: document.getElementById('dropZone'),
    fileInput: document.getElementById('fileInput'),
    secretInput: document.getElementById('secretInput'),
    setSecretBtn: document.getElementById('setSecretBtn'),
    lastUsedEl: document.getElementById('lastUsed'),
    toast: document.getElementById('toast'),
    themeToggle: document.getElementById('themeToggle'),
    cameraBtn: document.getElementById('cameraBtn'),
    cameraModal: document.getElementById('cameraModal'),
    cameraFeed: document.getElementById('cameraFeed'),
    camStatus: document.getElementById('camStatus'),
    camClose: document.getElementById('camClose')
  };

  const $ = Authenticator.dom;

  Authenticator.updateOTPDisplay = async function() {
    if (!Authenticator.currentSecret) return;
    const c = await Authenticator.generateTOTP(Authenticator.currentSecret);
    if (c) {
      $.otpValue.textContent = c.slice(0, 3) + ' \u00a0' + c.slice(3);
      $.otpDisplay.classList.remove('blur');
    } else {
      $.otpValue.textContent = '\u2014 \u2014 \u2014 \u00a0\u2014 \u2014 \u2014';
      $.otpDisplay.classList.add('blur');
    }
  };

  Authenticator.updateTimer = function(rem) {
    $.timerText.textContent = rem;
    $.timerFill.setAttribute('stroke-dashoffset', CIRCUMFERENCE * (1 - rem / 30));
    $.timerFill.classList.toggle('danger', rem <= 5);
    $.timerFill.classList.toggle('warning', rem > 5 && rem <= 10);
  };

  Authenticator.startCountdown = function() {
    let r = 30 - (Math.floor(Date.now() / 1000) % 30);
    function tick() {
      r--;
      if (r < 0) r = 29;
      Authenticator.updateTimer(r);
    }
    Authenticator.updateTimer(r);
    clearInterval(Authenticator.countdownTimer);
    Authenticator.countdownTimer = setInterval(tick, 1000);
  };

  Authenticator.startTOTP = function() {
    clearInterval(Authenticator.totpTimer);
    Authenticator.updateOTPDisplay();
    Authenticator.startCountdown();
    const ms = 30000 - (Date.now() % 30000);
    setTimeout(() => {
      Authenticator.updateOTPDisplay();
      Authenticator.totpTimer = setInterval(Authenticator.updateOTPDisplay, 30000);
    }, ms);
  };

  Authenticator.getOTP = function() {
    return $.otpValue.textContent.replace(/[\s\u00a0]/g, '');
  };

  Authenticator.copyOTP = function() {
    const code = Authenticator.getOTP();
    if (code && code.length === 6) {
      navigator.clipboard.writeText(code)
        .then(() => Authenticator.showToast('Copied!', 'success'))
        .catch(() => {
          const t = document.createElement('textarea');
          t.value = code;
          document.body.appendChild(t);
          t.select();
          document.execCommand('copy');
          document.body.removeChild(t);
          Authenticator.showToast('Copied!', 'success');
        });
    } else {
      Authenticator.showToast('No code to copy.', 'error');
    }
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
    try {
      localStorage.setItem('2fa_theme', dark ? 'dark' : 'light');
    } catch {}
  };

  Authenticator.loadTheme = function() {
    try {
      if (localStorage.getItem('2fa_theme') === 'dark') {
        document.body.classList.add('dark');
        $.themeToggle.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
      }
    } catch {}
  };

  Authenticator.updateLastUsed = function() {
    try {
      const s = localStorage.getItem('2fa_secret');
      if (s) {
        const i = localStorage.getItem('2fa_issuer') || '';
        $.lastUsedEl.textContent = 'Last used: ' + (i ? i + ' \u00b7 ' : '') + s.slice(0, 8) + '\u2026';
        $.lastUsedEl.classList.add('show');
      }
    } catch {}
  };

  Authenticator.setSecret = function(secret, issuer) {
    Authenticator.currentSecret = secret;
    $.secretInput.value = secret;
    if (issuer) $.otpIssuer.textContent = issuer;
    try {
      localStorage.setItem('2fa_secret', secret);
      localStorage.setItem('2fa_issuer', issuer || '');
    } catch {}
    Authenticator.updateLastUsed();
    Authenticator.startTOTP();
  };

  Authenticator.resetAll = function() {
    Authenticator.currentSecret = '';
    $.secretInput.value = '';
    $.otpValue.textContent = '\u2014 \u2014 \u2014 \u00a0\u2014 \u2014 \u2014';
    $.otpDisplay.classList.add('blur');
    $.otpIssuer.textContent = '';
    clearInterval(Authenticator.totpTimer);
    clearInterval(Authenticator.countdownTimer);
    clearTimeout(Authenticator.totpTimer);
    Authenticator.updateTimer(0);
    try {
      localStorage.removeItem('2fa_secret');
      localStorage.removeItem('2fa_issuer');
    } catch {}
    $.lastUsedEl.classList.remove('show');
    Authenticator.showToast('Reset complete.', 'info');
  };
})();
