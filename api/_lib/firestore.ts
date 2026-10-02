import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

function app(): App {
  const existing = getApps()[0];
  if (existing) return existing;
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
  if (!b64) throw new Error('FIREBASE_SERVICE_ACCOUNT_B64 is not set');
  return initializeApp({ credential: cert(JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))) });
}

let configured = false;
export function db() {
  const firestore = getFirestore(app());
  if (!configured) {
    firestore.settings({ ignoreUndefinedProperties: true });
    configured = true;
  }
  return firestore;
}

export const adminAuth = () => getAuth(app());
