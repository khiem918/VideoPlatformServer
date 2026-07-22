import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import { env } from './env';

/** Mirrors JwtStrategy.validate() (api_service/src/auth/strategy/jwt.strategy.ts),
 * which only requires a `userId` claim plus a valid, non-expired `exp`. */
export function signUserToken(userId: string): string {
  return jwt.sign({ userId }, env.jwtSecret, { expiresIn: '1h' });
}

export async function seedUser(pool: Pool): Promise<string> {
  const userId = `e2e-user-${randomUUID()}`;
  await pool.query(
    'INSERT INTO core."user" (id, user_email) VALUES ($1, $2)',
    [userId, `${userId}@example.com`],
  );
  return userId;
}

export async function cleanupUser(pool: Pool, userId: string): Promise<void> {
  await pool.query('DELETE FROM core."user" WHERE id = $1', [userId]);
}

export async function cleanupVideo(pool: Pool, videoId: string): Promise<void> {
  await pool.query('DELETE FROM core.video WHERE id = $1', [videoId]);
}
