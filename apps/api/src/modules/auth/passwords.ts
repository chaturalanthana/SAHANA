import { hash, verify } from '@node-rs/argon2';

/** Argon2id (algorithm 2), the hashing half of TD-07. */
const ARGON2ID = 2;

export function hashPassword(password: string): Promise<string> {
  return hash(password, {
    algorithm: ARGON2ID,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
}

export function verifyPassword(stored: string, password: string): Promise<boolean> {
  return verify(stored, password);
}
