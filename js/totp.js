window.Authenticator = window.Authenticator || {};

(function() {
  const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

  Authenticator.base32Decode = function(str) {
    const cleaned = str.replace(/[= \t\r\n]/g, '').toUpperCase();
    const bytes = [];
    let buf = 0, bits = 0;
    for (const ch of cleaned) {
      const idx = BASE32.indexOf(ch);
      if (idx === -1) continue;
      buf = (buf << 5) | idx;
      bits += 5;
      if (bits >= 8) {
        bits -= 8;
        bytes.push((buf >>> bits) & 0xff);
      }
    }
    return new Uint8Array(bytes);
  };

  Authenticator.generateTOTP = async function(secret, step = 30) {
    const key = await crypto.subtle.importKey(
      'raw',
      Authenticator.base32Decode(secret),
      { name: 'HMAC', hash: 'SHA-1' },
      false,
      ['sign']
    );
    const counter = Math.floor(Date.now() / 1000 / step);
    const buf = new ArrayBuffer(8);
    new DataView(buf).setBigUint64(0, BigInt(counter), false);
    const hmac = new Uint8Array(await crypto.subtle.sign('HMAC', key, buf));
    const off = hmac[19] & 0x0f;
    const code =
      ((hmac[off] & 0x7f) << 24) |
      ((hmac[off + 1] & 0xff) << 16) |
      ((hmac[off + 2] & 0xff) << 8) |
      (hmac[off + 3] & 0xff);
    return String(code % 1000000).padStart(6, '0');
  };
})();
