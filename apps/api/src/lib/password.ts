import {
  randomBytes,
  scrypt,
  timingSafeEqual,
  type ScryptOptions,
} from 'node:crypto';
import { promisify } from 'node:util';

const KEY_LENGTH = 64;
const SCRYPT_OPTIONS = { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;
const DUMMY_SALT = Buffer.alloc(16, 7);

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = (await scryptAsync(password, salt, KEY_LENGTH, SCRYPT_OPTIONS)) as Buffer;
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1] ?? '', 'hex');
  const expected = Buffer.from(parts[2] ?? '', 'hex');
  if (!salt.length || !expected.length) return false;
  const actual = (await scryptAsync(
    password,
    salt,
    expected.length,
    SCRYPT_OPTIONS,
  )) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * Runs the same expensive key derivation as a real verification so that
 * unknown accounts do not respond noticeably faster than existing ones.
 */
export async function verifyDummyPassword(password: string): Promise<void> {
  await scryptAsync(password, DUMMY_SALT, KEY_LENGTH, SCRYPT_OPTIONS);
}
