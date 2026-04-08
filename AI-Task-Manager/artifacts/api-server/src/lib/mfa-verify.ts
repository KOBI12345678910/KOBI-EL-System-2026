import crypto from "crypto";

const TOTP_DIGITS = 6;
const TOTP_PERIOD = 30;

function base32Decode(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const buffer: number[] = [];
  let bits = 0, value = 0;
  for (let i = 0; i < input.length; i++) {
    const c = input[i]!;
    if (c === "=") break;
    const idx = alphabet.indexOf(c);
    if (idx === -1) throw new Error("Invalid base32");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      buffer.push((value >>> bits) & 0xff);
    }
  }
  return Buffer.from(buffer);
}

function generateTOTP(secret: string, timestamp = Math.floor(Date.now() / 1000)): string {
  const buffer = base32Decode(secret);
  const counter = BigInt(Math.floor(timestamp / TOTP_PERIOD));
  const hmac = crypto.createHmac("sha1", buffer);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(counter);
  hmac.update(buf);
  const hash = hmac.digest();
  const offset = hash[hash.length - 1]! & 0xf;
  const code = (
    ((hash[offset]! & 0x7f) << 24) |
    ((hash[offset + 1]! & 0xff) << 16) |
    ((hash[offset + 2]! & 0xff) << 8) |
    (hash[offset + 3]! & 0xff)
  ) % Math.pow(10, TOTP_DIGITS);
  return code.toString().padStart(TOTP_DIGITS, "0");
}

export function verifyMfaCode(secret: string, code: string, window = 1): boolean {
  const now = Math.floor(Date.now() / 1000);
  for (let i = -window; i <= window; i++) {
    if (generateTOTP(secret, now + i * TOTP_PERIOD) === code) return true;
  }
  return false;
}
