// Firebase web config is public by design. Server secrets never live in VITE_ variables.
// With no config the app still runs: the landing page and demo work, auth pages explain what's missing.
import { initializeApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseConfigured = Boolean(config.apiKey && config.projectId && config.appId);
export const auth: Auth | null = firebaseConfigured ? getAuth(initializeApp(config)) : null;
