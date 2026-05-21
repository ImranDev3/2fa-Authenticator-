window.Authenticator = window.Authenticator || {};

(function() {
  const $ = Authenticator.dom;

  Authenticator.currentSecret = '';
  Authenticator.totpTimer = null;
  Authenticator.countdownTimer = null;
  Authenticator.cameraStream = null;
  Authenticator.cameraScanTimer = null;
  Authenticator.toastTimer = null;

  function restoreLast() {
    try {
      const s = localStorage.getItem('2fa_secret');
      const i = localStorage.getItem('2fa_issuer') || '';
      if (s) {
        Authenticator.setSecret(s, i);
        Authenticator.showToast('Restored last secret.', 'info');
      }
    } catch {}
  }

  function init() {
    Authenticator.loadTheme();
    Authenticator.updateLastUsed();

    try {
      const s = localStorage.getItem('2fa_secret');
      const i = localStorage.getItem('2fa_issuer') || '';
      if (s) {
        Authenticator.currentSecret = s;
        $.secretInput.value = s;
        if (i) $.otpIssuer.textContent = i;
        Authenticator.startTOTP();
      } else {
        $.otpDisplay.classList.add('blur');
      }
    } catch {
      $.otpDisplay.classList.add('blur');
    }
  }

  // --- Event Bindings ---

  $.themeToggle.addEventListener('click', Authenticator.toggleTheme);

  $.dropZone.addEventListener('click', () => $.fileInput.click());
  $.dropZone.addEventListener('dragover', e => {
    e.preventDefault();
    $.dropZone.classList.add('dragover');
  });
  $.dropZone.addEventListener('dragleave', () => $.dropZone.classList.remove('dragover'));
  $.dropZone.addEventListener('drop', e => {
    e.preventDefault();
    $.dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length) Authenticator.processFile(e.dataTransfer.files[0]);
  });
  $.fileInput.addEventListener('change', () => {
    if ($.fileInput.files.length) {
      Authenticator.processFile($.fileInput.files[0]);
      $.fileInput.value = '';
    }
  });

  $.setSecretBtn.addEventListener('click', () => {
    const v = $.secretInput.value.trim().toUpperCase();
    if (/^[A-Z2-7]{16,}$/.test(v)) {
      Authenticator.setSecret(v, '');
      Authenticator.showToast('Secret set.', 'success');
    } else {
      Authenticator.showToast('Invalid secret.', 'error');
    }
  });
  $.secretInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') $.setSecretBtn.click();
  });
  $.lastUsedEl.addEventListener('click', restoreLast);

  document.addEventListener('paste', Authenticator.handlePaste);

  $.copyBtn.addEventListener('click', Authenticator.copyOTP);
  $.otpDisplay.addEventListener('click', Authenticator.copyOTP);
  $.resetBtn.addEventListener('click', Authenticator.resetAll);

  $.cameraBtn.addEventListener('click', Authenticator.startCamera);
  $.camClose.addEventListener('click', Authenticator.stopCamera);
  $.cameraModal.addEventListener('click', e => {
    if (e.target === $.cameraModal) Authenticator.stopCamera();
  });

  document.addEventListener('keydown', e => {
    if ((e.key === 'c' || e.key === 'C') && !e.ctrlKey && !e.metaKey) Authenticator.copyOTP();
    if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey) Authenticator.resetAll();
  });

  // --- Boot ---
  init();
})();
