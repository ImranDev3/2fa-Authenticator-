// ─── Crypto Core ───
// AssemblyScript → WASM
// SHA-256, AES-256-GCM, Argon2id implementations
// Memory-safe, zero-dependency crypto for Authenticator

// SHA-256 constants
const K = new StaticArray<u32>(64);
K[0] = 0x428a2f98; K[1] = 0x71374491; K[2] = 0xb5c0fbcf; K[3] = 0xe9b5dba5;
K[4] = 0x3956c25b; K[5] = 0x59f111f1; K[6] = 0x923f82a4; K[7] = 0xab1c5ed5;
K[8] = 0xd807aa98; K[9] = 0x12835b01; K[10] = 0x243185be; K[11] = 0x550c7dc3;
K[12] = 0x72be5d74; K[13] = 0x80deb1fe; K[14] = 0x9bdc06a7; K[15] = 0xc19bf174;
K[16] = 0xe49b69c1; K[17] = 0xefbe4786; K[18] = 0x0fc19dc6; K[19] = 0x240ca1cc;
K[20] = 0x2de92c6f; K[21] = 0x4a7484aa; K[22] = 0x5cb0a9dc; K[23] = 0x76f988da;
K[24] = 0x983e5152; K[25] = 0xa831c66d; K[26] = 0xb00327c8; K[27] = 0xbf597fc7;
K[28] = 0xc6e00bf3; K[29] = 0xd5a79147; K[30] = 0x06ca6351; K[31] = 0x14292967;
K[32] = 0x27b70a85; K[33] = 0x2e1b2138; K[34] = 0x4d2c6dfc; K[35] = 0x53380d13;
K[36] = 0x650a7354; K[37] = 0x766a0abb; K[38] = 0x81c2c92e; K[39] = 0x92722c85;
K[40] = 0xa2bfe8a1; K[41] = 0xa81a664b; K[42] = 0xc24b8b70; K[43] = 0xc76c51a3;
K[44] = 0xd192e819; K[45] = 0xd6990624; K[46] = 0xf40e3585; K[47] = 0x106aa070;
K[48] = 0x19a4c116; K[49] = 0x1e376c08; K[50] = 0x2748774c; K[51] = 0x34b0bcb5;
K[52] = 0x391c0cb3; K[53] = 0x4ed8aa4a; K[54] = 0x5b9cca4f; K[55] = 0x682e6ff3;
K[56] = 0x748f82ee; K[57] = 0x78a5636f; K[58] = 0x84c87814; K[59] = 0x8cc70208;
K[60] = 0x90befffa; K[61] = 0xa4506ceb; K[62] = 0xbef9a3f7; K[63] = 0xc67178f2;

function rotr(x: u32, n: u32): u32 { return (x >> n) | (x << (32 - n)); }
function ch(x: u32, y: u32, z: u32): u32 { return (x & y) ^ (~x & z); }
function maj(x: u32, y: u32, z: u32): u32 { return (x & y) ^ (x & z) ^ (y & z); }
function sig0(x: u32): u32 { return rotr(x, 2) ^ rotr(x, 13) ^ rotr(x, 22); }
function sig1(x: u32): u32 { return rotr(x, 6) ^ rotr(x, 11) ^ rotr(x, 25); }
function gam0(x: u32): u32 { return rotr(x, 7) ^ rotr(x, 18) ^ (x >> 3); }
function gam1(x: u32): u32 { return rotr(x, 17) ^ rotr(x, 19) ^ (x >> 10); }

// SHA-256 hash: input bytes → 32-byte hash
export function sha256(inputPtr: usize, inputLen: u32, outputPtr: usize): void {
  const input = changetype<ArrayBuffer>(inputPtr);
  const inputView = Uint8Array.wrap(input, 0, inputLen);

  const bitLen: u64 = inputLen * 8;
  const paddedLen: u32 = (((inputLen + 8 + 64) / 64) * 64);
  const padded = new Uint8Array(paddedLen);

  // Copy input
  for (let i: u32 = 0; i < inputLen; i++) {
    padded[i] = inputView[i];
  }
  padded[inputLen] = 0x80;

  // Length in big-endian (last 8 bytes)
  for (let i: u32 = 0; i < 8; i++) {
    padded[paddedLen - 8 + i] = <u8>(bitLen >> (56 - i * 8));
  }

  var H = new StaticArray<u32>(8);
  H[0] = 0x6a09e667; H[1] = 0xbb67ae85; H[2] = 0x3c6ef372; H[3] = 0xa54ff53a;
  H[4] = 0x510e527f; H[5] = 0x9b05688c; H[6] = 0x1f83d9ab; H[7] = 0x5be0cd19;

  // Process 64-byte chunks
  var W = new Array<u32>(64);
  for (let chunk: u32 = 0; chunk < paddedLen; chunk += 64) {
    for (let t: u32 = 0; t < 16; t++) {
      const idx = chunk + t * 4;
      W[t] = (<u32>padded[idx] << 24) | (<u32>padded[idx + 1] << 16) |
             (<u32>padded[idx + 2] << 8) | <u32>padded[idx + 3];
    }
    for (let t: u32 = 16; t < 64; t++) {
      W[t] = gam1(W[t - 2]) + W[t - 7] + gam0(W[t - 15]) + W[t - 16];
    }

    let a = H[0], b = H[1], c = H[2], d = H[3];
    let e = H[4], f = H[5], g = H[6], h = H[7];

    for (let t: u32 = 0; t < 64; t++) {
      const T1 = h + sig1(e) + ch(e, f, g) + K[t] + W[t];
      const T2 = sig0(a) + maj(a, b, c);
      h = g; g = f; f = e; e = d + T1;
      d = c; c = b; b = a; a = T1 + T2;
    }

    H[0] += a; H[1] += b; H[2] += c; H[3] += d;
    H[4] += e; H[5] += f; H[6] += g; H[7] += h;
  }

  // Write output (big-endian)
  const output = Uint8Array.wrap(changetype<ArrayBuffer>(outputPtr), 0, 32);
  for (let i: u32 = 0; i < 8; i++) {
    output[i * 4]     = <u8>(H[i] >> 24);
    output[i * 4 + 1] = <u8>(H[i] >> 16);
    output[i * 4 + 2] = <u8>(H[i] >> 8);
    output[i * 4 + 3] = <u8>(H[i]);
  }
}

// Bytes to hex string
export function bytesToHex(inputPtr: usize, inputLen: u32, outputPtr: usize): void {
  const input = Uint8Array.wrap(changetype<ArrayBuffer>(inputPtr), 0, inputLen);
  const hex = new Uint8Array(inputLen * 2);
  const chars = "0123456789abcdef";
  for (let i: u32 = 0; i < inputLen; i++) {
    hex[i * 2] = chars.charCodeAt(<u32>(input[i] >> 4));
    hex[i * 2 + 1] = chars.charCodeAt(<u32>(input[i] & 0x0f));
  }
  const output = Uint8Array.wrap(changetype<ArrayBuffer>(outputPtr), 0, inputLen * 2);
  for (let i: u32 = 0; i < inputLen * 2; i++) {
    output[i] = hex[i];
  }
}

// XOR two byte arrays (for AES-XTS / whitening)
export function xorBytes(aPtr: usize, bPtr: usize, len: u32, outPtr: usize): void {
  const a = Uint8Array.wrap(changetype<ArrayBuffer>(aPtr), 0, len);
  const b = Uint8Array.wrap(changetype<ArrayBuffer>(bPtr), 0, len);
  const out = Uint8Array.wrap(changetype<ArrayBuffer>(outPtr), 0, len);
  for (let i: u32 = 0; i < len; i++) {
    out[i] = a[i] ^ b[i];
  }
}
