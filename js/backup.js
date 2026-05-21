window.Authenticator = window.Authenticator || {};

(function() {
  var _activeMethod = null;
  var _lockTimer = null;
  var _LOCK_TIMEOUT = 300000; // 5 min
  var _clearClipTimer = null;

  // ── Auth state objects ──
  Authenticator.auth = {
    metamask: { address: null, provider: null, signer: null, key: null, salt: null },
    webauthn: { credentialId: null, key: null, salt: null, registered: false },
    google: { credential: null, key: null, salt: null },
    password: { key: null, salt: null }
  };

  function getKey() {
    var a = Authenticator.auth;
    return a.metamask.key || a.webauthn.key || a.google.key || a.password.key;
  }

  function getSalt() {
    var a = Authenticator.auth;
    return a.metamask.salt || a.webauthn.salt || a.google.salt || a.password.salt;
  }

  function sourceLabel() {
    if (Authenticator.auth.metamask.key) return 'MetaMask';
    if (Authenticator.auth.webauthn.key) return 'WebAuthn';
    if (Authenticator.auth.google.key) return 'Google';
    if (Authenticator.auth.password.key) return 'Password';
    return null;
  }

  /* ── Argon2id KDF (world-class memory-hard key derivation) ── */
  async function deriveKeyArgon2id(secret, salt) {
    if (typeof hashwasm === 'undefined' || !hashwasm.argon2id) {
      return deriveKeyPBKDF2(secret, salt);
    }
    try {
      var enc = new TextEncoder();
      var result = await hashwasm.argon2id({
        password: secret,
        salt: salt,
        parallelism: 1,
        iterations: 3,
        memorySize: 65536, // 64 MB
        hashLength: 32,
        outputType: 'binary'
      });
      var keyMaterial = await crypto.subtle.importKey('raw', result, 'PBKDF2', false, ['deriveKey']);
      return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: salt, iterations: 1, hash: 'SHA-256' },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false, ['encrypt', 'decrypt']
      );
    } catch (e) {
      return deriveKeyPBKDF2(secret, salt);
    }
  }

  async function deriveKeyPBKDF2(secret, salt) {
    var enc = new TextEncoder();
    var keyMaterial = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: salt, iterations: 1000000, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false, ['encrypt', 'decrypt']
    );
  }

  /* ── Session auto-lock ── */
  function resetLockTimer() {
    if (_lockTimer) clearTimeout(_lockTimer);
    _lockTimer = setTimeout(autoLock, _LOCK_TIMEOUT);
  }

  function autoLock() {
    var a = Authenticator.auth;
    var hadKey = !!(a.metamask.key || a.webauthn.key || a.google.key || a.password.key);
    a.metamask.key = null; a.metamask.salt = null;
    a.webauthn.key = null; a.webauthn.salt = null;
    a.google.key = null; a.google.salt = null;
    a.password.key = null; a.password.salt = null;
    _activeMethod = null;
    if (hadKey) {
      Authenticator.showToast('Session locked due to inactivity.', 'info');
      updateModalUI();
    }
  }

  document.addEventListener('click', resetLockTimer);
  document.addEventListener('keydown', resetLockTimer);

  /* ── Clipboard auto-clear (30s) ── */
  function scheduleClipboardClear() {
    if (_clearClipTimer) clearTimeout(_clearClipTimer);
    _clearClipTimer = setTimeout(function() {
      navigator.clipboard.writeText('').catch(function() {});
      _clearClipTimer = null;
    }, 30000);
  }

  /* ── ========== MetaMask ========== ── */
  Authenticator.metaConnect = async function() {
    if (!window.ethereum) {
      Authenticator.showToast('MetaMask not found.', 'error');
      return;
    }
    try {
      var provider = new ethers.providers.Web3Provider(window.ethereum);
      var accounts = await provider.send('eth_requestAccounts', []);
      if (!accounts.length) { Authenticator.showToast('No accounts.', 'error'); return; }
      var signer = provider.getSigner();
      var address = accounts[0];
      var message = 'Authenticator\nWallet: ' + address + '\nTime: ' + Date.now();
      var signature = await signer.signMessage(message);
      var salt = crypto.getRandomValues(new Uint8Array(16));
      var key = await deriveKeyArgon2id(signature, salt);
      Authenticator.auth.metamask.address = address;
      Authenticator.auth.metamask.provider = provider;
      Authenticator.auth.metamask.signer = signer;
      Authenticator.auth.metamask.key = key;
      Authenticator.auth.metamask.salt = salt;
      _activeMethod = 'metamask';
      try { localStorage.setItem('2fa_wallet', address); } catch (e) {}
      updateModalUI();
      Authenticator.showToast('Connected: ' + address.slice(0,6) + '...' + address.slice(-4), 'success');
    } catch (err) {
      Authenticator.showToast(err.code === 4001 ? 'Rejected.' : 'Failed: ' + err.message, 'error');
    }
  };

  Authenticator.metaDisconnect = function() {
    Authenticator.auth.metamask.address = null;
    Authenticator.auth.metamask.provider = null;
    Authenticator.auth.metamask.signer = null;
    Authenticator.auth.metamask.key = null;
    Authenticator.auth.metamask.salt = null;
    try { localStorage.removeItem('2fa_wallet'); } catch (e) {}
    _activeMethod = recheckActive();
    updateModalUI();
    Authenticator.showToast('MetaMask disconnected.', 'info');
  };

  /* ── ========== WebAuthn (FIDO2 / hardware key) ========== ── */
  Authenticator.webauthnRegister = async function() {
    try {
      var challenge = crypto.getRandomValues(new Uint8Array(32));
      var userId = crypto.getRandomValues(new Uint8Array(16));
      var cred = await navigator.credentials.create({
        publicKey: {
          challenge: challenge,
          rp: { name: 'Authenticator' },
          user: {
            id: userId,
            name: 'authenticator-user',
            displayName: 'Authenticator User'
          },
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 },
            { type: 'public-key', alg: -257 }
          ],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            residentKey: 'preferred',
            userVerification: 'required'
          },
          timeout: 60000
        }
      });
      var credId = btoa(String.fromCharCode.apply(null, new Uint8Array(cred.rawId)));
      try { localStorage.setItem('2fa_wauth_id', credId); } catch (e) {}
      Authenticator.auth.webauthn.credentialId = credId;
      Authenticator.auth.webauthn.registered = true;
      updateModalUI();
      Authenticator.showToast('Hardware key registered!', 'success');
    } catch (err) {
      Authenticator.showToast('Registration failed: ' + err.message, 'error');
    }
  };

  Authenticator.webauthnLogin = async function() {
    var storedId = Authenticator.auth.webauthn.credentialId;
    if (!storedId) {
      try { storedId = localStorage.getItem('2fa_wauth_id'); } catch (e) {}
    }
    if (!storedId) {
      Authenticator.showToast('No key registered. Register first.', 'error');
      return;
    }
    try {
      var challenge = crypto.getRandomValues(new Uint8Array(32));
      var credIdBytes = Uint8Array.from(atob(storedId), function(c) { return c.charCodeAt(0); });
      var assertion = await navigator.credentials.get({
        publicKey: {
          challenge: challenge,
          allowCredentials: [{
            type: 'public-key',
            id: credIdBytes,
            transports: ['internal']
          }],
          userVerification: 'required',
          timeout: 60000
        }
      });
      var authData = new Uint8Array(assertion.response.authenticatorData);
      var sig = new Uint8Array(assertion.response.signature);
      var combined = new Uint8Array(authData.length + sig.length);
      combined.set(authData, 0);
      combined.set(sig, authData.length);
      var keyMaterial = btoa(String.fromCharCode.apply(null, combined));
      var salt = crypto.getRandomValues(new Uint8Array(16));
      var key = await deriveKeyArgon2id(keyMaterial, salt);
      Authenticator.auth.webauthn.key = key;
      Authenticator.auth.webauthn.salt = salt;
      _activeMethod = 'webauthn';
      updateModalUI();
      Authenticator.showToast('Hardware key verified!', 'success');
    } catch (err) {
      Authenticator.showToast('Verification failed: ' + err.message, 'error');
    }
  };

  Authenticator.webauthnLogout = function() {
    Authenticator.auth.webauthn.key = null;
    Authenticator.auth.webauthn.salt = null;
    _activeMethod = recheckActive();
    updateModalUI();
    Authenticator.showToast('WebAuthn locked.', 'info');
  };

  /* ── ========== Google ========== ── */
  Authenticator.initGoogle = function() {
    if (typeof google === 'undefined' || !google.accounts) return;
    var cid = null;
    try { cid = localStorage.getItem('2fa_gcid'); } catch (e) {}
    if (!cid) return;
    google.accounts.id.initialize({
      client_id: cid,
      callback: Authenticator.handleGoogleCredential,
      cancel_on_tap_outside: false
    });
    var btn = document.getElementById('gButton');
    if (btn && btn.children.length === 0) {
      google.accounts.id.renderButton(btn, { theme: 'outline', size: 'large', width: 240 });
    }
  };

  Authenticator.handleGoogleCredential = async function(response) {
    try {
      var token = response.credential;
      var salt = crypto.getRandomValues(new Uint8Array(16));
      var key = await deriveKeyArgon2id(token, salt);
      Authenticator.auth.google.credential = response;
      Authenticator.auth.google.key = key;
      Authenticator.auth.google.salt = salt;
      _activeMethod = 'google';
      updateModalUI();
      Authenticator.showToast('Signed in with Google!', 'success');
    } catch (err) {
      Authenticator.showToast('Google sign-in failed.', 'error');
    }
  };

  Authenticator.disconnectGoogle = function() {
    Authenticator.auth.google.credential = null;
    Authenticator.auth.google.key = null;
    Authenticator.auth.google.salt = null;
    if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
      google.accounts.id.disableAutoSelect();
    }
    _activeMethod = recheckActive();
    updateModalUI();
    Authenticator.showToast('Google signed out.', 'info');
  };

  Authenticator.setGoogleClientId = function() {
    var input = document.getElementById('gClientId');
    var cid = input.value.trim();
    if (!cid) { Authenticator.showToast('Enter a Client ID.', 'error'); return; }
    try { localStorage.setItem('2fa_gcid', cid); } catch (e) {}
    input.value = '';
    Authenticator.initGoogle();
    Authenticator.showToast('Google Client ID saved!', 'success');
  };

  /* ── ========== Password ========== ── */
  Authenticator.unlockPassword = async function() {
    var input = document.getElementById('pwdInput');
    var pwd = input.value.trim();
    if (!pwd) { Authenticator.showToast('Enter a password.', 'error'); return; }
    try {
      var salt = crypto.getRandomValues(new Uint8Array(16));
      var key = await deriveKeyArgon2id(pwd, salt);
      Authenticator.auth.password.key = key;
      Authenticator.auth.password.salt = salt;
      _activeMethod = 'password';
      input.value = '';
      updateModalUI();
      Authenticator.showToast('Password unlocked!', 'success');
    } catch (err) {
      Authenticator.showToast('Failed.', 'error');
    }
  };

  Authenticator.lockPassword = function() {
    Authenticator.auth.password.key = null;
    Authenticator.auth.password.salt = null;
    _activeMethod = recheckActive();
    updateModalUI();
    Authenticator.showToast('Password locked.', 'info');
  };

  function recheckActive() {
    var a = Authenticator.auth;
    if (a.metamask.key) return 'metamask';
    if (a.webauthn.key) return 'webauthn';
    if (a.google.key) return 'google';
    if (a.password.key) return 'password';
    return null;
  }

  /* ── ========== Unified encrypt / decrypt ========== ── */
  async function _encrypt(data) {
    var key = getKey();
    if (!key) throw new Error('No key');
    var salt = getSalt();
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, data);
    var combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encrypted), iv.length);
    return {
      saltB64: btoa(String.fromCharCode.apply(null, salt)),
      dataB64: btoa(String.fromCharCode.apply(null, combined)),
      method: sourceLabel()
    };
  }

  async function _decrypt(dataB64, saltB64) {
    var key = getKey();
    if (!key) throw new Error('No key');
    var combined = Uint8Array.from(atob(dataB64), function(c) { return c.charCodeAt(0); });
    var iv = combined.slice(0, 12);
    var encrypted = combined.slice(12);
    var decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, encrypted);
    return JSON.parse(new TextDecoder().decode(decrypted));
  }

  /* ── ========== Export ========== ── */
  Authenticator.exportBackup = async function() {
    var key = getKey();
    if (!key) { Authenticator.showToast('Authenticate first.', 'error'); return; }
    if (!Authenticator.accounts.length) { Authenticator.showToast('No accounts.', 'error'); return; }
    try {
      var data = new TextEncoder().encode(JSON.stringify(Authenticator.accounts));
      var result = await _encrypt(data);
      var payload = JSON.stringify({
        v: 3,
        m: result.method,
        s: result.saltB64,
        d: result.dataB64
      });
      await navigator.clipboard.writeText(payload);
      scheduleClipboardClear();
      Authenticator.showToast('Backup copied (auto-clears in 30s)!', 'success');
    } catch (err) {
      Authenticator.showToast('Export failed.', 'error');
    }
  };

  Authenticator.importBackup = async function(payload) {
    var key = getKey();
    if (!key) { Authenticator.showToast('Authenticate first.', 'error'); return; }
    try {
      var data;
      if (payload) {
        data = JSON.parse(payload);
      } else {
        var text = await navigator.clipboard.readText();
        data = JSON.parse(text);
      }
      if (!data.d) { Authenticator.showToast('Invalid backup.', 'error'); return; }
      if (data.v >= 3) {
        var accounts = await _decrypt(data.d, data.s || '');
        if (!Array.isArray(accounts) || !accounts.length) { Authenticator.showToast('Invalid data.', 'error'); return; }
        Authenticator.accounts = accounts;
        Authenticator.saveAccounts();
        Authenticator.renderList();
        Authenticator.showToast('Restored ' + accounts.length + ' accounts!', 'success');
      } else {
        await Authenticator.importLegacyBackup(payload);
      }
    } catch (err) {
      Authenticator.showToast('Import failed.', 'error');
    }
  };

  /* ── Legacy v1/v2 support (MetaMask-only) ── */
  Authenticator.importLegacyBackup = async function(payload) {
    try {
      var data = JSON.parse(payload);
      if (!data.d) throw new Error('Invalid');
      if (!Authenticator.auth.metamask.key && !Authenticator.auth.metamask.signer) {
        Authenticator.showToast('Connect MetaMask for legacy backup.', 'error');
        return;
      }
      var key = Authenticator.auth.metamask.key;
      if (data.s && Authenticator.auth.metamask.signer) {
        // v2: re-derive key with same salt
        var signature = await Authenticator.auth.metamask.signer.signMessage(
          'Authenticator Sync v2\nWallet: ' + Authenticator.auth.metamask.address + '\nTimestamp: ' + Date.now()
        );
        var salt = Uint8Array.from(atob(data.s), function(c) { return c.charCodeAt(0); });
        key = await deriveKeyPBKDF2(signature, salt);
      }
      var combined = Uint8Array.from(atob(data.d), function(c) { return c.charCodeAt(0); });
      var iv = combined.slice(0, 12);
      var encrypted = combined.slice(12);
      var decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, encrypted);
      var accounts = JSON.parse(new TextDecoder().decode(decrypted));
      if (!Array.isArray(accounts) || !accounts.length) { Authenticator.showToast('Invalid data.', 'error'); return; }
      Authenticator.accounts = accounts;
      Authenticator.saveAccounts();
      Authenticator.renderList();
      Authenticator.showToast('Restored ' + accounts.length + ' accounts!', 'success');
    } catch (err) {
      Authenticator.showToast('Import failed.', 'error');
    }
  };

  /* ── ========== Modal UI ========== ── */
  function updateModalUI() {
    var a = Authenticator.auth;

    // MetaMask
    var metaAccount = document.getElementById('metaAccount');
    var metaStatus = document.getElementById('metaStatus');
    var metaConnect = document.getElementById('metaConnect');
    if (a.metamask.address) {
      if (metaAccount) metaAccount.textContent = a.metamask.address.slice(0,6) + '...' + a.metamask.address.slice(-4);
      if (metaConnect) metaConnect.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" style="width:12px;height:12px"><path d="M6 12l4-4-4-4"/></svg> Disconnect';
      metaConnect.className = 'btn btn-small';
      if (metaStatus) metaStatus.textContent = a.metamask.key ? 'Ready ✓' : 'Connected (re-sign to unlock)';
    } else {
      if (metaAccount) metaAccount.textContent = '';
      if (metaConnect) metaConnect.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" style="width:12px;height:12px"><path d="M8 1v7m0 0l3-3m-3 3L5 5"/><path d="M3 9v4a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V9"/></svg> Connect';
      metaConnect.className = 'btn btn-small btn-primary';
      if (metaStatus) metaStatus.textContent = 'Disconnected';
    }

    // MetaMask export/import
    document.getElementById('metaExport').disabled = !a.metamask.key;
    document.getElementById('metaImport').disabled = !a.metamask.key;

    // WebAuthn
    var wauthStatus = document.getElementById('wauthStatus');
    var wauthLogin = document.getElementById('wauthLogin');
    var wauthExport = document.getElementById('wauthExport');
    var wauthImport = document.getElementById('wauthImport');
    var registered = a.webauthn.registered || (function() { try { return !!localStorage.getItem('2fa_wauth_id'); } catch(e) { return false; } })();
    if (wauthStatus) wauthStatus.textContent = a.webauthn.key ? 'Unlocked ✓' : registered ? 'Key registered — click Unlock' : 'No key registered';
    if (wauthLogin) wauthLogin.disabled = !registered;
    if (wauthExport) wauthExport.disabled = !a.webauthn.key;
    if (wauthImport) wauthImport.disabled = !a.webauthn.key;

    // Google
    var gStatus = document.getElementById('gStatus');
    var gActions = document.getElementById('gActions');
    if (a.google.key) {
      if (gStatus) gStatus.textContent = 'Signed in ✓';
      if (gActions) gActions.style.display = 'flex';
    } else {
      if (gStatus) gStatus.textContent = 'Not signed in';
      if (gActions) gActions.style.display = 'none';
    }

    // Password
    var pwdStatus = document.getElementById('pwdStatus');
    var pwdActions = document.getElementById('pwdActions');
    if (a.password.key) {
      if (pwdStatus) pwdStatus.textContent = 'Unlocked ✓';
      if (pwdActions) pwdActions.style.display = 'flex';
    } else {
      if (pwdStatus) pwdStatus.textContent = 'Locked';
      if (pwdActions) pwdActions.style.display = 'none';
    }
  }

  Authenticator.updateModalUI = updateModalUI;

  /* ── ========== Boot ========== ── */
  Authenticator.bootBackup = function() {
    // Restore wallet address from localStorage
    try {
      var addr = localStorage.getItem('2fa_wallet');
      if (addr && window.ethereum) {
        Authenticator.auth.metamask.address = addr;
      }
    } catch (e) {}

    // Restore WebAuthn credential
    try {
      var credId = localStorage.getItem('2fa_wauth_id');
      if (credId) {
        Authenticator.auth.webauthn.credentialId = credId;
        Authenticator.auth.webauthn.registered = true;
      }
    } catch (e) {}

    // Restore Google Client ID placeholder
    try {
      var cid = localStorage.getItem('2fa_gcid');
      if (cid) {
        var inp = document.getElementById('gClientId');
        if (inp) inp.placeholder = 'Client ID saved ✓';
      }
    } catch (e) {}

    setTimeout(Authenticator.initGoogle, 500);
    updateModalUI();
  };

  /* ── ========== Legacy helper for old code ========== ── */
  Authenticator.wallet = Authenticator.auth.metamask;
  Authenticator.google = Authenticator.auth.google;
  Authenticator.password = Authenticator.auth.password;

  // Legacy aliases
  Authenticator.connectWallet = Authenticator.metaConnect;
  Authenticator.disconnectWallet = Authenticator.metaDisconnect;
  Authenticator.exportEncryptedBackup = Authenticator.exportBackup;
  Authenticator.importEncryptedBackup = Authenticator.importBackup;
  Authenticator.checkWalletConnection = Authenticator.bootBackup;
  Authenticator.updateWalletUI = Authenticator.updateModalUI;
})();
