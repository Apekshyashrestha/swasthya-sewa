// Booking-conflict rules, shared by the Firestore and localStorage API layers
// so both behave identically and the rule has a single definition.
//
// A doctor's day is divided into fixed slots. A slot is unavailable when a
// non-cancelled appointment already exists for that doctor, on that calendar
// day, at that time, or when that time has already passed.

/** Calendar-day key. Two bookings clash on the same date regardless of clock time. */
export const dayKey = (value) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

/** Document id for a doctor's slot-occupancy record on one day. */
export const slotRecordId = (doctorId, date) => `${doctorId}__${dayKey(date)}`;

/** How far ahead a patient must book, so a slot cannot be taken as it starts. */
export const BOOKING_LEAD_MINUTES = 30;

/**
 * Minutes since midnight for a "09:00 AM" style slot label.
 * Returns null for anything unrecognised rather than guessing.
 */
export const slotMinutes = (slot) => {
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(String(slot ?? '').trim());
  if (!match) return null;
  let hours = Number(match[1]) % 12;
  if (match[3].toUpperCase() === 'PM') hours += 12;
  const minutes = hours * 60 + Number(match[2]);
  return minutes >= 0 && minutes < 24 * 60 ? minutes : null;
};

/**
 * The moment a slot begins. `date` may be a full ISO timestamp or a plain
 * YYYY-MM-DD calendar date; a plain date is read in the reader's own timezone
 * rather than as UTC midnight, which would shift the day for anyone west of
 * Greenwich and make a "today" slot look like tomorrow's.
 */
export const slotStart = (date, slot) => {
  const minutes = slotMinutes(slot);
  if (minutes === null) return null;
  const value = String(date ?? '');
  const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  const base = ymd
    ? new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]), 0, 0, 0, 0)
    : new Date(value);
  if (Number.isNaN(base.getTime())) return null;
  return new Date(base.getFullYear(), base.getMonth(), base.getDate(), 0, minutes, 0, 0);
};

/**
 * True when a slot can no longer be booked: either it has already started, or it
 * starts inside the lead time. Only ever true for today; future days are open.
 */
export const isSlotPast = (date, slot, now = new Date(), leadMinutes = BOOKING_LEAD_MINUTES) => {
  const start = slotStart(date, slot);
  if (!start) return false;
  return start.getTime() < now.getTime() + leadMinutes * 60_000;
};

/** The earliest bookable moment, used to bound the date picker. */
export const earliestBookableDate = (now = new Date(), leadMinutes = BOOKING_LEAD_MINUTES) =>
  new Date(now.getTime() + leadMinutes * 60_000);

const blocks = (appointment, doctorId, date, slot, ignoreId) =>
  appointment.id !== ignoreId &&
  appointment.doctorId === doctorId &&
  appointment.status !== 'CANCELLED' &&
  appointment.slot === slot &&
  dayKey(appointment.date) === dayKey(date);

/** True when this exact doctor/date/slot is already taken. */
export const isSlotTaken = (appointments, { doctorId, date, slot, ignoreId } = {}) =>
  appointments.some((a) => blocks(a, doctorId, date, slot, ignoreId));

/**
 * True when the slot cannot be booked at all, whether because it is taken or
 * because the time has passed. The API layers use this so a stale form, or a
 * request replayed after the slot started, is rejected server-side.
 */
export const isSlotUnavailable = (
  appointments,
  { doctorId, date, slot, ignoreId, now = new Date(), leadMinutes } = {}
) =>
  isSlotTaken(appointments, { doctorId, date, slot, ignoreId }) ||
  isSlotPast(date, slot, now, leadMinutes);

/** Every occupied slot for a doctor on a given day. */
export const takenSlotsFor = (appointments, { doctorId, date } = {}) => [
  ...new Set(
    appointments
      .filter(
        (a) =>
          a.doctorId === doctorId &&
          a.status !== 'CANCELLED' &&
          dayKey(a.date) === dayKey(date)
      )
      .map((a) => a.slot)
  ),
];