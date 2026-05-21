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
  $.setSecretBtn.addEventListener('click', () => {
    const secret = $.secretInput.value.trim().toUpperCase();
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
  $.secretInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') $.setSecretBtn.click();
  });
  $.issuerInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') $.setSecretBtn.click();
  });

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

  document.getElementById('exportBtn').addEventListener('click', function() {
    Authenticator.exportEncryptedBackup();
  });

  document.getElementById('importBtn').addEventListener('click', function() {
    Authenticator.importEncryptedBackup();
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if ((e.key === 'c' || e.key === 'C') && !e.ctrlKey && !e.metaKey && Authenticator.accounts.length === 1) {
      Authenticator.copyCode(Authenticator.accounts[0].id);
    }
  });

  // Boot
  init();
  Authenticator.checkWalletConnection();
})();
