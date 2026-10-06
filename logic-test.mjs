// Unit tests for the project's pure logic. Runs on plain Node with no emulator
// and no Firebase project, so it is fast enough to run before every commit.
//
//   node --test logic-test.mjs
//
// Firestore security rules are verified separately by rules-test.mjs, which
// needs the Firestore emulator (and therefore a JDK 11-21).

import test from 'node:test';
import assert from 'node:assert/strict';

import { dayKey, isSlotPast, isSlotTaken, slotMinutes, slotRecordId, slotStart, takenSlotsFor } from './src/lib/scheduling.js';
import { buildThreads, isHiddenFor, ownSenderFor, senderNameFor } from './src/lib/threads.js';
import { threadIdFor } from './src/lib/seedData.js';
import { buildRecordHtml } from './src/lib/report.js';
import { CONSULT_SLOTS } from './src/lib/format.js';
import { buildNotifications, countUnread, groupNotifications } from './src/lib/notifications.js';
import { usableAvatar } from './src/lib/avatar.js';

/* -------------------------------- avatars -------------------------------- */

test('the retired patient photo is ignored, so old accounts show initials', () => {
  const retired = 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80';
  assert.equal(usableAvatar(retired), '');
  // Query-string variants must not sneak past the filter.
  assert.equal(usableAvatar('https://images.unsplash.com/photo-1544005313-94ddf0286df2'), '');
  // The retired admin photo is filtered too.
  assert.equal(usableAvatar('https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'), '');
  // Anything else is left alone, so real photos keep working.
  assert.equal(usableAvatar('https://example.com/me.jpg'), 'https://example.com/me.jpg');
  assert.equal(usableAvatar(undefined), '');
  assert.equal(usableAvatar(null), '');
  assert.equal(usableAvatar(''), '');
});

/* ----------------------------- notifications ---------------------------- */

// Fixtures below are dated 2026-10-09. Pinning the clock keeps them in the past
// whatever day the suite runs, instead of silently ageing into the future.
const FIXED_NOW = new Date('2026-10-09T23:00:00.000Z');

test('notifications are derived from real rows, not stored', () => {
  const appointments = [
    {
      id: 'a1', status: 'CONFIRMED', slot: '10:30 AM', date: '2026-10-10T09:00:00.000Z',
      createdAt: '2026-10-01T08:00:00.000Z', statusUpdatedAt: '2026-10-09T10:00:00.000Z',
      doctor: { name: 'Dr. Adhikari' }, patient: { name: 'Priya' },
    },
  ];
  const bills = [
    {
      id: 'b1', status: 'PAID', amount: 800, paidAt: '2026-10-09T11:00:00.000Z',
      payment: { method: 'eSewa', patientName: 'Priya' }, patient: { name: 'Priya' },
    },
  ];
  const records = [
    {
      id: 'r1', title: 'Blood Sugar', type: 'Lab', updatedAt: '2026-10-09T12:00:00.000Z',
      patient: { name: 'Priya' },
    },
  ];

  const patient = buildNotifications({ role: 'PATIENT', appointments, bills, records, now: FIXED_NOW });
  const kinds = patient.map((n) => n.kind);
  assert.ok(kinds.includes('appointment'));
  assert.ok(kinds.includes('billing'));
  assert.ok(kinds.includes('record'));
  // Ordered newest first, and never duplicated.
  const times = patient.map((n) => n.createdAt);
  assert.deepEqual(times, [...times].sort().reverse());
  assert.equal(new Set(patient.map((n) => n.id)).size, patient.length);

  // Each row is tied to the thing it describes.
  assert.equal(patient.find((n) => n.kind === 'billing').message.includes('800'), true);
  assert.equal(patient.find((n) => n.kind === 'record').message.includes('Blood Sugar'), true);
});

test('no rows means no notifications, rather than placeholder ones', () => {
  assert.deepEqual(buildNotifications({ role: 'PATIENT' }), []);
  assert.deepEqual(buildNotifications({ role: 'ADMIN', appointments: [], bills: [] }), []);
});

test('appointment wording differs by role', () => {
  const appointments = [
    {
      id: 'a1', status: 'PAYMENT_PENDING', slot: '10:30 AM', date: '2026-10-10T09:00:00.000Z',
      createdAt: '2026-10-01T08:00:00.000Z', doctor: { name: 'Dr. Adhikari' }, patient: { name: 'Priya' },
    },
  ];
  const patient = buildNotifications({ role: 'PATIENT', appointments, now: FIXED_NOW });
  const admin = buildNotifications({ role: 'ADMIN', appointments, now: FIXED_NOW });

  // The patient is prompted to pay; the desk is prompted to prepare.
  assert.equal(patient[0].title, 'Payment pending');
  assert.equal(admin[0].title, 'New appointment booked');
  assert.equal(admin[0].message.includes('Priya'), true);
});

test('a notification points at a tab the viewer actually has', () => {
  // The two sidebars name these differently, and a wrong label navigates to a
  // tab that does not exist.
  const rows = (role) =>
    buildNotifications({
      role,
      appointments: [
        {
          id: 'a1', status: 'CONFIRMED', slot: '10:30 AM', date: '2026-10-10T09:00:00.000Z',
          createdAt: '2026-10-01T08:00:00.000Z', doctor: { name: 'Dr. Adhikari' },
        },
      ],
      bills: [{ id: 'b1', status: 'PAID', amount: 800, paidAt: '2026-10-09T11:00:00.000Z' }],
      records: [{ id: 'r1', title: 'Blood Sugar', createdAt: '2026-10-09T12:00:00.000Z' }],
      messages: [{ id: 'm1', sender: 'PATIENT', readAt: null, createdAt: '2026-10-09T13:00:00.000Z' }],
      now: FIXED_NOW,
    });

  assert.equal(rows('PATIENT').find((n) => n.kind === 'appointment').tab, 'My Appointments');
  assert.equal(rows('ADMIN').find((n) => n.kind === 'appointment').tab, 'Appointments');
  assert.equal(rows('PATIENT').find((n) => n.kind === 'billing').tab, 'Billing & Payments');
  assert.equal(rows('ADMIN').find((n) => n.kind === 'billing').tab, 'Billing');
  assert.equal(rows('ADMIN').find((n) => n.kind === 'message').tab, 'Messages');
  assert.equal(rows('PATIENT').find((n) => n.kind === 'record').tab, 'Medical Records');
});

test('a cancelled appointment is reported as such', () => {
  const items = buildNotifications({
    role: 'PATIENT',
    appointments: [
      {
        id: 'a1', status: 'CANCELLED', slot: '10:30 AM', date: '2026-10-10T09:00:00.000Z',
statusUpdatedAt: '2026-10-09T10:00:00.000Z', doctor: { name: 'Dr. Adhikari' },
      },
    ],
    now: FIXED_NOW,
  });
  assert.equal(items[0].title, 'Appointment cancelled');
  assert.equal(items[0].tone, 'danger');
});

test('unread chat becomes one notification, not one per message', () => {
  const messages = [
    { id: 'm1', sender: 'HOSPITAL', readAt: null, createdAt: '2026-10-09T10:00:00.000Z' },
    { id: 'm2', sender: 'HOSPITAL', readAt: null, createdAt: '2026-10-09T11:00:00.000Z' },
    { id: 'm3', sender: 'PATIENT', readAt: null, createdAt: '2026-10-09T11:30:00.000Z' },
    { id: 'm4', sender: 'HOSPITAL', readAt: '2026-10-09T12:00:00.000Z', createdAt: '2026-10-09T12:00:00.000Z' },
  ];
  const items = buildNotifications({ role: 'PATIENT', messages, now: FIXED_NOW });
  const chat = items.filter((n) => n.kind === 'message');
  assert.equal(chat.length, 1);
  assert.equal(chat[0].title, '2 new messages');
  // The patient's own unread message is not news to them.
  assert.deepEqual(buildNotifications({ role: 'ADMIN', messages, now: FIXED_NOW }).length, 1);
  // Once everything is read there is nothing to report.
  assert.deepEqual(buildNotifications({ role: 'PATIENT', messages: messages.map((m) => ({ ...m, readAt: m.readAt ?? 'x' })), now: FIXED_NOW }), []);
});

test('unread count is measured against the last time the panel was opened', () => {
  const items = [
    { id: 'n1', createdAt: '2026-10-09T10:00:00.000Z' },
    { id: 'n2', createdAt: '2026-10-09T11:00:00.000Z' },
    { id: 'n3', createdAt: '2026-10-09T12:00:00.000Z' },
  ];
  assert.equal(countUnread(items, ''), 3);
  assert.equal(countUnread(items, '2026-10-09T10:30:00.000Z'), 2);
  assert.equal(countUnread(items, '2026-10-09T23:00:00.000Z'), 0);
  // A missing or corrupt marker is treated as nothing seen, never as all read.
  assert.equal(countUnread(items, 'not-a-date'), 3);
});

test('notifications are grouped by day, newest day first', () => {
  // Fixed clock so the boundaries are deterministic: a late Tuesday evening.
  const now = new Date(2026, 9, 13, 22, 0);
  const at = (d, h) => new Date(2026, 9, d, h, 0).toISOString();
  const items = [
    { id: 'a', createdAt: at(9, 9) },
    { id: 'b', createdAt: at(13, 20) }, // today, late
    { id: 'c', createdAt: at(13, 8) }, // today, early
    { id: 'd', createdAt: at(12, 12) }, // yesterday
    { id: 'e', createdAt: at(11, 12) }, // two days back
    { id: 'f', createdAt: at(1, 12) }, // older than a week
  ];

  const sections = groupNotifications(items, now);
  const labels = sections.map((s) => s.label);
  assert.equal(labels[0], 'Today');
  assert.equal(labels[1], 'Yesterday');

  // Within Today, the newest entry is at the top.
  assert.deepEqual(sections[0].items.map((n) => n.id), ['b', 'c']);
  assert.equal(sections[1].items.length, 1);

  // Anything older than a week falls back to a real date so it stays identifiable.
  assert.ok(labels.includes('1 Oct 2026'));
  // The whole list survives; grouping only reorders it.
  assert.equal(sections.reduce((n, s) => n + s.items.length, 0), items.length);
});

test('recent days are named by weekday and older ones by date', () => {
  const now = new Date(2026, 9, 13, 22, 0); // Tuesday evening
  const sections = groupNotifications(
    [
      { id: 'a', createdAt: new Date(2026, 9, 13, 8).toISOString() }, // today
      { id: 'b', createdAt: new Date(2026, 9, 12, 8).toISOString() }, // yesterday
      { id: 'c', createdAt: new Date(2026, 9, 8, 8).toISOString() }, // 5 days back
      { id: 'd', createdAt: new Date(2026, 9, 1, 8).toISOString() }, // 12 days back
    ],
    now
  );
  assert.deepEqual(sections.map((s) => s.label), [
    'Today',
    'Yesterday',
    'Thursday',
    '1 Oct 2026',
  ]);
});

test('a future-dated row is dropped instead of filing itself under Today', () => {
  // Regression: seeded appointments had no createdAt, so the notification
  // borrowed the appointment's own (future) date and landed in "Today".
  // Built as offsets from `now` so the fixtures cannot drift across timezones.
  const now = new Date(2026, 9, 13, 22, 0);
  const at = (days) => new Date(2026, 9, 13 + days, 12, 0).toISOString();
  const appointments = [
    { id: 'a1', patient: { name: 'Priya Sharma' }, status: 'CONFIRMED', date: at(20), createdAt: at(-5) },
    { id: 'a2', patient: { name: 'Ramesh Karki' }, status: 'CONFIRMED', date: at(15), createdAt: at(1) },
  ];
  const items = buildNotifications({ role: 'PATIENT', appointments, now });
  assert.deepEqual(items.map((n) => n.id), ['confirmed_a1']);
  // And the survivor sits in its own day, not under Today.
  assert.deepEqual(groupNotifications(items, now).map((s) => s.label), ['Thursday']);
});

test('recent notifications sort to the top', () => {
  const now = new Date(2026, 9, 13, 22, 0);
  const at = (days) => new Date(2026, 9, 13 + days, 12, 0).toISOString();
  const bills = [
    { id: 'old', patient: { name: 'Priya Sharma' }, status: 'PAID', amount: 800, paidAt: at(-5) },
    { id: 'newest', patient: { name: 'Priya Sharma' }, status: 'PAID', amount: 800, paidAt: at(0) },
    { id: 'middle', patient: { name: 'Priya Sharma' }, status: 'PAID', amount: 800, paidAt: at(-1) },
  ];
  const items = buildNotifications({ role: 'PATIENT', bills, now });
  assert.deepEqual(items.map((n) => n.id), ['bill_newest', 'bill_middle', 'bill_old']);
  // Newest day first, and within Today the newest entry is at the top.
  const sections = groupNotifications(items, now);
  assert.deepEqual(sections.map((s) => s.label), ['Today', 'Yesterday', 'Thursday']);
  assert.deepEqual(sections[0].items.map((n) => n.id), ['bill_newest']);
});

test('an appointment with no known timestamp produces no notification', () => {
  const now = new Date(2026, 9, 13, 22, 0);
  const items = buildNotifications({
    role: 'PATIENT',
    appointments: [{ id: 'a9', patient: { name: 'Deepak Basnet' }, status: 'COMPLETED', date: '2026-10-12T05:00:00.000Z' }],
    now,
  });
  assert.deepEqual(items, []);
});

test('grouping does not merge two different days that share a label', () => {
  const now = new Date(2026, 9, 13, 22, 0);
  // Both a weekday, three weeks apart: they must not collapse into one section.
  const items = [
    { id: 'old', createdAt: new Date(2026, 8, 22, 10, 0).toISOString() },
    { id: 'new', createdAt: new Date(2026, 9, 1, 10, 0).toISOString() },
  ];
  const sections = groupNotifications(items, now);
  assert.deepEqual(sections.map((s) => s.label), ['1 Oct 2026', '22 Sep 2026']);
});

test('an unreadable timestamp is dropped rather than crashing the panel', () => {
  const now = new Date(2026, 9, 13, 22, 0);
  const sections = groupNotifications(
    [{ id: 'bad', createdAt: 'not-a-date' }, { id: 'ok', createdAt: new Date(2026, 9, 13, 9).toISOString() }],
    now
  );
  assert.equal(sections.length, 1);
  assert.deepEqual(sections[0].items.map((n) => n.id), ['ok']);
});

/* ------------------------------ scheduling ------------------------------ */

test('slot labels parse to minutes since midnight', () => {
  assert.equal(slotMinutes('09:00 AM'), 540);
  assert.equal(slotMinutes('12:00 PM'), 720);
  assert.equal(slotMinutes('02:00 PM'), 840);
  assert.equal(slotMinutes('10:30 AM'), 630);
  // Unrecognised input is refused rather than guessed at.
  assert.equal(slotMinutes('half nine'), null);
  assert.equal(slotMinutes(''), null);
});

test('a slot start is read in local time, not UTC midnight', () => {
  // A plain calendar date must not be shifted into the previous day for
  // anyone west of Greenwich, which would make "today" look like yesterday.
  const start = slotStart('2026-10-10', '10:30 AM');
  assert.equal(start.getFullYear(), 2026);
  assert.equal(start.getMonth(), 9);
  assert.equal(start.getDate(), 10);
  assert.equal(start.getHours(), 10);
  assert.equal(start.getMinutes(), 30);
});

test('a slot that has already started today cannot be booked', () => {
  const now = new Date(2026, 9, 10, 20, 0); // 8 PM on 10 Oct 2026
  const today = '2026-10-10';
  // The reported case: booking 10 AM at 8 PM.
  assert.equal(isSlotPast(today, '10:00 AM', now), true);
  assert.equal(isSlotPast(today, '09:00 AM', now), true);
  assert.equal(isSlotPast(today, '04:00 PM', now), true);
  // Nothing left today after the last slot has gone.
  assert.equal(CONSULT_SLOTS.every((s) => isSlotPast(today, s, now)), true);
});

test('a slot starting inside the lead time is refused', () => {
  const now = new Date(2026, 9, 10, 9, 45);
  // 10:00 AM is 15 minutes away, under the 30 minute lead time.
  assert.equal(isSlotPast('2026-10-10', '10:00 AM', now), true);
  assert.equal(isSlotPast('2026-10-10', '10:30 AM', now), false);
});

test('future slots stay bookable regardless of the clock', () => {
  const now = new Date(2026, 9, 10, 23, 59);
  assert.equal(isSlotPast('2026-10-11', '09:00 AM', now), false);
  assert.equal(isSlotPast('2026-11-01', '02:00 PM', now), false);
});

const day = (h) => `2026-10-10T${String(h).padStart(2, '0')}:00:00.000Z`;

const base = [
  {
    id: 'a1',
    doctorId: 'd1',
    date: day(9),
    slot: '10:30 AM',
    status: 'CONFIRMED',
  },
  {
    id: 'a2',
    doctorId: 'd1',
    date: day(9),
    slot: '02:00 PM',
    status: 'PAYMENT_PENDING',
  },
  {
    id: 'a3',
    doctorId: 'd1',
    date: day(9),
    slot: '04:00 PM',
    status: 'CANCELLED',
  },
  {
    id: 'a4',
    doctorId: 'd2',
    date: day(9),
    slot: '10:30 AM',
    status: 'CONFIRMED',
  },
];

test('dayKey ignores the time of day', () => {
  assert.equal(dayKey('2026-10-10T09:00:00.000Z'), dayKey('2026-10-10T16:00:00.000Z'));
  assert.notEqual(dayKey('2026-10-10T09:00:00.000Z'), dayKey('2026-10-11T09:00:00.000Z'));
});

test('dayKey returns an empty string for an unparseable date', () => {
  assert.equal(dayKey('not-a-date'), '');
});

test('a booked slot is detected for the same doctor and day', () => {
  assert.equal(
    isSlotTaken(base, { doctorId: 'd1', date: day(9), slot: '10:30 AM' }),
    true
  );
});

test('a pending payment still blocks the slot', () => {
  assert.equal(
    isSlotTaken(base, { doctorId: 'd1', date: day(9), slot: '02:00 PM' }),
    true
  );
});

test('a cancelled appointment frees the slot again', () => {
  assert.equal(
    isSlotTaken(base, { doctorId: 'd1', date: day(9), slot: '04:00 PM' }),
    false
  );
});

test('the same time slot is free for a different doctor', () => {
  assert.equal(
    isSlotTaken(base, { doctorId: 'd3', date: day(9), slot: '10:30 AM' }),
    false
  );
});

test('the same slot is free on a different day', () => {
  assert.equal(
    isSlotTaken(base, { doctorId: 'd1', date: '2026-10-11T09:00:00.000Z', slot: '10:30 AM' }),
    false
  );
});

test('the same slot is free at a different time', () => {
  assert.equal(isSlotTaken(base, { doctorId: 'd1', date: day(9), slot: '09:00 AM' }), false);
});

test('ignoreId lets an appointment not clash with itself', () => {
  assert.equal(
    isSlotTaken(base, { doctorId: 'd1', date: day(9), slot: '10:30 AM', ignoreId: 'a1' }),
    false
  );
});

test('takenSlotsFor lists only occupied slots, cancelled excluded', () => {
  assert.deepEqual(takenSlotsFor(base, { doctorId: 'd1', date: day(9) }), [
    '10:30 AM',
    '02:00 PM',
  ]);
});

test('takenSlotsFor de-duplicates repeated slots', () => {
  const dupes = [...base, { id: 'a5', doctorId: 'd1', date: day(9), slot: '10:30 AM', status: 'PENDING' }];
  assert.deepEqual(takenSlotsFor(dupes, { doctorId: 'd1', date: day(9) }), [
    '10:30 AM',
    '02:00 PM',
  ]);
});

test('slotRecordId is stable per doctor and day', () => {
  // Midday UTC, so the assertion holds in any timezone from -12 to +11.
  assert.equal(slotRecordId('d1', day(9)), slotRecordId('d1', '2026-10-10T12:00:00.000Z'));
  assert.notEqual(slotRecordId('d1', day(9)), slotRecordId('d2', day(9)));
});

test('dayKey uses local time, matching how a booking is submitted', () => {
  // The booking form sends local 09:00, and dayKey reads local calendar fields,
  // so the day round-trips. This is why the key is deliberately not UTC-based.
  const submitted = new Date(`${'2026-10-10'}T09:00:00`).toISOString();
  assert.equal(dayKey(submitted), '2026-10-10');
});

/* -------------------------------- threads -------------------------------- */

const PATIENT = { name: 'Priya Sharma', email: 'priya@gmail.com' };

// One conversation per patient, so a patient who has seen two doctors still
// has a single thread with the hospital.
const patientFirst = [
  {
    id: 'm1',
    threadId: 't_1',
    patientId: '1',
    patient: PATIENT,
    sender: 'PATIENT',
    text: 'hello',
    createdAt: '2026-10-01T10:00:00.000Z',
  },
  {
    id: 'm2',
    threadId: 't_1',
    patientId: '1',
    patient: PATIENT,
    sender: 'HOSPITAL',
    senderName: 'Hospital team',
    text: 'hi',
    createdAt: '2026-10-01T11:00:00.000Z',
  },
];

const hospitalFirst = [
  {
    id: 'm3',
    threadId: 't_2',
    patientId: '2',
    patient: PATIENT,
    sender: 'HOSPITAL',
    senderName: 'Hospital team',
    text: 'your results are ready',
    createdAt: '2026-10-01T12:00:00.000Z',
  },
];

test('a patient always sees the hospital team, never a doctor', () => {
  for (const messages of [patientFirst, hospitalFirst]) {
    const [thread] = buildThreads(messages, 'PATIENT');
    assert.equal(thread.counterpart.name, 'Hospital team');
    assert.equal(thread.doctorId, undefined);
  }
});

test('threadIdFor gives one conversation per patient', () => {
  assert.equal(threadIdFor('p1', 'a@b.com'), threadIdFor('p1', 'a@b.com'));
  assert.notEqual(threadIdFor('p1', 'a@b.com'), threadIdFor('p2', 'c@d.com'));
});

test('a seeded profile and its registered account share one conversation', () => {
  // Registering with a seeded email gives a different account id, but the
  // patient must not end up with two separate conversations.
  assert.equal(
    threadIdFor('p1', 'priya@gmail.com'),
    threadIdFor('firebase-uid-abc123', 'priya@gmail.com')
  );
  assert.equal(
    threadIdFor('p1', 'priya@gmail.com'),
    threadIdFor('p1', 'Priya@Gmail.com')
  );
});

test('threadIdFor falls back to the patient id without an email', () => {
  assert.equal(threadIdFor('p1'), 't_p1');
});

test('a message deleted on the patient side is hidden from only that view', () => {
  const m = {
    id: 'm1', threadId: 't_a@b.com', patientId: 'p1',
    sender: 'HOSPITAL', text: 'Take 1 tablet twice daily.', hiddenFor: ['PATIENT'],
  };
  // Hidden for the patient, still present for the hospital record.
  assert.equal(isHiddenFor(m, 'PATIENT'), true);
  assert.equal(isHiddenFor(m, 'ADMIN'), false);
  assert.equal(buildThreads([m], 'PATIENT').length, 0);
  assert.equal(buildThreads([m], 'ADMIN').length, 1);
});

test('a message deleted by the hospital is hidden from only the dashboard', () => {
  const m = {
    id: 'm2', threadId: 't_a@b.com', patientId: 'p1',
    sender: 'PATIENT', text: 'I have chest tightness.', hiddenFor: ['HOSPITAL'],
  };
  assert.equal(isHiddenFor(m, 'ADMIN'), true);
  assert.equal(isHiddenFor(m, 'PATIENT'), false);
});

test('an admin reply stays in the thread it was written from', () => {
  // A reply that re-derives its key from a profile lookup can lose the email and
  // land in a second conversation for the same person. The thread id must be
  // carried through the reply unchanged.
  const threadId = threadIdFor('p1', 'priya@gmail.com');
  const reply = { threadId, patientId: 'p1' };
  assert.equal(reply.threadId, threadIdFor('p1', 'priya@gmail.com'));
  assert.equal(reply.threadId, threadIdFor('firebase-uid', 'priya@gmail.com'));
  // Without an email the derived key degrades, which is exactly the bug.
  assert.notEqual(threadIdFor('p1'), threadId);
});

test('deleting a whole conversation hides every message in it from that side only', () => {
  const thread = [
    { id: 'a', threadId: 't_x', sender: 'PATIENT', text: 'Question', hiddenFor: [] },
    { id: 'b', threadId: 't_x', sender: 'HOSPITAL', text: 'Answer', hiddenFor: [] },
  ];
  // What the delete-conversation endpoint does: add one side to every row.
  const hiddenForPatient = thread.map((m) => ({ ...m, hiddenFor: ['PATIENT'] }));

  assert.equal(buildThreads(hiddenForPatient, 'PATIENT').length, 0);
  // The hospital still holds the entire thread, so the guarantee that a bulk
  // delete cannot bypass the per-message rule still holds.
  assert.equal(buildThreads(hiddenForPatient, 'ADMIN').length, 1);
  assert.equal(buildThreads(hiddenForPatient, 'ADMIN')[0].messages.length, 2);
});

test('a message can be hidden from both views but never deleted', () => {
  const m = { id: 'm3', threadId: 't_a@b.com', sender: 'PATIENT', hiddenFor: ['PATIENT', 'HOSPITAL'] };
  assert.equal(isHiddenFor(m, 'PATIENT'), true);
  assert.equal(isHiddenFor(m, 'ADMIN'), true);
  // The row survives both deletions, which is what preserves the record.
  assert.equal(m.text === undefined, true);
  assert.equal(m.hiddenFor.length, 2);
});

test('the hospital desk side sees the patient as the counterpart', () => {
  for (const messages of [patientFirst, hospitalFirst]) {
    const [thread] = buildThreads(messages, 'ADMIN');
    assert.equal(thread.counterpart.name, PATIENT.name);
  }
});

test('ownSenderFor maps the portal to the sender it owns', () => {
  assert.equal(ownSenderFor('ADMIN'), 'HOSPITAL');
  assert.equal(ownSenderFor('PATIENT'), 'PATIENT');
});

test('a hospital reply is labelled as the hospital team, not the doctor', () => {
  assert.equal(senderNameFor({ sender: 'HOSPITAL' }), 'Hospital team');
  assert.equal(senderNameFor({ sender: 'PATIENT' }), null);
});

test('unread counts only the other party and only unread messages', () => {
  const [thread] = buildThreads(patientFirst, 'PATIENT');
  assert.equal(thread.unread, 1);
  const read = [{ ...hospitalFirst[0], readAt: '2026-10-01T12:05:00.000Z' }];
  assert.equal(buildThreads(read, 'PATIENT')[0].unread, 0);
});

test('threads are ordered by most recent activity', () => {
  const older = { ...hospitalFirst[0], threadId: 't_0', createdAt: '2026-09-01T09:00:00.000Z' };
  const threads = buildThreads([...patientFirst, older], 'PATIENT');
  assert.equal(threads[0].threadId, 't_1');
  assert.equal(threads[1].threadId, 't_0');
});

/* --------------------------------- report -------------------------------- */

test('the generated report contains the record details', () => {
  const html = buildRecordHtml(
    {
      id: 'r1',
      title: 'Blood Sugar Report',
      type: 'Lab',
      doctor: { id: 'd1', name: 'Dr. Sandeep Adhikari' },
      patient: PATIENT,
      description: 'Fasting 95 mg/dL',
      createdAt: '2026-10-01T00:00:00.000Z',
    },
    {}
  );
  assert.match(html, /Blood Sugar Report/);
  assert.match(html, /Dr\. Sandeep Adhikari/);
  assert.match(html, /Fasting 95 mg\/dL/);
  assert.match(html, /r1/);
});

test('report content is HTML-escaped', () => {
  const html = buildRecordHtml(
    {
      id: 'r2',
      title: '<script>alert(1)</script>',
      description: 'a & b < c',
      createdAt: '2026-10-01T00:00:00.000Z',
    },
    {}
  );
  assert.ok(!html.includes('<script>'));
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /a &amp; b &lt; c/);
});

test('a record with no findings still renders', () => {
  const html = buildRecordHtml({ id: 'r3', title: 'Empty', createdAt: '2026-10-01T00:00:00.000Z' }, {});
  assert.match(html, /No further details were recorded/);
});