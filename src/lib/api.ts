// The single seam between the UI and the backend (Vercel functions in /api).
import type { City, CurationResult, SearchQuery, WeekFare } from '../shared/types';
import { useSyncExternalStore } from 'react';
import { auth } from './firebase';
import { toSearchParams } from './queryUrl';

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 0,
    public extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

async function authedFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new ApiError('UNAUTHENTICATED', 'Sign in to use flexfare.', 401);
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
  } catch {
    throw new ApiError('NETWORK', 'Could not reach flexfare. Check your connection and try again.');
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new ApiError(String(body.code ?? 'ERROR'), String(body.message ?? 'Something went wrong. Please try again.'), res.status, body);
  }
  return body as T;
}

// --- searches left today (shared by the header pill, search page and results) ---
export interface QuotaInfo {
  used: number;
  limit: number;
  resetsAt?: string;
}
let quota: QuotaInfo | null = null;
const listeners = new Set<() => void>();
export function setQuota(q: QuotaInfo) {
  quota = q;
  listeners.forEach((l) => l());
}
export const useQuota = () =>
  useSyncExternalStore(
    (cb) => (listeners.add(cb), () => listeners.delete(cb)),
    () => quota,
  );

// --- curation (cached per query so list <-> detail doesn't re-run it) ---
const cache = new Map<string, Promise<CurationResult>>();

export function curateRoutes(query: SearchQuery): Promise<CurationResult> {
  const key = toSearchParams(query).toString();
  if (!cache.has(key)) {
    const p = authedFetch<CurationResult>('/api/curate', { method: 'POST', body: JSON.stringify(Object.fromEntries(toRequest(query))) });
    p.then((r) => r.quota && setQuota(r.quota)).catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return cache.get(key)!;
}

/** The request body uses the same field names as the URL, but with numbers as numbers. */
function toRequest(q: SearchQuery): Map<string, unknown> {
  const p = toSearchParams(q);
  return new Map<string, unknown>([...p.entries()].map(([k, v]) => [k, k === 'pax' ? Number(v) : v]));
}

export const weekFares = (from: string, to: string) =>
  authedFetch<{ fares: WeekFare[] }>(`/api/week-fares?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`).then((r) => r.fares);

export const searchCities = (q: string) =>
  authedFetch<{ cities: City[] }>(`/api/places?q=${encodeURIComponent(q)}`).then((r) => r.cities);

export interface RecentSearch {
  id: string;
  query: Record<string, string | number | null>;
  headline: string;
  topPrice: number;
  createdAt: number;
}
export interface Me extends QuotaInfo {
  email: string;
  recent: RecentSearch[];
}
export const getMe = () => authedFetch<Me>('/api/me').then((m) => (setQuota(m), m));
export const deleteAccount = () => authedFetch<{ ok: true }>('/api/me', { method: 'DELETE' });
export const addPhone = (phone: string) => authedFetch<{ ok: true }>('/api/add-phone', { method: 'POST', body: JSON.stringify({ phone }) });
