window.Authenticator = window.Authenticator || {};

(function() {
  Authenticator.wallet = { address: null, provider: null, signer: null, encryptionKey: null, salt: null };
  Authenticator.google = { credential: null, encryptionKey: null, salt: null };
  Authenticator.password = { encryptionKey: null, salt: null };

  var _gInited = false, _activeMethod = null;

  function getEncryptionKey() {
    return Authenticator.wallet.encryptionKey || Authenticator.google.encryptionKey || Authenticator.password.encryptionKey;
  }

  function getSalt() {
    return Authenticator.wallet.salt || Authenticator.google.salt || Authenticator.password.salt;
  }

  function getSourceLabel() {
    if (Authenticator.wallet.encryptionKey) return 'MetaMask';
    if (Authenticator.google.encryptionKey) return 'Google';
    if (Authenticator.password.encryptionKey) return 'Password';
    return null;
  }

  Authenticator.connectWallet = async function() {
    if (!window.ethereum) {
      Authenticator.showToast('MetaMask not found. Install it to use wallet sync.', 'error');
      return false;
    }
    try {
      var provider = new ethers.providers.Web3Provider(window.ethereum);
      var accounts = await provider.send('eth_requestAccounts', []);
      if (!accounts.length) { Authenticator.showToast('No accounts found.', 'error'); return false; }
      var signer = provider.getSigner();
      var address = accounts[0];
      var message = 'Authenticator Sync v2\nWallet: ' + address + '\nTimestamp: ' + Date.now();
      var signature = await signer.signMessage(message);
      var salt = crypto.getRandomValues(new Uint8Array(16));
      var keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(signature), 'PBKDF2', false, ['deriveKey']);
      var key = await crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: salt, iterations: 600000, hash: 'SHA-256' },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false, ['encrypt', 'decrypt']
      );
      Authenticator.wallet.address = address;
      Authenticator.wallet.provider = provider;
      Authenticator.wallet.signer = signer;
      Authenticator.wallet.encryptionKey = key;
      Authenticator.wallet.salt = salt;
      try { localStorage.setItem('2fa_wallet', address); } catch (e) {}
      _activeMethod = 'metamask';
      Authenticator.updateWalletUI();
      Authenticator.showToast('Wallet connected: ' + address.slice(0,6) + '...' + address.slice(-4), 'success');
      return true;
    } catch (err) {
      Authenticator.showToast(err.code === 4001 ? 'Connection rejected.' : 'Connection failed: ' + err.message, 'error');
      return false;
    }
  };

  Authenticator.disconnectWallet = function() {
    Authenticator.wallet.address = null;
    Authenticator.wallet.provider = null;
    Authenticator.wallet.signer = null;
    Authenticator.wallet.encryptionKey = null;
    Authenticator.wallet.salt = null;
    try { localStorage.removeItem('2fa_wallet'); } catch (e) {}
    if (Authenticator.google.encryptionKey || Authenticator.password.encryptionKey) {
      _activeMethod = Authenticator.google.encryptionKey ? 'google' : 'password';
    } else {
      _activeMethod = null;
    }
    Authenticator.updateWalletUI();
    Authenticator.showToast('Wallet disconnected.', 'info');
  };

  /* --- Google Sign-In --- */
  Authenticator.initGoogle = function() {
    if (typeof google === 'undefined' || !google.accounts) return;
    var cid = null;
    try { cid = localStorage.getItem('2fa_gcid'); } catch (e) {}
    if (!cid) return;
    _gInited = true;
    google.accounts.id.initialize({
      client_id: cid,
      callback: Authenticator.handleGoogleCredential,
      cancel_on_tap_outside: false
    });
    var btn = document.getElementById('gButton');
    if (btn) google.accounts.id.renderButton(btn, { theme: 'outline', size: 'large', width: 240 });
  };

  Authenticator.handleGoogleCredential = async function(response) {
    try {
      var token = response.credential;
      var salt = crypto.getRandomValues(new Uint8Array(16));
      var keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(token), 'PBKDF2', false, ['deriveKey']);
      var key = await crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: salt, iterations: 600000, hash: 'SHA-256' },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false, ['encrypt', 'decrypt']
      );
      Authenticator.google.credential = response;
      Authenticator.google.encryptionKey = key;
      Authenticator.google.salt = salt;
      _activeMethod = 'google';
      Authenticator.updateWalletUI();
      Authenticator.showToast('Signed in with Google!', 'success');
    } catch (err) {
      Authenticator.showToast('Google sign-in failed.', 'error');
    }
  };

  Authenticator.disconnectGoogle = function() {
    Authenticator.google.credential = null;
    Authenticator.google.encryptionKey = null;
    Authenticator.google.salt = null;
    if (Authenticator.wallet.encryptionKey || Authenticator.password.encryptionKey) {
      _activeMethod = Authenticator.wallet.encryptionKey ? 'metamask' : 'password';
    } else {
      _activeMethod = null;
    }
    var status = document.getElementById('gStatus');
    var actions = document.getElementById('gActions');
    if (status) status.textContent = 'Not signed in';
    if (actions) actions.style.display = 'none';
    Authenticator.showToast('Google signed out.', 'info');
  };

  Authenticator.setGoogleClientId = function() {
    var input = document.getElementById('gClientId');
    var cid = input.value.trim();
    if (!cid) { Authenticator.showToast('Enter a valid Client ID.', 'error'); return; }
    try { localStorage.setItem('2fa_gcid', cid); } catch (e) {}
    input.value = '';
    Authenticator.initGoogle();
    Authenticator.showToast('Google Client ID saved!', 'success');
  };

  /* --- Password --- */
  Authenticator.unlockPassword = async function() {
    var input = document.getElementById('pwdInput');
    var pwd = input.value.trim();
    if (!pwd) { Authenticator.showToast('Enter a password.', 'error'); return; }
    try {
      var salt = crypto.getRandomValues(new Uint8Array(16));
      var keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(pwd), 'PBKDF2', false, ['deriveKey']);
      var key = await crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: salt, iterations: 600000, hash: 'SHA-256' },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false, ['encrypt', 'decrypt']
      );
      Authenticator.password.encryptionKey = key;
      Authenticator.password.salt = salt;
      _activeMethod = 'password';
      input.value = '';
      Authenticator.updateWalletUI();
      Authenticator.showToast('Password set!', 'success');
    } catch (err) {
      Authenticator.showToast('Failed to set password.', 'error');
    }
  };

  Authenticator.lockPassword = function() {
    Authenticator.password.encryptionKey = null;
    Authenticator.password.salt = null;
    if (Authenticator.wallet.encryptionKey || Authenticator.google.encryptionKey) {
      _activeMethod = Authenticator.wallet.encryptionKey ? 'metamask' : 'google';
    } else {
      _activeMethod = null;
    }
    var status = document.getElementById('pwdStatus');
    var actions = document.getElementById('pwdActions');
    if (status) status.textContent = 'Locked';
    if (actions) actions.style.display = 'none';
    Authenticator.updateWalletUI();
    Authenticator.showToast('Password locked.', 'info');
  };

  /* --- Unified encrypt/decrypt --- */
  async function _encrypt(data) {
    var key = getEncryptionKey();
    if (!key) throw new Error('No encryption key.');
    var salt = getSalt();
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, data);
    var combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encrypted), iv.length);
    var saltB64 = btoa(String.fromCharCode.apply(null, salt));
    var base64 = btoa(String.fromCharCode.apply(null, combined));
    return { saltB64: saltB64, base64: base64, method: getSourceLabel() };
  }

  async function _decrypt(base64, saltB64) {
    var key = getEncryptionKey();
    if (!key) throw new Error('No encryption key.');
    var combined = Uint8Array.from(atob(base64), function(c) { return c.charCodeAt(0); });
    var iv = combined.slice(0, 12);
    var encrypted = combined.slice(12);
    var decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, encrypted);
    return JSON.parse(new TextDecoder().decode(decrypted));
  }

  /* --- Export --- */
  Authenticator.exportBackup = async function() {
    var key = getEncryptionKey();
    if (!key) { Authenticator.showToast('Authenticate first (MetaMask/Google/Password).', 'error'); return null; }
    if (!Authenticator.accounts.length) { Authenticator.showToast('No accounts to backup.', 'error'); return null; }
    try {
      var data = new TextEncoder().encode(JSON.stringify(Authenticator.accounts));
      var result = await _encrypt(data);
      var payload = JSON.stringify({ v: 2, s: result.saltB64, d: result.base64, m: result.method });
      await navigator.clipboard.writeText(payload);
      Authenticator.showToast('Encrypted backup copied to clipboard!', 'success');
      return payload;
    } catch (err) {
      Authenticator.showToast('Export failed.', 'error');
      return null;
    }
  };

  Authenticator.importBackup = async function(payload) {
    var key = getEncryptionKey();
    if (!key) { Authenticator.showToast('Authenticate first (MetaMask/Google/Password).', 'error'); return false; }
    try {
      var data;
      if (payload) {
        data = JSON.parse(payload);
      } else {
        var text = await navigator.clipboard.readText();
        data = JSON.parse(text);
      }
      if (!data.d) { Authenticator.showToast('Invalid backup data.', 'error'); return false; }
      var accounts = await _decrypt(data.d, data.s || '');
      if (!Array.isArray(accounts) || !accounts.length) { Authenticator.showToast('Invalid backup data.', 'error'); return false; }
      Authenticator.accounts = accounts;
      Authenticator.saveAccounts();
      Authenticator.renderList();
      Authenticator.showToast('Restored ' + accounts.length + ' accounts from backup!', 'success');
      return true;
    } catch (err) {
      Authenticator.showToast('Import failed: Invalid or corrupted backup.', 'error');
      return false;
    }
  };

  /* --- Legacy Metamask-only import support (v1 payloads) --- */
  Authenticator.importEncryptedBackup = async function(payload) {
    try {
      var data = JSON.parse(payload);
      if (data.w || (!data.s && data.d)) {
        return Authenticator.importLegacyMetaMask(data, payload);
      }
    } catch (e) {}
    return Authenticator.importBackup(payload);
  };

  Authenticator.importLegacyMetaMask = async function(data, raw) {
    if (!Authenticator.wallet.encryptionKey) {
      Authenticator.showToast('Connect your wallet first.', 'error');
      return false;
    }
    try {
      if (data.w && data.w.toLowerCase() !== Authenticator.wallet.address.toLowerCase()) {
        Authenticator.showToast('This backup belongs to a different wallet.', 'error');
        return false;
      }
      var importKey = Authenticator.wallet.encryptionKey;
      if (data.s) {
        var signature = await Authenticator.wallet.signer.signMessage(
          'Authenticator Sync v2\nWallet: ' + Authenticator.wallet.address + '\nTimestamp: ' + Date.now()
        );
        var salt = Uint8Array.from(atob(data.s), function(c) { return c.charCodeAt(0); });
        var keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(signature), 'PBKDF2', false, ['deriveKey']);
        importKey = await crypto.subtle.deriveKey(
          { name: 'PBKDF2', salt: salt, iterations: 600000, hash: 'SHA-256' },
          keyMaterial,
          { name: 'AES-GCM', length: 256 },
          false, ['encrypt', 'decrypt']
        );
      }
      var combined = Uint8Array.from(atob(data.d), function(c) { return c.charCodeAt(0); });
      var iv = combined.slice(0, 12);
      var encrypted = combined.slice(12);
      var decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, importKey, encrypted);
      var accounts = JSON.parse(new TextDecoder().decode(decrypted));
      if (!Array.isArray(accounts) || !accounts.length) { Authenticator.showToast('Invalid backup data.', 'error'); return false; }
      Authenticator.accounts = accounts;
      Authenticator.saveAccounts();
      Authenticator.renderList();
      Authenticator.showToast('Restored ' + accounts.length + ' accounts from backup!', 'success');
      return true;
    } catch (err) {
      Authenticator.showToast('Import failed: Invalid or corrupted backup.', 'error');
      return false;
    }
  };

  Authenticator.checkWalletConnection = function() {
    try {
      var addr = localStorage.getItem('2fa_wallet');
      if (addr && window.ethereum && !Authenticator.wallet.encryptionKey) {
        Authenticator.wallet.address = addr;
        Authenticator.updateWalletUI();
      }
    } catch (e) {}
    var cid = null;
    try { cid = localStorage.getItem('2fa_gcid'); } catch (e) {}
    if (cid) {
      var inp = document.getElementById('gClientId');
      if (inp) inp.placeholder = 'Client ID saved ✓';
    }
    setTimeout(Authenticator.initGoogle, 500);
  };

  Authenticator.updateWalletUI = function() {
    var wBtn = document.getElementById('walletBtn');
    var wStatus = document.getElementById('walletStatus');
    var wAddress = document.getElementById('walletAddress');
    var panel = document.getElementById('backupPanel');

    if (Authenticator.wallet.encryptionKey || Authenticator.google.encryptionKey || Authenticator.password.encryptionKey) {
      if (panel) panel.style.display = 'block';
    } else {
      if (panel) panel.style.display = 'none';
    }

    if (wBtn) {
      if (Authenticator.wallet.address) {
        wBtn.textContent = 'Disconnect';
        wBtn.className = 'btn btn-small btn-wallet connected';
        if (wStatus) wStatus.textContent = 'Connected';
        if (wAddress) {
          wAddress.textContent = Authenticator.wallet.address.slice(0,6) + '...' + Authenticator.wallet.address.slice(-4);
          wAddress.style.display = 'inline';
        }
      } else {
        wBtn.textContent = 'Connect Wallet';
        wBtn.className = 'btn btn-small btn-wallet';
        if (wStatus) wStatus.textContent = 'Not connected';
        if (wAddress) wAddress.style.display = 'none';
      }
    }

    /* Google UI */
    var gStatus = document.getElementById('gStatus');
    var gActions = document.getElementById('gActions');
    if (Authenticator.google.encryptionKey) {
      if (gStatus) gStatus.textContent = 'Signed in ✓';
      if (gActions) gActions.style.display = 'flex';
    } else {
      if (gStatus && !Authenticator.google.encryptionKey) {
        gStatus.textContent = 'Not signed in';
      }
      if (gActions) gActions.style.display = 'none';
    }

    /* Password UI */
    var pwdStatus = document.getElementById('pwdStatus');
    var pwdActions = document.getElementById('pwdActions');
    if (Authenticator.password.encryptionKey) {
      if (pwdStatus) pwdStatus.textContent = 'Unlocked ✓';
      if (pwdActions) pwdActions.style.display = 'flex';
    } else {
      if (pwdStatus) pwdStatus.textContent = 'Locked';
      if (pwdActions) pwdActions.style.display = 'none';
    }

    /* Backup bar (legacy placeholder) */
    var bar = document.getElementById('backupSection');
    if (bar) bar.style.display = 'none';
  };

  Authenticator.handleWalletKeyDown = function(e) {
    if (e.key === 'Enter') {
      var val = e.target.value.trim();
      if (val) {
        Authenticator.importEncryptedBackup(val);
        e.target.value = '';
      }
    }
  };
})();
