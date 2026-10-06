// Notifications are derived from the records the app already has, rather than
// stored as their own list. A stored list has to be written to from every place
// that changes state, and would drift out of step the moment one of those
// writes was missed - which is why the dashboard used to return three
// hard-coded rows that never corresponded to anything the user had done.
//
// Deriving them means the bell can never show something untrue: if the row is
// there, the thing happened, and the time shown is when it happened.

const STATUS_TONE = {
  CONFIRMED: 'success',
  COMPLETED: 'success',
  PAYMENT_PENDING: 'warning',
  CANCELLED: 'danger',
};

const money = (amount) =>
  `Rs ${Number(amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

/** "10 Oct 2026" style day, used when an event happened on a different day. */
const shortDate = (value) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

// A notification is only worth showing if we know when the event happened. The
// fallback is deliberately NOT the appointment's own date: that is a future
// date, so borrowing it dated every notification days ahead, sorted them above
// everything real, and filed them under Today.
const when = (value) => (value ? String(value) : '');

// The two portals name their tabs differently, so a notification has to be
// pointed at the label the viewer's own sidebar actually uses. Getting this
// wrong navigates to a tab that does not exist.
const APPOINTMENT_TAB = { ADMIN: 'Appointments', PATIENT: 'My Appointments' };

// Appointment events. A patient is told about their own booking changing; the
// hospital is told about a booking arriving, because that is the desk's cue to
// prepare for it.
function fromAppointments(appointments, role) {
  return appointments.flatMap((a) => {
    const who = a.patient?.name || 'Patient';
    const doctor = a.doctor?.name || 'Doctor';
    const whenText = `${shortDate(a.date)} • ${a.slot ?? ''}`.trim();

    if (role === 'ADMIN') {
      return [
        {
          id: `booked_${a.id}`,
          kind: 'appointment',
          tab: APPOINTMENT_TAB[role] ?? APPOINTMENT_TAB.PATIENT,
          tone: 'info',
          title: 'New appointment booked',
          message: `${who} • ${doctor} • ${whenText}`,
          createdAt: when(a.createdAt),
        },
      ];
    }

    const status = String(a.status ?? '').toUpperCase();
    if (status === 'CANCELLED') {
      return [
        {
          id: `cancelled_${a.id}`,
          kind: 'appointment',
          tab: APPOINTMENT_TAB[role] ?? APPOINTMENT_TAB.PATIENT,
          tone: 'danger',
          title: 'Appointment cancelled',
          message: `${doctor} • ${whenText}`,
          createdAt: when(a.statusUpdatedAt || a.createdAt),
        },
      ];
    }

    if (status === 'PAYMENT_PENDING') {
      return [
        {
          id: `unpaid_${a.id}`,
          kind: 'appointment',
          tab: APPOINTMENT_TAB[role] ?? APPOINTMENT_TAB.PATIENT,
          tone: 'warning',
          title: 'Payment pending',
          message: `${doctor} • ${whenText}`,
          createdAt: when(a.statusUpdatedAt || a.createdAt),
        },
      ];
    }

    const title =
      status === 'COMPLETED' ? 'Consultation completed' : 'Appointment confirmed';
    return [
      {
        id: `${status.toLowerCase() || 'confirmed'}_${a.id}`,
        kind: 'appointment',
        tab: APPOINTMENT_TAB[role] ?? APPOINTMENT_TAB.PATIENT,
        tone: STATUS_TONE[status] ?? 'info',
        title,
        message: `${doctor} • ${whenText}`,
        createdAt: when(a.statusUpdatedAt || a.createdAt),
      },
    ];
  });
}

function fromBills(bills, role) {
  return bills
    .filter((b) => String(b.status ?? '').toUpperCase() === 'PAID')
    .map((b) => ({
      id: `bill_${b.id}`,
      kind: 'billing',
      tab: role === 'ADMIN' ? 'Billing' : 'Billing & Payments',
      tone: 'success',
      title: 'Payment received',
      message: `${money(b.amount)} • ${b.payment?.method ?? 'eSewa'} • ${
        b.payment?.patientName || b.patient?.name || 'Patient'
      }`,
      createdAt: when(b.paidAt || b.createdAt),
    }));
}

function fromRecords(records, role) {
  return records.map((r) => ({
    id: `record_${r.id}`,
    kind: 'record',
    tab: role === 'ADMIN' ? 'Medical Records' : 'Medical Records',
    tone: 'info',
    title: 'Medical report available',
    message: `${r.title ?? 'Report'} • ${r.type ?? 'General'}${
      role === 'ADMIN' && r.patient?.name ? ` • ${r.patient.name}` : ''
    }`,
    createdAt: when(r.updatedAt || r.createdAt),
  }));
}

/**
 * Unread chat is collapsed into one notification rather than one per message,
 * so a long conversation does not push everything else off the list.
 */
function fromMessages(messages, role) {
  const unread = messages.filter((m) => !m.readAt && m.sender !== (role === 'ADMIN' ? 'HOSPITAL' : 'PATIENT'));
  if (!unread.length) return [];

  const latest = unread[unread.length - 1];
  const patients = new Set(unread.map((m) => m.patient?.name).filter(Boolean));
  return [
    {
      id: `unread_${latest.id}`,
      kind: 'message',
      tab: 'Messages',
      tone: 'info',
      title: unread.length === 1 ? 'New message' : `${unread.length} new messages`,
      message:
        role === 'ADMIN'
          ? [...patients].slice(0, 3).join(', ') || 'From the hospital desk'
          : 'Reply from the hospital team',
      createdAt: when(latest.createdAt),
    },
  ];
}

/**
 * Build the notification list for a portal.
 *
 * @param role      'ADMIN' or 'PATIENT' - decides the wording and the tab each
 *                  notification links to.
 * @param messages  Required for the unread-chat notification; omit it and that
 *                  entry is simply absent.
 * @param now       Injectable clock for tests.
 */
export function buildNotifications({
  role,
  appointments = [],
  bills = [],
  records = [],
  messages = [],
  limit = 25,
  now = new Date(),
} = {}) {
  // A notification dated in the future is a bug in whatever produced it, and
  // left alone it sorts above everything real and files itself under "Today".
  // Dropped rather than clamped, so a wrong timestamp cannot masquerade as news.
  const cutoff = now.getTime() + 60_000;

  const rows = [
    ...fromAppointments(appointments, role),
    ...fromBills(bills, role),
    ...fromRecords(records, role),
    ...fromMessages(messages, role),
  ]
    .filter((n) => n.createdAt)
    .filter((n) => new Date(n.createdAt).getTime() <= cutoff)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

  return rows.slice(0, limit);
}

// Rendered by hand rather than via toLocaleDateString: the short month name is
// ICU-dependent ("Sept" in some en-GB environments, "Sep" in others), so a
// locale-derived label would not match what the tests or the user's machine say.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Split the list into day sections, newest day first, so the panel reads as a
 * timeline rather than one undifferentiated wall. Within a day the newest entry
 * is at the top.
 *
 * Today and Yesterday are named, the last week is named by weekday, and
 * anything older falls back to a date so a month-old entry is still identifiable.
 */
export function groupNotifications(notifications, now = new Date()) {
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 86_400_000;

  // Keyed by the section's own midnight so sections can be ordered by date
  // rather than by comparing label text.
  const sections = new Map();
  for (const n of notifications) {
    const time = new Date(n.createdAt).getTime();
    if (Number.isNaN(time)) continue;
    const at = new Date(time);
    const key = new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime();
    const dayDiff = Math.round((midnight - key) / day);

    let label;
    if (dayDiff <= 0) label = 'Today';
    else if (dayDiff === 1) label = 'Yesterday';
    else if (dayDiff < 7) label = at.toLocaleDateString(undefined, { weekday: 'long' });
    else label = `${at.getDate()} ${MONTHS[at.getMonth()]} ${at.getFullYear()}`;

    if (!sections.has(key)) sections.set(key, { label, items: [] });
    sections.get(key).items.push(n);
  }

  return [...sections.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, section]) => section);
}

/**
 * How many are newer than the last time this user opened the panel. Tracked as a
 * timestamp rather than per-item read flags, so an event that arrives while the
 * panel is closed still shows up as unread instead of being silently missed.
 */
export const countUnread = (notifications, seenAt) => {
  const mark = new Date(seenAt ?? 0).getTime();
  if (!Number.isFinite(mark)) return notifications.length;
  return notifications.filter((n) => new Date(n.createdAt).getTime() > mark).length;
};

export const seenKey = (userId) => `swasthya.seen.${userId || 'guest'}`;

export const readSeenAt = (userId) => {
  try {
    return localStorage.getItem(seenKey(userId)) || '';
  } catch {
    // Storage can be unavailable (private mode); treated as "nothing seen yet".
    return '';
  }
};

export const writeSeenAt = (userId, value = new Date().toISOString()) => {
  try {
    localStorage.setItem(seenKey(userId), value);
  } catch {
    // Losing the read marker only costs a repeat badge, never data.
  }
  return value;
};