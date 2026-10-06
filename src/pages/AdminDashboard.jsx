import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgeIndianRupee,
  CalendarCheck2,
  CheckCircle2,
  Clock,
  CreditCard,
  FileText,
  Mail,
  Pencil,
  Phone,
  Plus,
  Receipt,
  Stethoscope,
  Trash2,
  TrendingUp,
  User,
  Users,
  XCircle,
} from "lucide-react";
import api from "../lib/api.js";
import {
  CONSULT_SLOTS,
  formatDate,
  formatDateTime,
  formatMoney,
  formatRelative,
  isToday,
  isStale,
  titleCase,
} from "../lib/format.js";
import { useToast } from "../context/useToast.js";
import { Avatar } from "../components/ui/Avatar.jsx";
import { Badge, StatusBadge } from "../components/ui/Badge.jsx";
import { Button } from "../components/ui/Button.jsx";
import { Card, CardBody, CardHeader } from "../components/ui/Card.jsx";
import { EmptyState, LoadingBlock } from "../components/ui/Feedback.jsx";
import { Combobox } from "../components/ui/Combobox.jsx";
import { Field, Input, Select, Switch, Textarea } from "../components/ui/Field.jsx";
import { Modal } from "../components/ui/Modal.jsx";
import { StatCard } from "../components/ui/StatCard.jsx";
import MessagesPanel from "../components/MessagesPanel.jsx";
import { buildThreads } from "../lib/threads.js";
import {
  BLANK_DOCTOR,
  RECORD_TYPES,
  SPECIALTIES,
} from "../lib/nav.js";

export default function AdminDashboard({ activeTab, onNavigate, search }) {
  const toast = useToast();

  const [doctors, setDoctors] = useState([]);
  const [patients, setPatients] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [bills, setBills] = useState([]);
  const [records, setRecords] = useState([]);
  const [messages, setMessages] = useState([]);
  const [activeThread, setActiveThread] = useState("");
  const [sendingMsg, setSendingMsg] = useState(false);
  const [loading, setLoading] = useState(true);

  const [selectedPatient, setSelectedPatient] = useState(null);

  const [doctorModal, setDoctorModal] = useState(false);
  const [editingDoctor, setEditingDoctor] = useState(null);
  const [doctorForm, setDoctorForm] = useState(BLANK_DOCTOR);
  const [savingDoctor, setSavingDoctor] = useState(false);

  const [billModal, setBillModal] = useState(false);
  const [billForm, setBillForm] = useState({ patientId: "", amount: 800 });
  const [savingBill, setSavingBill] = useState(false);

  const [recordModal, setRecordModal] = useState(false);
  const [recordForm, setRecordForm] = useState({
    patientId: "",
    doctorId: "",
    title: "",
    type: RECORD_TYPES[0],
    description: "",
  });
  const [editingRecordId, setEditingRecordId] = useState(null);
  const [savingRecord, setSavingRecord] = useState(false);
  const [deletingRecordId, setDeletingRecordId] = useState(null);

  const load = useCallback(async () => {
    const [d, p, a, b, r] = await Promise.allSettled([
      api.get("/doctors"),
      api.get("/users/patients"),
      api.get("/appointments/all"),
      api.get("/bills/all"),
      api.get("/records/all"),
    ]);
    setDoctors(d.status === "fulfilled" ? d.value.data ?? [] : []);
    setPatients(p.status === "fulfilled" ? p.value.data ?? [] : []);
    setAppointments(a.status === "fulfilled" ? a.value.data ?? [] : []);
    setBills(b.status === "fulfilled" ? b.value.data ?? [] : []);
    setRecords(r.status === "fulfilled" ? r.value.data ?? [] : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      if (active) await load();
    })();
    return () => {
      active = false;
    };
  }, [load]);

  // Live message stream, so a reply from a patient shows up without a refresh.
  useEffect(() => {
    let unsubscribe = null;
    let cancelled = false;
    api
      .subscribe("/messages/all", (rows) => {
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

  // Derived patient selection — avoids a state-syncing effect.
  const billPatientId = billForm.patientId || patients[0]?.id || "";
  const recordPatientId = recordForm.patientId || patients[0]?.id || "";

  // Combobox entries: the name is searchable, the email is shown alongside it.
  const patientOptions = useMemo(
    () =>
      patients.map((p) => ({
        value: p.id,
        label: p.name ?? "Unnamed patient",
        meta: p.email ?? "",
      })),
    [patients]
  );

  /* ---------------------------- derived ---------------------------- */

  const stats = useMemo(() => {
    const pending = appointments.filter((a) => a.status === "PENDING");
    const settled = bills.filter((b) => b.status === "PAID");
    const outstanding = bills
      .filter((b) => b.status === "PENDING")
      .reduce((s, b) => s + (Number(b.amount) || 0), 0);
    return {
      totalPatients: patients.length,
      totalDoctors: doctors.length,
      totalAppointments: appointments.length,
      pendingApps: pending.length,
      revenue: settled.reduce((s, b) => s + (Number(b.amount) || 0), 0),
      outstanding,
      paidBills: settled.length,
      onDuty: doctors.filter((d) => d.available).length,
    };
  }, [patients, doctors, appointments, bills]);

  const slotsTakenFor = useCallback(
    (doctor) =>
      appointments.filter(
        (a) =>
          (a.doctor?.name ?? null) === (doctor.name ?? null) &&
          isToday(a.date) &&
          a.status !== "CANCELLED"
      ),
    [appointments]
  );

  const doctorLoad = (doctor) => {
    const taken = slotsTakenFor(doctor).length;
    if (taken === 0) return { label: "Free", chip: "chip-free" };
    if (taken >= 3) return { label: "Fully booked", chip: "chip-full" };
    return { label: `${taken} booked`, chip: "chip-busy" };
  };

  const isSlotTaken = (doctor, slot) =>
    slotsTakenFor(doctor).some((a) => a.slot === slot);

  /* ---------------------------- messages ---------------------------- */

  const threads = useMemo(() => buildThreads(messages, "ADMIN"), [messages]);

  const reloadMessages = async () => {
    const { data } = await api.get("/messages/all");
    setMessages(data ?? []);
  };

  const sendMessage = async (thread, text) => {
    setSendingMsg(true);
    try {
      // The thread id travels with the reply. Deriving it again from the
      // patient profile can produce a different key and split one conversation
      // in two, which is what made replies open a fresh conversation.
      await api.post("/messages", {
        patientId: thread.patientId,
        patient: thread.patient,
        threadId: thread.threadId,
        text,
      });
      await reloadMessages();
    } catch (err) {
      toast.error(err.message || "Could not send the message.");
    } finally {
      setSendingMsg(false);
    }
  };

  const startThread = async (patient, text) => {
    if (!patient) {
      toast.error("Choose a patient first.");
      return;
    }
    setSendingMsg(true);
    try {
      await api.post("/messages", { patientId: patient.id, text });
      await reloadMessages();
      toast.success(`Message sent to ${patient.name}.`);
    } catch (err) {
      toast.error(err.message || "Could not send the message.");
    } finally {
      setSendingMsg(false);
    }
  };

  // Hides the message from the hospital dashboard. The patient keeps their copy,
  // so what they told the desk cannot be erased by staff.
  const deleteMessage = async (message) => {
    try {
      await api.post(`/messages/${message.id}/visibility`);
      await reloadMessages();
      toast.success("Message hidden from the dashboard.");
    } catch (err) {
      toast.error(err.message || "Could not delete the message.");
    }
  };

  // Hides the entire conversation from the dashboard in one step. The patient
  // keeps the full thread.
  const deleteConversation = async (thread) => {
    try {
      await api.post("/messages/thread/visibility", { threadId: thread.threadId });
      setActiveThread("");
      await reloadMessages();
      toast.success("Conversation deleted from the dashboard.");
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

  // The hospital desk can open a conversation with any registered patient.
  const composeTargets = useMemo(
    () =>
      patients.map((p) => ({
        id: p.id,
        name: p.name,
        subtitle: p.email ?? "",
      })),
    [patients]
  );

  const patientRows = (patient) => ({
    appointments: appointments.filter(
      (a) =>
        a.patient?.email === patient.email || a.patientId === patient.id
    ),
    bills: bills.filter(
      (b) => b.patient?.email === patient.email || b.patientId === patient.id
    ),
    records: records.filter(
      (r) => r.patient?.email === patient.email || r.patientId === patient.id
    ),
  });

  /* ---------------------------- mutations ---------------------------- */

  const openAddDoctor = () => {
    setEditingDoctor(null);
    setDoctorForm(BLANK_DOCTOR);
    setDoctorModal(true);
  };

  const openEditDoctor = (d) => {
    setEditingDoctor(d);
    setDoctorForm({
      name: d.name ?? "",
      email: d.email ?? "",
      specialty: d.specialty ?? SPECIALTIES[0],
      phone: d.phone ?? "",
      fee: d.fee ?? 800,
      experience: d.experience ?? 5,
      available: d.available !== false,
    });
    setDoctorModal(true);
  };

  const saveDoctor = async (e) => {
    e.preventDefault();
    setSavingDoctor(true);
    try {
      const payload = { ...doctorForm, fee: +doctorForm.fee };
      if (editingDoctor) {
        await api.put(`/doctors/${editingDoctor}`, payload);
        toast.success("Doctor updated.");
      } else {
        await api.post("/doctors", payload);
        toast.success(`${doctorForm.name} added to the panel.`);
      }
      setDoctorModal(false);
      await load();
    } catch (err) {
      toast.error(err.message || "Could not save the doctor.");
    } finally {
      setSavingDoctor(false);
    }
  };

  const removeDoctor = async (doctor) => {
    if (
      !window.confirm(`Remove ${doctor.name} from the hospital panel?`)
    ) {
      return;
    }
    try {
      await api.delete(`/doctors/${doctor.id}`);
      toast.success(`${doctor.name} removed.`);
      await load();
    } catch (err) {
      toast.error(err.message || "Could not remove the doctor.");
    }
  };

  const removePatient = async (patient) => {
    if (
      !window.confirm(
        `Permanently remove ${patient.name} and all of their appointments, bills and records? This cannot be undone.`
      )
    ) {
      return;
    }
    try {
      await api.delete(`/users/${patient.id}`);
      setSelectedPatient((current) =>
        current?.id === patient.id ? null : current
      );
      toast.success(`${patient.name} removed.`);
      await load();
    } catch (err) {
      toast.error(err.message || "Could not remove the patient.");
    }
  };

  const toggleAvailable = async (doctor) => {
    try {
      await api.put(`/doctors/${doctor.id}`, { available: !doctor.available });
      await load();
      toast.success(
        `${doctor.name} marked ${doctor.available ? "unavailable" : "available"}.`
      );
    } catch (err) {
      toast.error(err.message || "Could not update availability.");
    }
  };

  const setAppointmentStatus = async (appointment, status) => {
    if (status === "CONFIRMED" && appointment.status === "PAYMENT_PENDING") {
      toast.error(
        "The patient has not paid the consultation fee yet — this appointment cannot be confirmed."
      );
      return;
    }
    try {
      await api.patch(`/appointments/${appointment.id}/status`, { status });
      toast.success(
        status === "CONFIRMED"
          ? "Appointment approved — the patient can now message the doctor."
          : "Appointment rejected."
      );
      await load();
    } catch (err) {
      toast.error(err.message || "Could not update the appointment.");
    }
  };

  const createBill = async (e) => {
    e.preventDefault();
    setSavingBill(true);
    try {
      await api.post("/bills", {
        patientId: billPatientId,
        amount: +billForm.amount,
      });
      toast.success("Bill generated.");
      setBillModal(false);
      setBillForm((f) => ({ ...f, amount: 800 }));
      await load();
    } catch (err) {
      toast.error(err.message || "Could not generate the bill.");
    } finally {
      setSavingBill(false);
    }
  };

  const EMPTY_RECORD_FORM = {
    patientId: "",
    doctorId: "",
    title: "",
    type: RECORD_TYPES[0],
    description: "",
  };

  const openCreateRecord = () => {
    // Seed the patient here as well as in the Select, otherwise the dropdown
    // shows the first patient while the submitted id stays empty and the record
    // is stored against an unknown owner.
    setRecordForm({ ...EMPTY_RECORD_FORM, patientId: patients[0]?.id ?? "" });
    setEditingRecordId(null);
    setRecordModal(true);
  };

  const openEditRecord = (record) => {
    // Seeded reports predate `doctorId` and only carry a name, so fall back to a
    // name lookup to preselect the right doctor instead of showing "not specified".
    const doctorId =
      record.doctorId ||
      record.doctor?.id ||
      doctors.find((d) => d.name === record.doctor?.name)?.id ||
      "";
    setRecordForm({
      patientId: record.patientId ?? "",
      doctorId,
      title: record.title ?? "",
      type: record.type ?? RECORD_TYPES[0],
      description: record.description ?? "",
    });
    setEditingRecordId(record.id);
    setRecordModal(true);
  };

  // One handler for both paths: create when there is no id, update when there is.
  const saveRecord = async (e) => {
    e.preventDefault();
    if (!recordForm.title.trim()) {
      toast.error("Please give the report a title.");
      return;
    }
    if (!recordPatientId) {
      toast.error("Please choose which patient this report belongs to.");
      return;
    }
    // The Select falls back to the first patient for display, so send the
    // resolved id rather than the possibly-empty form value.
    const payload = { ...recordForm, patientId: recordPatientId };
    setSavingRecord(true);
    try {
      if (editingRecordId) {
        await api.put(`/records/${editingRecordId}`, payload);
        toast.success("Report updated.");
      } else {
        await api.post("/records", payload);
        toast.success("Report uploaded to the patient record.");
      }
      setRecordModal(false);
      setEditingRecordId(null);
      setRecordForm({ ...EMPTY_RECORD_FORM });
      await load();
    } catch (err) {
      toast.error(err.message || "Could not save the report.");
    } finally {
      setSavingRecord(false);
    }
  };

  const deleteRecord = async (record) => {
    const confirmed = window.confirm(
      `Delete "${record.title}" from ${record.patient?.name ?? "this patient"}'s medical record?\n\nThis cannot be undone.`
    );
    if (!confirmed) return;
    setDeletingRecordId(record.id);
    try {
      await api.delete(`/records/${record.id}`);
      toast.success("Report deleted.");
      await load();
    } catch (err) {
      toast.error(err.message || "Could not delete the report.");
    } finally {
      setDeletingRecordId(null);
    }
  };

  const markBillPaid = async (bill) => {
    try {
      await api.post(`/bills/${bill.id}/pay`, { method: "Counter" });
      toast.success("Bill marked as paid.");
      await load();
    } catch (err) {
      toast.error(err.message || "Could not update the bill.");
    }
  };

  /* ---------------------------- render ---------------------------- */

  if (loading) {
    return (
      <div className="page-inner">
        <div className="stat-grid">
          {[0, 1, 2, 3].map((i) => (
            <div className="skeleton" key={i} style={{ height: 122, borderRadius: 18 }} />
          ))}
        </div>
        <Card>
          <CardBody>
            <LoadingBlock rows={4} label="Loading hospital data" />
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <>
      <div className="page-inner">
        {activeTab === "Dashboard" && (
          <AdminOverview
            stats={stats}
            doctors={doctors}
            appointments={appointments}
            patients={patients}
            doctorLoad={doctorLoad}
            slotsTakenFor={slotsTakenFor}
            search={search}
            onNavigate={onNavigate}
            onStatus={setAppointmentStatus}
            onSelectPatient={(p) => {
              setSelectedPatient(p);
              onNavigate("Patients");
            }}
          />
        )}

        {activeTab === "Doctors" && (
          <DoctorsAdmin
            doctors={doctors}
            search={search}
            isSlotTaken={isSlotTaken}
            doctorLoad={doctorLoad}
            onAdd={openAddDoctor}
            onEdit={openEditDoctor}
            onDelete={removeDoctor}
            onToggle={toggleAvailable}
          />
        )}

        {activeTab === "Patients" && (
          <PatientsAdmin
            patients={patients}
            search={search}
            selected={selectedPatient}
            onSelect={setSelectedPatient}
            onDelete={removePatient}
            rowsFor={patientRows}
          />
        )}

        {activeTab === "Appointments" && (
          <AppointmentsAdmin
            appointments={appointments}
            search={search}
            onStatus={setAppointmentStatus}
          />
        )}

        {activeTab === "Messages" && (
          <MessagesPanel
            role="ADMIN"
            counterpartLabel="Patient"
            composeTitle="New message to a patient"
            composeDescription="Choose the patient and write your first message."
            composeFieldLabel="Patient"
            threads={threads}
            activeId={activeThread}
            onSelect={openThread}
            onOpen={openThread}
            onSend={sendMessage}
            onStartThread={startThread}
            onDelete={deleteMessage}
            onDeleteThread={deleteConversation}
            composeTargets={composeTargets}
            loading={loading}
            sending={sendingMsg}
          />
        )}

        {activeTab === "Billing" && (
          <BillingAdmin
            bills={bills}
            stats={stats}
            search={search}
            onCreate={() => setBillModal(true)}
            onMarkPaid={markBillPaid}
          />
        )}

        {activeTab === "Medical Records" && (
          <RecordsAdmin
            records={records}
            search={search}
            onCreate={openCreateRecord}
            onEdit={openEditRecord}
            onDelete={deleteRecord}
            deletingId={deletingRecordId}
          />
        )}
      </div>

      {/* ---------------------------- Doctor modal ---------------------------- */}
      <Modal
        open={doctorModal}
        onClose={() => setDoctorModal(false)}
        title={editingDoctor ? "Edit doctor" : "Add a doctor"}
        description={
          editingDoctor
            ? "Update the doctor's profile, fee or availability."
            : "New doctors can be booked immediately."
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setDoctorModal(false)}>
              Cancel
            </Button>
            <Button onClick={saveDoctor} loading={savingDoctor}>
              {editingDoctor ? "Save changes" : "Add doctor"}
            </Button>
          </>
        }
      >
        <form className="stack stack-4" onSubmit={saveDoctor}>
          <Field label="Full name" htmlFor="doc-name">
            <Input
              id="doc-name"
              icon={User}
              placeholder="Dr. Sandeep Adhikari"
              value={doctorForm.name}
              onChange={(e) =>
                setDoctorForm((f) => ({ ...f, name: e.target.value }))
              }
              required
            />
          </Field>

          <div className="grid grid-2">
            <Field label="Email" htmlFor="doc-email">
              <Input
                id="doc-email"
                type="email"
                icon={Mail}
                placeholder="name@hospital.com"
                value={doctorForm.email}
                onChange={(e) =>
                  setDoctorForm((f) => ({ ...f, email: e.target.value }))
                }
                required
              />
            </Field>
            <Field label="Phone" htmlFor="doc-phone">
              <Input
                id="doc-phone"
                type="tel"
                icon={Phone}
                placeholder="9800000000"
                value={doctorForm.phone}
                onChange={(e) =>
                  setDoctorForm((f) => ({ ...f, phone: e.target.value }))
                }
              />
            </Field>
          </div>

          <Field label="Specialty" htmlFor="doc-spec">
            <Select
              id="doc-spec"
              value={doctorForm.specialty}
              onChange={(e) =>
                setDoctorForm((f) => ({ ...f, specialty: e.target.value }))
              }
            >
              {SPECIALTIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid grid-2">
            <Field label="Consultation fee" htmlFor="doc-fee">
              <Input
                id="doc-fee"
                type="number"
                min={0}
                value={doctorForm.fee}
                onChange={(e) =>
                  setDoctorForm((f) => ({ ...f, fee: e.target.value }))
                }
              />
            </Field>
            <Field label="Years of experience" htmlFor="doc-exp">
              <Input
                id="doc-exp"
                type="number"
                min={0}
                value={doctorForm.experience}
                onChange={(e) =>
                  setDoctorForm((f) => ({ ...f, experience: e.target.value }))
                }
              />
            </Field>
          </div>

          <div
            className="row row-3 row-between"
            style={{
              padding: "var(--sp-3) var(--sp-4)",
              background: "var(--bg-surface-2)",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-md)",
            }}
          >
            <div>
              <div className="t-sm t-bold">Accepting bookings</div>
              <div className="t-xs t-muted">
                Turn off to temporarily hide this doctor from patients.
              </div>
            </div>
            <Switch
              id="doc-available"
              checked={doctorForm.available}
              onChange={(v) =>
                setDoctorForm((f) => ({ ...f, available: v }))
              }
            />
          </div>
        </form>
      </Modal>

      {/* ---------------------------- Bill modal ---------------------------- */}
      <Modal
        open={billModal}
        onClose={() => setBillModal(false)}
        title="Generate a bill"
        description="Create an invoice for a patient's consultation."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setBillModal(false)}>
              Cancel
            </Button>
            <Button onClick={createBill} loading={savingBill}>
              Generate
            </Button>
          </>
        }
      >
        <form className="stack stack-4" onSubmit={createBill}>
          <Field label="Patient" htmlFor="bill-patient">
            <Select
              id="bill-patient"
              icon={User}
              value={billPatientId}
              onChange={(e) =>
                setBillForm((f) => ({ ...f, patientId: e.target.value }))
              }
            >
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.email}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Amount" htmlFor="bill-amount">
            <Input
              id="bill-amount"
              type="number"
              min={0}
              value={billForm.amount}
              onChange={(e) =>
                setBillForm((f) => ({ ...f, amount: e.target.value }))
              }
              required
            />
          </Field>
        </form>
      </Modal>

      {/* ---------------------------- Record modal ---------------------------- */}
      <Modal
        open={recordModal}
        onClose={() => {
          setRecordModal(false);
          setEditingRecordId(null);
        }}
        title={editingRecordId ? "Edit report" : "Upload a report"}
        description={
          editingRecordId
            ? "Changes are saved straight to the patient's medical record."
            : "The report is added to the patient's medical record."
        }
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setRecordModal(false);
                setEditingRecordId(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={saveRecord} loading={savingRecord}>
              {editingRecordId ? "Save changes" : "Upload report"}
            </Button>
          </>
        }
      >
        <form className="stack stack-4" onSubmit={saveRecord}>
          <Field
            label="Patient"
            hint="Type a name to search, then pick the patient from the list."
            htmlFor="rec-patient"
          >
            <Combobox
              id="rec-patient"
              icon={User}
              value={recordPatientId}
              options={patientOptions}
              onChange={(patientId) =>
                setRecordForm((f) => ({ ...f, patientId }))
              }
              placeholder="Search patient name"
              searchPlaceholder="Search patient name or email"
              emptyText="No patient matches that name"
            />
          </Field>

          <Field
            label="Reported by"
            hint="The doctor who issued this report."
            htmlFor="rec-doctor"
          >
            <Select
              id="rec-doctor"
              icon={Stethoscope}
              value={recordForm.doctorId || ""}
              onChange={(e) =>
                setRecordForm((f) => ({ ...f, doctorId: e.target.value }))
              }
            >
              <option value="">Hospital Doctor (not specified)</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                  {d.specialty ? ` — ${d.specialty}` : ""}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Report title" htmlFor="rec-title">
            <Input
              id="rec-title"
              icon={FileText}
              placeholder="Blood Sugar Report"
              value={recordForm.title}
              onChange={(e) =>
                setRecordForm((f) => ({ ...f, title: e.target.value }))
              }
              required
            />
          </Field>

          <Field label="Type" htmlFor="rec-type">
            <Select
              id="rec-type"
              value={recordForm.type}
              onChange={(e) =>
                setRecordForm((f) => ({ ...f, type: e.target.value }))
              }
            >
              {RECORD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Findings"
            hint="Shown to the patient in their records."
            htmlFor="rec-desc"
          >
            <Textarea
              id="rec-desc"
              rows={3}
              placeholder="Fasting 95 mg/dL, Post-prandial 130 mg/dL (Normal)"
              value={recordForm.description}
              onChange={(e) =>
                setRecordForm((f) => ({ ...f, description: e.target.value }))
              }
            />
          </Field>
        </form>
      </Modal>
    </>
  );
}

/* ============================== OVERVIEW ============================== */

function AdminOverview({
  stats,
  doctors,
  appointments,
  patients,
  doctorLoad,
  slotsTakenFor,
  search,
  onNavigate,
  onStatus,
  onSelectPatient,
}) {
  const q = search.trim().toLowerCase();
  const hit = (...vals) =>
    vals.some((v) => String(v ?? "").toLowerCase().includes(q));

  const pending = appointments.filter((a) => a.status === "PENDING");
  const recent = useMemo(
    () =>
      [...appointments].sort(
        (a, b) => new Date(b.date) - new Date(a.date)
      ),
    [appointments]
  );

  const visPending = q
    ? pending.filter((a) =>
        hit(a.patient?.name, a.patient?.email, a.doctor?.name, a.reason)
      )
    : pending;
  const visRecent = q
    ? recent.filter((a) =>
        hit(
          a.patient?.name,
          a.patient?.email,
          a.doctor?.name,
          a.reason,
          a.status
        )
      )
    : recent;
  const visDoctors = q
    ? doctors.filter((d) => hit(d.name, d.specialty, d.email))
    : doctors;
  const visPatients = q
    ? patients.filter((p) => hit(p.name, p.email, p.phone))
    : patients;

  // On-duty doctors float to the top; the rest dim below so the working
  // roster reads first when the panel is busy.
  const dutyDoctors = [...visDoctors].sort(
    (a, b) => Number(b.available !== false) - Number(a.available !== false)
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h2 className="t-display">Facility overview</h2>
          <p className="t-sm t-muted" style={{ marginTop: 4 }}>
            Live numbers from the hospital record — updated as you work.
          </p>
        </div>
      </div>

      <div className="stat-grid">
        <StatCard
          icon={Users}
          tone="brand"
          label="Registered patients"
          value={stats.totalPatients}
          meta="All time"
          onClick={() => onNavigate("Patients")}
        />
        <StatCard
          icon={Stethoscope}
          tone="success"
          label="Doctors on panel"
          value={stats.totalDoctors}
          meta={`${stats.onDuty} accepting bookings`}
          onClick={() => onNavigate("Doctors")}
        />
        <StatCard
          icon={CalendarCheck2}
          tone={stats.pendingApps ? "warning" : "info"}
          label="Appointments"
          value={stats.totalAppointments}
          meta={`${stats.pendingApps} awaiting approval`}
          onClick={() => onNavigate("Appointments")}
        />
        <StatCard
          icon={TrendingUp}
          tone="accent"
          label="Revenue collected"
          value={formatMoney(stats.revenue)}
          meta={`${formatMoney(stats.outstanding)} outstanding`}
          onClick={() => onNavigate("Billing")}
        />
      </div>

      <div className="grid grid-2">
        <Card>
          <CardHeader
            title="Awaiting approval"
            subtitle={visPending.length ? `${visPending.length} requests need a decision` : "Queue is clear"}
            action={
              visPending.length ? (
                <Button size="sm" onClick={() => onNavigate("Appointments")}>
                  Review all
                </Button>
              ) : null
            }
          />
          <CardBody flush>
            {visPending.length === 0 ? (
              <EmptyState
                icon={CheckCircle2}
                title="Nothing pending"
                text="Every appointment request has been handled."
                compact
              />
            ) : (
              <div className="list">
                {visPending.slice(0, 4).map((a) => (
                  <ApprovalRow key={a.id} appointment={a} onStatus={onStatus} />
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Doctors on duty today"
            subtitle={`${stats.onDuty} of ${visDoctors.length} accepting bookings`}
            action={
              <Button size="sm" variant="ghost" onClick={() => onNavigate("Doctors")}>
                Manage
              </Button>
            }
          />
          <CardBody flush>
            {visDoctors.length === 0 ? (
              <EmptyState
                icon={Stethoscope}
                title="No doctors yet"
                text="Add your first specialist to start taking bookings."
                compact
              />
            ) : (
              <div className="list">
                {dutyDoctors.slice(0, 5).map((d) => {
                  const load = doctorLoad(d);
                  const cap = CONSULT_SLOTS.length;
                  const taken = slotsTakenFor(d).length;
                  const pct = d.available && cap ? Math.round((taken / cap) * 100) : 0;
                  const tone = d.available ? load.chip.replace("chip-", "") : "off";
                  return (
                    <div className={`duty-row${d.available ? "" : " is-off"}`} key={d.id}>
                      <span className={`duty-avatar${d.available ? " is-on" : ""}`}>
                        <Avatar src={d.avatar} name={d.name} size="sm" />
                        <span className="duty-dot" aria-hidden="true" />
                      </span>
                      <div className="list-main">
                        <div className="list-title truncate">{d.name}</div>
                        <div className="list-meta truncate">
                          {d.specialty} · {formatMoney(d.fee)}
                        </div>
                        <div className="duty-meter" aria-hidden="true">
                          <span
                            className={`duty-meter-fill is-${tone}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                      <div className="list-side">
                        <span className={`chip ${d.available ? load.chip : ""}`}>
                          {d.available ? load.label : "Off duty"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Recent appointments"
          subtitle="Newest first"
          action={
            <Button size="sm" variant="ghost" onClick={() => onNavigate("Appointments")}>
              View all
            </Button>
          }
        />
        <CardBody flush>
          {visRecent.length === 0 ? (
            <EmptyState icon={CalendarCheck2} title="No appointments yet" compact />
          ) : (
            <div className="list">
              {visRecent.slice(0, 6).map((a) => (
                <div className="list-row" key={a.id}>
                  <Avatar
                    src={a.doctor?.avatar}
                    name={a.doctor?.name ?? "Doctor"}
                    size="sm"
                  />
                  <div className="list-main">
                    <div className="list-title truncate">
                      {a.patient?.name ?? a.patientId ?? "Patient"}
                      <span className="t-muted" style={{ fontWeight: 500 }}>
                        {"  →  "}
                        {a.doctor?.name ?? a.doctorId ?? "Doctor"}
                      </span>
                    </div>
                    <div className="list-meta">
                      {formatDateTime(a.date)}
                      {a.slot ? ` · ${a.slot}` : ""}
                      {a.reason ? ` · ${a.reason}` : ""}
                    </div>
                  </div>
                  <div className="list-side">
                    <StatusBadge status={a.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Patients"
          subtitle={`${visPatients.length} registered`}
          action={
            <Button size="sm" variant="ghost" onClick={() => onNavigate("Patients")}>
              View all
            </Button>
          }
        />
        <CardBody>
          <div className="grid grid-auto">
            {visPatients.slice(0, 6).map((p) => (
              <button
                type="button"
                key={p.id}
                className="list-row is-clickable"
                onClick={() => onSelectPatient(p)}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: "var(--r-lg)",
                  padding: "var(--sp-4)",
                }}
              >
                <Avatar src={p.avatar} name={p.name} size="sm" />
                <div className="list-main" style={{ minWidth: 0 }}>
                  <div className="list-title truncate">{p.name}</div>
                  <div className="list-meta truncate">{p.email}</div>
                </div>
              </button>
            ))}
          </div>
        </CardBody>
      </Card>
    </>
  );
}

function ApprovalRow({ appointment: a, onStatus }) {
  const patientName = a.patient?.name ?? a.patientId ?? "Patient";
  const doctorName = a.doctor?.name ?? a.doctorId ?? "Doctor";
  const requestedAt = a.createdAt ?? a.statusUpdatedAt;
  const stale = isStale(requestedAt);

  return (
    <div className={`approval-row${stale ? " is-stale" : ""}`}>
      <span className="approval-rail" aria-hidden="true" />
      <Avatar src={a.patient?.avatar} name={patientName} size="sm" />
      <div className="approval-main">
        <div className="approval-top">
          <span className="list-title truncate">{patientName}</span>
        </div>
        <div className="approval-meta">
          <span className="approval-chip">
            <Stethoscope size={13} aria-hidden="true" />
            <span className="truncate">{doctorName}</span>
          </span>
          <span className="approval-chip">
            <CalendarCheck2 size={13} aria-hidden="true" />
            {formatDate(a.date)}
            {a.slot ? ` · ${a.slot}` : ""}
          </span>
          {a.reason && (
            <span className="approval-chip">
              <FileText size={13} aria-hidden="true" />
              <span className="truncate">{a.reason}</span>
            </span>
          )}
        </div>
        {requestedAt && (
          <div className="approval-age">
            <Clock size={12} aria-hidden="true" />
            Requested {formatRelative(requestedAt)}
          </div>
        )}
      </div>
      <div className="approval-actions">
        <Button
          size="sm"
          variant="success"
          icon={CheckCircle2}
          onClick={() => onStatus(a, "CONFIRMED")}
        >
          Approve
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={XCircle}
          onClick={() => onStatus(a, "CANCELLED")}
          aria-label={`Reject ${patientName}'s request`}
        >
          Reject
        </Button>
      </div>
    </div>
  );
}

/* ============================== DOCTORS ============================== */

function DoctorsAdmin({
  doctors,
  search,
  isSlotTaken,
  doctorLoad,
  onAdd,
  onEdit,
  onDelete,
  onToggle,
}) {
  const q = search.trim().toLowerCase();
  const filtered = q
    ? doctors.filter(
        (d) =>
          d.name?.toLowerCase().includes(q) ||
          d.specialty?.toLowerCase().includes(q)
      )
    : doctors;

  return (
    <>
      <div className="page-head">
        <div>
          <h2 className="t-display">Doctors &amp; schedule</h2>
          <p className="t-sm t-muted" style={{ marginTop: 4 }}>
            Today's slot occupancy per doctor. Struck-through times are taken.
          </p>
        </div>
        <Button icon={Plus} onClick={onAdd}>
          Add doctor
        </Button>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={Stethoscope}
              title={q ? "No matching doctors" : "No doctors yet"}
              text={
                q
                  ? "Try a different name or specialty."
                  : "Add your specialists so patients can book consultations."
              }
              action={
                q ? null : (
                  <Button icon={Plus} onClick={onAdd}>
                    Add the first doctor
                  </Button>
                )
              }
            />
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-auto">
          {filtered.map((d) => {
            const load = doctorLoad(d);
            return (
              <Card key={d.id} interactive>
                <CardBody className="stack stack-4">
                  <div className="row row-3">
                    <Avatar src={d.avatar} name={d.name} size="md" />
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="list-title truncate">{d.name}</div>
                      <div className="list-meta">{d.specialty}</div>
                    </div>
                    <span className={`chip ${load.chip}`}>{load.label}</span>
                  </div>

                  <div className="divider" />

                  <div className="grid grid-2" style={{ gap: "var(--sp-3)" }}>
                    <MiniStat label="Fee" value={formatMoney(d.fee)} />
                    <MiniStat
                      label="Experience"
                      value={`${d.experience ?? 0} yrs`}
                    />
                  </div>

                  <div className="stack stack-2">
                    <div className="t-label">Today's slots</div>
                    <div className="row row-2 row-wrap">
                      {CONSULT_SLOTS.map((slot) => {
                        const taken = isSlotTaken(d, slot);
                        return (
                          <span
                            key={slot}
                            className={`chip ${taken ? "chip-full" : "chip-free"}`}
                            style={{
                              textDecoration: taken ? "line-through" : "none",
                              opacity: taken ? 0.75 : 1,
                            }}
                            title={taken ? "Booked" : "Free"}
                          >
                            {slot}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  <div className="row row-3">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="grow"
                      onClick={() => onToggle(d)}
                    >
                      {d.available ? "Set unavailable" : "Set available"}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => onEdit(d)}
                      aria-label={`Edit ${d.name}`}
                    >
                      <Pencil size={14} />
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => onDelete(d)}
                      aria-label={`Remove ${d.name}`}
                    >
                      <Trash2 size={14} />
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

function MiniStat({ label, value }) {
  return (
    <div
      style={{
        padding: "var(--sp-3)",
        background: "var(--bg-surface-2)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-md)",
      }}
    >
      <div className="t-label">{label}</div>
      <div
        className="t-sm t-bold t-num"
        style={{ marginTop: 2, fontSize: "var(--text-md)" }}
      >
        {value}
      </div>
    </div>
  );
}

/* ============================== PATIENTS ============================== */

function PatientsAdmin({ patients, search, selected, onSelect, onDelete, rowsFor }) {
  const q = search.trim().toLowerCase();
  const filtered = q
    ? patients.filter(
        (p) =>
          p.name?.toLowerCase().includes(q) || p.email?.toLowerCase().includes(q)
      )
    : patients;

  const detail = selected ? rowsFor(selected) : null;
  const billed = detail
    ? detail.bills.reduce((s, b) => s + (Number(b.amount) || 0), 0)
    : 0;
  const paid = detail
    ? detail.bills
        .filter((b) => b.status === "PAID")
        .reduce((s, b) => s + (Number(b.amount) || 0), 0)
    : 0;
  const due = billed - paid;

  return (
    <>
      <div className="page-head">
        <div>
          <h2 className="t-display">Patients</h2>
          <p className="t-sm t-muted" style={{ marginTop: 4 }}>
            {filtered.length} {filtered.length === 1 ? "record" : "records"}
            {q ? ` matching "${q}"` : ""}
          </p>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={Users}
              title={q ? "No matching patients" : "No patients yet"}
              text="Patients appear here once they register a portal account."
            />
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardBody flush>
            <div className="table-wrap">
              <table className="table table-stack">
                <thead>
                  <tr>
                    <th>Patient</th>
                    <th>Contact</th>
                    <th>Location</th>
                    <th className="t-center">Visits</th>
                    <th className="t-center">Bills</th>
                    <th className="t-center">Records</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => {
                    const rows = rowsFor(p);
                    const isOpen = selected?.id === p.id;
                    return (
                      <tr
                        key={p.id}
                        onClick={() => onSelect(isOpen ? null : p)}
                        style={{
                          cursor: "pointer",
                          background: isOpen ? "var(--primary-soft)" : undefined,
                        }}
                      >
                        <td>
                          <div className="row row-3">
                            <Avatar src={p.avatar} name={p.name} size="sm" />
                            <div style={{ minWidth: 0 }}>
                              <div className="list-title">{p.name}</div>
                              <div className="list-meta">{p.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="t-sm t-secondary" data-label="Contact">{p.phone ?? "—"}</td>
                        <td className="t-sm t-secondary" data-label="Location">{p.address ?? "—"}</td>
                        <td className="t-center t-sm t-num" data-label="Visits">
                          {rows.appointments.length}
                        </td>
                        <td className="t-center t-sm t-num" data-label="Bills">{rows.bills.length}</td>
                        <td className="t-center t-sm t-num" data-label="Records">
                          {rows.records.length}
                        </td>
                        <td className="t-right" data-label="">
                          <div
                            className="row row-2"
                            style={{ justifyContent: "flex-end" }}
                          >
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelect(isOpen ? null : p);
                              }}
                            >
                              {isOpen ? "Hide" : "View"}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={Trash2}
                              aria-label={`Remove ${p.name}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                onDelete(p);
                              }}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      )}

      <Modal
        open={!!(selected && detail)}
        onClose={() => onSelect(null)}
        title={selected?.name}
        description={
          selected
            ? `${selected.email} · ${selected.phone ?? "no phone"} · ${selected.address ?? "no address"}`
            : undefined
        }
        size="lg"
        footer={
          <>
            <Button
              variant="ghost"
              icon={Trash2}
              onClick={() => selected && onDelete(selected)}
            >
              Remove
            </Button>
            <Button variant="secondary" onClick={() => onSelect(null)}>
              Hide
            </Button>
          </>
        }
      >
        {detail ? (
          <div className="stack stack-4">
            <div
              className="row row-4 row-wrap"
              style={{ alignItems: "center" }}
            >
              <Avatar
                src={selected?.avatar}
                name={selected?.name}
                size="lg"
              />
              <div className="grow" style={{ minWidth: 180 }}>
                <div className="t-bold">{selected?.name}</div>
                <div className="t-sm t-muted truncate">{selected?.email}</div>
              </div>
              <div
                className="grid grid-3"
                style={{ gap: "var(--sp-3)", flex: 2, minWidth: 280 }}
              >
                <MiniStat label="Phone" value={selected?.phone ?? "—"} />
                <MiniStat label="Location" value={selected?.address ?? "—"} />
                <MiniStat label="Visits" value={detail.appointments.length} />
                <MiniStat label="Total billed" value={formatMoney(billed)} />
                <MiniStat label="Paid" value={formatMoney(paid)} />
                <MiniStat label="Outstanding" value={formatMoney(due)} />
              </div>
            </div>

            <div className="grid grid-3">
              <DetailColumn
                icon={CalendarCheck2}
                title="Appointments"
                count={detail.appointments.length}
                empty="No visits booked."
                items={[...detail.appointments]
                  .sort((a, b) => new Date(b.date) - new Date(a.date))
                  .map((a) => ({
                    id: a.id,
                    title: a.doctor?.name ?? a.doctorId ?? "Doctor",
                    meta: `${a.doctor?.specialty ? `${a.doctor.specialty} · ` : ""}${formatDate(a.date)}${a.slot ? ` · ${a.slot}` : ""}`,
                    note: a.reason ? `Problem: ${a.reason}` : null,
                    badge: <StatusBadge status={a.status} />,
                  }))}
              />
              <DetailColumn
                icon={Receipt}
                title="Bills"
                count={detail.bills.length}
                empty="No bills raised."
                items={[...detail.bills]
                  .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                  .map((b) => ({
                    id: b.id,
                    title: formatMoney(b.amount),
                    meta: formatDate(b.createdAt),
                    badge: <StatusBadge status={b.status} />,
                  }))}
              />
              <DetailColumn
                icon={FileText}
                title="Records"
                count={detail.records.length}
                empty="No reports uploaded."
                items={[...detail.records]
                  .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                  .map((r) => ({
                    id: r.id,
                    title: r.title,
                    meta: `${titleCase(r.type ?? "General")} · ${formatDate(r.createdAt)}${r.doctor?.name ? ` · ${r.doctor.name}` : ""}`,
                    note: r.description || null,
                  }))}
              />
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}

function DetailColumn({ icon: Icon, title, count, empty, items }) {
  return (
    <div className="stack stack-3">
      <div className="row row-2">
        <Icon size={15} className="t-muted" aria-hidden="true" />
        <span className="t-sm t-bold">{title}</span>
        <Badge tone="neutral" dot={false}>
          {count}
        </Badge>
      </div>
      {items.length === 0 ? (
        <p className="t-xs t-muted">{empty}</p>
      ) : (
        <div className="stack stack-2">
          {items.map((it) => (
            <div
              key={it.id}
              className="row row-2 row-between"
              style={{
                padding: "var(--sp-3)",
                border: "1px solid var(--border)",
                borderRadius: "var(--r-md)",
                background: "var(--bg-surface-2)",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div className="t-sm t-bold truncate">{it.title}</div>
                <div className="t-xs t-muted">{it.meta}</div>
                {it.note ? (
                  <div className="t-xs t-secondary" style={{ marginTop: 2 }}>
                    {it.note}
                  </div>
                ) : null}
              </div>
              {it.badge}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================== APPOINTMENTS ============================== */

function AppointmentsAdmin({ appointments, search, onStatus }) {
  const q = search.trim().toLowerCase();
  const sorted = useMemo(
    () =>
      [...appointments].sort((a, b) => new Date(b.date) - new Date(a.date)),
    [appointments]
  );

  const filtered = q
    ? sorted.filter(
        (a) =>
          a.patient?.name?.toLowerCase().includes(q) ||
          a.doctor?.name?.toLowerCase().includes(q) ||
          a.reason?.toLowerCase().includes(q)
      )
    : sorted;

  return (
    <>
      <div className="page-head">
        <div>
          <h2 className="t-display">Appointments</h2>
          <p className="t-sm t-muted" style={{ marginTop: 4 }}>
            {filtered.length} of {appointments.length} records
          </p>
        </div>
      </div>

      <Card>
        <CardBody flush>
          {filtered.length === 0 ? (
            <EmptyState
              icon={CalendarCheck2}
              title={q ? "No matching appointments" : "No appointments yet"}
              text={
                q
                  ? "Search by patient, doctor or reason."
                  : "Patient bookings will land here for approval."
              }
            />
          ) : (
            <div className="list">
              {filtered.map((a) => (
                <div className="list-row" key={a.id}>
                  <Avatar
                    src={a.doctor?.avatar}
                    name={a.doctor?.name ?? "Doctor"}
                    size="md"
                  />
                  <div className="list-main">
                    <div className="list-title">
                      {a.patient?.name ?? a.patientId ?? "Patient"}
                      <span className="t-muted" style={{ fontWeight: 500 }}>
                        {"  →  "}
                        {a.doctor?.name ?? a.doctorId ?? "Doctor"}
                      </span>
                    </div>
                    <div className="list-meta">
                      {formatDateTime(a.date)}
                      {a.slot ? ` · ${a.slot}` : ""}
                      {isToday(a.date) ? " · today" : ""}
                    </div>
                    {a.reason && <div className="list-sub">{a.reason}</div>}
                  </div>
                  <div className="list-side">
                    <StatusBadge status={a.status} />
                    {a.status === "PENDING" ? (
                      <>
                        <Button
                          size="sm"
                          variant="success"
                          icon={CheckCircle2}
                          onClick={() => onStatus(a, "CONFIRMED")}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          icon={XCircle}
                          onClick={() => onStatus(a, "CANCELLED")}
                        >
                          Reject
                        </Button>
                      </>
                    ) : null}
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

/* ============================== BILLING ============================== */

function BillingAdmin({ bills, stats, search, onCreate, onMarkPaid }) {
  const q = search.trim().toLowerCase();
  const sorted = useMemo(
    () => [...bills].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    [bills]
  );

  const filtered = q
    ? sorted.filter(
        (b) =>
          b.patient?.name?.toLowerCase().includes(q) ||
          String(b.amount).includes(q)
      )
    : sorted;

  return (
    <>
      <div className="page-head">
        <div>
          <h2 className="t-display">Billing</h2>
          <p className="t-sm t-muted" style={{ marginTop: 4 }}>
            {filtered.length} of {bills.length} invoices
          </p>
        </div>
        <Button icon={Plus} onClick={onCreate}>
          Generate bill
        </Button>
      </div>

      <div className="stat-grid">
        <StatCard
          icon={TrendingUp}
          tone="success"
          label="Collected"
          value={formatMoney(stats.revenue)}
          meta={`${stats.paidBills} settled invoices`}
        />
        <StatCard
          icon={BadgeIndianRupee}
          tone={stats.outstanding ? "warning" : "success"}
          label="Outstanding"
          value={formatMoney(stats.outstanding)}
          meta={stats.outstanding ? "Awaiting payment" : "Nothing due"}
        />
        <StatCard
          icon={Receipt}
          tone="info"
          label="Invoices raised"
          value={bills.length}
          meta="All time"
        />
        <StatCard
          icon={CreditCard}
          tone="accent"
          label="Settlement rate"
          value={
            bills.length
              ? `${Math.round((stats.paidBills / bills.length) * 100)}%`
              : "—"
          }
          meta="Bills paid"
        />
      </div>

      <Card>
        <CardBody flush>
          {filtered.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title={q ? "No matching invoices" : "No bills yet"}
              text="Generate an invoice after a consultation to start billing."
              action={
                q ? null : (
                  <Button icon={Plus} onClick={onCreate}>
                    Generate the first bill
                  </Button>
                )
              }
            />
          ) : (
            <div className="table-wrap">
              <table className="table table-stack">
                <thead>
                  <tr>
                    <th>Patient</th>
                    <th>Invoice</th>
                    <th>Raised</th>
                    <th className="t-right">Amount</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((b) => (
                    <tr key={b.id}>
                      <td>
                        <div className="row row-3">
                          <Avatar
                            src={b.patient?.avatar}
                            name={b.patient?.name ?? "Patient"}
                            size="sm"
                          />
                          <div style={{ minWidth: 0 }}>
                            <div className="list-title truncate">
                              {b.patient?.name ?? b.patientId ?? "Patient"}
                            </div>
                            <div className="list-meta truncate">
                              {b.patient?.email ?? ""}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="t-mono t-xs" data-label="Invoice">
                        #{String(b.id).slice(-6).toUpperCase()}
                      </td>
                      <td className="t-sm t-secondary" data-label="Raised">
                        {formatDate(b.createdAt)}
                      </td>
                      <td className="t-right t-bold t-num" data-label="Amount">
                        {formatMoney(b.amount)}
                      </td>
                      <td data-label="Status">
                        <StatusBadge status={b.status} />
                      </td>
                      <td className="t-right" data-label="">
                        {b.status === "PENDING" ? (
                          <Button size="sm" onClick={() => onMarkPaid(b)}>
                            Mark paid
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </>
  );
}

/* ============================== RECORDS ============================== */

function RecordsAdmin({
  records,
  search,
  onCreate,
  onEdit,
  onDelete,
  deletingId,
}) {
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
          r.patient?.name?.toLowerCase().includes(q) ||
          r.type?.toLowerCase().includes(q)
      )
    : sorted;

  return (
    <>
      <div className="page-head">
        <div>
          <h2 className="t-display">Medical records</h2>
          <p className="t-sm t-muted" style={{ marginTop: 4 }}>
            {filtered.length} of {records.length} reports
          </p>
        </div>
        <Button icon={Plus} onClick={onCreate}>
          Upload report
        </Button>
      </div>

      <Card>
        <CardBody flush>
          {filtered.length === 0 ? (
            <EmptyState
              icon={FileText}
              title={q ? "No matching reports" : "No records yet"}
              text="Upload lab results, imaging and prescriptions for your patients."
              action={
                q ? null : (
                  <Button icon={Plus} onClick={onCreate}>
                    Upload the first report
                  </Button>
                )
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
                      {r.patient?.name ?? r.patientId ?? "Patient"}
                      {r.doctor?.name ? ` · ${r.doctor.name}` : ""}
                      {" · "}
                      {formatRelative(r.createdAt)}
                    </div>
                    {r.description && (
                      <div className="list-sub">{r.description}</div>
                    )}
                  </div>
                  <div className="list-side">
                    <Badge tone="brand" dot={false}>
                      {titleCase(r.type ?? "General")}
                    </Badge>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={Pencil}
                      onClick={() => onEdit(r)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      icon={Trash2}
                      loading={deletingId === r.id}
                      onClick={() => onDelete(r)}
                    >
                      Delete
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