// Firebase-backed implementation of the same client API surface exposed by
// the localStorage mock (see mockApi.js). Loaded lazily via lib/api.js when
// VITE_FIREBASE_* variables are configured.

import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { auth, db } from './firebase.js';
import { getAdminEmails, isAdminEmail } from './firebaseConfig.js';
import { isSlotPast } from './scheduling.js';
import { buildNotifications } from './notifications.js';
import { usableAvatar } from './avatar.js';
import {
  INITIAL_ACTIVITIES,
  INITIAL_APPOINTMENTS,
  INITIAL_BILLS,
  INITIAL_DOCTORS,
  INITIAL_MESSAGES,
  INITIAL_PATIENTS,
  INITIAL_RECORDS,
  threadIdFor,
} from './seedData.js';

const AVATAR_DOCTOR = 'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=150&auto=format&fit=crop&q=80';

const nowIso = () => new Date().toISOString();
const makeId = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const makeTxnId = () => `TXN-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;

// Calendar-day key, so two bookings on the same date clash regardless of the
// clock time stored on the appointment. The rule itself lives in
// ./scheduling.js so the Firestore and mock layers cannot drift apart.
const dayKey = (value) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

// Rules enforce the same boundary, but failing here produces a readable message
// instead of a raw PERMISSION_DENIED from the SDK. The message names the signed-in
// address because the allowlist is matched on email: signing in with any other
// account looks identical on screen but fails every administrator-only call.
function assertAdmin(user) {
  if (user?.role === 'ADMIN') return;
  const signedIn = user?.email ? `"${user.email}"` : 'no account';
  throw new Error(
    `Administrator access required. You are signed in as ${signedIn}, but admin access is only granted to ${getAdminEmails().join(', ')}. Sign out and log in with that address.`
  );
}

function roleForEmail(email = '') {
  return isAdminEmail(email) ? 'ADMIN' : 'PATIENT';
}

async function waitForUser() {
  if (typeof auth.authStateReady === 'function') {
    await auth.authStateReady();
  }
  return auth.currentUser;
}

async function getDocData(col, id) {
  const snap = await getDoc(doc(db, col, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

async function getCollection(col) {
  const snap = await getDocs(collection(db, col));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function getPatients() {
  const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'PATIENT')));
  // Filtered on read so accounts created before patients lost their stock photo
  // show initials too, without waiting for the seed to rewrite the document.
  return snap.docs.map((d) => ({ id: d.id, ...d.data(), avatar: usableAvatar(d.data().avatar) }));
}

async function getDoctors() {
  const snap = await getDocs(collection(db, 'doctors'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Mirrors the isOwner() rule: a message belongs to the patient whose account id
// or email it carries.
function isMessageOwner(message, user) {
  if (!user) return false;
  return (
    message?.patientId === user.id ||
    (message?.patient?.email ?? '').toLowerCase() === (user.email ?? '').toLowerCase()
  );
}

// Records carry the doctor who issued them, mirroring how appointments store
// `doctorId` plus a denormalised `doctor` summary.
const DEFAULT_RECORD_DOCTOR = { id: null, name: 'Hospital Doctor', specialty: null, avatar: null };

async function resolveRecordDoctor(doctorId, fallback) {
  if (!doctorId) return fallback ?? DEFAULT_RECORD_DOCTOR;
  const match = (await getDoctors()).find((d) => d.id === doctorId);
  if (!match) return fallback ?? DEFAULT_RECORD_DOCTOR;
  return { id: match.id, name: match.name, specialty: match.specialty ?? null, avatar: match.avatar ?? null };
}

// Rules scope a patient's reads to their own rows, so a patient's collection is
// fetched with two single-field queries (their uid and their email) rather than
// reading everything and filtering on the client.
function ownedQueries(col, user) {
  const list = [query(collection(db, col), where('patientId', '==', user.id))];
  if (user.email) {
    list.push(query(collection(db, col), where('patient.email', '==', user.email)));
  }
  return list;
}

async function getOwnedCollection(col, user) {
  const snaps = await Promise.all(ownedQueries(col, user).map((q) => getDocs(q)));
  const merged = new Map();
  snaps.forEach((snap) => snap.docs.forEach((d) => merged.set(d.id, { id: d.id, ...d.data() })));
  return [...merged.values()];
}

// The messages in one thread, read in a way the caller's rules actually permit.
// A bare `where('threadId' == ...)` is rejected for a patient: Firestore only
// allows a query when its filter proves every possible result is readable, and
// a threadId says nothing about ownership. An admin may read any thread.
async function getThreadMessages(threadId, user) {
  if (user?.role === 'ADMIN') {
    const snap = await getDocs(query(collection(db, 'messages'), where('threadId', '==', threadId)));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  const owned = await getOwnedCollection('messages', user);
  return owned.filter((m) => m.threadId === threadId);
}

// Live view of the same data. Returns an unsubscribe function.
function subscribeOwned(col, user, onData, onError) {
  let disposed = false;
  const push = () => {
    if (disposed) return;
    getOwnedCollection(col, user).then(
      (rows) => {
        if (!disposed) onData(rows);
      },
      (err) => {
        if (!disposed) onError?.(err);
      }
    );
  };
  const unsubs = ownedQueries(col, user).map((q) => onSnapshot(q, push, onError));
  push();
  return () => {
    disposed = true;
    unsubs.forEach((u) => u());
  };
}

function subscribeAll(col, onData, onError) {
  return onSnapshot(
    collection(db, col),
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onError
  );
}

// SLOT AVAILABILITY
// Booked slots are mirrored into a `takenSlots` collection keyed by doctor and
// calendar day. It holds no patient data, so any signed-in user may read it to
// grey out unavailable times without being able to read other patients'
// appointments.
const takenSlotId = (doctorId, date) => `${doctorId}__${dayKey(date)}`;

async function readTakenSlots(doctorId, date) {
  const snap = await getDoc(doc(db, 'takenSlots', takenSlotId(doctorId, date)));
  return snap.exists() ? snap.data().slots ?? [] : [];
}

// Claims a slot inside a transaction. Firestore retries a transaction whose
// document changed underneath it, so when two patients submit the same slot at
// the same moment exactly one wins and the other is told to pick another time.
// A plain read-then-write would let both succeed.
async function reserveSlot(doctorId, date, slot) {
  const ref = doc(db, 'takenSlots', takenSlotId(doctorId, date));
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const slots = snap.exists() ? snap.data().slots ?? [] : [];
    if (slots.includes(slot)) return false;
    tx.set(ref, { doctorId, date: dayKey(date), slots: [...slots, slot] }, { merge: true });
    return true;
  });
}

async function releaseSlot(doctorId, date, slot) {
  const ref = doc(db, 'takenSlots', takenSlotId(doctorId, date));
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const slots = (snap.data().slots ?? []).filter((s) => s !== slot);
  await setDoc(ref, { slots }, { merge: true });
}

async function deleteWhere(col, field, value) {
  const snap = await getDocs(query(collection(db, col), where(field, '==', value)));
  if (snap.empty) return;
  const batch = writeBatch(db);
  snap.docs.forEach((item) => batch.delete(item.ref));
  await batch.commit();
}

async function assertNotBlocked(email) {
  if (!email) return;
  const snap = await getDoc(doc(db, 'blockedUsers', email.toLowerCase()));
  if (snap.exists()) {
    throw new Error('This account has been removed by the hospital.');
  }
}

async function ensureProfile(firebaseUser, overrides = {}) {
  const existing = await getDocData('users', firebaseUser.uid);
  const role = roleForEmail(firebaseUser.email ?? '');

  if (existing) {
    // Never trust a stored role — recompute it from the admin allowlist so a
    // user cannot grant themselves administrator access by editing their doc.
    if (existing.role !== role) {
      await setDoc(doc(db, 'users', firebaseUser.uid), { role }, { merge: true });
    }
    return { ...existing, role, avatar: usableAvatar(existing.avatar) };
  }

  const profile = {
    id: firebaseUser.uid,
    name: overrides.name ?? firebaseUser.displayName ?? (role === 'ADMIN' ? 'Dr. Admin' : 'Patient User'),
    email: firebaseUser.email ?? overrides.email ?? '',
    role,
    phone: overrides.phone ?? '+977 98012 34567',
    address: overrides.address ?? 'Biratnagar, Nepal',
    // No stock photo for anyone: the UI falls back to name initials, which
    // cannot be the wrong person.
    avatar: '',
    createdAt: nowIso(),
  };
  await setDoc(doc(db, 'users', firebaseUser.uid), profile);
  return profile;
}

// Seed Firestore once so the app is not empty on first run. Requires an
// authenticated session (see firestore.rules); failures are non-fatal.
let seedPromise = null;
function ensureSeeded(user) {
  // Only administrators may write the demo patient profiles, so only seed
  // when an admin is signed in.
  if (user?.role !== 'ADMIN') return Promise.resolve(null);
  if (!seedPromise) {
    seedPromise = seedFirestore().catch((err) => {
      console.warn('[firebase] seed skipped:', err?.message ?? err);
      return null;
    });
  }
  return seedPromise;
}

// Bump this whenever seedData.js changes so existing projects pick up new rows.
const SEED_VERSION = 11;

async function seedFirestore() {
  const markerRef = doc(db, 'meta', 'bootstrap');
  const marker = await getDoc(markerRef);
  if (marker.exists() && marker.data().version === SEED_VERSION) return;

  const batch = writeBatch(db);
  INITIAL_DOCTORS.forEach((item) => batch.set(doc(db, 'doctors', item.id), item));
  INITIAL_PATIENTS.forEach((item) =>
    batch.set(doc(db, 'users', item.id), { ...item, role: 'PATIENT', createdAt: nowIso() }),
  );
  INITIAL_APPOINTMENTS.forEach((item) => batch.set(doc(db, 'appointments', item.id), item));
  INITIAL_BILLS.forEach((item) => batch.set(doc(db, 'bills', item.id), item));
  INITIAL_RECORDS.forEach((item) => batch.set(doc(db, 'records', item.id), item));
  INITIAL_ACTIVITIES.forEach((item) => batch.set(doc(db, 'activities', item.id), item));
  // Seeded messages are overwritten so legacy fields (the removed doctor keys)
// disappear, but the per-view state a user has since created must survive that
// overwrite: a re-seed would otherwise resurrect every deleted message and
// reset every read receipt.
const priorMessages = new Map((await getCollection('messages')).map((m) => [m.id, m]));
INITIAL_MESSAGES.forEach((item) => {
  const prior = priorMessages.get(item.id);
  batch.set(doc(db, 'messages', item.id), {
    ...item,
    hiddenFor: prior?.hiddenFor ?? [],
    readAt: prior?.readAt ?? null,
  });
});

  // Mirror the seeded bookings into takenSlots so the booking form shows them
  // as unavailable straight after seeding.
  const seededSlots = new Map();
  INITIAL_APPOINTMENTS.forEach((item) => {
    if (item.status === 'CANCELLED') return;
    const id = takenSlotId(item.doctorId, item.date);
    if (!seededSlots.has(id)) {
      seededSlots.set(id, { doctorId: item.doctorId, date: dayKey(item.date), slots: [] });
    }
    seededSlots.get(id).slots.push(item.slot);
  });
  seededSlots.forEach((entry, id) => {
    batch.set(doc(db, 'takenSlots', id), {
      doctorId: entry.doctorId,
      date: entry.date,
      slots: [...new Set(entry.slots)],
    });
  });

  batch.set(markerRef, { seededAt: nowIso(), version: SEED_VERSION });
  await batch.commit();
}

function authErrorMessage(err) {
  switch (err?.code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
      return 'Incorrect email or password. New here? Create an account first.';
    case 'auth/user-not-found':
      return 'No account found for that email. Create an account first.';
    case 'auth/email-already-in-use':
      return 'That email is already registered. Try signing in instead.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a minute and try again.';
    case 'auth/network-request-failed':
      return 'Network error. Check your internet connection and try again.';
    default:
      return err?.message || 'Something went wrong. Please try again.';
  }
}

async function withAuthErrors(run) {
  try {
    return await run();
  } catch (err) {
    const friendly = new Error(authErrorMessage(err));
    friendly.code = err?.code;
    throw friendly;
  }
}

async function clientRequest(method, path, body = {}) {
  const cleanPath = path.replace(/^\/api/, '').replace(/^\//, '');

  // AUTH ROUTES
  if (cleanPath === 'auth/me') {
    const firebaseUser = await waitForUser();
    if (!firebaseUser) throw new Error('Not authenticated');
    await assertNotBlocked(firebaseUser.email);
    const user = await ensureProfile(firebaseUser);
    return { data: { user } };
  }

  if (cleanPath === 'auth/login') {
    return withAuthErrors(async () => {
      const cred = await signInWithEmailAndPassword(auth, (body.email || '').trim(), body.password);
      try {
        await assertNotBlocked(cred.user.email);
      } catch (blocked) {
        await signOut(auth);
        throw blocked;
      }
      const user = await ensureProfile(cred.user, { email: body.email });
      return { data: { user, token: await cred.user.getIdToken() } };
    });
  }

  if (cleanPath === 'auth/register') {
    return withAuthErrors(async () => {
      if (isAdminEmail(body.email)) {
        throw new Error('Administrator accounts are created by the hospital. Please sign in instead.');
      }
      const cred = await createUserWithEmailAndPassword(auth, (body.email || '').trim(), body.password);
      try {
        await assertNotBlocked(cred.user.email);
      } catch (blocked) {
        await signOut(auth);
        throw blocked;
      }
      if (body.name) await updateProfile(cred.user, { displayName: body.name });
      const user = await ensureProfile(cred.user, { name: body.name, phone: body.phone, email: body.email });
      return { data: { user, message: 'Account created successfully' } };
    });
  }

  if (cleanPath === 'auth/logout') {
    await signOut(auth);
    return { data: { message: 'Logged out successfully' } };
  }

  if (cleanPath === 'auth/reset-password') {
    return withAuthErrors(async () => {
      await sendPasswordResetEmail(auth, (body.email || '').trim());
      return { data: { message: 'Password reset email sent' } };
    });
  }

  if (cleanPath === 'auth/verify') {
    const firebaseUser = await waitForUser();
    if (!firebaseUser) throw new Error('Not authenticated');
    await assertNotBlocked(firebaseUser.email);
    await firebaseUser.reload();
    const user = await ensureProfile(firebaseUser);
    return { data: { user, message: auth.currentUser?.emailVerified ? 'Verified' : 'Not verified' } };
  }

  if (cleanPath === 'auth/resend-verification') {
    const firebaseUser = await waitForUser();
    if (firebaseUser) await sendEmailVerification(firebaseUser);
    return { data: { message: 'Verification email sent' } };
  }

  // Resolve the signed-in user for all remaining routes.
  const firebaseUser = await waitForUser();
  const storedProfile = firebaseUser ? await getDocData('users', firebaseUser.uid) : null;
  const user = firebaseUser
    ? {
        ...(storedProfile ?? {}),
        id: firebaseUser.uid,
        name: storedProfile?.name ?? firebaseUser.displayName ?? 'User',
        email: storedProfile?.email ?? firebaseUser.email ?? '',
        role: roleForEmail(firebaseUser.email ?? ''),
        phone: storedProfile?.phone ?? '',
        address: storedProfile?.address ?? '',
        avatar: usableAvatar(storedProfile?.avatar),
      }
    : null;

  if (cleanPath === 'users/me') {
    if (method === 'PUT') {
      if (!firebaseUser) throw new Error('Not authenticated');
      await setDoc(doc(db, 'users', firebaseUser.uid), body, { merge: true });
      if (body.name) await updateProfile(firebaseUser, { displayName: body.name });
      return { data: await getDocData('users', firebaseUser.uid) };
    }
    return { data: user };
  }

  // Remove a patient (administrator only): profile, their data, and block the
  // email so the account cannot be recreated from the browser.
  if (cleanPath.startsWith('users/') && method === 'DELETE') {
    if (user?.role !== 'ADMIN') throw new Error('Only administrators can remove patients.');
    const userId = cleanPath.split('/')[1];
    const target = await getDocData('users', userId);
    const email = (target?.email ?? '').toLowerCase();
    await Promise.all(
      [
        ['appointments', 'patientId', userId],
        ['bills', 'patientId', userId],
        ['records', 'patientId', userId],
        email ? ['appointments', 'patient.email', email] : null,
        email ? ['bills', 'patient.email', email] : null,
        email ? ['records', 'patient.email', email] : null,
      ]
        .filter(Boolean)
        .map(([col, field, value]) => deleteWhere(col, field, value)),
    );
    if (email) {
      await setDoc(doc(db, 'blockedUsers', email), {
        email,
        reason: 'Removed by hospital',
        blockedAt: nowIso(),
      });
    }
    await deleteDoc(doc(db, 'users', userId));
    return { data: { message: 'Patient removed' } };
  }

  // NOTIFICATIONS
  // Derived from the caller's own rows rather than stored, so an entry always
  // reflects something that actually happened.
  if (cleanPath === 'notifications') {
    await ensureSeeded(user);
    const isAdmin = user?.role === 'ADMIN';
    const [appointments, bills, records, messages] = await Promise.all([
      isAdmin ? getCollection('appointments') : getOwnedCollection('appointments', user),
      isAdmin ? getCollection('bills') : getOwnedCollection('bills', user),
      isAdmin ? getCollection('records') : getOwnedCollection('records', user),
      isAdmin ? getCollection('messages') : getOwnedCollection('messages', user),
    ]);
    return {
      data: {
        items: buildNotifications({
          role: user?.role ?? 'PATIENT',
          appointments,
          bills,
          records,
          messages,
        }),
      },
    };
  }

  // DASHBOARD DATA
  if (cleanPath === 'users/dashboard') {
    await ensureSeeded(user);
    const isAdmin = user?.role === 'ADMIN';
    // Rules scope a patient to their own rows, so a patient must query their
    // own documents rather than fetching everything and filtering.
    const [allApps, allBills, allRecords, allActivities] = await Promise.all([
      isAdmin ? getCollection('appointments') : getOwnedCollection('appointments', user),
      isAdmin ? getCollection('bills') : getOwnedCollection('bills', user),
      isAdmin ? getCollection('records') : getOwnedCollection('records', user),
      getCollection('activities'),
    ]);
    const userApps = allApps;
    const userBills = allBills;
    const userRecords = allRecords;

    return {
      data: {
        upcomingCount: userApps.filter((a) => a.status === 'CONFIRMED' || a.status === 'PENDING').length,
        consultationsCount: userApps.filter((a) => a.status === 'CONFIRMED' || a.status === 'COMPLETED').length,
        totalBills: userBills.reduce((acc, b) => acc + (b.amount || 0), 0),
        recordsCount: userRecords.length,
        appointments: userApps.slice(0, 5),
        activities: allActivities.slice(0, 5),
      },
    };
  }

  // DOCTORS
  if (cleanPath === 'doctors') {
    await ensureSeeded(user);
    if (method === 'POST') {
      assertAdmin(user);
      const id = makeId('doc');
      const newDoc = { id, avatar: AVATAR_DOCTOR, ...body, createdAt: nowIso() };
      await setDoc(doc(db, 'doctors', id), newDoc);
      return { data: newDoc };
    }
    return { data: await getCollection('doctors') };
  }

  if (cleanPath.startsWith('doctors/')) {
    assertAdmin(user);
    const docId = cleanPath.split('/')[1];
    if (method === 'PUT') {
      await setDoc(doc(db, 'doctors', docId), body, { merge: true });
      return { data: await getDocData('doctors', docId) };
    }
    if (method === 'DELETE') {
      await deleteDoc(doc(db, 'doctors', docId));
      return { data: { message: 'Doctor deleted' } };
    }
  }

  // APPOINTMENTS
  if (cleanPath === 'appointments/my') {
    await ensureSeeded(user);
    const allApps = await getOwnedCollection('appointments', user);
    if (user?.role === 'ADMIN') return { data: await getCollection('appointments') };
    return { data: allApps };
  }

  if (cleanPath === 'appointments/all') {
    assertAdmin(user);
    await ensureSeeded(user);
    return { data: await getCollection('appointments') };
  }

  // SLOT AVAILABILITY
  if (cleanPath === 'appointments/slots') {
    return { data: { taken: await readTakenSlots(body.doctorId, body.date) } };
  }

  if (cleanPath === 'appointments' && method === 'POST') {
    if (!firebaseUser) throw new Error('Not authenticated');
    const docs = await getCollection('doctors');
    const doctor = docs.find((d) => d.id === body.doctorId) || { name: 'Hospital Doctor', specialty: 'General' };
    const date = body.date || nowIso();
    const slot = body.slot || '10:30 AM';

    // A slot that has already started, or is about to, cannot be booked. Checked
    // here as well as in the form, because the form can be left open past the
    // time it was filled in at, or submitted directly.
    if (isSlotPast(date, slot)) {
      throw new Error(
        'That time has already passed. Please choose a later slot or another day.'
      );
    }

    // Claim the slot atomically. The transaction is what makes a double
    // booking impossible: two simultaneous submissions cannot both observe the
    // slot as free.
    const claimed = await reserveSlot(body.doctorId, date, slot);
    if (!claimed) {
      throw new Error('That time slot has already been booked. Please choose another one.');
    }

    const id = makeId('app');
    const newApp = {
      id,
      patientId: user?.id,
      patient: { name: user?.name || 'Patient', email: user?.email || 'patient@gmail.com' },
      doctorId: body.doctorId,
      doctor,
      date,
      slot,
      status: 'PAYMENT_PENDING',
      fee: Number(doctor.fee) || 0,
      reason: body.reason || 'General Consultation',
      createdAt: nowIso(),
    };

    try {
      await setDoc(doc(db, 'appointments', id), newApp);
    } catch (err) {
      // Do not leave the slot blocked by a booking that was never stored.
      await releaseSlot(body.doctorId, date, slot).catch(() => {});
      throw err;
    }

    const actId = makeId('act');
    await setDoc(doc(db, 'activities', actId), {
      id: actId,
      action: 'BOOK_APPOINTMENT',
      detail: `Booked with ${doctor.name}`,
      createdAt: nowIso(),
    });
    return { data: newApp };
  }

  if (cleanPath.startsWith('appointments/') && cleanPath.endsWith('/cancel')) {
    const appId = cleanPath.split('/')[1];
    const current = await getDocData('appointments', appId);
    await setDoc(doc(db, 'appointments', appId), { status: 'CANCELLED' }, { merge: true });
    if (current?.doctorId && current?.date && current?.slot) {
      await releaseSlot(current.doctorId, current.date, current.slot);
    }
    return { data: await getDocData('appointments', appId) };
  }

  if (cleanPath.startsWith('appointments/') && cleanPath.endsWith('/status')) {
    assertAdmin(user);
    const appId = cleanPath.split('/')[1];
    await setDoc(doc(db, 'appointments', appId), { status: body.status, statusUpdatedAt: nowIso() }, { merge: true });
    return { data: await getDocData('appointments', appId) };
  }

  if (cleanPath.startsWith('appointments/') && cleanPath.endsWith('/pay')) {
    const appId = cleanPath.split('/')[1];
    const app = await getDocData('appointments', appId);
    if (!app) throw new Error('Appointment not found.');
    const paidAt = nowIso();
    const amount = Number(body.amount) || Number(app.fee) || 0;
    const payment = {
      txnId: body.txnId || makeTxnId(),
      method: body.methodLabel || body.method || 'eSewa',
      amount,
      paidAt,
      patientName: app.patient?.name || user?.name || 'Patient',
      patientEmail: app.patient?.email || user?.email || '',
      doctorName: app.doctor?.name || 'Doctor',
      appointmentDate: app.date,
      appointmentSlot: app.slot || '',
    };
    await setDoc(
      doc(db, 'appointments', appId),
      { status: 'CONFIRMED', paid: true, payment },
      { merge: true }
    );

    const billId = makeId('bill');
    await setDoc(doc(db, 'bills', billId), {
      id: billId,
      patientId: app.patientId || user?.id,
      patient: app.patient,
      amount,
      description: `${payment.doctorName} · Consultation fee`,
      method: payment.method,
      txnId: payment.txnId,
      appointmentId: appId,
      status: 'PAID',
      createdAt: paidAt,
      paidAt,
    });

    const actId = makeId('act');
    await setDoc(doc(db, 'activities', actId), {
      id: actId,
      action: 'PAYMENT_SUCCESSFUL',
      detail: `${payment.txnId} · ${payment.method}`,
      createdAt: paidAt,
    });

    return { data: { ...app, status: 'CONFIRMED', paid: true, payment } };
  }

  // BILLS
  if (cleanPath === 'bills/my') {
    await ensureSeeded(user);
    if (user?.role === 'ADMIN') return { data: await getCollection('bills') };
    return { data: await getOwnedCollection('bills', user) };
  }

  if (cleanPath === 'bills/all') {
    assertAdmin(user);
    await ensureSeeded(user);
    return { data: await getCollection('bills') };
  }

  if (cleanPath === 'bills' && method === 'POST') {
    assertAdmin(user);
    const patients = await getPatients();
    const patient = patients.find((p) => p.id === body.patientId) || { name: 'Patient' };
    const id = makeId('bill');
    const newBill = {
      id,
      patientId: body.patientId,
      patient,
      amount: Number(body.amount) || 500,
      status: 'PENDING',
      createdAt: nowIso(),
    };
    await setDoc(doc(db, 'bills', id), newBill);
    return { data: newBill };
  }

  if (cleanPath.startsWith('bills/') && cleanPath.endsWith('/pay')) {
    const billId = cleanPath.split('/')[1];
    await setDoc(doc(db, 'bills', billId), { status: 'PAID', paidAt: nowIso() }, { merge: true });
    return { data: await getDocData('bills', billId) };
  }

  // MESSAGES (patient <-> doctor chat)
  if (cleanPath === 'messages/my') {
    await ensureSeeded(user);
    if (user?.role === 'ADMIN') return { data: await getCollection('messages') };
    const rows = await getOwnedCollection('messages', user);
    return { data: rows.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))) };
  }

  if (cleanPath === 'messages/all') {
    assertAdmin(user);
    await ensureSeeded(user);
    const all = await getCollection('messages');
    return {
      data: all.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))),
    };
  }

  if (cleanPath === 'messages' && method === 'POST') {
    if (!firebaseUser) throw new Error('Not authenticated');
    const text = String(body.text ?? '').trim();
    if (!text) throw new Error('Message cannot be empty.');

    const isAdmin = user?.role === 'ADMIN';
    const patientId = isAdmin ? body.patientId : user?.id;
    // Only an administrator may enumerate patients; a patient is describing
    // themselves and must not read other people's profiles.
    const patients = isAdmin ? await getPatients() : [];

    // Prefer the denormalised snapshot the caller already holds. Re-deriving the
    // patient from the directory can lose the email, and the thread key is built
    // from it, so a reply would otherwise land in a different conversation.
    const fallback = body.patient ?? { id: patientId, name: 'Patient', email: '' };
    const patient = isAdmin
      ? patients.find((p) => p.id === patientId) || fallback
      : {
          id: user?.id,
          name: user?.name || 'Patient',
          email: user?.email || '',
          avatar: usableAvatar(user?.avatar),
        };

    // A reply must stay in the thread it was written from. Only an admin may
    // name a thread directly; a patient always gets their own derived one.
    const threadId =
      isAdmin && body.threadId ? String(body.threadId) : threadIdFor(patientId, patient.email);

    const id = makeId('msg');
    const message = {
      id,
      // One conversation per patient: no doctor is stored on the message, since
      // the hospital desk answers regardless of who the enquiry concerns.
      threadId,
      patientId,
      patient: { id: patient.id, name: patient.name, email: patient.email, avatar: usableAvatar(patient.avatar) },
      sender: isAdmin ? 'HOSPITAL' : 'PATIENT',
      senderName: isAdmin ? 'Hospital team' : (patient.name || user.name || 'Patient'),
      text,
      readAt: null,
      // Which views this message has been hidden from. Per-side, so the other
      // party and the clinical record keep it.
      hiddenFor: [],
      createdAt: nowIso(),
    };
    await setDoc(doc(db, 'messages', id), message);
    return { data: message };
  }

  // Hide a whole conversation from one party's own view. Same per-side rule as
  // deleting a single message, applied across the thread, so it cannot become a
  // way around that guarantee. Checked before the single-message route, whose
  // path pattern would otherwise match this one.
  if (cleanPath === 'messages/thread/visibility' && method === 'POST') {
    if (!firebaseUser) throw new Error('Not authenticated');
    const threadId = body.threadId;
    if (!threadId) throw new Error('That conversation no longer exists.');

    const isAdmin = user?.role === 'ADMIN';
    const rows = await getThreadMessages(threadId, user);
    if (!rows.length) throw new Error('That conversation no longer exists.');
    if (!isAdmin && !rows.every((m) => isMessageOwner(m, user))) {
      throw new Error('You can only hide your own conversations.');
    }

    const side = isAdmin ? 'HOSPITAL' : 'PATIENT';
    const batch = writeBatch(db);
    let hidden = 0;
    rows.forEach((m) => {
      const hiddenFor = Array.from(new Set([...(m.hiddenFor ?? []), side]));
      if (hiddenFor.length === (m.hiddenFor ?? []).length) return;
      batch.set(doc(db, 'messages', m.id), { hiddenFor }, { merge: true });
      hidden += 1;
    });
    if (hidden) await batch.commit();
    return { data: { threadId, hidden } };
  }

  // Hide a message from one party's own view. The row is kept so the other side
  // and the clinical record still hold it; `hiddenFor` records whose view it is
  // missing from. A patient can only ever add their own side.
  if (cleanPath.startsWith('messages/') && cleanPath.endsWith('/visibility') && method === 'POST') {
    if (!firebaseUser) throw new Error('Not authenticated');
    const messageId = cleanPath.split('/')[1];
    const existing = await getDocData('messages', messageId);
    if (!existing) throw new Error('That message no longer exists.');

    const isAdmin = user?.role === 'ADMIN';
    if (!isAdmin && !isMessageOwner(existing, user)) {
      throw new Error('You can only hide your own messages.');
    }
    const side = isAdmin ? 'HOSPITAL' : 'PATIENT';
    const hiddenFor = Array.from(new Set([...(existing.hiddenFor ?? []), side]));
    await setDoc(doc(db, 'messages', messageId), { hiddenFor }, { merge: true });
    return { data: { id: messageId, hiddenFor } };
  }

  if (cleanPath === 'messages/read' && method === 'POST') {
    const threadId = body.threadId;
    if (!threadId || !firebaseUser) return { data: { updated: 0 } };
    const stamp = nowIso();
    const batch = writeBatch(db);
    let updated = 0;
    // Scoped to the caller's own messages, never by threadId alone: Firestore
    // rejects a query whose filter cannot prove every returned document is
    // readable, so an unscoped thread lookup fails for patients.
    (await getThreadMessages(threadId, user)).forEach((m) => {
      if (!m.readAt) {
        batch.set(doc(db, 'messages', m.id), { readAt: stamp }, { merge: true });
        updated += 1;
      }
    });
    if (updated) await batch.commit();
    return { data: { updated } };
  }

  // MEDICAL RECORDS
  if (cleanPath === 'records/my') {
    await ensureSeeded(user);
    if (user?.role === 'ADMIN') return { data: await getCollection('records') };
    return { data: await getOwnedCollection('records', user) };
  }

  if (cleanPath === 'records/all') {
    assertAdmin(user);
    await ensureSeeded(user);
    return { data: await getCollection('records') };
  }

  if (cleanPath === 'records' && method === 'POST') {
    assertAdmin(user);
    const patients = await getPatients();
    const patient = patients.find((p) => p.id === body.patientId) || { name: 'Patient' };
    const doctor = await resolveRecordDoctor(body.doctorId);
    const id = makeId('rec');
    const newRecord = {
      id,
      patientId: body.patientId,
      patient,
      doctorId: doctor.id,
      doctor,
      title: body.title || 'Medical Report',
      type: body.type || 'General',
      description: body.description || '',
      createdAt: nowIso(),
    };
    await setDoc(doc(db, 'records', id), newRecord);
    return { data: newRecord };
  }

  // Edit an existing report. Administrators only: a patient must never be able
  // to alter a medical record, which the Firestore rules also enforce.
  if (cleanPath.startsWith('records/') && (method === 'PUT' || method === 'PATCH')) {
    assertAdmin(user);
    const recordId = cleanPath.split('/')[1];
    const existing = await getDocData('records', recordId);
    if (!existing) throw new Error('That report no longer exists.');

    const patients = body.patientId ? await getPatients() : [];
    // Reassigning the report is optional; keeping the original owner when the
    // patient is left untouched preserves who the record belongs to.
    const patient =
      body.patientId && body.patientId !== existing.patientId
        ? patients.find((p) => p.id === body.patientId) || existing.patient
        : existing.patient;

    // Only re-resolve the doctor when the admin actually picked a different one,
    // so an unchanged field never falls back to the default placeholder.
    const doctor =
      body.doctorId && body.doctorId !== existing.doctorId
        ? await resolveRecordDoctor(body.doctorId, existing.doctor)
        : existing.doctor || DEFAULT_RECORD_DOCTOR;

    const patch = {
      title: body.title?.trim() || existing.title,
      type: body.type || existing.type,
      description: body.description ?? existing.description,
      patient,
      doctorId: doctor.id ?? existing.doctorId ?? null,
      doctor,
      updatedAt: nowIso(),
    };
    await setDoc(doc(db, 'records', recordId), patch, { merge: true });
    return { data: await getDocData('records', recordId) };
  }

  if (cleanPath.startsWith('records/') && method === 'DELETE') {
    assertAdmin(user);
    const recordId = cleanPath.split('/')[1];
    const existing = await getDocData('records', recordId);
    if (!existing) throw new Error('That report no longer exists.');
    await deleteDoc(doc(db, 'records', recordId));
    return { data: { message: 'Report deleted', id: recordId } };
  }

  // PATIENTS
  if (cleanPath === 'users/patients') {
    assertAdmin(user);
    await ensureSeeded(user);
    return { data: await getPatients() };
  }

  // ADMIN STATS
  if (cleanPath === 'admin/stats') {
    assertAdmin(user);
    await ensureSeeded(user);
    const [docs, patients, allApps, allBills, acts] = await Promise.all([
      getCollection('doctors'),
      getPatients(),
      getCollection('appointments'),
      getCollection('bills'),
      getCollection('activities'),
    ]);
    return {
      data: {
        totalPatients: patients.length,
        totalDoctors: docs.length,
        totalAppointments: allApps.length,
        pendingApps: allApps.filter((a) => a.status === 'PENDING').length,
        totalRevenue: allBills.filter((b) => b.status === 'PAID').reduce((sum, b) => sum + (b.amount || 0), 0),
        recentActivity: acts,
      },
    };
  }

  // Fallback
  return { data: null, status: 200 };
}

// Live message stream. `path` is either /messages/my or /messages/all.
async function clientSubscribe(path, onData, onError) {
  const firebaseUser = await waitForUser();
  if (!firebaseUser) {
    onError?.(new Error('Not authenticated'));
    return () => {};
  }
  const email = firebaseUser.email ?? '';
  const isAdmin = isAdminEmail(email);
  const user = {
    id: firebaseUser.uid,
    email,
    name: firebaseUser.displayName || 'User',
    role: isAdminEmail(email) ? 'ADMIN' : 'PATIENT',
  };

  try {
    await ensureSeeded(user);
  } catch (err) {
    onError?.(err);
    return () => {};
  }

  const source = path.replace('/messages/', '').replace('messages/', '');
  const sink = (rows) =>
    onData(rows.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))));

  if (source === 'all' || isAdmin) return subscribeAll('messages', sink, onError);
  return subscribeOwned('messages', user, sink, onError);
}

const api = {
  get: (path, opts) => clientRequest('GET', path, opts),
  post: (path, body, opts) => clientRequest('POST', path, body, opts),
  put: (path, body, opts) => clientRequest('PUT', path, body, opts),
  patch: (path, body, opts) => clientRequest('PATCH', path, body, opts),
  delete: (path, opts) => clientRequest('DELETE', path, opts),
  subscribe: (path, onData, onError) => clientSubscribe(path, onData, onError),
};

export default api;
