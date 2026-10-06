import { useCallback, useEffect, useMemo, useState } from "react";
import { HeartPulse, MapPin, Phone, User as UserIcon } from "lucide-react";
import { useAuth } from "./context/useAuth.js";
import { ToastProvider } from "./context/ToastProvider.jsx";
import { useToast } from "./context/useToast.js";
import { useTheme } from "./hooks/useTheme.js";
import AuthScreen from "./components/AuthScreen.jsx";
import { AppShell } from "./components/layout/AppShell.jsx";
import { Button } from "./components/ui/Button.jsx";
import { Field, Input } from "./components/ui/Field.jsx";
import { Modal } from "./components/ui/Modal.jsx";
import PatientPortal from "./pages/PatientPortal.jsx";
import AdminDashboard from "./pages/AdminDashboard.jsx";
import { PATIENT_NAV, ADMIN_NAV, PATIENT_TABS, ADMIN_TABS } from "./lib/nav.js";
import { titleCase } from "./lib/format.js";
import { countUnread, readSeenAt, writeSeenAt } from "./lib/notifications.js";
import api from "./lib/api.js";

export default function App() {
  return (
    <ToastProvider>
      <Root />
    </ToastProvider>
  );
}

function Root() {
  const { theme } = useTheme();
  const { user, loading, login, register, logout, resetPassword, updateProfile } =
    useAuth();
  const toast = useToast();

  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authSuccess, setAuthSuccess] = useState("");

  const [search, setSearch] = useState("");
  const [patientTab, setPatientTab] = useState(PATIENT_TABS[0].value);
  const [adminTab, setAdminTab] = useState(ADMIN_TABS[0].value);

  const [profileOpen, setProfileOpen] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: "", phone: "", address: "" });
  const [savingProfile, setSavingProfile] = useState(false);

  const isAdmin = user?.role === "ADMIN";

  // Paint the correct theme before the first frame of content.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const activeShellTab = isAdmin ? adminTab : patientTab;

  // The overview page has no search box, so drop any in-flight query when
  // navigating to it rather than leaving its lists silently filtered.
  const navigateTo = useCallback((tab, setTab) => {
    setTab(tab);
    if (tab === "Dashboard") setSearch("");
  }, []);
  const navigateAdmin = useCallback(
    (tab) => navigateTo(tab, setAdminTab),
    [navigateTo]
  );
  const navigatePatient = useCallback(
    (tab) => navigateTo(tab, setPatientTab),
    [navigateTo]
  );

  const resetSessionState = useCallback(() => {
    setSearch("");
    setPatientTab(PATIENT_TABS[0].value);
    setAdminTab(ADMIN_TABS[0].value);
    setAuthError("");
    setAuthSuccess("");
    setProfileOpen(false);
  }, []);

  const handleAuthSubmit = useCallback(
    async ({ name, email, password, phone, isRegister, portal }) => {
      setAuthBusy(true);
      setAuthError("");
      setAuthSuccess("");

      try {
        const loggedIn = isRegister
          ? (
              await register({
                name: name.trim(),
                email: email.trim(),
                password,
                phone: phone.trim(),
              })
            ).user
          : await login(email.trim(), password);

        const wantsAdmin = portal === "admin";
        if (wantsAdmin && loggedIn?.role !== "ADMIN") {
          // The API granted a patient session — undo it rather than leaving the
          // user stranded on the admin tab with no permissions.
          await logout();
          setAuthError(
            "That account is not an administrator. Use the patient portal, or sign in with an admin address."
          );
          return;
        }

        resetSessionState();
        toast.success(
          isRegister
            ? `Welcome, ${loggedIn?.name?.split(" ")[0]}!`
            : `Signed in as ${loggedIn?.name}`
        );
      } catch (err) {
        setAuthError(err.message || "We could not sign you in.");
      } finally {
        setAuthBusy(false);
      }
    },
    [login, register, logout, toast, resetSessionState]
  );

  const handleReset = useCallback(
    async (email, password) => {
      setAuthBusy(true);
      setAuthError("");
      setAuthSuccess("");
      try {
        await resetPassword(email.trim(), password);
        setAuthSuccess("If that email is registered, password reset instructions are on the way.");
      } catch (err) {
        setAuthError(err.message || "Could not reset the password.");
      } finally {
        setAuthBusy(false);
      }
    },
    [resetPassword]
  );

  const handleLogout = useCallback(async () => {
    await logout();
    resetSessionState();
    toast.info("Signed out.");
  }, [logout, toast, resetSessionState]);

  const openProfile = useCallback(() => {
    setProfileForm({
      name: user?.name ?? "",
      phone: user?.phone ?? "",
      address: user?.address ?? "",
    });
    setProfileOpen(true);
  }, [user]);

  const saveProfile = useCallback(
    async (e) => {
      e.preventDefault();
      setSavingProfile(true);
      try {
        await updateProfile({
          name: profileForm.name.trim(),
          phone: profileForm.phone.trim(),
          address: profileForm.address.trim(),
        });
        setProfileOpen(false);
        toast.success("Profile updated.");
      } catch (err) {
        toast.error(err.message || "Could not update your profile.");
      } finally {
        setSavingProfile(false);
      }
    },
    [profileForm, updateProfile, toast]
  );

  const shellUser = useMemo(
    () => ({
      name: user?.name ?? "Guest",
      email: user?.email ?? "",
      avatar: user?.avatar,
      roleLabel: titleCase(user?.role ?? "patient"),
    }),
    [user]
  );

  const shellProps = {
    user: shellUser,
    brandSubtitle: isAdmin ? "Admin panel" : "Patient portal",
    searchValue: search,
    onSearchChange: setSearch,
    showSearch: activeShellTab !== "Dashboard",
    onLogout: handleLogout,
  };

  // Notifications are derived from live data, so they are refetched when the
  // panel opens and periodically while the app is open, rather than being
  // snapshotted once at sign-in.
  const [notifications, setNotifications] = useState([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [seenAt, setSeenAt] = useState(() => readSeenAt(user?.id));

  const applyNotifications = (payload) =>
  setNotifications(Array.isArray(payload?.items) ? payload.items : []);

const refreshNotifications = useCallback(async () => {
  try {
    const { data } = await api.get("/notifications");
    applyNotifications(data);
  } catch {
    // A failed refresh leaves the last known list in place rather than
    // blanking the bell and implying there is nothing to report.
  }
}, []);

useEffect(() => {
  if (!user) return undefined;
  let alive = true;
  api
    .get("/notifications")
    .then(({ data }) => {
      if (alive) applyNotifications(data);
    })
    .catch(() => {});
  const timer = setInterval(() => {
    api
      .get("/notifications")
      .then(({ data }) => {
        if (alive) applyNotifications(data);
      })
      .catch(() => {});
  }, 60_000);
  return () => {
    alive = false;
    clearInterval(timer);
  };
}, [user]);

  const unreadCount = useMemo(() => countUnread(notifications, seenAt), [notifications, seenAt]);

  const toggleNotifications = () => {
    setNotifOpen((open) => {
      if (!open) {
        // Opening marks what is on screen as seen, so the badge reflects only
        // what has arrived since.
        refreshNotifications();
        setSeenAt(writeSeenAt(user?.id));
      }
      return !open;
    });
  };

  const openNotification = (n) => {
    if (!n?.tab) return;
    if (isAdmin) navigateAdmin(n.tab);
    else navigatePatient(n.tab);
    setNotifOpen(false);
    setSeenAt(writeSeenAt(user?.id));
  };

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "var(--bg-body)",
          color: "var(--text-muted)",
        }}
      >
        <div className="stack stack-4" style={{ alignItems: "center" }}>
          <HeartPulse size={32} style={{ color: "var(--primary)" }} />
          <div className="row row-3">
            <span className="spinner" />
            <span className="t-sm">Loading Swasthya Sewa…</span>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <AuthScreen
        onSubmit={handleAuthSubmit}
        onReset={handleReset}
        loading={authBusy}
        error={authError}
        success={authSuccess}
      />
    );
  }

  return (
    <>
      {isAdmin ? (
        <AppShell
          {...shellProps}
          navSections={ADMIN_NAV}
          activeTab={adminTab}
          onNavigate={navigateAdmin}
          searchPlaceholder="Search patients, doctors, bills…"
          notifications={notifications}
          notificationCount={unreadCount}
          notificationsOpen={notifOpen}
          onToggleNotifications={toggleNotifications}
          onOpenNotification={openNotification}
        >
          <AdminDashboard
            activeTab={adminTab}
            onNavigate={navigateAdmin}
            search={search}
          />
        </AppShell>
      ) : (
        <AppShell
          {...shellProps}
          navSections={PATIENT_NAV}
          activeTab={patientTab}
          onNavigate={navigatePatient}
          searchPlaceholder="Search doctors and specialties…"
          notifications={notifications}
          notificationCount={unreadCount}
          notificationsOpen={notifOpen}
          onToggleNotifications={toggleNotifications}
          onOpenNotification={openNotification}
        >
          <PatientPortal
            user={user}
            onOpenProfile={openProfile}
            search={search}
            activeTab={patientTab}
            onNavigate={navigatePatient}
          />
        </AppShell>
      )}

      <Modal
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        title="Edit profile"
        description="Keep your contact details up to date."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setProfileOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveProfile} loading={savingProfile}>
              Save changes
            </Button>
          </>
        }
      >
        <form className="stack stack-4" onSubmit={saveProfile}>
          <Field label="Full name" htmlFor="pf-name">
            <Input
              id="pf-name"
              icon={UserIcon}
              value={profileForm.name}
              onChange={(e) =>
                setProfileForm((f) => ({ ...f, name: e.target.value }))
              }
              required
            />
          </Field>
          <Field label="Phone number" htmlFor="pf-phone">
            <Input
              id="pf-phone"
              type="tel"
              icon={Phone}
              placeholder="+977 98XXXXXXXX"
              value={profileForm.phone}
              onChange={(e) =>
                setProfileForm((f) => ({ ...f, phone: e.target.value }))
              }
            />
          </Field>
          <Field label="Address" htmlFor="pf-address">
            <Input
              id="pf-address"
              icon={MapPin}
              placeholder="Biratnagar, Nepal"
              value={profileForm.address}
              onChange={(e) =>
                setProfileForm((f) => ({ ...f, address: e.target.value }))
              }
            />
          </Field>
        </form>
      </Modal>
    </>
  );
}