// Reads Firebase configuration from Vite env vars.
// This module intentionally imports no Firebase SDK code so it can be evaluated
// cheaply by the API façade without pulling the SDK into the main bundle.

export function getFirebaseConfig() {
  return {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  };
}

export function isFirebaseConfigured() {
  const { apiKey, projectId, appId } = getFirebaseConfig();
  return Boolean(apiKey && projectId && appId);
}

const DEFAULT_ADMIN_EMAILS = ['admin@swasthya.dev'];

// Comma-separated list in VITE_ADMIN_EMAILS, e.g. "admin@swasthya.dev".
// Only these email addresses are granted the administrator role.
export function getAdminEmails() {
  const raw = import.meta.env.VITE_ADMIN_EMAILS;
  const list = (raw ? raw.split(',') : DEFAULT_ADMIN_EMAILS)
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  return list.length ? list : DEFAULT_ADMIN_EMAILS;
}

export function isAdminEmail(email) {
  return getAdminEmails().includes((email || '').trim().toLowerCase());
}
