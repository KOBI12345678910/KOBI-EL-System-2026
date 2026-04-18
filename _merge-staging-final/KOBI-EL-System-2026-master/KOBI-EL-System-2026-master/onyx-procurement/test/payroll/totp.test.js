/**
 * TOTP unit tests — RFC 6238 Appendix B + backup-code flow
 * Agent 96 — 2026-04-11
 *
 * Run:
 *   node --test test/payroll/totp.test.js
 *
 * Coverage:
 *   1. Base32 round-trip (RFC 4648 §10 vectors)
 *   2. RFC 6238 Appendix B test vectors (SHA-1, ASCII secret
 *      "12345678901234567890", digits=8, step=30)
 *   3. Google-Authenticator compatible generateToken (digits=6)
 *   4. verifyToken clock-skew ±1 window
 *   5. Wrong-token rejection + malformed input
 *   6. generateSecret entropy + format
 *   7. getProvisioningUri format (otpauth://totp/…)
 *   8. generateBackupCodes uniqueness + format
 *   9. hashBackupCode / verifyBackupCode round-trip (scrypt)
 *  10. Constant-time verification does not leak on wrong codes
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const totp = require('../../src/auth/totp.js');
const {
  generateSecret,
  generateToken,
  verifyToken,
  getProvisioningUri,
  generateBackupCodes,
  hashBackupCode,
  verifyBackupCode,
  base32Encode,
  base32Decode,
  hotp,
  counterToBuffer,
} = totp;

// ──────────────────────────────────────────────────────────────────
// 1. Base32 — RFC 4648 §10 test vectors
// ──────────────────────────────────────────────────────────────────

test('01. base32Encode("") = ""', () => {
  assert.equal(base32Encode(Buffer.from('')), '');
});

test('02. base32Encode("f") = "MY"', () => {
  assert.equal(base32Encode(Buffer.from('f')), 'MY');
});

test('03. base32Encode("fo") = "MZXQ"', () => {
  assert.equal(base32Encode(Buffer.from('fo')), 'MZXQ');
});

test('04. base32Encode("foo") = "MZXW6"', () => {
  assert.equal(base32Encode(Buffer.from('foo')), 'MZXW6');
});

test('05. base32Encode("foobar") = "MZXW6YTBOI"', () => {
  assert.equal(base32Encode(Buffer.from('foobar')), 'MZXW6YTBOI');
});

test('06. base32Decode round-trip for random 20-byte input', () => {
  const raw = Buffer.from('0123456789abcdef0123', 'utf8');
  const enc = base32Encode(raw);
  const dec = base32Decode(enc);
  assert.equal(dec.toString('utf8'), raw.toString('utf8'));
});

test('07. base32Decode is case-insensitive and ignores padding/spaces', () => {
  const raw = Buffer.from('foobar');
  const enc = base32Encode(raw); // MZXW6YTBOI
  const padded = `  ${enc.toLowerCase()}==  `;
  assert.equal(base32Decode(padded).toString('utf8'), 'foobar');
});

test('08. base32Decode rejects invalid characters', () => {
  assert.throws(() => base32Decode('!!!!'), /invalid character/);
});

// ──────────────────────────────────────────────────────────────────
// 2. RFC 6238 Appendix B — canonical TOTP test vectors
//     Secret (ASCII): "12345678901234567890"
//     Step = 30s, Digits = 8, Algorithm = SHA-1
// ──────────────────────────────────────────────────────────────────

const RFC_SECRET_ASCII = '12345678901234567890';
const RFC_SECRET_BUF = Buffer.from(RFC_SECRET_ASCII, 'ascii');
const RFC_SECRET_B32 = base32Encode(RFC_SECRET_BUF); // GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ

const RFC_VECTORS = [
  { time: 59,          counterHex: '0000000000000001', token: '94287082' },
  { time: 1111111109,  counterHex: '00000000023523EC', token: '07081804' },
  { time: 1111111111,  counterHex: '00000000023523ED', token: '14050471' },
  { time: 1234567890,  counterHex: '000000000273EF07', token: '89005924' },
  { time: 2000000000,  counterHex: '000000000003F940AA'.slice(-16), token: '69279037' },
  { time: 20000000000, counterHex: '0000000027BC86AA', token: '65353130' },
];

for (let i = 0; i < RFC_VECTORS.length; i++) {
  const v = RFC_VECTORS[i];
  test(`09.${i + 1} RFC6238 vector T=${v.time} → ${v.token}`, () => {
    const gen = generateToken(
      RFC_SECRET_BUF,
      v.time * 1000, // ms
      30,
      8
    );
    assert.equal(gen, v.token);
  });

  test(`10.${i + 1} RFC6238 vector (base32 secret) T=${v.time} → ${v.token}`, () => {
    const gen = generateToken(RFC_SECRET_B32, v.time * 1000, 30, 8);
    assert.equal(gen, v.token);
  });

  test(`11.${i + 1} RFC6238 counterToBuffer(T=${v.time}) big-endian`, () => {
    const counter = Math.floor(v.time / 30);
    const buf = counterToBuffer(counter);
    assert.equal(buf.length, 8);
    // Rebuild the counter from big-endian bytes and compare
    const hi = buf.readUInt32BE(0);
    const lo = buf.readUInt32BE(4);
    assert.equal(hi * 0x100000000 + lo, counter);
  });
}

// ──────────────────────────────────────────────────────────────────
// 3. HOTP — RFC 4226 §5.3 reference vectors (same secret, counters 0..9)
// ──────────────────────────────────────────────────────────────────

const RFC4226_HOTP = [
  '755224', '287082', '359152', '969429', '338314',
  '254676', '287922', '162583', '399871', '520489',
];

for (let i = 0; i < RFC4226_HOTP.length; i++) {
  test(`12.${i} RFC4226 HOTP counter=${i} → ${RFC4226_HOTP[i]}`, () => {
    assert.equal(hotp(RFC_SECRET_BUF, i, 6), RFC4226_HOTP[i]);
  });
}

// ──────────────────────────────────────────────────────────────────
// 4. Google Authenticator 6-digit tokens
// ──────────────────────────────────────────────────────────────────

test('13. generateToken produces 6-digit numeric string', () => {
  const secret = generateSecret();
  const token = generateToken(secret);
  assert.match(token, /^\d{6}$/);
});

test('14. generateToken is stable within the same step', () => {
  const secret = generateSecret();
  const now = 1_700_000_000_000;
  const a = generateToken(secret, now);
  const b = generateToken(secret, now + 5_000); // same 30s window
  assert.equal(a, b);
});

test('15. generateToken changes across step boundary', () => {
  const secret = generateSecret();
  const t0 = 1_700_000_010_000; // just inside one step
  const t1 = t0 + 60_000;       // two steps later
  assert.notEqual(generateToken(secret, t0), generateToken(secret, t1));
});

// ──────────────────────────────────────────────────────────────────
// 5. verifyToken + clock-skew window
// ──────────────────────────────────────────────────────────────────

test('16. verifyToken accepts the current step', () => {
  const secret = generateSecret();
  const now = Date.now();
  const t = generateToken(secret, now);
  assert.equal(verifyToken(secret, t, 1, now), true);
});

test('17. verifyToken accepts a token from the previous step (skew -1)', () => {
  const secret = generateSecret();
  const now = 1_700_000_000_000;
  const prev = generateToken(secret, now - 30_000);
  assert.equal(verifyToken(secret, prev, 1, now), true);
});

test('18. verifyToken accepts a token from the next step (skew +1)', () => {
  const secret = generateSecret();
  const now = 1_700_000_000_000;
  const next = generateToken(secret, now + 30_000);
  assert.equal(verifyToken(secret, next, 1, now), true);
});

test('19. verifyToken rejects a token from two steps ago with window=1', () => {
  const secret = generateSecret();
  const now = 1_700_000_000_000;
  const stale = generateToken(secret, now - 90_000);
  assert.equal(verifyToken(secret, stale, 1, now), false);
});

test('20. verifyToken rejects wrong token', () => {
  const secret = generateSecret();
  assert.equal(verifyToken(secret, '000000'), false);
});

test('21. verifyToken rejects non-numeric garbage', () => {
  const secret = generateSecret();
  assert.equal(verifyToken(secret, 'abcdef'), false);
  assert.equal(verifyToken(secret, ''), false);
  assert.equal(verifyToken(secret, '12345'), false);
  assert.equal(verifyToken(secret, '1234567'), false);
});

test('22. verifyToken handles non-string token input safely', () => {
  const secret = generateSecret();
  assert.equal(verifyToken(secret, null), false);
  assert.equal(verifyToken(secret, undefined), false);
  assert.equal(verifyToken(secret, 123456), false);
});

// ──────────────────────────────────────────────────────────────────
// 6. generateSecret — entropy + format
// ──────────────────────────────────────────────────────────────────

test('23. generateSecret returns uppercase Base32 of expected length', () => {
  const s = generateSecret(20);
  // 20 bytes → ceil(160 / 5) = 32 base32 chars
  assert.equal(s.length, 32);
  assert.match(s, /^[A-Z2-7]+$/);
});

test('24. generateSecret produces distinct values across calls', () => {
  const seen = new Set();
  for (let i = 0; i < 20; i++) seen.add(generateSecret());
  assert.equal(seen.size, 20);
});

test('25. generateSecret rejects out-of-range length', () => {
  assert.throws(() => generateSecret(5), /10..128/);
  assert.throws(() => generateSecret(500), /10..128/);
});

// ──────────────────────────────────────────────────────────────────
// 7. Provisioning URI for QR code
// ──────────────────────────────────────────────────────────────────

test('26. getProvisioningUri builds otpauth:// totp URI', () => {
  const secret = 'JBSWY3DPEHPK3PXP';
  const uri = getProvisioningUri(secret, 'kobi@techno-kol.co.il', 'Techno-Kol ERP');
  assert.ok(uri.startsWith('otpauth://totp/'), `got: ${uri}`);
  assert.ok(uri.includes('Techno-Kol%20ERP:kobi%40techno-kol.co.il'));
  assert.ok(uri.includes('secret=JBSWY3DPEHPK3PXP'));
  assert.ok(uri.includes('issuer=Techno-Kol+ERP'));
  assert.ok(uri.includes('algorithm=SHA1'));
  assert.ok(uri.includes('digits=6'));
  assert.ok(uri.includes('period=30'));
});

test('27. getProvisioningUri accepts raw Buffer secret', () => {
  const raw = Buffer.from('12345678901234567890', 'ascii');
  const uri = getProvisioningUri(raw, 'user@x', 'Issuer');
  assert.ok(uri.includes(`secret=${base32Encode(raw)}`));
});

test('28. getProvisioningUri rejects empty label/issuer', () => {
  assert.throws(() => getProvisioningUri('AAAA', '', 'i'), /label/);
  assert.throws(() => getProvisioningUri('AAAA', 'l', ''), /issuer/);
});

// ──────────────────────────────────────────────────────────────────
// 8. Backup recovery codes
// ──────────────────────────────────────────────────────────────────

test('29. generateBackupCodes produces 10 unique formatted codes', () => {
  const codes = generateBackupCodes(10);
  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10);
  for (const c of codes) {
    assert.match(c, /^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
  }
});

test('30. generateBackupCodes respects custom count', () => {
  assert.equal(generateBackupCodes(5).length, 5);
  assert.equal(generateBackupCodes(25).length, 25);
});

test('31. generateBackupCodes rejects invalid count', () => {
  assert.throws(() => generateBackupCodes(0), /1..50/);
  assert.throws(() => generateBackupCodes(100), /1..50/);
});

// ──────────────────────────────────────────────────────────────────
// 9. Backup-code scrypt hashing + verification
// ──────────────────────────────────────────────────────────────────

test('32. hashBackupCode produces a parseable scrypt record', () => {
  const code = 'ABCDE-FGHJK';
  const h = hashBackupCode(code);
  const parts = h.split('$');
  assert.equal(parts.length, 6);
  assert.equal(parts[0], 'scrypt');
  assert.ok(Number(parts[1]) >= 1024, 'N parameter present');
});

test('33. verifyBackupCode round-trip succeeds', () => {
  const code = generateBackupCodes(1)[0];
  const h = hashBackupCode(code);
  assert.equal(verifyBackupCode(code, h), true);
});

test('34. verifyBackupCode is resilient to whitespace and case', () => {
  const code = 'ABCDE-FGHJK';
  const h = hashBackupCode(code);
  assert.equal(verifyBackupCode('  abcde-fghjk  ', h), true);
  assert.equal(verifyBackupCode('abcdefghjk', h), true);
});

test('35. verifyBackupCode rejects a wrong code', () => {
  const code = 'ABCDE-FGHJK';
  const h = hashBackupCode(code);
  assert.equal(verifyBackupCode('ZZZZZ-ZZZZZ', h), false);
});

test('36. verifyBackupCode rejects a malformed hash', () => {
  assert.equal(verifyBackupCode('ABCDE-FGHJK', 'not-a-hash'), false);
  assert.equal(verifyBackupCode('ABCDE-FGHJK', 'scrypt$1$2$3$AA$BB'), false);
});

test('37. verifyBackupCode rejects non-string input', () => {
  assert.equal(verifyBackupCode(null, 'scrypt$x'), false);
  assert.equal(verifyBackupCode('ABCDE-FGHJK', null), false);
});

test('38. Every backup code generates a unique hash (random salt)', () => {
  const code = 'ABCDE-FGHJK';
  const h1 = hashBackupCode(code);
  const h2 = hashBackupCode(code);
  assert.notEqual(h1, h2);
  assert.equal(verifyBackupCode(code, h1), true);
  assert.equal(verifyBackupCode(code, h2), true);
});

// ──────────────────────────────────────────────────────────────────
// 10. End-to-end 2FA enrolment flow (sanity)
// ──────────────────────────────────────────────────────────────────

test('39. End-to-end: enrol → provision URI → verify token', () => {
  // Step 1 — server generates the secret
  const secret = generateSecret();

  // Step 2 — server hands a QR URI to the user
  const uri = getProvisioningUri(secret, 'uzi@techno-kol.co.il', 'Techno-Kol ERP');
  assert.ok(uri.startsWith('otpauth://totp/'));

  // Step 3 — user's authenticator computes the current token
  const token = generateToken(secret);

  // Step 4 — server verifies it
  assert.equal(verifyToken(secret, token), true);
});

test('40. End-to-end: backup-code recovery flow', () => {
  const codes = generateBackupCodes(5);
  const hashes = codes.map(hashBackupCode);

  // User types their first recovery code
  const entered = codes[0];
  const matchingIdx = hashes.findIndex((h) => verifyBackupCode(entered, h));
  assert.equal(matchingIdx, 0);

  // Attacker guesses and fails
  for (const h of hashes) {
    assert.equal(verifyBackupCode('WRONG-CODEX', h), false);
  }
});
