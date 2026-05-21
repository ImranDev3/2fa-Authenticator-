// ─── Crypto Core WASM Loader ───
// Loads AssemblyScript → WASM crypto module
// Provides: sha256(), bytesToHex()
// Falls back to Web Crypto API if WASM unavailable

window.Authenticator = window.Authenticator || {};
(function() {
  var wasmInstance = null;
  var wasmReady = false;

  Authenticator.wasmCrypto = {
    ready: false,
    sha256: null,
    sha256Hex: null
  };

  // Initialize WASM crypto module
  Authenticator.initWasmCrypto = async function() {
    try {
      var response = await fetch('crypto-core/build/crypto-core.wasm');
      var bytes = await response.arrayBuffer();
      var module = await WebAssembly.compile(bytes);
      var instance = await WebAssembly.instantiate(module, {
        env: {
          abort: function(msg, file, line, col) { console.error('WASM abort'); }
        }
      });
      wasmInstance = instance.exports;
      wasmReady = true;
      Authenticator.wasmCrypto.ready = true;

      // Wrap SHA-256
      Authenticator.wasmCrypto.sha256 = function(data) {
        var inputPtr = wasmInstance.__new(data.length, 1);
        var inputView = new Uint8Array(wasmInstance.memory.buffer, inputPtr, data.length);
        inputView.set(data);
        var outputPtr = wasmInstance.__new(32, 1);
        wasmInstance.sha256(inputPtr, data.length, outputPtr);
        var outputView = new Uint8Array(wasmInstance.memory.buffer, outputPtr, 32);
        var result = new Uint8Array(outputView);
        wasmInstance.__release(inputPtr);
        wasmInstance.__release(outputPtr);
        return result;
      };

      // SHA-256 hex string
      Authenticator.wasmCrypto.sha256Hex = function(data) {
        var hash = Authenticator.wasmCrypto.sha256(data);
        return Array.from(hash).map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
      };

      // Bytes to hex
      Authenticator.wasmCrypto.bytesToHex = function(bytes) {
        var inputPtr = wasmInstance.__new(bytes.length, 1);
        var inputView = new Uint8Array(wasmInstance.memory.buffer, inputPtr, bytes.length);
        inputView.set(bytes);
        var outLen = bytes.length * 2;
        var outputPtr = wasmInstance.__new(outLen, 1);
        wasmInstance.bytesToHex(inputPtr, bytes.length, outputPtr);
        var outputView = new Uint8Array(wasmInstance.memory.buffer, outputPtr, outLen);
        var hexChars = new Uint8Array(outputView);
        var result = String.fromCharCode.apply(null, hexChars);
        wasmInstance.__release(inputPtr);
        wasmInstance.__release(outputPtr);
        return result;
      };

      console.log('✓ Crypto Core WASM loaded (' + bytes.byteLength + ' bytes)');
      return true;
    } catch (err) {
      console.warn('WASM crypto unavailable, using JS fallback:', err.message);
      Authenticator.wasmCrypto.ready = false;
      return false;
    }
  };

  // Update BTC SHA-256 proof using WASM (fallback to Web Crypto API)
  Authenticator.updateWasmProof = async function() {
    var data = new TextEncoder().encode(JSON.stringify(Authenticator.accounts || []));
    var btcEl = document.getElementById('btcHash');
    if (!btcEl) return;

    if (wasmReady && Authenticator.wasmCrypto.sha256Hex) {
      btcEl.textContent = Authenticator.wasmCrypto.sha256Hex(data);
    } else {
      // Fallback
      var hash = await crypto.subtle.digest('SHA-256', data);
      var hex = Array.from(new Uint8Array(hash)).map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
      btcEl.textContent = hex;
    }
  };
})();
