import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { readEnv } from '../../env';

const ACCESS_TOKEN_TTL = '15m';

export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function secretKey(): Uint8Array {
  return new TextEncoder().encode(readEnv().sessionSecret);
}

export async function signAccessToken(claims: {
  sub: string;
  sid: string;
  societyId: string;
}): Promise<string> {
  return new SignJWT({ sid: claims.sid, societyId: claims.societyId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_TTL)
    .sign(secretKey());
}

export async function verifyAccessToken(token: string): Promise<{
  sub: string;
  sid: string;
  societyId: string;
}> {
  const { payload } = await jwtVerify(token, secretKey());
  if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') {
    throw new Error('invalid access token');
  }
  if (typeof payload.societyId !== 'string') {
    throw new Error('invalid access token');
  }
  return { sub: payload.sub, sid: payload.sid, societyId: payload.societyId };
}

export const ACCESS_TOKEN_SECONDS = 15 * 60;
export const WEB_SESSION_MS = 12 * 60 * 60 * 1000;
export const MOBILE_REFRESH_MS = 30 * 24 * 60 * 60 * 1000;
