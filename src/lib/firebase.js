// Firebase app bootstrap. Only imported by the Firebase-backed API chunk,
// which is loaded lazily when VITE_FIREBASE_* variables are present.

import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFirebaseConfig } from './firebaseConfig.js';

const config = getFirebaseConfig();

if (!config.apiKey || !config.projectId || !config.appId) {
  throw new Error(
    'Firebase is not configured. Set VITE_FIREBASE_API_KEY, VITE_FIREBASE_PROJECT_ID and VITE_FIREBASE_APP_ID.',
  );
}

const app = getApps().length ? getApp() : initializeApp(config);

export const auth = getAuth(app);
export const db = getFirestore(app);
export { app };
