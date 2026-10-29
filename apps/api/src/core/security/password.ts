/**
 * Băm và kiểm mật khẩu bằng scrypt (có sẵn trong Node, không cần thư viện ngoài).
 * Định dạng lưu: scrypt$<salt hex>$<hash hex>
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (pwd: string, salt: Buffer, len: number) => Promise<Buffer>;
const KEY_LEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, KEY_LEN);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, saltHex, hashHex] = stored.split('$');
  if (algo !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(expected, actual);
}

/** Khoá API: tạo khoá ngẫu nhiên và băm sha256 để lưu. */
export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const key = `kt_${randomBytes(24).toString('base64url')}`;
  return { key, prefix: key.slice(0, 10), hash: hashApiKey(key) };
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}
