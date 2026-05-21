window.Authenticator = window.Authenticator || {};

(function() {
  Authenticator.wallet = {
    address: null,
    provider: null,
    signer: null,
    encryptionKey: null
  };

  Authenticator.connectWallet = async function() {
    if (!window.ethereum) {
      Authenticator.showToast('MetaMask not found. Install it to use wallet sync.', 'error');
      return false;
    }
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const accounts = await provider.send('eth_requestAccounts', []);
      if (!accounts.length) {
        Authenticator.showToast('No accounts found.', 'error');
        return false;
      }
      const signer = provider.getSigner();
      const address = accounts[0];

      const message = 'Authenticator Wallet Sync\n\nSign this message to encrypt and sync your 2FA accounts.\nWallet: ' + address + '\nTimestamp: ' + Date.now();
      const signature = await signer.signMessage(message);

      const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(signature));
      const key = await crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);

      Authenticator.wallet.address = address;
      Authenticator.wallet.provider = provider;
      Authenticator.wallet.signer = signer;
      Authenticator.wallet.encryptionKey = key;

      try { localStorage.setItem('2fa_wallet', address); } catch {}

      Authenticator.updateWalletUI();
      Authenticator.showToast('Wallet connected: ' + address.slice(0, 6) + '...' + address.slice(-4), 'success');
      return true;
    } catch (err) {
      if (err.code === 4001) {
        Authenticator.showToast('Connection rejected.', 'error');
      } else {
        Authenticator.showToast('Connection failed: ' + err.message, 'error');
      }
      return false;
    }
  };

  Authenticator.disconnectWallet = function() {
    Authenticator.wallet.address = null;
    Authenticator.wallet.provider = null;
    Authenticator.wallet.signer = null;
    Authenticator.wallet.encryptionKey = null;
    try { localStorage.removeItem('2fa_wallet'); } catch {}
    Authenticator.updateWalletUI();
    Authenticator.showToast('Wallet disconnected.', 'info');
  };

  Authenticator.exportEncryptedBackup = async function() {
    if (!Authenticator.wallet.encryptionKey) {
      Authenticator.showToast('Connect your wallet first.', 'error');
      return null;
    }
    if (!Authenticator.accounts.length) {
      Authenticator.showToast('No accounts to backup.', 'error');
      return null;
    }
    try {
      const data = new TextEncoder().encode(JSON.stringify(Authenticator.accounts));
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        Authenticator.wallet.encryptionKey,
        data
      );

      const combined = new Uint8Array(iv.length + encrypted.byteLength);
      combined.set(iv, 0);
      combined.set(new Uint8Array(encrypted), iv.length);

      const base64 = btoa(String.fromCharCode.apply(null, combined));
      const payload = JSON.stringify({
        v: 1,
        w: Authenticator.wallet.address,
        d: base64
      });

      await navigator.clipboard.writeText(payload);
      Authenticator.showToast('Encrypted backup copied to clipboard!', 'success');
      return payload;
    } catch (err) {
      Authenticator.showToast('Export failed.', 'error');
      return null;
    }
  };

  Authenticator.importEncryptedBackup = async function(payload) {
    if (!Authenticator.wallet.encryptionKey) {
      Authenticator.showToast('Connect your wallet first.', 'error');
      return false;
    }
    try {
      let data;
      if (payload) {
        data = JSON.parse(payload);
      } else {
        const text = await navigator.clipboard.readText();
        data = JSON.parse(text);
      }

      if (data.w && data.w.toLowerCase() !== Authenticator.wallet.address.toLowerCase()) {
        Authenticator.showToast('This backup belongs to a different wallet.', 'error');
        return false;
      }

      const combined = Uint8Array.from(atob(data.d), c => c.charCodeAt(0));
      const iv = combined.slice(0, 12);
      const encrypted = combined.slice(12);

      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        Authenticator.wallet.encryptionKey,
        encrypted
      );

      const accounts = JSON.parse(new TextDecoder().decode(decrypted));

      if (!Array.isArray(accounts) || !accounts.length) {
        Authenticator.showToast('Invalid backup data.', 'error');
        return false;
      }

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
      const addr = localStorage.getItem('2fa_wallet');
      if (addr && window.ethereum) {
        Authenticator.wallet.address = addr;
        Authenticator.updateWalletUI();
        Authenticator.showToast('Wallet reconnected: ' + addr.slice(0, 6) + '...' + addr.slice(-4), 'info');
      }
    } catch {}
  };

  Authenticator.updateWalletUI = function() {
    const btn = document.getElementById('walletBtn');
    const status = document.getElementById('walletStatus');
    const address = document.getElementById('walletAddress');
    const backupSection = document.getElementById('backupSection');

    if (!btn) return;

    if (Authenticator.wallet.address) {
      btn.textContent = 'Disconnect';
      btn.className = 'btn btn-small btn-wallet connected';
      if (status) status.textContent = 'Connected';
      if (address) {
        address.textContent = Authenticator.wallet.address.slice(0, 6) + '...' + Authenticator.wallet.address.slice(-4);
        address.style.display = 'inline';
      }
      if (backupSection) backupSection.style.display = 'flex';
    } else {
      btn.textContent = 'Connect Wallet';
      btn.className = 'btn btn-small btn-wallet';
      if (status) status.textContent = 'Not connected';
      if (address) address.style.display = 'none';
      if (backupSection) backupSection.style.display = 'none';
    }
  };

  Authenticator.handleWalletKeyDown = function(e) {
    if (e.key === 'Enter') {
      const val = e.target.value.trim();
      if (val) {
        Authenticator.importEncryptedBackup(val);
        e.target.value = '';
      }
    }
  };
})();
