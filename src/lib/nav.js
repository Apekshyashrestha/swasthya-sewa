import {
  CalendarCheck2,
  CalendarPlus,
  CreditCard,
  FileText,
  LayoutDashboard,
  MessageSquare,
  Stethoscope,
  User,
  Users,
} from "lucide-react";

/* ----------------------------- Patient ----------------------------- */

export const PATIENT_TABS = [
  { value: "Dashboard", label: "Dashboard", icon: LayoutDashboard },
  { value: "Book Appointment", label: "Find a doctor", icon: CalendarPlus },
  { value: "My Appointments", label: "Appointments", icon: CalendarCheck2 },
  { value: "Consultation", label: "Consultations", icon: Stethoscope },
  { value: "Messages", label: "Messages", icon: MessageSquare },
  { value: "Billing & Payments", label: "Billing", icon: CreditCard },
  { value: "Medical Records", label: "Medical records", icon: FileText },
  { value: "Profile", label: "Profile", icon: User },
];

export const PATIENT_NAV = [
  { label: "Overview", items: [PATIENT_TABS[0], PATIENT_TABS[2]] },
  {
    label: "Services",
    items: [
      PATIENT_TABS[1],
      PATIENT_TABS[3],
      PATIENT_TABS[4],
      PATIENT_TABS[5],
      PATIENT_TABS[6],
    ],
  },
  { label: "Account", items: [PATIENT_TABS[7]] },
];

/* ------------------------------ Admin ------------------------------ */

export const ADMIN_TABS = [
  { value: "Dashboard", label: "Overview", icon: LayoutDashboard },
  { value: "Doctors", label: "Doctors", icon: Stethoscope },
  { value: "Patients", label: "Patients", icon: Users },
  { value: "Appointments", label: "Appointments", icon: CalendarCheck2 },
  { value: "Messages", label: "Messages", icon: MessageSquare },
  { value: "Billing", label: "Billing", icon: CreditCard },
  { value: "Medical Records", label: "Medical records", icon: FileText },
];

export const ADMIN_NAV = [
  { label: "Overview", items: [ADMIN_TABS[0]] },
  { label: "Manage", items: ADMIN_TABS.slice(1) },
];

export const SPECIALTIES = [
  "Cardiologist",
  "Pediatrician",
  "Orthopedic",
  "Dermatologist",
  "Neurologist",
  "General Physician",
];

// Categories offered by the admin report form. The seeded reports already carry
// Cardiology and Radiology, so those are included here too — otherwise a type a
// patient can see could never be chosen again by an administrator.
export const RECORD_TYPES = [
  "Lab",
  "Imaging",
  "Radiology",
  "Cardiology",
  "Prescription",
  "Referral",
  "General",
];

export const BLANK_DOCTOR = {
  name: "",
  email: "",
  specialty: SPECIALTIES[0],
  phone: "",
  fee: 800,
  experience: 5,
  available: true,
};