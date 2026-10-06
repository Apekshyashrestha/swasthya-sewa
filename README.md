# Swasthya Sewa — Digital Healthcare & Hospital Management System 

A modern, responsive, and feature-rich Hospital Management System (HMS) frontend built with **React 19**, **Vite**, and **Tailwind CSS**.

---

## 🌟 Key Features

### 👤 Patient Portal
- **Dashboard Overview**: Personalized greeting, upcoming appointment counter, consultation history, pending bills, and medical records summary.
- **Book Appointment**: Filter doctors by specialty, view doctor fee and experience, select date and available time slots.
- **My Appointments**: Live listing of scheduled consultations with options to view details or cancel.
- **Tele-Consultations**: One-click join link for confirmed appointments.
- **Billing & Payments**: Transparent breakdown of invoices with instant one-click simulated payment.
- **Medical Records**: Access uploaded lab results, prescriptions, and radiology reports.
- **Profile Management**: View and edit personal contact information and address.

### 🛡️ Admin Panel
- **Hospital Analytics & Statistics**: Real-time KPI counters (total patients, doctors, appointments, pending requests, and total revenue).
- **Doctor Directory Management**: Add new doctors, update details, toggle availability, or remove entries.
- **Appointment Approval Workflow**: Accept, reschedule, or cancel patient appointments.
- **Patient Directory**: Complete list of registered patients with contact details.
- **Billing Management**: Create patient bills and track payment status.
- **Medical Record Upload**: Upload diagnosis and laboratory reports for patients.

### 💾 Client-Side Persistence
- Powered by a local storage data store (`localStorage`) with initial seed data.
- Completely standalone: **Zero backend server or database setup required**.
- Actions in Patient and Admin views seamlessly sync via client storage.

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Development Server
```bash
npm run dev
```
Open your browser at `http://localhost:5173`.

### 3. Build for Production
```bash
npm run build
```

---

## 🔑 Demo Credentials

You can sign in immediately with the following demo accounts or create your own:

- **Admin Panel**: `admin@swasthyasewa.com` / `Admin@123`
- **Patient Portal**: `priya@gmail.com` / `Patient@123`
- Or click **Create Account** to register any new account.

---

## 📁 Project Structure

```
swasthya-sewa/
├── src/
│   ├── assets/              # Static images and icons
│   ├── components/          # Reusable UI components
│   │   ├── Header.jsx
│   │   ├── Sidebar.jsx
│   │   ├── WelcomeBanner.jsx
│   │   ├── UpcomingAppointments.jsx
│   │   ├── ProfileCard.jsx
│   │   ├── QuickActions.jsx
│   │   ├── RecentActivity.jsx
│   │   ├── HealthTips.jsx
│   │   └── QuickLinks.jsx
│   ├── context/
│   │   └── AuthContext.jsx  # Client authentication & user state
│   ├── hooks/
│   │   └── useDashboard.js  # Live dashboard data hook
│   ├── lib/
│   │   └── api.js           # Client-side storage & mock API service
│   ├── pages/
│   │   └── AdminDashboard.jsx # Admin management portal
│   ├── App.css              # Styling and design system
│   ├── App.jsx              # Main application shell & routing
│   └── main.jsx             # React entry point
├── package.json
└── vite.config.js
```

