import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  BadgeIndianRupee,
  CalendarCheck2,
  CalendarPlus,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  Download,
  FileText,
  HeartPulse,
  Info,
  MapPin,
  MessageSquare,
  Phone,
  Receipt,
  Stethoscope,
  User,
  XCircle,
} from "lucide-react";
import api from "../lib/api.js";
import {
  CONSULT_SLOTS,
  firstName,
  formatDate,
  formatDateTime,
  formatMoney,
  formatRelative,
  greetingFor,
  isToday,
  mockTxnId,
  PAYMENT_METHODS,
  toDateInputValue,
  titleCase,
  wait,
} from "../lib/format.js";
import { isSlotPast } from "../lib/scheduling.js";
import { downloadRecordFile } from "../lib/report.js";
import { useDashboard } from "../hooks/useDashboard.js";
import { useToast } from "../context/useToast.js";
import { Avatar } from "../components/ui/Avatar.jsx";
import { Badge, StatusBadge } from "../components/ui/Badge.jsx";
import { Button } from "../components/ui/Button.jsx";
import { Card, CardBody, CardHeader } from "../components/ui/Card.jsx";
import { EmptyState, LoadingBlock } from "../components/ui/Feedback.jsx";
import { Field, Input, Select, Textarea } from "../components/ui/Field.jsx";
import MessagesPanel from "../components/MessagesPanel.jsx";
import { buildThreads } from "../lib/threads.js";
import { Modal } from "../components/ui/Modal.jsx";
import { StatCard } from "../components/ui/StatCard.jsx";

const EMPTY_BOOKING = {
  doctorId: "",
  date: toDateInputValue(),
  slot: CONSULT_SLOTS[0],
  reason: "",
};

export default function PatientPortal({ user, onOpenProfile, search, activeTab, onNavigate }) {
  const toast = useToast();
  const { data: dash, loading: dashLoading, refresh: refreshDash } = useDashboard();

  const [doctors, setDoctors] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [bills, setBills] = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  const [bookingOpen, setBookingOpen] = useState(false);
  const [booking, setBooking] = useState(EMPTY_BOOKING);
  const [saving, setSaving] = useState(false);
  const [payTarget, setPayTarget] = useState(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [takenSlots, setTakenSlots] = useState([]);
  const [recordView, setRecordView] = useState(null);
  const [messages, setMessages] = useState([]);
  const [activeThread, setActiveThread] = useState("");
  const [sendingMsg, setSendingMsg] = useState(false);

  const loadAll = useCallback(async () => {
    const [d, a, b, r] = await Promise.allSettled([
      api.get("/doctors"),
      api.get("/appointments/my"),
      api.get("/bills/my"),
      api.get("/records/my"),
    ]);
    setDoctors(d.status === "fulfilled" ? d.value.data ?? [] : []);
    setAppointments(a.status === "fulfilled" ? a.value.data ?? [] : []);
    setBills(b.status === "fulfilled" ? b.value.data ?? [] : []);
    setRecords(r.status === "fulfilled" ? r.value.data ?? [] : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      if (active) await loadAll();
    })();
    return () => {
      active = false;
    };
  }, [loadAll]);

  // Live message stream. Firestore pushes changes as they happen; the mock
  // implementation polls. Messages are therefore never stale on screen.
  useEffect(() => {
    let unsubscribe = null;
    let cancelled = false;
    api
      .subscribe("/messages/my", (rows) => {
        if (!cancelled) setMessages(rows ?? []);
      })
      .then((unsub) => {
        if (cancelled) unsub?.();
        else unsubscribe = unsub;
      })
      .catch(() => {
        /* stream is best-effort; the tab still loads via manual reload */
      });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  // Derived rather than stored, so a late-arriving doctor list needs no effect.
  const selectedDoctorId = booking.doctorId || doctors[0]?.id || "";
  const selectedDoctor = doctors.find((d) => d.id === selectedDoctorId) ?? null;
  const fee = Number(selectedDoctor?.fee) || 0;

  // Slot occupancy for the doctor and date currently chosen in the form. Fetched
  // on demand so an already-booked time is disabled rather than only rejected
  // after the patient fills in the rest of the form.
  const refreshSlots = useCallback(async (doctorId, date) => {
    if (!doctorId || !date) {
      setTakenSlots([]);
      return;
    }
    try {
      const { data } = await api.get("/appointments/slots", { doctorId, date });
      setTakenSlots(data?.taken ?? []);
    } catch {
      setTakenSlots([]);
    }
  }, []);

  const openBooking = (doctorId) => {
    // Default to the first slot that can still be booked. The fixed first slot
    // is often already in the past by the time the form is opened.
    const date = toDateInputValue();
    const firstFree = CONSULT_SLOTS.find((slot) => !isSlotPast(date, slot)) ?? '';
    const next = {
      ...EMPTY_BOOKING,
      doctorId: doctorId ?? doctors[0]?.id ?? "",
      date,
      slot: firstFree,
    };
    setBooking(next);
    setBookingOpen(true);
    refreshSlots(next.doctorId, next.date);
  };

  const refresh = useCallback(async () => {
    await Promise.all([loadAll(), refreshDash()]);
  }, [loadAll, refreshDash]);

  const submitBooking = async (e) => {
    e.preventDefault();
    if (!selectedDoctorId) {
      toast.error("Please choose a doctor.");
      return;
    }
    if (!booking.date) {
      toast.error("Please choose a date.");
      return;
    }
    if (!booking.slot) {
      toast.error("No times are left for that day. Please choose another date.");
      return;
    }
    if (takenSlots.includes(booking.slot)) {
      toast.error("That time slot has already been booked. Please choose another one.");
      return;
    }
    if (isSlotPast(booking.date, booking.slot)) {
      toast.error("That time has already passed. Please choose a later slot or another day.");
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.post("/appointments", {
        doctorId: selectedDoctorId,
        date: new Date(`${booking.date}T09:00:00`).toISOString(),
        slot: booking.slot,
        reason: booking.reason.trim() || "General consultation",
      });
      setBookingOpen(false);
      setPayTarget({ ...data, fee: data?.fee ?? fee });
      toast.info("Appointment held. Complete the payment to confirm it.");
      await refresh();
    } catch (err) {
      // The server is authoritative: a slot may be taken between the form being
      // filled in and the booking being submitted.
      if (/already been booked/i.test(err.message ?? "")) {
        refreshSlots(selectedDoctorId, booking.date);
      }
      toast.error(err.message || "Could not book the appointment.");
    } finally {
      setSaving(false);
    }
  };

  const cancelAppointment = async (appointment) => {
    if (!window.confirm("Cancel this appointment? This cannot be undone.")) return;
    try {
      await api.patch(`/appointments/${appointment.id}/cancel`);
      toast.success("Appointment cancelled.");
      await refresh();
    } catch (err) {
      toast.error(err.message || "Could not cancel the appointment.");
    }
  };

  const payBill = async (bill) => {
    try {
      await api.post(`/bills/${bill.id}/pay`, { method: "Card" });
      toast.success(`Payment of ${formatMoney(bill.amount)} recorded.`);
      await refresh();
    } catch (err) {
      toast.error(err.message || "Payment failed.");
    }
  };

  const downloadRecord = (record) => {
    // Records are structured data, so the download is a generated report rather
    // than an attached file. If a real attachment exists it is linked inside it.
    try {
      const name = downloadRecordFile(record, { patient: user });
      toast.success(`Report downloaded as ${name}`);
    } catch {
      toast.error("Could not generate the report. Please try again.");
    }
  };

  const threads = useMemo(() => buildThreads(messages, "PATIENT"), [messages]);

  const reloadMessages = async () => {
    const { data } = await api.get("/messages/my");
    setMessages(data ?? []);
  };

  const sendMessage = async (thread, text) => {
    setSendingMsg(true);
    try {
      await api.post("/messages", { text });
      await reloadMessages();
    } catch (err) {
      toast.error(err.message || "Could not send the message.");
    } finally {
      setSendingMsg(false);
    }
  };

  // The panel always passes the addressee first, even when there is none, so the
  // admin inbox and this single hospital conversation share one callback shape.
  const sendToHospital = async (_target, text) => {
    setSendingMsg(true);
    try {
      await api.post("/messages", { text });
      await reloadMessages();
      toast.success("Message sent to the hospital.");
    } catch (err) {
      toast.error(err.message || "Could not send the message.");
    } finally {
      setSendingMsg(false);
    }
  };

  // Hides the message from the patient's own view. The hospital keeps their
  // copy, since a clinical conversation is not the patient's to erase.
  const deleteMessage = async (message) => {
    try {
      await api.post(`/messages/${message.id}/visibility`);
      await reloadMessages();
      toast.success("Message hidden from your view.");
    } catch (err) {
      toast.error(err.message || "Could not delete the message.");
    }
  };

  // Hides the entire conversation from the patient's view in one step. The
  // hospital keeps the full thread.
  const deleteConversation = async (thread) => {
    try {
      await api.post("/messages/thread/visibility", { threadId: thread.threadId });
      setActiveThread("");
      await reloadMessages();
      toast.success("Conversation deleted from your view.");
    } catch (err) {
      toast.error(err.message || "Could not delete the conversation.");
    }
  };

  const openThread = async (thread) => {
    setActiveThread(thread.threadId);
    if (thread.unread === 0) return;
    try {
      await api.post("/messages/read", { threadId: thread.threadId });
      await reloadMessages();
    } catch {
      // Read receipts are best-effort; never block the conversation.
    }
  };

  // The Consultations tab is chat-based: it routes into Messages. The patient has
  // a single conversation, so an existing one is simply opened; the composer only
  // appears when they have never written in.
  const askHospital = () => {
    onNavigate("Messages");
    setActiveThread(threads[0]?.threadId ?? "");
    if (threads.length === 0) setComposeOpen(true);
  };

  const upcoming = useMemo(
    () =>
      appointments
        .filter((a) => a.status !== "CANCELLED" && a.status !== "COMPLETED")
        .sort((a, b) => new Date(a.date) - new Date(b.date)),
    [appointments]
  );

  const confirmed = useMemo(
    () => appointments.filter((a) => a.status === "CONFIRMED"),
    [appointments]
  );

  const pendingBills = bills.filter((b) => b.status === "PENDING");
  const outstanding = pendingBills.reduce(
    (sum, b) => sum + (Number(b.amount) || 0),
    0
  );
  const paidTotal = bills
    .filter((b) => b.status === "PAID")
    .reduce((sum, b) => sum + (Number(b.amount) || 0), 0);

  const filteredDoctors = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return doctors;
    return doctors.filter(
      (d) =>
        d.name?.toLowerCase().includes(q) ||
        d.specialty?.toLowerCase().includes(q)
    );
  }, [doctors, search]);

  return (
    <>
      <div className="page-inner">
        {activeTab === "Dashboard" && (
          <DashboardTab
            user={user}
            dash={dash}
            dashLoading={dashLoading}
            loading={loading}
            upcoming={upcoming}
            outstanding={outstanding}
            paidTotal={paidTotal}
            recordsCount={records.length}
            onNavigate={onNavigate}
            onBook={openBooking}
          />
        )}

        {activeTab === "Book Appointment" && (
          <DoctorsTab
            doctors={filteredDoctors}
            loading={loading}
            query={search}
            onBook={openBooking}
          />
        )}

        {activeTab === "My Appointments" && (
          <AppointmentsTab
            appointments={appointments}
            loading={loading}
            search={search}
            onCancel={cancelAppointment}
            onBook={openBooking}
            onPay={setPayTarget}
          />
        )}

        {activeTab === "Consultation" && (
          <ConsultationTab
            appointments={confirmed}
            loading={loading}
            search={search}
            upcoming={upcoming}
            onMessage={askHospital}
          />
        )}

        {activeTab === "Messages" && (
          <MessagesPanel
            role="PATIENT"
            counterpartLabel="Hospital team"
            composeTitle="Message the hospital"
            composeDescription="Ask about an appointment, a report, or anything else."
            composeFieldLabel={null}
            replyPlaceholder="Write your message to the hospital…"
            threads={threads}
            activeId={activeThread}
            onSelect={openThread}
            onOpen={openThread}
            onSend={sendMessage}
            onStartThread={sendToHospital}
            onDelete={deleteMessage}
            onDeleteThread={deleteConversation}
            initialComposeOpen={composeOpen}
            onComposeOpenChange={setComposeOpen}
            loading={loading}
            sending={sendingMsg}
          />
        )}

        {activeTab === "Billing & Payments" && (
          <BillingTab
            bills={bills}
            loading={loading}
            search={search}
            outstanding={outstanding}
            paidTotal={paidTotal}
            onPay={payBill}
          />
        )}

        {activeTab === "Medical Records" && (
          <RecordsTab
            records={records}
            loading={loading}
            search={search}
            onView={setRecordView}
            onDownload={downloadRecord}
          />
        )}

        {activeTab === "Profile" && (
          <ProfileTab user={user} onEdit={onOpenProfile} />
        )}
      </div>

      <Modal
        open={bookingOpen}
        onClose={() => setBookingOpen(false)}
        title="Book an appointment"
        description="Pick a doctor, date and time — then pay the fee to confirm."
        footer={
          <>
            <Button variant="secondary" onClick={() => setBookingOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitBooking} loading={saving}>
              Continue to payment
            </Button>
          </>
        }
      >
        <form className="stack stack-5" onSubmit={submitBooking} id="booking-form">
          <Field label="Doctor" htmlFor="bk-doctor">
            <Select
              id="bk-doctor"
              icon={Stethoscope}
              value={selectedDoctorId}
              onChange={(e) => {
                const doctorId = e.target.value;
                setBooking((b) => ({ ...b, doctorId }));
                refreshSlots(doctorId, booking.date);
              }}
            >
              {doctors.length === 0 && <option value="">No doctors available</option>}
              {doctors.map((d) => (
                <option key={d.id} value={d.id} disabled={!d.available}>
                  {d.name} — {d.specialty} ({formatMoney(d.fee)})
                  {d.available ? "" : " · unavailable"}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid grid-2">
            <Field label="Date" htmlFor="bk-date">
              <Input
                id="bk-date"
                type="date"
                value={booking.date}
                min={toDateInputValue()}
                onChange={(e) => {
                  const date = e.target.value;
                  // Moving to another day may invalidate the chosen slot.
                  setBooking((b) => ({
                    ...b,
                    date,
                    slot: isSlotPast(date, b.slot)
                      ? CONSULT_SLOTS.find((s) => !isSlotPast(date, s)) ?? b.slot
                      : b.slot,
                  }));
                  refreshSlots(selectedDoctorId, date);
                }}
              />
            </Field>
            <Field label="Patient" htmlFor="bk-patient">
              <Input
                id="bk-patient"
                icon={User}
                readOnly
                value={user.name}
                tabIndex={-1}
              />
            </Field>
          </div>

          <Field
            label="Time slot"
            hint={
              takenSlots.length
                ? "Times shown in Nepal Standard Time. Unavailable times are marked."
                : "Times shown in Nepal Standard Time"
            }
          >
            <div className="slot-grid">
              {CONSULT_SLOTS.map((slot) => {
                const isTaken = takenSlots.includes(slot);
                // A slot that has already started cannot be booked, so it is
                // shown greyed out rather than failing on submit.
                const isPast = isSlotPast(booking.date, slot);
                const blocked = isTaken || isPast;
                return (
                  <button
                    key={slot}
                    type="button"
                    className={`slot ${booking.slot === slot ? "is-active" : ""} ${
                      blocked ? "is-taken" : ""
                    }`}
                    disabled={blocked}
                    aria-disabled={blocked}
                    title={isPast ? "Time has passed" : isTaken ? "Already booked" : undefined}
                    onClick={() => setBooking((b) => ({ ...b, slot }))}
                  >
                    {slot}
                    {isPast ? (
                      <span className="slot-taken-note">Passed</span>
                    ) : isTaken ? (
                      <span className="slot-taken-note">Booked</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field
            label="Reason for visit"
            hint="Optional, but it helps the doctor prepare."
            htmlFor="bk-reason"
          >
            <Textarea
              id="bk-reason"
              rows={3}
              placeholder="e.g. Chest pain for the last three days"
              value={booking.reason}
              onChange={(e) =>
                setBooking((b) => ({ ...b, reason: e.target.value }))
              }
            />
          </Field>

          <div
            className="row row-between"
            style={{
              padding: "var(--sp-4)",
              background: "var(--primary-soft)",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-lg)",
            }}
          >
            <div>
              <div className="t-sm t-bold">Consultation fee</div>
              <div className="t-xs t-muted">
                You pay this on the next step to confirm the booking.
              </div>
            </div>
            <span className="t-md t-bold t-num">{formatMoney(fee)}</span>
          </div>
        </form>
      </Modal>

      {payTarget && (
        <PaymentModal
          key={payTarget.id}
          appointment={payTarget}
          onClose={() => setPayTarget(null)}
          onPaid={refresh}
        />
      )}

      {recordView && (
        <ReportModal
          record={recordView}
          patient={user}
          onClose={() => setRecordView(null)}
          onDownload={downloadRecord}
        />
      )}
    </>
  );
}

/* ============================ MOCK PAYMENT ============================ */

function PaymentSummary({ appointment, fee }) {
  const doctor = appointment?.doctor ?? {};
  return (
    <div
      className="stack stack-2"
      style={{
        padding: "var(--sp-4)",
        background: "var(--bg-surface-2)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)",
      }}
    >
      <div className="row row-2">
        <Stethoscope size={15} className="t-muted" aria-hidden="true" />
        <span className="t-sm t-bold">{doctor.name ?? "Doctor"}</span>
        {doctor.specialty ? (
          <span className="t-xs t-muted">{doctor.specialty}</span>
        ) : null}
      </div>
      <div className="t-xs t-muted">
        {formatDate(appointment?.date)}
        {appointment?.slot ? ` · ${appointment.slot}` : ""}
      </div>
      <div className="divider" />
      <div className="row row-between">
        <span className="t-sm t-muted">Consultation fee</span>
        <span className="t-sm t-bold t-num">{formatMoney(fee)}</span>
      </div>
    </div>
  );
}

function ReceiptRow({ label, value }) {
  return (
    <div
      className="row row-between row-wrap"
      style={{
        padding: "var(--sp-2) 0",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <span className="t-sm t-muted">{label}</span>
      <span className="t-sm t-bold" style={{ textAlign: "right" }}>
        {value}
      </span>
    </div>
  );
}

function PaymentModal({ appointment, onClose, onPaid }) {
  const toast = useToast();
  const [step, setStep] = useState("methods");
  const [methodId, setMethodId] = useState(PAYMENT_METHODS[0].id);
  const [receipt, setReceipt] = useState(null);

  const fee = Number(appointment?.fee ?? appointment?.doctor?.fee) || 0;
  const method =
    PAYMENT_METHODS.find((m) => m.id === methodId) ?? PAYMENT_METHODS[0];

  const payNow = async () => {
    setStep("processing");
    try {
      await wait(1400 + Math.floor(Math.random() * 600));
      const txnId = mockTxnId();
      const { data } = await api.post(`/appointments/${appointment.id}/pay`, {
        method: method.id,
        methodLabel: method.label,
        amount: fee,
        txnId,
      });
      setReceipt({
        txnId: data?.payment?.txnId ?? txnId,
        method: data?.payment?.method ?? method.label,
        amount: data?.payment?.amount ?? fee,
      });
      setStep("success");
      toast.success("Payment successful. Appointment confirmed.");
      await onPaid?.();
    } catch (err) {
      setStep("failed");
      toast.error(
        err.message || "Payment failed. The appointment is still unpaid."
      );
    }
  };

  const title =
    step === "success"
      ? "Payment successful"
      : step === "processing"
        ? "Processing payment"
        : step === "failed"
          ? "Payment failed"
          : "Pay consultation fee";

  let footer;
  if (step === "success") {
    footer = <Button onClick={onClose}>Done</Button>;
  } else if (step === "failed") {
    footer = (
      <>
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
        <Button onClick={() => setStep("methods")}>Try again</Button>
      </>
    );
  } else if (step === "processing") {
    footer = (
      <Button variant="secondary" onClick={onClose} disabled>
        Processing…
      </Button>
    );
  } else {
    footer = (
      <>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={payNow}>Pay {formatMoney(fee)}</Button>
      </>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      description="Complete the payment to confirm your appointment."
      footer={footer}
    >
      {step === "methods" && (
        <div className="stack stack-4">
          <PaymentSummary appointment={appointment} fee={fee} />

          <div className="stack stack-3">
            <div className="t-label">Payment method</div>
            {PAYMENT_METHODS.map((m) => {
              const active = m.id === methodId;
              return (
                <label
                  key={m.id}
                  className="row row-3"
                  style={{
                    padding: "var(--sp-3) var(--sp-4)",
                    border: `1px solid ${active ? "var(--primary)" : "var(--border)"}`,
                    borderRadius: "var(--r-md)",
                    background: active
                      ? "var(--primary-soft)"
                      : "var(--bg-surface)",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="radio"
                    name="payment-method"
                    checked={active}
                    onChange={() => setMethodId(m.id)}
                    style={{ accentColor: "var(--primary)" }}
                  />
                  <div className="grow">
                    <div className="t-sm t-bold">{m.label}</div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {step === "processing" && (
        <div className="stack stack-4">
          <div
            className="stack stack-3"
            style={{ alignItems: "center", padding: "var(--sp-6) 0" }}
          >
            <span className="spinner" />
            <div className="t-bold">Processing Payment…</div>
            <div className="t-sm t-muted t-center">
              Contacting {method.label}. Please do not close this window.
            </div>
          </div>
          <PaymentSummary appointment={appointment} fee={fee} />
        </div>
      )}

      {step === "success" && (
        <div className="stack stack-4">
          <div
            className="stack stack-3"
            style={{ alignItems: "center", padding: "var(--sp-4) 0" }}
          >
            <span className="stat-icon tone-success" style={{ width: 52, height: 52 }}>
              <CheckCircle2 size={26} aria-hidden="true" />
            </span>
            <div className="t-display">Payment Successful</div>
            <div className="t-sm t-muted t-center">
              Your appointment is confirmed and the fee is recorded.
            </div>
          </div>

          <div className="stack stack-1">
            <ReceiptRow label="Transaction ID" value={receipt?.txnId ?? "—"} />
            <ReceiptRow label="Payment method" value={receipt?.method ?? "—"} />
            <ReceiptRow label="Amount paid" value={formatMoney(receipt?.amount)} />
            <ReceiptRow
              label="Doctor"
              value={appointment?.doctor?.name ?? "Doctor"}
            />
            <ReceiptRow
              label="Appointment"
              value={`${formatDate(appointment?.date)}${appointment?.slot ? ` · ${appointment.slot}` : ""}`}
            />
            <ReceiptRow
              label="Patient"
              value={[
                appointment?.patient?.name,
                appointment?.patient?.email,
              ]
                .filter(Boolean)
                .join(" · ")}
            />
          </div>
        </div>
      )}

      {step === "failed" && (
        <div className="stack stack-4">
          <div
            className="stack stack-3"
            style={{ alignItems: "center", padding: "var(--sp-4) 0" }}
          >
            <span className="stat-icon tone-danger" style={{ width: 52, height: 52 }}>
              <XCircle size={26} aria-hidden="true" />
            </span>
            <div className="t-display">Payment failed</div>
            <div className="t-sm t-muted t-center">
              No money was taken. The appointment stays as Payment Pending until
              the fee is paid.
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ============================== DASHBOARD ============================== */

function DashboardTab({
  user,
  dash,
  dashLoading,
  loading,
  upcoming,
  outstanding,
  paidTotal,
  recordsCount,
  onNavigate,
  onBook,
}) {
  const dashValue = (value, fallback = 0) =>
    dashLoading ? "—" : (value ?? fallback);

  return (
    <>
      <section className="hero">
        <span className="hero-eyebrow">
          <HeartPulse size={13} />
          {formatDate(new Date(), { weekday: "long", day: "numeric", month: "long" })}
        </span>
        <h2>
          {greetingFor()}, {firstName(user.name)}.
        </h2>
        <p>
          Here is your health at a glance. You have{" "}
          <strong style={{ color: "#fff" }}>
            {upcoming.length} upcoming {upcoming.length === 1 ? "visit" : "visits"}
          </strong>
          {outstanding > 0 && (
            <>
              {" "}and{" "}
              <strong style={{ color: "#fff" }}>
                {formatMoney(outstanding)} outstanding
              </strong>
            </>
          )}
          .
        </p>

        <div className="hero-stats">
          <button
            type="button"
            className="hero-stat"
            onClick={() => onNavigate("My Appointments")}
          >
            <span className="hero-stat-value">{dashValue(dash?.upcomingCount)}</span>
            <span className="hero-stat-label">Appointments</span>
          </button>
          <button
            type="button"
            className="hero-stat"
            onClick={() => onNavigate("Consultation")}
          >
            <span className="hero-stat-value">
              {dashValue(dash?.consultationsCount)}
            </span>
            <span className="hero-stat-label">Consultations</span>
          </button>
          <button
            type="button"
            className="hero-stat"
            onClick={() => onNavigate("Billing & Payments")}
          >
            <span className="hero-stat-value">{dashValue(dash?.totalBills)}</span>
            <span className="hero-stat-label">Total billed</span>
          </button>
          <button
            type="button"
            className="hero-stat"
            onClick={() => onNavigate("Medical Records")}
          >
            <span className="hero-stat-value">{dashValue(recordsCount)}</span>
            <span className="hero-stat-label">Records</span>
          </button>
        </div>
      </section>

      <div className="stat-grid">
        <StatCard
          icon={CalendarCheck2}
          tone="brand"
          label="Upcoming visits"
          value={dashValue(dash?.upcomingCount)}
          meta="Next 30 days"
          onClick={() => onNavigate("My Appointments")}
        />
        <StatCard
          icon={MessageSquare}
          tone="info"
          label="Tele-consultations"
          value={dashValue(dash?.consultationsCount)}
          meta="Chat with your doctor"
          onClick={() => onNavigate("Consultation")}
        />
        <StatCard
          icon={BadgeIndianRupee}
          tone={outstanding > 0 ? "warning" : "success"}
          label="Outstanding"
          value={formatMoney(outstanding)}
          meta={outstanding > 0 ? "Payment due" : "All clear"}
          onClick={() => onNavigate("Billing & Payments")}
        />
        <StatCard
          icon={FileText}
          tone="accent"
          label="Lifetime paid"
          value={formatMoney(paidTotal)}
          meta="Settled invoices"
          onClick={() => onNavigate("Billing & Payments")}
        />
      </div>

      <div className="grid grid-dash-main">
        <Card>
          <CardHeader
            title="Next appointments"
            subtitle="Your upcoming visits in order"
            action={
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onNavigate("My Appointments")}
                iconRight={ArrowUpRight}
              >
                View all
              </Button>
            }
          />
          <CardBody flush>
            {loading ? (
              <div style={{ padding: "var(--sp-6)" }}>
                <LoadingBlock />
              </div>
            ) : upcoming.length === 0 ? (
              <EmptyState
                icon={CalendarPlus}
                title="No appointments yet"
                text="Book your first visit with one of our specialists — it only takes a minute."
                compact
                action={
                  <Button size="sm" onClick={() => onBook()}>
                    Book an appointment
                  </Button>
                }
              />
            ) : (
              <div className="list">
                {upcoming.slice(0, 3).map((a) => (
                  <AppointmentRow key={a.id} appointment={a} />
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Quick actions" />
          <CardBody>
            <div className="stack stack-3">
              <QuickAction
                icon={CalendarPlus}
                title="Book an appointment"
                text="Choose a doctor and time"
                onClick={() => onBook()}
                primary
              />
              <QuickAction
                icon={MessageSquare}
                title="Message your doctor"
                text="Ask questions about your visit"
                onClick={() => onNavigate("Messages")}
              />
              <QuickAction
                icon={CreditCard}
                title="Pay outstanding bills"
                text="Secure online payment"
                onClick={() => onNavigate("Billing & Payments")}
              />
              <QuickAction
                icon={FileText}
                title="View medical records"
                text="Reports and prescriptions"
                onClick={() => onNavigate("Medical Records")}
              />
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-dash-half">
        <Card>
          <CardHeader title="Recent activity" subtitle="Latest updates on your care" />
          <CardBody>
            {(dash?.activities ?? []).length === 0 ? (
              <EmptyState
                icon={Info}
                title="Nothing yet"
                text="Activity from your doctors will show up here."
                compact
              />
            ) : (
              <div className="timeline">
                {dash.activities.slice(0, 4).map((act, i) => (
                  <div className="timeline-item" key={act.id ?? i}>
                    <span
                      className={`timeline-dot ${
                        i === 0 ? "tone-brand" : ""
                      }`}
                    >
                      <CheckCircle2 size={16} aria-hidden="true" />
                    </span>
                    <div className="grow">
                      <div className="t-sm t-bold">
                        {titleCase(act.action)}
                      </div>
                      <div className="t-xs t-muted" style={{ marginTop: 2 }}>
                        {act.detail}
                      </div>
                    </div>
                    <span className="t-xs t-muted shrink-0">
                      {formatRelative(act.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Health reminder" subtitle="Small habits, big difference" />
          <CardBody>
            <div className="stack stack-4">
              <Tip
                title="Stay hydrated"
                text="Aim for 6–8 glasses of water through the day."
              />
              <Tip
                title="Keep check-ups regular"
                text="Annual screenings catch problems early."
              />
              <Tip
                title="Sleep well"
                text="Seven to nine hours keeps immunity strong."
              />
              <Button
                variant="soft"
                block
                onClick={() =>
                  window.open(
                    "https://www.who.int/health-topics",
                    "_blank",
                    "noopener,noreferrer"
                  )
                }
                iconRight={ArrowUpRight}
              >
                Read health guidance
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>
    </>
  );
}

function Tip({ title, text }) {
  return (
    <div className="row row-top row-3">
      <span className="timeline-dot tone-success" style={{ width: 32, height: 32 }}>
        <HeartPulse size={15} aria-hidden="true" />
      </span>
      <div>
        <div className="t-sm t-bold">{title}</div>
        <div className="t-xs t-muted">{text}</div>
      </div>
    </div>
  );
}

function QuickAction({ icon: Icon, title, text, onClick, primary = false }) {
  return (
    <button
      type="button"
      className="list-row is-clickable"
      onClick={onClick}
      style={{
        border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)",
        padding: "var(--sp-4)",
        background: primary ? "var(--primary-soft)" : "var(--bg-surface-2)",
      }}
    >
      <span
        className={`stat-icon ${primary ? "tone-brand" : ""}`}
        style={{ width: 36, height: 36 }}
      >
        <Icon size={17} aria-hidden="true" />
      </span>
      <span className="list-main">
        <span className="list-title" style={{ display: "block" }}>
          {title}
        </span>
        <span className="list-meta" style={{ display: "block" }}>
          {text}
        </span>
      </span>
      <ArrowUpRight size={16} className="t-muted" aria-hidden="true" />
    </button>
  );
}

/* ============================== DOCTORS ============================== */

function DoctorsTab({ doctors, loading, query, onBook }) {
  const available = doctors.filter((d) => d.available).length;

  return (
    <>
      <div className="page-head">
        <div>
          <h2 className="t-display">Find a doctor</h2>
          <p className="t-sm t-muted" style={{ marginTop: 4 }}>
            {loading
              ? "Loading specialists…"
              : `${available} of ${doctors.length} specialists accepting bookings${
                  query ? ` for "${query}"` : ""
                }`}
          </p>
        </div>
      </div>

      <Card>
        <CardBody>
          {loading ? (
            <LoadingBlock rows={3} label="Loading doctors" />
          ) : doctors.length === 0 ? (
            <EmptyState
              icon={Stethoscope}
              title={query ? "No matching specialists" : "No doctors yet"}
              text={
                query
                  ? "Try a different name or specialty."
                  : "Specialists will appear here once they are added."
              }
            />
          ) : (
            <div className="grid grid-auto">
              {doctors.map((d) => (
                <DoctorCard key={d.id} doctor={d} onBook={onBook} />
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </>
  );
}

function DoctorCard({ doctor: d, onBook }) {
  return (
    <article className={`doctor-card ${d.available ? "" : "is-unavailable"}`}>
      <div className="doctor-card-top">
        <Avatar src={d.avatar} name={d.name} size="lg" />
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="row row-2" style={{ marginBottom: 2 }}>
            <span className="doctor-name truncate">{d.name}</span>
          </div>
          <div className="doctor-spec">{d.specialty}</div>
          <div style={{ marginTop: 8 }}>
            {d.available ? (
              <Badge tone="success">Available</Badge>
            ) : (
              <Badge tone="neutral">Unavailable</Badge>
            )}
          </div>
        </div>
      </div>

      <div className="doctor-card-body">
        <div className="doctor-meta">
          {d.experience ? (
            <span className="doctor-meta-item">
              <Stethoscope size={13} aria-hidden="true" />
              {d.experience} yrs experience
            </span>
          ) : null}
          <span className="doctor-meta-item">
            <MessageSquare size={13} aria-hidden="true" />
            Chat consult
          </span>
        </div>
      </div>

      <div className="doctor-card-foot">
        <div>
          <div className="doctor-fee">
            {formatMoney(d.fee)} <span>/ visit</span>
          </div>
        </div>
        <Button
          size="sm"
          disabled={!d.available}
          onClick={() => onBook(d.id)}
          icon={CalendarPlus}
        >
          {d.available ? "Book now" : "Unavailable"}
        </Button>
      </div>
    </article>
  );
}

/* ============================== APPOINTMENTS ============================== */

function AppointmentRow({ appointment: a, onCancel, onPay, showActions = true }) {
  const cancellable =
    showActions && a.status !== "CANCELLED" && a.status !== "COMPLETED";
  const payable =
    showActions && a.status === "PAYMENT_PENDING" && typeof onPay === "function";

  return (
    <div className="list-row">
      <Avatar
        src={a.doctor?.avatar}
        name={a.doctor?.name ?? "Doctor"}
        size="md"
      />
      <div className="list-main">
        <div className="list-title truncate">
          {a.doctor?.name ?? "Hospital doctor"}
        </div>
        <div className="list-meta">
          {a.doctor?.specialty ? `${a.doctor.specialty} · ` : ""}
          {formatDateTime(a.date)}
          {a.slot ? ` · ${a.slot}` : ""}
        </div>
        {a.reason && <div className="list-sub truncate">{a.reason}</div>}
      </div>
      <div className="list-side">
        <StatusBadge status={a.status} />
        {payable && (
          <Button size="sm" icon={CreditCard} onClick={() => onPay(a)}>
            Pay {formatMoney(a.fee ?? a.doctor?.fee ?? 0)}
          </Button>
        )}
        {cancellable && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onCancel(a)}
            icon={XCircle}
            aria-label="Cancel appointment"
          >
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

function AppointmentsTab({ appointments, loading, search, onCancel, onBook, onPay }) {
  const q = search.trim().toLowerCase();
  const sorted = useMemo(
    () =>
      [...appointments].sort(
        (a, b) => new Date(b.date) - new Date(a.date)
      ),
    [appointments]
  );

  const filtered = q
    ? sorted.filter(
        (a) =>
          a.doctor?.name?.toLowerCase().includes(q) ||
          a.doctor?.specialty?.toLowerCase().includes(q) ||
          a.reason?.toLowerCase().includes(q) ||
          a.status?.toLowerCase().includes(q)
      )
    : sorted;

  const today = sorted.filter((a) => isToday(a.date));

  return (
    <>
      <div className="page-head">
        <div>
          <h2 className="t-display">My appointments</h2>
          <p className="t-sm t-muted" style={{ marginTop: 4 }}>
            {loading
              ? "Loading…"
              : q
                ? `${filtered.length} of ${appointments.length} appointments`
                : `${appointments.length} total · ${today.length} today`}
          </p>
        </div>
        <Button icon={CalendarPlus} onClick={() => onBook()}>
          New booking
        </Button>
      </div>

      <Card>
        <CardBody flush>
          {loading ? (
            <div style={{ padding: "var(--sp-6)" }}>
              <LoadingBlock />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={CalendarCheck2}
              title={q ? "No matching appointments" : "No appointments yet"}
              text={
                q
                  ? "Search by doctor, specialty, reason or status."
                  : "When you book a visit it will appear here with its status, so you can message your doctor."
              }
              action={
                q ? undefined : (
                  <Button icon={CalendarPlus} onClick={() => onBook()}>
                    Book an appointment
                  </Button>
                )
              }
            />
          ) : (
            <div className="list">
              {filtered.map((a) => (
                <AppointmentRow
                  key={a.id}
                  appointment={a}
                  onCancel={onCancel}
                  onPay={onPay}
                />
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </>
  );
}

/* ============================== CONSULTATION ============================== */

function ConsultationTab({ appointments, loading, search, upcoming, onMessage }) {
  const next = upcoming[0];
  const q = search.trim().toLowerCase();
  const filtered = q
    ? appointments.filter(
        (a) =>
          a.doctor?.name?.toLowerCase().includes(q) ||
          a.doctor?.specialty?.toLowerCase().includes(q) ||
          a.reason?.toLowerCase().includes(q)
      )
    : appointments;

  return (
    <>
      <div className="page-head">
        <div>
          <h2 className="t-display">Online consultations</h2>
          <p className="t-sm t-muted" style={{ marginTop: 4 }}>
            Message your doctor once the hospital confirms your appointment.
          </p>
        </div>
      </div>

      {loading ? (
        <Card>
          <CardBody>
            <LoadingBlock />
          </CardBody>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={Stethoscope}
              title={
                q ? "No matching consultations" : "No confirmed consultations"
              }
              text={
                q
                  ? "Search by doctor, specialty or reason."
                  : next
                    ? `Your ${formatDate(next.date)} visit is still awaiting approval. You can message the doctor here the moment it is confirmed.`
                    : "Once a doctor confirms one of your appointments, you can start a conversation with them here."
              }
            />
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-auto">
          {filtered.map((a) => {
            const live = isToday(a.date);
            return (
              <Card key={a.id}>
                <CardBody className="stack stack-4">
                  <div className="row row-3">
                    <Avatar
                      src={a.doctor?.avatar}
                      name={a.doctor?.name ?? "Doctor"}
                      size="md"
                    />
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="list-title truncate">
                        {a.doctor?.name ?? "Hospital doctor"}
                      </div>
                      <div className="list-meta">
                        {a.doctor?.specialty ?? "General medicine"}
                      </div>
                    </div>
                  </div>

                  <div className="divider" />

                  <div className="stack stack-2">
                    <div className="info-line">
                      <CalendarCheck2 size={15} />
                      {formatDateTime(a.date)}
                      {a.slot ? ` · ${a.slot}` : ""}
                    </div>
                    {a.reason && (
                      <div className="info-line">
                        <ClipboardList size={15} />
                        <span className="truncate">{a.reason}</span>
                      </div>
                    )}
                  </div>

                  <div className="row row-2 row-between">
                    {live ? (
                      <Badge tone="danger">Starts today</Badge>
                    ) : (
                      <Badge tone="neutral">{formatRelative(a.date)}</Badge>
                    )}
                    <Button
                      size="sm"
                      icon={MessageSquare}
                      onClick={onMessage}
                    >
                      Ask the hospital
                    </Button>
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

/* ============================== BILLING ============================== */

function BillingTab({ bills, loading, search, outstanding, paidTotal, onPay }) {
  const q = search.trim().toLowerCase();
  const sorted = useMemo(
    () => [...bills].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    [bills]
  );

  const filtered = q
    ? sorted.filter(
        (b) =>
          String(b.id).slice(-6).toLowerCase().includes(q) ||
          String(b.amount).includes(q) ||
          b.status?.toLowerCase().includes(q)
      )
    : sorted;

  return (
    <>
      <div className="page-head">
        <div>
          <h2 className="t-display">Billing &amp; payments</h2>
          <p className="t-sm t-muted" style={{ marginTop: 4 }}>
            {loading
              ? "Loading…"
              : q
                ? `${filtered.length} of ${bills.length} invoices`
                : `${bills.length} invoices · ${formatMoney(outstanding)} due`}
          </p>
        </div>
      </div>

      <div className="stat-grid">
        <StatCard
          icon={Receipt}
          tone={outstanding > 0 ? "warning" : "success"}
          label="Outstanding"
          value={formatMoney(outstanding)}
          meta={
            outstanding > 0 ? "Payment required" : "Nothing due"
          }
        />
        <StatCard
          icon={CheckCircle2}
          tone="success"
          label="Paid to date"
          value={formatMoney(paidTotal)}
          meta="Settled"
        />
        <StatCard
          icon={CreditCard}
          tone="info"
          label="Total invoices"
          value={bills.length}
          meta="All time"
        />
        <StatCard
          icon={BadgeIndianRupee}
          tone="accent"
          label="Average invoice"
          value={formatMoney(
            bills.length ? Math.round(paidTotal / Math.max(1, bills.filter((b) => b.status === "PAID").length)) : 0
          )}
          meta="Per settled bill"
        />
      </div>

      <Card>
        <CardHeader
          title="Invoices"
          subtitle="Every bill raised by the hospital"
          action={
            outstanding > 0 ? (
              <Button
                size="sm"
                onClick={() => {
                  const first = bills.find((b) => b.status === "PENDING");
                  if (first) onPay(first);
                }}
              >
                Pay oldest due
              </Button>
            ) : null
          }
        />
        <CardBody flush>
          {loading ? (
            <div style={{ padding: "var(--sp-6)" }}>
              <LoadingBlock />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title={q ? "No matching invoices" : "No bills yet"}
              text={
                q
                  ? "Search by invoice number, amount or status."
                  : "Invoices are created after your consultations."
              }
            />
          ) : (
            <div className="list">
              {filtered.map((b) => (
                <div className="list-row" key={b.id}>
                  <span className="stat-icon tone-brand" style={{ width: 38, height: 38 }}>
                    <Receipt size={17} aria-hidden="true" />
                  </span>
                  <div className="list-main">
                    <div className="list-title">
                      Invoice #{String(b.id).slice(-6).toUpperCase()}
                    </div>
                    <div className="list-meta">
                      Raised {formatDate(b.createdAt)}
                      {b.status === "PAID" && ` · paid ${formatDate(b.paidAt ?? b.createdAt)}`}
                    </div>
                  </div>
                  <div className="list-side">
                    <span className="t-md t-bold t-num">
                      {formatMoney(b.amount)}
                    </span>
                    <StatusBadge status={b.status} />
                    {b.status === "PENDING" && (
                      <Button size="sm" onClick={() => onPay(b)}>
                        Pay now
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </>
  );
}

/* ============================== RECORDS ============================== */

function ReportModal({ record, patient, onClose, onDownload }) {
  const details = [
    ["Report type", titleCase(record?.type ?? "General")],
    ["Reported by", record?.doctor?.name ?? "—"],
    ["Patient", record?.patient?.name ?? patient?.name ?? "—"],
    ["Date of report", formatDate(record?.createdAt)],
    ["Reference ID", record?.id ?? "—"],
  ];

  return (
    <Modal
      open={Boolean(record)}
      onClose={onClose}
      title={record?.title ?? "Medical report"}
      description="Issued by your doctor through Swasthya Sewa."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button icon={Download} onClick={() => onDownload(record)}>
            Download report
          </Button>
        </>
      }
    >
      <div className="stack stack-5">
        <dl className="report-meta">
          {details.map(([label, value]) => (
            <div className="report-meta-row" key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>

        <div>
          <h3 className="t-sm t-bold" style={{ marginBottom: 6 }}>
            Findings
          </h3>
          <p className="report-findings">
            {record?.description || record?.notes || "No further details were recorded."}
          </p>
        </div>

        {record?.fileUrl && (
          <p className="t-xs t-muted">
            This report also has an attachment. Use Download to open the generated copy
            with the attachment linked inside it.
          </p>
        )}
      </div>
    </Modal>
  );
}

function RecordsTab({ records, loading, search, onView, onDownload }) {
  const q = search.trim().toLowerCase();
  const sorted = useMemo(
    () =>
      [...records].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    [records]
  );

  const filtered = q
    ? sorted.filter(
        (r) =>
          r.title?.toLowerCase().includes(q) ||
          r.type?.toLowerCase().includes(q) ||
          r.doctor?.name?.toLowerCase().includes(q) ||
          r.description?.toLowerCase().includes(q)
      )
    : sorted;

  return (
    <>
      <div className="page-head">
        <div>
          <h2 className="t-display">Medical records</h2>
          <p className="t-sm t-muted" style={{ marginTop: 4 }}>
            {loading
              ? "Loading…"
              : q
                ? `${filtered.length} of ${records.length} reports`
                : `${records.length} reports shared by your doctors`}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader
          title="Reports & prescriptions"
          subtitle="Most recent first"
        />
        <CardBody flush>
          {loading ? (
            <div style={{ padding: "var(--sp-6)" }}>
              <LoadingBlock />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={FileText}
              title={q ? "No matching records" : "No records yet"}
              text={
                q
                  ? "Search by title, type, doctor or description."
                  : "Lab reports, imaging and prescriptions added by your doctor will appear here."
              }
            />
          ) : (
            <div className="list">
              {filtered.map((r) => (
                <div className="list-row" key={r.id}>
                  <span className="stat-icon tone-info" style={{ width: 38, height: 38 }}>
                    <FileText size={17} aria-hidden="true" />
                  </span>
                  <div className="list-main">
                    <div className="list-title">{r.title}</div>
                    <div className="list-meta">
                      {titleCase(r.type ?? "General")}
                      {r.doctor?.name ? ` · ${r.doctor.name}` : ""}
                      {" · "}
                      {formatDate(r.createdAt)}
                    </div>
                    {r.description && (
                      <div className="list-sub">{r.description}</div>
                    )}
                  </div>
                  <div className="list-side">
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={FileText}
                      onClick={() => onView(r)}
                    >
                      View report
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={Download}
                      onClick={() => onDownload(r)}
                    >
                      Download
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </>
  );
}

/* ============================== PROFILE ============================== */

function ProfileTab({ user, onEdit }) {
  return (
    <>
      <div className="page-head">
        <div>
          <h2 className="t-display">Your profile</h2>
          <p className="t-sm t-muted" style={{ marginTop: 4 }}>
            Keep your contact details current so the hospital can reach you.
          </p>
        </div>
        <Button onClick={onEdit}>Edit profile</Button>
      </div>

      <Card>
        <div className="profile-hero">
          <Avatar src={user.avatar} name={user.name} size="xl" />
          <div>
            <div
              style={{ fontSize: "var(--text-2xl)", fontWeight: 700, letterSpacing: "-0.03em" }}
            >
              {user.name}
            </div>
            <div
              style={{
                color: "rgba(255,255,255,0.75)",
                fontSize: "var(--text-base)",
                marginTop: 2,
              }}
            >
              {user.email}
            </div>
            <div style={{ marginTop: 12 }}>
              <Badge tone="brand" dot={false}>
                {user.role === "ADMIN" ? "Administrator" : "Patient"}
              </Badge>
            </div>
          </div>
        </div>

        <CardBody>
          <div className="grid grid-2">
            <InfoBlock icon={User} label="Full name" value={user.name} />
            <InfoBlock icon={Phone} label="Phone" value={user.phone || "Not set"} />
            <InfoBlock icon={MapPin} label="Address" value={user.address || "Not set"} />
            <InfoBlock icon={HeartPulse} label="Account type" value={titleCase(user.role)} />
          </div>
        </CardBody>
      </Card>
    </>
  );
}

function InfoBlock({ icon: Icon, label, value }) {
  return (
    <div className="row row-3 row-top">
      <span className="stat-icon" style={{ width: 36, height: 36 }}>
        <Icon size={16} aria-hidden="true" />
      </span>
      <div style={{ minWidth: 0 }}>
        <div className="t-label">{label}</div>
        <div className="t-sm" style={{ marginTop: 2 }}>
          {value}
        </div>
      </div>
    </div>
  );
}
