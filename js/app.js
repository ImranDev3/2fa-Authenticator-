window.Authenticator = window.Authenticator || {};

(function() {
  var $ = Authenticator.dom;

  function init() {
    Authenticator.loadTheme();
    Authenticator.loadAccounts();
    Authenticator.renderList();
    Authenticator.startGlobalTimer();
    Authenticator.bootBackup();
    Authenticator.initWasmCrypto().then(function() {
      Authenticator.updateCryptoProof();
    });
    Authenticator.updateCryptoProof();

    // Migrate old single-account data
    try {
      var oldSecret = localStorage.getItem('2fa_secret');
      var oldIssuer = localStorage.getItem('2fa_issuer');
      if (oldSecret && Authenticator.accounts.length === 0) {
        Authenticator.addAccount(oldSecret, oldIssuer || 'My Account');
        localStorage.removeItem('2fa_secret');
        localStorage.removeItem('2fa_issuer');
      }
    } catch (e) {}
  }

  // ── Theme ──
  $.themeToggle.addEventListener('click', Authenticator.toggleTheme);

  // ── Architecture modal ──
  $.archTrigger.addEventListener('click', function() {
    $.archModal.style.display = 'flex';
  });

  $.archClose.addEventListener('click', function() {
    $.archModal.style.display = 'none';
  });

  $.archModal.addEventListener('click', function(e) {
    if (e.target === $.archModal) $.archModal.style.display = 'none';
  });

  // ── Backup modal ──
  $.backupTrigger.addEventListener('click', function() {
    Authenticator.updateModalUI();
    $.backupModal.style.display = 'flex';
  });

  $.backupClose.addEventListener('click', function() {
    $.backupModal.style.display = 'none';
  });

  $.backupModal.addEventListener('click', function(e) {
    if (e.target === $.backupModal) $.backupModal.style.display = 'none';
  });

  // ── Backup tabs ──
  document.querySelectorAll('.bp-tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      document.querySelectorAll('.bp-tab').forEach(function(t) { t.classList.remove('active'); });
      this.classList.add('active');
      document.querySelectorAll('.bp-body').forEach(function(b) { b.style.display = 'none'; });
      var target = document.getElementById('bp' + this.dataset.tab.charAt(0).toUpperCase() + this.dataset.tab.slice(1));
      if (target) target.style.display = 'block';
    });
  });

  // ── MetaMask ──
  document.getElementById('metaConnect').addEventListener('click', function() {
    if (Authenticator.auth.metamask.address) { Authenticator.metaDisconnect(); }
    else { Authenticator.metaConnect(); }
  });
  document.getElementById('metaExport').addEventListener('click', function() {
    if (Authenticator.auth.metamask.key) { Authenticator.exportBackup(); }
    else { Authenticator.showToast('Unlock MetaMask first.', 'error'); }
  });
  document.getElementById('metaImport').addEventListener('click', function() {
    if (Authenticator.auth.metamask.key) { Authenticator.importBackup(); }
    else { Authenticator.showToast('Unlock MetaMask first.', 'error'); }
  });

  // ── Bitcoin ──
  document.getElementById('btcConnect').addEventListener('click', function() {
    if (Authenticator.auth.bitcoin.address) { Authenticator.btcDisconnect(); }
    else { Authenticator.btcConnect(); }
  });
  document.getElementById('btcExport').addEventListener('click', function() {
    if (Authenticator.auth.bitcoin.key) { Authenticator.exportBackup(); }
    else { Authenticator.showToast('Connect BTC wallet first.', 'error'); }
  });
  document.getElementById('btcImport').addEventListener('click', function() {
    if (Authenticator.auth.bitcoin.key) { Authenticator.importBackup(); }
    else { Authenticator.showToast('Connect BTC wallet first.', 'error'); }
  });

  // ── WebAuthn ──
  document.getElementById('wauthRegister').addEventListener('click', Authenticator.webauthnRegister);
  document.getElementById('wauthLogin').addEventListener('click', Authenticator.webauthnLogin);
  document.getElementById('wauthExport').addEventListener('click', function() {
    if (Authenticator.auth.webauthn.key) { Authenticator.exportBackup(); }
    else { Authenticator.showToast('Unlock WebAuthn first.', 'error'); }
  });
  document.getElementById('wauthImport').addEventListener('click', function() {
    if (Authenticator.auth.webauthn.key) { Authenticator.importBackup(); }
    else { Authenticator.showToast('Unlock WebAuthn first.', 'error'); }
  });

  // ── Google ──
  document.getElementById('gExport').addEventListener('click', function() {
    if (Authenticator.auth.google.key) { Authenticator.exportBackup(); }
    else { Authenticator.showToast('Sign in with Google first.', 'error'); }
  });
  document.getElementById('gImport').addEventListener('click', function() {
    if (Authenticator.auth.google.key) { Authenticator.importBackup(); }
    else { Authenticator.showToast('Sign in with Google first.', 'error'); }
  });
  document.getElementById('gSignOut').addEventListener('click', Authenticator.disconnectGoogle);
  document.getElementById('gSetId').addEventListener('click', Authenticator.setGoogleClientId);

  // ── Password ──
  document.getElementById('pwdUnlock').addEventListener('click', Authenticator.unlockPassword);
  document.getElementById('pwdExport').addEventListener('click', function() {
    if (Authenticator.auth.password.key) { Authenticator.exportBackup(); }
    else { Authenticator.showToast('Unlock password first.', 'error'); }
  });
  document.getElementById('pwdImport').addEventListener('click', function() {
    if (Authenticator.auth.password.key) { Authenticator.importBackup(); }
    else { Authenticator.showToast('Unlock password first.', 'error'); }
  });
  document.getElementById('pwdLock').addEventListener('click', Authenticator.lockPassword);

  // ── Search ──
  $.searchInput.addEventListener('input', function() { Authenticator.renderList(); });

  // ── Drop zone ──
  $.dropZone.addEventListener('click', function() { $.fileInput.click(); });
  $.dropZone.addEventListener('dragover', function(e) {
    e.preventDefault();
    $.dropZone.classList.add('dragover');
  });
  $.dropZone.addEventListener('dragleave', function() { $.dropZone.classList.remove('dragover'); });
  $.dropZone.addEventListener('drop', function(e) {
    e.preventDefault();
    $.dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length) Authenticator.processFile(e.dataTransfer.files[0]);
  });
  $.fileInput.addEventListener('change', function() {
    if ($.fileInput.files.length) {
      Authenticator.processFile($.fileInput.files[0]);
      $.fileInput.value = '';
    }
  });

  // ── Manual entry ──
  $.secretInput.addEventListener('input', Authenticator.startPreview);

  $.setSecretBtn.addEventListener('click', function() {
    var secret = $.secretInput.value.replace(/[= \t\r\n]/g, '').toUpperCase();
    var issuer = $.issuerInput.value.trim() || 'My Account';
    if (/^[A-Z2-7]{16,}$/.test(secret)) {
      Authenticator.addAccount(secret, issuer);
      $.secretInput.value = '';
      $.issuerInput.value = '';
      Authenticator.showToast('Account added.', 'success');
    } else {
      Authenticator.showToast('Invalid secret key.', 'error');
    }
  });

  // ── Preview copy ──
  $.otpDisplay.addEventListener('click', Authenticator.copyPreviewCode);

  // ── Paste ──
  document.addEventListener('paste', Authenticator.handlePaste);

  // ── Camera ──
  $.cameraBtn.addEventListener('click', Authenticator.startCamera);
  $.camClose.addEventListener('click', Authenticator.stopCamera);
  $.cameraModal.addEventListener('click', function(e) {
    if (e.target === $.cameraModal) Authenticator.stopCamera();
  });

  // ── Keyboard shortcuts ──
  document.addEventListener('keydown', function(e) {
    if ((e.key === 'c' || e.key === 'C') && !e.ctrlKey && !e.metaKey && Authenticator.accounts.length === 1) {
      Authenticator.copyCode(Authenticator.accounts[0].id);
    }
  });

  // ── Boot ──
  init();

  // ── PWA ──
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(function() {});
  }

  // ── Wake Lock ──
  if ('wakeLock' in navigator) {
    var lock = null;
    document.addEventListener('visibilitychange', function() {
      if (document.visibilityState === 'visible' && Authenticator.accounts.length) {
        navigator.wakeLock.request('screen').then(function(l) { lock = l; }).catch(function() {});
      } else if (lock) { lock.release(); lock = null; }
    });
  }
})();
