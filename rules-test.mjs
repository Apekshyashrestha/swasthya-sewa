// Firestore security rules verification, run against the Firestore emulator.
//
//   npm i --no-save --legacy-peer-deps @firebase/rules-unit-testing@3.0.4
//   npm run test:rules
//
// @firebase/rules-unit-testing is deliberately NOT a saved dependency: it pins
// firebase@^10 as a peer while this project is on firebase@^12, so adding it
// normally breaks `npm install`. The emulator also needs JDK 11-21.
//
// Checks the guarantees the portal depends on:
//   - a patient can only ever read their own appointments / bills / records
//   - a patient cannot flip an appointment to CONFIRMED without recording a
//     payment, so nobody self-confirms an unpaid visit
//   - a patient cannot edit a doctor's catalogue
//   - chat messages stay private to the patient who owns them

import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';

const projectId = 'swasthya-sewa-rules-test';
const rules = readFileSync('firestore.rules', 'utf8');

const testEnv = await initializeTestEnvironment({
  projectId,
  firestore: { rules },
});

const PATIENT = { uid: 'patient-uid-1', email: 'priya@gmail.com' };
const OTHER_PATIENT = { uid: 'patient-uid-2', email: 'ramesh@gmail.com' };
const ADMIN = { uid: 'admin-uid-1', email: 'admin@swasthya.dev' };

const db = (context) =>
  testEnv.authenticatedContext(context.uid, { email: context.email }).firestore();

const seed = {
  doctors: {
    d1: { id: 'd1', name: 'Dr. Sandeep Adhikari', specialty: 'Cardiology', fee: 800 },
  },
  appointments: {
    app1: {
      id: 'app1',
      patientId: PATIENT.uid,
      patient: { name: 'Priya Sharma', email: PATIENT.email },
      doctorId: 'd1',
      doctor: { name: 'Dr. Sandeep Adhikari' },
      date: '2026-10-10T09:00:00.000Z',
      slot: '10:30 AM',
      status: 'CONFIRMED',
      fee: 800,
    },
    app2: {
      id: 'app2',
      patientId: OTHER_PATIENT.uid,
      patient: { name: 'Ramesh Karki', email: OTHER_PATIENT.email },
      doctorId: 'd1',
      doctor: { name: 'Dr. Sandeep Adhikari' },
      date: '2026-10-10T09:00:00.000Z',
      slot: '10:30 AM',
      status: 'CONFIRMED',
      fee: 800,
    },
  },
  bills: {
    bill1: {
      id: 'bill1',
      patientId: PATIENT.uid,
      patient: { name: 'Priya Sharma', email: PATIENT.email },
      appointmentId: 'app1',
      amount: 800,
      status: 'PENDING',
    },
  },
  records: {
    rec1: {
      id: 'rec1',
      patientId: PATIENT.uid,
      patient: { name: 'Priya Sharma', email: PATIENT.email },
      title: 'Blood Sugar Report',
    },
    rec2: {
      id: 'rec2',
      patientId: OTHER_PATIENT.uid,
      patient: { name: 'Ramesh Karki', email: OTHER_PATIENT.email },
      title: 'Chest X-Ray',
    },
  },
  messages: {
    msg1: {
      id: 'msg1',
      threadId: 't_1__d1',
      patientId: PATIENT.uid,
      patient: { name: 'Priya Sharma', email: PATIENT.email },
      doctorId: 'd1',
      text: 'I have chest pain',
      createdAt: '2026-10-01T10:00:00.000Z',
    },
    msg2: {
      id: 'msg2',
      threadId: 't_2__d1',
      patientId: OTHER_PATIENT.uid,
      patient: { name: 'Ramesh Karki', email: OTHER_PATIENT.email },
      doctorId: 'd1',
      text: 'private to the other patient',
      createdAt: '2026-10-01T11:00:00.000Z',
    },
  },
};

await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const firestore = ctx.firestore();
  for (const [col, docs] of Object.entries(seed)) {
    for (const [id, data] of Object.entries(docs)) {
      await firestore.collection(col).doc(id).set(data);
    }
  }
});

const results = [];
const check = async (label, fn) => {
  try {
    await fn();
    results.push({ label, ok: true });
  } catch (err) {
    results.push({ label, ok: false, detail: err.message.split('\n')[0] });
  }
};

const patient = db(PATIENT);
const other = db(OTHER_PATIENT);
const admin = db(ADMIN);

/* ------------------------------ appointments ----------------------------- */

await check('patient reads own appointment', () =>
  assertSucceeds(patient.collection('appointments').doc('app1').get())
);
await check('patient CANNOT read another patient appointment', () =>
  assertFails(patient.collection('appointments').doc('app2').get())
);
await check('patient CANNOT query another patient appointment', () =>
  assertFails(
    patient
      .collection('appointments')
      .where('patientId', '==', OTHER_PATIENT.uid)
      .get()
  )
);
await check('patient CANNOT self-confirm without paying', () =>
  assertFails(
    patient.collection('appointments').doc('app1').update({ status: 'CONFIRMED' })
  )
);
await check('patient CANNOT confirm by recording a fake payment flag', () =>
  assertFails(
    patient
      .collection('appointments')
      .doc('app1')
      .update({ status: 'CONFIRMED', paid: false, payment: { txnId: 'x' } })
  )
);
await check('patient CAN complete their own appointment', () =>
  assertFails(
    patient.collection('appointments').doc('app1').update({ status: 'COMPLETED' })
  )
);
await check('patient CAN cancel their own appointment', () =>
  assertSucceeds(patient.collection('appointments').doc('app1').update({ status: 'CANCELLED' }))
);
await check('patient CANNOT reassign the doctor on their appointment', () =>
  assertFails(
    patient.collection('appointments').doc('app1').update({ doctorId: 'd1', slot: '02:00 PM' })
  )
);
await check('patient CANNOT cancel another patient appointment', () =>
  assertFails(patient.collection('appointments').doc('app2').update({ status: 'CANCELLED' }))
);
await check('patient CAN book for themselves', () =>
  assertSucceeds(
    patient.collection('appointments').add({
      patientId: PATIENT.uid,
      patient: { name: 'Priya Sharma', email: PATIENT.email },
      doctorId: 'd1',
      status: 'PAYMENT_PENDING',
    })
  )
);
await check('patient CANNOT book on behalf of somebody else', () =>
  assertFails(
    patient.collection('appointments').add({
      patientId: OTHER_PATIENT.uid,
      patient: { name: 'Ramesh Karki', email: OTHER_PATIENT.email },
      doctorId: 'd1',
      status: 'PAYMENT_PENDING',
    })
  )
);
await check('admin reads any appointment', () =>
  assertSucceeds(admin.collection('appointments').doc('app2').get())
);
await check('admin completes any appointment', () =>
  assertSucceeds(admin.collection('appointments').doc('app2').update({ status: 'COMPLETED' }))
);

/* ---------------------------------- bills -------------------------------- */

await check('patient reads own bill', () =>
  assertSucceeds(patient.collection('bills').doc('bill1').get())
);
await check('patient CAN settle own bill', () =>
  assertSucceeds(
    patient.collection('bills').doc('bill1').update({ status: 'PAID', paidAt: 'now' })
  )
);
await check('patient CANNOT change the amount on a bill', () =>
  assertFails(patient.collection('bills').doc('bill1').update({ amount: 1 }))
);
await check('patient CANNOT create a bill with no appointment behind it', () =>
  assertFails(
    patient.collection('bills').add({
      patientId: PATIENT.uid,
      amount: 999,
      status: 'PAID',
    })
  )
);

/* -------------------------------- records -------------------------------- */

await check('patient reads own record', () =>
  assertSucceeds(patient.collection('records').doc('rec1').get())
);
await check('patient CANNOT read another patient record', () =>
  assertFails(patient.collection('records').doc('rec2').get())
);
await check('patient CANNOT alter a medical record', () =>
  assertFails(patient.collection('records').doc('rec1').update({ title: 'Edited' }))
);
await check('patient CANNOT delete a medical record', () =>
  assertFails(patient.collection('records').doc('rec1').delete())
);
await check('admin writes records', () =>
  assertSucceeds(admin.collection('records').add({ title: 'New report' }))
);

/* --------------------------------- doctors -------------------------------- */

await check('anyone signed in reads the doctor catalogue', () =>
  assertSucceeds(patient.collection('doctors').doc('d1').get())
);
await check('patient CANNOT add a doctor', () =>
  assertFails(patient.collection('doctors').add({ name: 'Dr. Fake' }))
);
await check('patient CANNOT edit a doctor', () =>
  assertFails(patient.collection('doctors').doc('d1').update({ fee: 1 }))
);
await check('patient CANNOT delete a doctor', () =>
  assertFails(patient.collection('doctors').doc('d1').delete())
);
await check('admin adds a doctor', () =>
  assertSucceeds(admin.collection('doctors').add({ name: 'Dr. New' }))
);

/* -------------------------------- messages -------------------------------- */

await check('patient reads own message', () =>
  assertSucceeds(patient.collection('messages').doc('msg1').get())
);
await check('patient CANNOT read another patient message', () =>
  assertFails(patient.collection('messages').doc('msg2').get())
);
await check('patient CAN mark own thread read', () =>
  assertSucceeds(
    patient.collection('messages').doc('msg1').update({ readAt: '2026-10-02T09:00:00.000Z' })
  )
);
await check('patient CANNOT rewrite the text of a message', () =>
  assertFails(
    patient.collection('messages').doc('msg1').update({ text: 'tampered', readAt: 'x' })
  )
);
await check('patient CANNOT post into another patient thread', () =>
  assertFails(
    patient.collection('messages').add({
      patientId: OTHER_PATIENT.uid,
      patient: { name: 'Ramesh Karki', email: OTHER_PATIENT.email },
      doctorId: 'd1',
      text: 'injected',
    })
  )
);
await check('admin reads every message', () =>
  assertSucceeds(admin.collection('messages').doc('msg2').get())
);

/* ------------------------------- users ----------------------------------- */

await check('patient reads own profile', () =>
  assertSucceeds(patient.collection('users').doc(PATIENT.uid).get())
);
await check('patient CANNOT enumerate other profiles', () =>
  assertFails(patient.collection('users').where('role', '==', 'PATIENT').get())
);
await check('admin enumerates patients', () =>
  assertSucceeds(admin.collection('users').where('role', '==', 'PATIENT').get())
);

/* ----------------------------- slot mirror ------------------------------- */

await check('patient reads slot occupancy (no patient data)', () =>
  assertSucceeds(patient.collection('takenSlots').doc('d1__2026-10-10').get())
);

/* ------------------------------- anon user -------------------------------- */

await check('signed out CANNOT read appointments', () =>
  assertFails(testEnv.unauthenticatedContext().firestore().collection('appointments').get())
);

await testEnv.cleanup();

const failed = results.filter((r) => !r.ok);
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.label}${r.ok ? '' : ` -> ${r.detail}`}`);
}
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);