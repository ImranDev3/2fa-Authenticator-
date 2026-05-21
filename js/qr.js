window.Authenticator = window.Authenticator || {};

(function() {
  Authenticator.decodeQR = function(data, w, h) {
    const r = jsQR(data, w, h, { inversionAttempts: 'dontInvert' });
    return r ? r.data : null;
  };

  Authenticator.extractSecret = function(url) {
    try {
      const u = url.trim();
      if (!u.startsWith('otpauth://') && !u.startsWith('http')) return null;
      const q = u.indexOf('?');
      if (q === -1) return null;
      const s = new URLSearchParams(u.slice(q)).get('secret');
      return s ? s.toUpperCase() : null;
    } catch {
      return null;
    }
  };

  Authenticator.extractIssuer = function(url) {
    try {
      const u = url.trim();
      const s = new URLSearchParams(u.slice(u.indexOf('?')));
      const i = s.get('issuer');
      if (i) return decodeURIComponent(i);
      const m = u.match(/otpauth:\/\/totp\/(.+?)(\?|$)/);
      if (m) return decodeURIComponent(m[1]).replace(/:.*$/, '');
      return 'My Account';
    } catch {
      return 'My Account';
    }
  };

  Authenticator.fillManualFields = function(secret, issuer) {
    Authenticator.dom.secretInput.value = secret;
    Authenticator.dom.issuerInput.value = issuer;
  };

  Authenticator.processQR = function(data) {
    const s = Authenticator.extractSecret(data);
    if (s) {
      const issuer = Authenticator.extractIssuer(data);
      Authenticator.fillManualFields(s, issuer);
      Authenticator.showToast('QR scanned! Review and click Add.', 'success');
      return true;
    }
    Authenticator.showToast('No valid secret found.', 'error');
    return false;
  };

  Authenticator.processFile = function(file) {
    const r = new FileReader();
    r.onload = function(e) {
      const img = new Image();
      img.onload = function() {
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const d = ctx.getImageData(0, 0, c.width, c.height);
        const res = Authenticator.decodeQR(d.data, d.width, d.height);
        if (res) {
          Authenticator.processQR(res);
        } else {
          Authenticator.showToast('No QR code found.', 'error');
        }
      };
      img.src = e.target.result;
    };
    r.readAsDataURL(file);
  };

  Authenticator.startCamera = async function() {
    try {
      Authenticator.cameraStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 640 },
          height: { ideal: 480 }
        }
      });
      Authenticator.dom.cameraFeed.srcObject = Authenticator.cameraStream;
      Authenticator.dom.cameraModal.classList.add('open');
      Authenticator.dom.camStatus.textContent = 'Scanning for QR code...';
      Authenticator.scanFrame();
    } catch {
      Authenticator.showToast('Camera unavailable.', 'error');
    }
  };

  Authenticator.stopCamera = function() {
    if (Authenticator.cameraStream) {
      Authenticator.cameraStream.getTracks().forEach(t => t.stop());
      Authenticator.cameraStream = null;
    }
    clearTimeout(Authenticator.cameraScanTimer);
    Authenticator.dom.cameraModal.classList.remove('open');
  };

  Authenticator.scanFrame = function() {
    if (!Authenticator.dom.cameraModal.classList.contains('open')) return;
    if (Authenticator.dom.cameraFeed.readyState >= 2) {
      const c = document.createElement('canvas');
      c.width = Authenticator.dom.cameraFeed.videoWidth;
      c.height = Authenticator.dom.cameraFeed.videoHeight;
      const ctx = c.getContext('2d');
      ctx.drawImage(Authenticator.dom.cameraFeed, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height);
      const r = Authenticator.decodeQR(d.data, d.width, d.height);
      if (r && Authenticator.processQR(r)) {
        Authenticator.stopCamera();
        return;
      }
    }
    Authenticator.cameraScanTimer = setTimeout(Authenticator.scanFrame, 400);
  };

  Authenticator.handlePaste = async function(e) {
    const items = (e.clipboardData || window.clipboardData).items;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const f = item.getAsFile();
        if (f) {
          Authenticator.processFile(f);
          Authenticator.showToast('Processing image...', 'info');
          return;
        }
      }
    }
    const text = (e.clipboardData || window.clipboardData).getData('text');
    if (text) {
      const s = Authenticator.extractSecret(text);
      if (s) {
        const issuer = Authenticator.extractIssuer(text);
        Authenticator.fillManualFields(s, issuer);
        Authenticator.showToast('Secret pasted! Click Add to save.', 'success');
        return;
      }
      const clean = text.replace(/[= \t\r\n]/g, '').toUpperCase();
      if (/^[A-Z2-7]{16,}$/.test(clean)) {
        Authenticator.fillManualFields(clean, 'My Account');
        Authenticator.showToast('Secret pasted! Click Add to save.', 'success');
        return;
      }
    }
  };
})();
