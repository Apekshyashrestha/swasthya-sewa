// Pure frontend client-side storage & mock API service.
// Zero backend server required — used automatically when Firebase env vars are absent.

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
import { isAdminEmail } from './firebaseConfig.js';
import { isSlotPast, isSlotTaken, takenSlotsFor } from './scheduling.js';
import { buildNotifications } from './notifications.js';
import { usableAvatar } from './avatar.js';

const roleForEmail = (email = '') => (isAdminEmail(email) ? 'ADMIN' : 'PATIENT');

const STORAGE_KEYS = {
  USER: 'swasthya_active_user',
  DOCTORS: 'swasthya_doctors',
  APPOINTMENTS: 'swasthya_appointments',
  PATIENTS: 'swasthya_patients',
  BILLS: 'swasthya_bills',
  RECORDS: 'swasthya_records',
  ACTIVITIES: 'swasthya_activities',
  MESSAGES: 'swasthya_messages',
  BLOCKED: 'swasthya_blocked',
};

function getStore(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      localStorage.setItem(key, JSON.stringify(fallback));
      return fallback;
    }
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function setStore(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.error('Failed to save to localStorage:', e);
  }
}

function getActiveUser() {
  return getStore(STORAGE_KEYS.USER, null);
}

function setActiveUser(user) {
  if (user) {
    setStore(STORAGE_KEYS.USER, user);
  } else {
    try {
      localStorage.removeItem(STORAGE_KEYS.USER);
    } catch {
      // Storage can be unavailable (private mode); nothing to clean up.
    }
  }
}

function getBlocked() {
  return getStore(STORAGE_KEYS.BLOCKED, []);
}

function isBlocked(email) {
  return getBlocked().includes((email || '').toLowerCase());
}

function blockEmail(email) {
  const list = getBlocked();
  const key = (email || '').toLowerCase();
  if (key && !list.includes(key)) {
    list.push(key);
    setStore(STORAGE_KEYS.BLOCKED, list);
  }
}

const DEFAULT_RECORD_DOCTOR = { id: null, name: 'Hospital Doctor', specialty: null, avatar: null };

// Mirrors the Firebase helper: records store `doctorId` plus a denormalised
// `doctor` summary, matching how appointments reference their doctor.
function resolveRecordDoctor(doctors, doctorId, fallback) {
  if (doctorId) {
    const match = doctors.find((d) => d.id === doctorId);
    if (match) {
      return { id: match.id, name: match.name, specialty: match.specialty ?? null, avatar: match.avatar ?? null };
    }
  }
  return fallback ?? DEFAULT_RECORD_DOCTOR;
}

// Client-side mock API dispatcher
async function clientRequest(method, path, body = {}) {
  // Artificial micro-delay (10ms) for realistic async behavior without blocking
  await new Promise((r) => setTimeout(r, 10));

  const cleanPath = path.replace(/^\/api/, '').replace(/^\//, '');
  const user = getActiveUser();

  // AUTH ROUTES
  if (cleanPath === 'auth/me') {
    if (!user) throw new Error('Not authenticated');
    if (isBlocked(user.email)) throw new Error('This account has been removed by the hospital.');
    // Filtered on read: a session persisted before the retired photo was dropped
    // still carries the old URL in localStorage.
    return { data: { user: { ...user, avatar: usableAvatar(user.avatar) } } };
  }

  if (cleanPath === 'auth/login') {
    const { email } = body;
    if (isBlocked(email)) throw new Error('This account has been removed by the hospital.');
    const role = roleForEmail(email);
    const namePart = (email || 'user').split('@')[0];
    const formattedName = role === 'ADMIN' ? 'Dr. Admin' : namePart.charAt(0).toUpperCase() + namePart.slice(1);
    const loggedUser = {
      id: 'usr_' + Date.now(),
      name: formattedName,
      email: email || 'patient@gmail.com',
      role,
      phone: '+977 98012 34567',
      address: 'Biratnagar, Nepal',
      avatar: '',
    };
    setActiveUser(loggedUser);
    return { data: { user: loggedUser, token: 'mock-jwt-token' } };
  }

  if (cleanPath === 'auth/register') {
    const { name, email, phone } = body;
    if (isAdminEmail(email)) {
      throw new Error('Administrator accounts are created by the hospital. Please sign in instead.');
    }
    if (isBlocked(email)) {
      throw new Error('This account has been removed by the hospital.');
    }
    const role = roleForEmail(email);
    const registeredUser = {
      id: 'usr_' + Date.now(),
      name: name || 'Patient User',
      email: email || 'patient@gmail.com',
      role,
      phone: phone || '+977 98012 34567',
      address: 'Biratnagar, Nepal',
      avatar: '',
    };
    setActiveUser(registeredUser);
    return { data: { user: registeredUser, message: 'Account created successfully' } };
  }

  if (cleanPath === 'auth/logout') {
    setActiveUser(null);
    return { data: { message: 'Logged out successfully' } };
  }

  if (cleanPath === 'auth/reset-password') {
    return { data: { message: 'Password reset successful' } };
  }

  if (cleanPath === 'auth/verify') {
    return { data: { user, message: 'Verified' } };
  }

  if (cleanPath === 'auth/resend-verification') {
    return { data: { message: 'Verification email sent' } };
  }

  if (cleanPath === 'users/me') {
    if (method === 'PUT') {
      const updated = { ...(user || {}), ...body };
      setActiveUser(updated);
      return { data: updated };
    }
    return { data: user };
  }

  // DASHBOARD DATA
  // NOTIFICATIONS
  // Derived from the caller's own rows rather than stored, so an entry always
  // reflects something that actually happened.
  if (cleanPath === 'notifications') {
    const isAdmin = user?.role === 'ADMIN';
    const allApps = getStore(STORAGE_KEYS.APPOINTMENTS, INITIAL_APPOINTMENTS);
    const allBills = getStore(STORAGE_KEYS.BILLS, INITIAL_BILLS);
    const allRecords = getStore(STORAGE_KEYS.RECORDS, INITIAL_RECORDS);
    const allMessages = getStore(STORAGE_KEYS.MESSAGES, INITIAL_MESSAGES);

    const owns = (row) =>
      isAdmin ||
      !row.patient?.email ||
      row.patient.email === user?.email ||
      row.patientId === user?.id;

    return {
      data: {
        items: buildNotifications({
          role: user?.role ?? 'PATIENT',
          appointments: allApps.filter(owns),
          bills: allBills.filter(owns),
          records: allRecords.filter(owns),
          messages: allMessages.filter(owns),
        }),
      },
    };
  }

  if (cleanPath === 'users/dashboard') {
    const allApps = getStore(STORAGE_KEYS.APPOINTMENTS, INITIAL_APPOINTMENTS);
    const allBills = getStore(STORAGE_KEYS.BILLS, INITIAL_BILLS);
    const allRecords = getStore(STORAGE_KEYS.RECORDS, INITIAL_RECORDS);
    const allActivities = getStore(STORAGE_KEYS.ACTIVITIES, INITIAL_ACTIVITIES);

    const userApps = user?.role === 'ADMIN' ? allApps : allApps.filter((a) => !a.patient?.email || a.patient?.email === user?.email || a.patientId === user?.id);
    const userBills = user?.role === 'ADMIN' ? allBills : allBills.filter((b) => !b.patient?.email || b.patient?.email === user?.email || b.patientId === user?.id);
    const userRecords = user?.role === 'ADMIN' ? allRecords : allRecords.filter((r) => !r.patient?.email || r.patient?.email === user?.email || r.patientId === user?.id);

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
    const docs = getStore(STORAGE_KEYS.DOCTORS, INITIAL_DOCTORS);
    if (method === 'POST') {
      const newDoc = {
        id: 'doc_' + Date.now(),
        avatar: 'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=150&auto=format&fit=crop&q=80',
        ...body,
      };
      docs.push(newDoc);
      setStore(STORAGE_KEYS.DOCTORS, docs);
      return { data: newDoc };
    }
    return { data: docs };
  }

  if (cleanPath.startsWith('doctors/')) {
    const docId = cleanPath.split('/')[1];
    const docs = getStore(STORAGE_KEYS.DOCTORS, INITIAL_DOCTORS);
    if (method === 'PUT') {
      const idx = docs.findIndex((d) => d.id === docId);
      if (idx !== -1) {
        docs[idx] = { ...docs[idx], ...body };
        setStore(STORAGE_KEYS.DOCTORS, docs);
        return { data: docs[idx] };
      }
    }
    if (method === 'DELETE') {
      const filtered = docs.filter((d) => d.id !== docId);
      setStore(STORAGE_KEYS.DOCTORS, filtered);
      return { data: { message: 'Doctor deleted' } };
    }
  }

  // APPOINTMENTS
  if (cleanPath === 'appointments/my') {
    const allApps = getStore(STORAGE_KEYS.APPOINTMENTS, INITIAL_APPOINTMENTS);
    const userApps = user?.role === 'ADMIN' ? allApps : allApps.filter((a) => !a.patient?.email || a.patient?.email === user?.email || a.patientId === user?.id);
    return { data: userApps };
  }

  if (cleanPath === 'appointments/all') {
    const allApps = getStore(STORAGE_KEYS.APPOINTMENTS, INITIAL_APPOINTMENTS);
    return { data: allApps };
  }

  if (cleanPath === 'appointments/slots') {
    const allApps = getStore(STORAGE_KEYS.APPOINTMENTS, INITIAL_APPOINTMENTS);
    return { data: { taken: takenSlotsFor(allApps, body) } };
  }

  if (cleanPath === 'appointments' && method === 'POST') {
    const docs = getStore(STORAGE_KEYS.DOCTORS, INITIAL_DOCTORS);
    const doc = docs.find((d) => d.id === body.doctorId) || { name: 'Hospital Doctor', specialty: 'General' };
    const allApps = getStore(STORAGE_KEYS.APPOINTMENTS, INITIAL_APPOINTMENTS);
    const date = body.date || new Date().toISOString();
    const slot = body.slot || '10:30 AM';

    // A slot that has already started, or is about to, cannot be booked.
    if (isSlotPast(date, slot)) {
      throw new Error('That time has already passed. Please choose a later slot or another day.');
    }

    // Refuse the booking if this doctor already has a non-cancelled
    // appointment on the same calendar day and time.
    if (isSlotTaken(allApps, { doctorId: body.doctorId, date, slot })) {
      throw new Error('That time slot has already been booked. Please choose another one.');
    }

    const appId = 'app_' + Date.now();
    const newApp = {
      id: appId,
      patientId: user?.id || 'p1',
      patient: { name: user?.name || 'Patient', email: user?.email || 'patient@gmail.com' },
      doctorId: body.doctorId,
      doctor: doc,
      date,
      slot,
      status: 'PAYMENT_PENDING',
      fee: Number(doc.fee) || 0,
      reason: body.reason || 'General Consultation',
    };
    allApps.unshift(newApp);
    setStore(STORAGE_KEYS.APPOINTMENTS, allApps);

    // Record activity
    const acts = getStore(STORAGE_KEYS.ACTIVITIES, INITIAL_ACTIVITIES);
    acts.unshift({
      id: 'act_' + Date.now(),
      action: 'BOOK_APPOINTMENT',
      detail: `Booked with ${doc.name}`,
      createdAt: new Date().toISOString(),
    });
    setStore(STORAGE_KEYS.ACTIVITIES, acts);

    return { data: newApp };
  }

  if (cleanPath.startsWith('appointments/') && cleanPath.endsWith('/cancel')) {
    const appId = cleanPath.split('/')[1];
    const allApps = getStore(STORAGE_KEYS.APPOINTMENTS, INITIAL_APPOINTMENTS);
    const target = allApps.find((a) => a.id === appId);
    if (target) {
      target.status = 'CANCELLED';
      setStore(STORAGE_KEYS.APPOINTMENTS, allApps);
    }
    return { data: target };
  }

  if (cleanPath.startsWith('appointments/') && cleanPath.endsWith('/status')) {
    const appId = cleanPath.split('/')[1];
    const allApps = getStore(STORAGE_KEYS.APPOINTMENTS, INITIAL_APPOINTMENTS);
    const target = allApps.find((a) => a.id === appId);
    if (target) {
      target.status = body.status;
      setStore(STORAGE_KEYS.APPOINTMENTS, allApps);
    }
    return { data: target };
  }

  if (cleanPath.startsWith('appointments/') && cleanPath.endsWith('/pay')) {
    const appId = cleanPath.split('/')[1];
    const allApps = getStore(STORAGE_KEYS.APPOINTMENTS, INITIAL_APPOINTMENTS);
    const app = allApps.find((a) => a.id === appId);
    if (!app) throw new Error('Appointment not found.');

    const paidAt = new Date().toISOString();
    const amount = Number(body.amount) || Number(app.fee) || 0;
    const payment = {
      txnId:
        body.txnId ||
        `TXN-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`,
      method: body.methodLabel || body.method || 'eSewa',
      amount,
      paidAt,
      patientName: app.patient?.name || user?.name || 'Patient',
      patientEmail: app.patient?.email || user?.email || '',
      doctorName: app.doctor?.name || 'Doctor',
      appointmentDate: app.date,
      appointmentSlot: app.slot || '',
    };
    app.status = 'CONFIRMED';
    app.paid = true;
    app.payment = payment;
    setStore(STORAGE_KEYS.APPOINTMENTS, allApps);

    const allBills = getStore(STORAGE_KEYS.BILLS, INITIAL_BILLS);
    allBills.unshift({
      id: 'bill_' + Date.now(),
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
    setStore(STORAGE_KEYS.BILLS, allBills);

    return { data: app };
  }

  // BILLS
  if (cleanPath === 'bills/my') {
    const allBills = getStore(STORAGE_KEYS.BILLS, INITIAL_BILLS);
    const userBills = user?.role === 'ADMIN' ? allBills : allBills.filter((b) => !b.patient?.email || b.patient?.email === user?.email || b.patientId === user?.id);
    return { data: userBills };
  }

  if (cleanPath === 'bills/all') {
    const allBills = getStore(STORAGE_KEYS.BILLS, INITIAL_BILLS);
    return { data: allBills };
  }

  if (cleanPath === 'bills' && method === 'POST') {
    const allBills = getStore(STORAGE_KEYS.BILLS, INITIAL_BILLS);
    const patients = getStore(STORAGE_KEYS.PATIENTS, INITIAL_PATIENTS);
    const patient = patients.find((p) => p.id === body.patientId) || { name: 'Patient' };
    const newBill = {
      id: 'bill_' + Date.now(),
      patientId: body.patientId,
      patient,
      amount: Number(body.amount) || 500,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    };
    allBills.unshift(newBill);
    setStore(STORAGE_KEYS.BILLS, allBills);
    return { data: newBill };
  }

  if (cleanPath.startsWith('bills/') && cleanPath.endsWith('/pay')) {
    const billId = cleanPath.split('/')[1];
    const allBills = getStore(STORAGE_KEYS.BILLS, INITIAL_BILLS);
    const bill = allBills.find((b) => b.id === billId);
    if (bill) {
      bill.status = 'PAID';
      setStore(STORAGE_KEYS.BILLS, allBills);
    }
    return { data: bill };
  }

  // MESSAGES (patient <-> doctor chat)
  if (cleanPath === 'messages/my') {
    const all = getStore(STORAGE_KEYS.MESSAGES, INITIAL_MESSAGES);
    const mine =
      user?.role === 'ADMIN'
        ? all
        : all.filter(
            (m) =>
              !m.patient?.email ||
              m.patient?.email === user?.email ||
              m.patientId === user?.id
          );
    return { data: mine.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))) };
  }

  if (cleanPath === 'messages/all') {
    const all = getStore(STORAGE_KEYS.MESSAGES, INITIAL_MESSAGES);
    return { data: all.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))) };
  }

  if (cleanPath === 'messages' && method === 'POST') {
    const text = String(body.text ?? '').trim();
    if (!text) throw new Error('Message cannot be empty.');

    const isAdmin = user?.role === 'ADMIN';
    const all = getStore(STORAGE_KEYS.MESSAGES, INITIAL_MESSAGES);
    const patients = getStore(STORAGE_KEYS.PATIENTS, INITIAL_PATIENTS);

    const patientId = isAdmin ? body.patientId : user?.id;
    // Prefer the denormalised snapshot the caller already holds, so the thread
    // key is never rebuilt from a profile lookup that may have lost the email.
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

    const message = {
      id: 'msg_' + Date.now(),
      // One conversation per patient: no doctor is stored on the message, since
      // the hospital desk answers regardless of who the enquiry concerns.
      threadId,
      patientId,
      patient: { id: patient.id, name: patient.name, email: patient.email, avatar: usableAvatar(patient.avatar) },
      sender: isAdmin ? 'HOSPITAL' : 'PATIENT',
      senderName: isAdmin ? 'Hospital team' : patient.name || 'Patient',
      text,
      readAt: null,
      // Which views this message has been hidden from. Per-side, so the other
      // party and the clinical record keep it.
      hiddenFor: [],
      createdAt: new Date().toISOString(),
    };
    all.push(message);
    setStore(STORAGE_KEYS.MESSAGES, all);
    return { data: message };
  }

  // Hide a whole conversation from one party's own view. Same per-side rule as
  // deleting a single message, applied across the thread.
  if (cleanPath === 'messages/thread/visibility' && method === 'POST') {
    const all = getStore(STORAGE_KEYS.MESSAGES, INITIAL_MESSAGES);
    const rows = all.filter((m) => m.threadId === body.threadId);
    if (!rows.length) throw new Error('That conversation no longer exists.');

    const isAdmin = user?.role === 'ADMIN';
    const owns = (m) =>
      m.patientId === user?.id ||
      (m.patient?.email ?? '').toLowerCase() === (user?.email ?? '').toLowerCase();
    if (!isAdmin && !rows.every(owns)) {
      throw new Error('You can only hide your own conversations.');
    }

    const side = isAdmin ? 'HOSPITAL' : 'PATIENT';
    let hidden = 0;
    rows.forEach((m) => {
      const next = Array.from(new Set([...(m.hiddenFor ?? []), side]));
      if (next.length === (m.hiddenFor ?? []).length) return;
      m.hiddenFor = next;
      hidden += 1;
    });
    if (hidden) setStore(STORAGE_KEYS.MESSAGES, all);
    return { data: { threadId: body.threadId, hidden } };
  }

  // Hide a message from one party's own view. The row is kept so the other side
  // and the clinical record still hold it; `hiddenFor` records whose view it is
  // missing from. A patient can only ever add their own side.
  if (/^messages\/[^/]+\/visibility$/.test(cleanPath) && method === 'POST') {
    const all = getStore(STORAGE_KEYS.MESSAGES, INITIAL_MESSAGES);
    const message = all.find((m) => m.id === cleanPath.split('/')[1]);
    if (!message) throw new Error('That message no longer exists.');

    const isAdmin = user?.role === 'ADMIN';
    const owns =
      message.patientId === user?.id ||
      (message.patient?.email ?? '').toLowerCase() === (user?.email ?? '').toLowerCase();
    if (!isAdmin && !owns) throw new Error('You can only hide your own messages.');

    const side = isAdmin ? 'HOSPITAL' : 'PATIENT';
    message.hiddenFor = Array.from(new Set([...(message.hiddenFor ?? []), side]));
    setStore(STORAGE_KEYS.MESSAGES, all);
    return { data: { id: message.id, hiddenFor: message.hiddenFor } };
  }

  if (cleanPath === 'messages/read' && method === 'POST') {
    const all = getStore(STORAGE_KEYS.MESSAGES, INITIAL_MESSAGES);
    const stamp = new Date().toISOString();
    let updated = 0;
    all.forEach((m) => {
      if (m.threadId === body.threadId && !m.readAt) {
        m.readAt = stamp;
        updated += 1;
      }
    });
    if (updated) setStore(STORAGE_KEYS.MESSAGES, all);
    return { data: { updated } };
  }

  // MEDICAL RECORDS
  if (cleanPath === 'records/my') {
    const allRecords = getStore(STORAGE_KEYS.RECORDS, INITIAL_RECORDS);
    const userRecords = user?.role === 'ADMIN' ? allRecords : allRecords.filter((r) => !r.patient?.email || r.patient?.email === user?.email || r.patientId === user?.id);
    return { data: userRecords };
  }

  if (cleanPath === 'records/all') {
    const allRecords = getStore(STORAGE_KEYS.RECORDS, INITIAL_RECORDS);
    return { data: allRecords };
  }

  if (cleanPath === 'records' && method === 'POST') {
    const allRecords = getStore(STORAGE_KEYS.RECORDS, INITIAL_RECORDS);
    const patients = getStore(STORAGE_KEYS.PATIENTS, INITIAL_PATIENTS);
    const doctors = getStore(STORAGE_KEYS.DOCTORS, INITIAL_DOCTORS);
    const patient = patients.find((p) => p.id === body.patientId) || { name: 'Patient' };
    const doctor = resolveRecordDoctor(doctors, body.doctorId);
    const newRecord = {
      id: 'rec_' + Date.now(),
      patientId: body.patientId,
      patient,
      doctorId: doctor.id,
      doctor,
      title: body.title || 'Medical Report',
      type: body.type || 'General',
      description: body.description || '',
      createdAt: new Date().toISOString(),
    };
    allRecords.unshift(newRecord);
    setStore(STORAGE_KEYS.RECORDS, allRecords);
    return { data: newRecord };
  }

  if (cleanPath.startsWith('records/') && (method === 'PUT' || method === 'PATCH')) {
    const recordId = cleanPath.split('/')[1];
    const allRecords = getStore(STORAGE_KEYS.RECORDS, INITIAL_RECORDS);
    const existing = allRecords.find((r) => r.id === recordId);
    if (!existing) throw new Error('That report no longer exists.');

    const patients = getStore(STORAGE_KEYS.PATIENTS, INITIAL_PATIENTS);
    const patient =
      body.patientId && body.patientId !== existing.patientId
        ? patients.find((p) => p.id === body.patientId) || existing.patient
        : existing.patient;

    // Only re-resolve when the admin picked a different doctor, so an untouched
    // field never falls back to the default placeholder.
    const doctors = getStore(STORAGE_KEYS.DOCTORS, INITIAL_DOCTORS);
    const doctor =
      body.doctorId && body.doctorId !== existing.doctorId
        ? resolveRecordDoctor(doctors, body.doctorId, existing.doctor)
        : existing.doctor || resolveRecordDoctor(doctors, null);

    const updated = {
      ...existing,
      title: body.title?.trim() || existing.title,
      type: body.type || existing.type,
      description: body.description ?? existing.description,
      patient,
      doctorId: doctor.id ?? existing.doctorId ?? null,
      doctor,
      updatedAt: new Date().toISOString(),
    };
    setStore(
      STORAGE_KEYS.RECORDS,
      allRecords.map((r) => (r.id === recordId ? updated : r))
    );
    return { data: updated };
  }

  if (cleanPath.startsWith('records/') && method === 'DELETE') {
    const recordId = cleanPath.split('/')[1];
    const allRecords = getStore(STORAGE_KEYS.RECORDS, INITIAL_RECORDS);
    if (!allRecords.some((r) => r.id === recordId)) {
      throw new Error('That report no longer exists.');
    }
    setStore(
      STORAGE_KEYS.RECORDS,
      allRecords.filter((r) => r.id !== recordId)
    );
    return { data: { message: 'Report deleted', id: recordId } };
  }

  // REMOVE PATIENT (administrator)
  if (cleanPath.startsWith('users/') && method === 'DELETE') {
    const userId = cleanPath.split('/')[1];
    const patients = getStore(STORAGE_KEYS.PATIENTS, INITIAL_PATIENTS);
    const target = patients.find((p) => p.id === userId);
    const email = target?.email;
    const match = (item) => item.patientId === userId || (email && item.patient?.email === email);
    setStore(STORAGE_KEYS.PATIENTS, patients.filter((p) => p.id !== userId));
    setStore(STORAGE_KEYS.APPOINTMENTS, getStore(STORAGE_KEYS.APPOINTMENTS, INITIAL_APPOINTMENTS).filter((a) => !match(a)));
    setStore(STORAGE_KEYS.BILLS, getStore(STORAGE_KEYS.BILLS, INITIAL_BILLS).filter((b) => !match(b)));
    setStore(STORAGE_KEYS.RECORDS, getStore(STORAGE_KEYS.RECORDS, INITIAL_RECORDS).filter((r) => !match(r)));
    if (email) blockEmail(email);
    return { data: { message: 'Patient removed' } };
  }

  // PATIENTS
  if (cleanPath === 'users/patients') {
    const patients = getStore(STORAGE_KEYS.PATIENTS, INITIAL_PATIENTS);
    return { data: patients.map((p) => ({ ...p, avatar: usableAvatar(p.avatar) })) };
  }

  // ADMIN STATS
  if (cleanPath === 'admin/stats') {
    const docs = getStore(STORAGE_KEYS.DOCTORS, INITIAL_DOCTORS);
    const patients = getStore(STORAGE_KEYS.PATIENTS, INITIAL_PATIENTS);
    const allApps = getStore(STORAGE_KEYS.APPOINTMENTS, INITIAL_APPOINTMENTS);
    const allBills = getStore(STORAGE_KEYS.BILLS, INITIAL_BILLS);
    const acts = getStore(STORAGE_KEYS.ACTIVITIES, INITIAL_ACTIVITIES);

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

// Mock counterpart to the Firestore onSnapshot stream. localStorage has no
// change events inside one tab, so it polls and emits on change.
function clientSubscribe(path, onData, onError) {
  const timer = setInterval(() => {
    clientRequest('GET', path)
      .then((res) => onData(res?.data ?? []))
      .catch((err) => onError?.(err));
  }, 2000);
  clientRequest('GET', path)
    .then((res) => onData(res?.data ?? []))
    .catch((err) => onError?.(err));
  return () => clearInterval(timer);
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
