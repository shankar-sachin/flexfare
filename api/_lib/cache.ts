import { createHash } from 'node:crypto';
import { db } from './firestore.js';

export const hashKey = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 40);

/** Stored as a JSON string so Firestore's nested-array/undefined rules never bite. */
export async function cacheGet<T>(collection: string, key: string, ttlMs: number): Promise<T | null> {
  const snap = await db().collection(collection).doc(key).get();
  const d = snap.data();
  if (!d || typeof d.json !== 'string' || Date.now() - (d.createdAt as number) > ttlMs) return null;
  try {
    return JSON.parse(d.json) as T;
  } catch {
    return null;
  }
}

export async function cacheSet(collection: string, key: string, value: unknown): Promise<void> {
  await db().collection(collection).doc(key).set({ json: JSON.stringify(value), createdAt: Date.now() });
}
