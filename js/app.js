window.Authenticator = window.Authenticator || {};

(function() {
  const $ = Authenticator.dom;

  function init() {
    Authenticator.loadTheme();
    Authenticator.loadAccounts();
    Authenticator.renderList();
    Authenticator.startGlobalTimer();

    // Migrate old single-account data
    try {
      const oldSecret = localStorage.getItem('2fa_secret');
      const oldIssuer = localStorage.getItem('2fa_issuer');
      if (oldSecret && Authenticator.accounts.length === 0) {
        Authenticator.addAccount(oldSecret, oldIssuer || 'My Account');
        localStorage.removeItem('2fa_secret');
        localStorage.removeItem('2fa_issuer');
      }
    } catch {}
  }

  // Theme
  $.themeToggle.addEventListener('click', Authenticator.toggleTheme);

  // Search
  $.searchInput.addEventListener('input', () => Authenticator.renderList());

  // Drop zone
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

  // Manual entry
  $.secretInput.addEventListener('input', Authenticator.startPreview);

  $.setSecretBtn.addEventListener('click', () => {
    const secret = $.secretInput.value.replace(/[= \t\r\n]/g, '').toUpperCase();
    const issuer = $.issuerInput.value.trim() || 'My Account';
    if (/^[A-Z2-7]{16,}$/.test(secret)) {
      Authenticator.addAccount(secret, issuer);
      $.secretInput.value = '';
      $.issuerInput.value = '';
      Authenticator.showToast('Account added.', 'success');
    } else {
      Authenticator.showToast('Invalid secret key.', 'error');
    }
  });


  // Preview copy
  $.otpDisplay.addEventListener('click', Authenticator.copyPreviewCode);

  // Paste
  document.addEventListener('paste', Authenticator.handlePaste);

  // Camera
  $.cameraBtn.addEventListener('click', Authenticator.startCamera);
  $.camClose.addEventListener('click', Authenticator.stopCamera);
  $.cameraModal.addEventListener('click', e => {
    if (e.target === $.cameraModal) Authenticator.stopCamera();
  });

  // Wallet
  document.getElementById('walletBtn').addEventListener('click', function() {
    if (Authenticator.wallet.address) {
      Authenticator.disconnectWallet();
    } else {
      Authenticator.connectWallet();
    }
  });

  // Legacy backup bar buttons
  var exportBtn = document.getElementById('exportBtn');
  var importBtn = document.getElementById('importBtn');
  if (exportBtn) exportBtn.addEventListener('click', function() { Authenticator.exportEncryptedBackup(); });
  if (importBtn) importBtn.addEventListener('click', function() { Authenticator.importEncryptedBackup(); });

  // Backup panel tabs
  document.querySelectorAll('.bp-tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      document.querySelectorAll('.bp-tab').forEach(function(t) { t.classList.remove('active'); });
      this.classList.add('active');
      document.querySelectorAll('.bp-body').forEach(function(b) { b.style.display = 'none'; });
      var target = document.getElementById('bp' + this.dataset.tab.charAt(0).toUpperCase() + this.dataset.tab.slice(1));
      if (target) target.style.display = 'block';
    });
  });

  // MetaMask backup buttons
  document.getElementById('metaExport').addEventListener('click', function() {
    if (Authenticator.wallet.encryptionKey) { Authenticator.exportBackup(); }
    else { Authenticator.showToast('Connect MetaMask first.', 'error'); }
  });
  document.getElementById('metaImport').addEventListener('click', function() {
    if (Authenticator.wallet.encryptionKey) { Authenticator.importBackup(); }
    else { Authenticator.showToast('Connect MetaMask first.', 'error'); }
  });

  // Google backup buttons
  document.getElementById('gExport').addEventListener('click', function() {
    if (Authenticator.google.encryptionKey) { Authenticator.exportBackup(); }
    else { Authenticator.showToast('Sign in with Google first.', 'error'); }
  });
  document.getElementById('gImport').addEventListener('click', function() {
    if (Authenticator.google.encryptionKey) { Authenticator.importBackup(); }
    else { Authenticator.showToast('Sign in with Google first.', 'error'); }
  });
  document.getElementById('gSignOut').addEventListener('click', Authenticator.disconnectGoogle);
  document.getElementById('gSetId').addEventListener('click', Authenticator.setGoogleClientId);

  // Password backup buttons
  document.getElementById('pwdUnlock').addEventListener('click', Authenticator.unlockPassword);
  document.getElementById('pwdExport').addEventListener('click', function() {
    if (Authenticator.password.encryptionKey) { Authenticator.exportBackup(); }
    else { Authenticator.showToast('Set a password first.', 'error'); }
  });
  document.getElementById('pwdImport').addEventListener('click', function() {
    if (Authenticator.password.encryptionKey) { Authenticator.importBackup(); }
    else { Authenticator.showToast('Set a password first.', 'error'); }
  });
  document.getElementById('pwdLock').addEventListener('click', Authenticator.lockPassword);

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if ((e.key === 'c' || e.key === 'C') && !e.ctrlKey && !e.metaKey && Authenticator.accounts.length === 1) {
      Authenticator.copyCode(Authenticator.accounts[0].id);
    }
  });

  // Boot
  init();
  Authenticator.checkWalletConnection();

  // PWA - register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // Keep screen awake while viewing codes
  if ('wakeLock' in navigator) {
    let lock = null;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && Authenticator.accounts.length) {
        navigator.wakeLock.request('screen').then(l => lock = l).catch(() => {});
      } else if (lock) { lock.release(); lock = null; }
    });
  }
})();
