import { useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  CalendarCheck2,
  CheckCircle2,
  HeartPulse,
  Lock,
  Mail,
  MessageSquare,
  Phone,
  ShieldCheck,
  User,
} from "lucide-react";
import { Button } from "./ui/Button.jsx";
import { Field, Input } from "./ui/Field.jsx";
import { ThemeToggle } from "./layout/AppShell.jsx";

const FEATURES = [
  {
    icon: CalendarCheck2,
    text: "Book appointments with specialists in seconds",
  },
  {
    icon: MessageSquare,
    text: "Message the hospital team securely from anywhere",
  },
  { icon: Activity, text: "Keep lab reports and prescriptions in one place" },
];

const BLANK_FORM = { name: "", email: "", password: "", confirm: "", phone: "" };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AuthScreen({
  onSubmit,
  onReset,
  loading,
  error,
  success,
  onDismissSuccess,
}) {
  const [mode, setMode] = useState("login");
  const [portal, setPortal] = useState("patient");
  const [form, setForm] = useState(BLANK_FORM);
  const [formError, setFormError] = useState("");

  const update = (key) => (e) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const switchMode = (next) => {
    setMode(next);
    setFormError("");
    setForm((prev) => ({ ...prev, password: "", confirm: "" }));
    onDismissSuccess?.();
  };

  const selectPortal = (next) => {
    setPortal(next);
    // Administrators are provisioned by the hospital; no self-registration.
    if (next === "admin") switchMode("login");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");
    if (!EMAIL_RE.test(form.email.trim())) {
      setFormError("Enter a valid email address.");
      return;
    }
    if (mode === "reset") {
      onReset(form.email);
      return;
    }
    if (!form.password) {
      setFormError("Enter your password.");
      return;
    }
    if (form.password.length < 6) {
      setFormError("Password must be at least 6 characters.");
      return;
    }
    if (mode === "register") {
      if (!form.name.trim()) {
        setFormError("Enter your full name.");
        return;
      }
      if (form.password !== form.confirm) {
        setFormError("Passwords do not match.");
        return;
      }
      if (!/^\d{10}$/.test(form.phone.trim())) {
        setFormError("Phone number must be exactly 10 digits.");
        return;
      }
    }
    const result = await onSubmit({
      name: form.name,
      email: form.email,
      password: form.password,
      phone: form.phone,
      isRegister: mode === "register",
      portal,
    });
    if (result?.registered) {
      // Land on the sign-in form but keep the "account created" notice up.
      setMode("login");
      setForm((prev) => ({ ...prev, password: "", confirm: "" }));
    }
  };

  const heading =
    mode === "login" ? "Welcome back" : mode === "register" ? "Create your account" : "Reset your password";
  const subheading =
    mode === "login"
      ? "Sign in to manage your care."
      : mode === "register"
        ? "Join Swasthya Sewa in under a minute."
        : "Enter your email and we'll send you a link to choose a new password.";

  return (
    <div className="auth">
      <aside className="auth-aside">
        <div className="auth-aside-brand">
          <span className="brand-mark">
            <HeartPulse size={20} aria-hidden="true" />
          </span>
          <div className="brand-text">
            <div className="brand-name">Swasthya Sewa</div>
            <div className="brand-role">Health system</div>
          </div>
        </div>

        <div className="auth-pitch">
          <h1>Healthcare, simplified for everyone.</h1>
          <p>
            Book appointments, message the hospital team and keep every medical
            record in one place.
          </p>
          <div className="auth-features">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <div className="auth-feature" key={feature.text}>
                  <span className="auth-feature-icon">
                    <Icon size={17} aria-hidden="true" />
                  </span>
                  {feature.text}
                </div>
              );
            })}
          </div>
        </div>
      </aside>

      <main className="auth-main">
        <div className="auth-theme">
          <div className="auth-theme-brand">
            <span className="brand-mark">
              <HeartPulse size={20} aria-hidden="true" />
            </span>
            <span className="brand-name">Swasthya Sewa</span>
          </div>
          <ThemeToggle />
        </div>

        <div className="auth-panel">
          <div className="auth-head">
            <div className="auth-title">{heading}</div>
            <div className="auth-sub">{subheading}</div>
          </div>

          {mode !== "reset" && (
            <div className="segmented segmented-block">
              <button
                type="button"
                className={`segmented-item ${portal === "patient" ? "is-active" : ""}`.trim()}
                onClick={() => selectPortal("patient")}
              >
                <User size={15} aria-hidden="true" />
                Patient
              </button>
              <button
                type="button"
                className={`segmented-item ${portal === "admin" ? "is-active" : ""}`.trim()}
                onClick={() => selectPortal("admin")}
              >
                <ShieldCheck size={15} aria-hidden="true" />
                Administrator
              </button>
            </div>
          )}

          {(formError || error) && (
            <div className="alert alert-error">
              <AlertCircle size={16} aria-hidden="true" />
              <span>{formError || error}</span>
            </div>
          )}
          {success && (
            <div className="alert alert-success">
              <CheckCircle2 size={16} aria-hidden="true" />
              <span>{success}</span>
            </div>
          )}

          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            {mode === "register" && (
              <Field label="Full name" htmlFor="auth-name">
                <Input
                  id="auth-name"
                  icon={User}
                  placeholder="Priya Sharma"
                  value={form.name}
                  onChange={update("name")}
                  autoComplete="name"
                  required
                />
              </Field>
            )}

            <Field label="Email address" htmlFor="auth-email">
              <Input
                id="auth-email"
                type="email"
                icon={Mail}
                placeholder="you@example.com"
                value={form.email}
                onChange={update("email")}
                autoComplete="email"
                required
              />
            </Field>

            {mode === "register" && (
              <Field label="Phone number" htmlFor="auth-phone">
                <Input
                  id="auth-phone"
                  type="tel"
                  inputMode="numeric"
                  icon={Phone}
                  placeholder="98XXXXXXXX"
                  value={form.phone}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      phone: e.target.value.replace(/\D/g, "").slice(0, 10),
                    }))
                  }
                  autoComplete="tel"
                  maxLength={10}
                  pattern="\d{10}"
                  title="Enter a 10-digit mobile number"
                  required
                />
              </Field>
            )}

            {mode !== "reset" && (
              <Field label="Password" htmlFor="auth-password">
                <Input
                  id="auth-password"
                  type="password"
                  icon={Lock}
                  placeholder="••••••••"
                  value={form.password}
                  onChange={update("password")}
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  required
                  minLength={6}
                />
              </Field>
            )}

            {mode === "register" && (
              <Field label="Confirm password" htmlFor="auth-confirm">
                <Input
                  id="auth-confirm"
                  type="password"
                  icon={Lock}
                  placeholder="••••••••"
                  value={form.confirm}
                  onChange={update("confirm")}
                  autoComplete="new-password"
                  required
                  minLength={6}
                />
              </Field>
            )}

            <Button type="submit" block loading={loading} iconRight={ArrowRight}>
              {mode === "login"
                ? "Sign in"
                : mode === "register"
                  ? "Create account"
                  : "Send reset link"}
            </Button>
          </form>

          {mode !== "reset" && (
            <div className="auth-demo">
              {portal === "patient" ? (
                <>
                  New patients can{" "}
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => switchMode("register")}
                  >
                    create an account
                  </button>{" "}
                  with any email.
                </>
              ) : (
                <>
                  The administrator account is created by the hospital. Please
                  sign in with the admin credentials.
                </>
              )}
            </div>
          )}

          {!(mode === "login" && portal === "admin") && (
            <div className="auth-switch">
              {mode === "login" && (
                <>
                  New here?{" "}
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => switchMode("register")}
                  >
                    Create an account
                  </button>
                  {" · "}
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => switchMode("reset")}
                  >
                    Forgot password?
                  </button>
                </>
              )}
              {mode === "register" && (
                <>
                  Already have an account?{" "}
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => switchMode("login")}
                  >
                    Sign in
                  </button>
                </>
              )}
              {mode === "reset" && (
                <>
                  Remembered it?{" "}
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => switchMode("login")}
                  >
                    Back to sign in
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
