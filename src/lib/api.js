// API façade. Selects the Firebase-backed implementation when VITE_FIREBASE_*
// vars are configured, otherwise falls back to the localStorage mock.
//
// Both implementations are loaded lazily so the Firebase SDK only ships in its
// own chunk and the mock seeds aren't paid for when Firebase is in use.

import { isFirebaseConfigured } from './firebaseConfig.js';

let apiPromise = null;

function loadApi() {
  if (!apiPromise) {
    apiPromise = (isFirebaseConfigured()
      ? import('./firebaseApi.js')
      : import('./mockApi.js')
    ).then((mod) => mod.default);
  }
  return apiPromise;
}

const api = {
  get: (path, opts) => loadApi().then((impl) => impl.get(path, opts)),
  post: (path, body, opts) => loadApi().then((impl) => impl.post(path, body, opts)),
  put: (path, body, opts) => loadApi().then((impl) => impl.put(path, body, opts)),
  patch: (path, body, opts) => loadApi().then((impl) => impl.patch(path, body, opts)),
  delete: (path, opts) => loadApi().then((impl) => impl.delete(path, opts)),

  // Resolves to an unsubscribe function. Used for live message updates.
  subscribe: async (path, onData, onError) => {
    const impl = await loadApi();
    return impl.subscribe(path, onData, onError);
  },
};

export default api;
