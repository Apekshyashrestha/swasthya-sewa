import { useState } from "react";
import {
  Bell,
  HeartPulse,
  LogOut,
  Menu,
  Moon,
  Search,
  Sun,
  X,
} from "lucide-react";
import { useTheme } from "../../hooks/useTheme.js";
import { formatRelative } from "../../lib/format.js";
import { groupNotifications } from "../../lib/notifications.js";
import { Avatar } from "../ui/Avatar.jsx";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  return (
    <button
      type="button"
      className="icon-btn"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title="Toggle theme"
    >
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

export function AppShell({
  user,
  brandSubtitle,
  searchValue = "",
  onSearchChange,
  showSearch = true,
  onLogout,
  navSections = [],
  activeTab,
  onNavigate,
  searchPlaceholder = "Search…",
  notificationCount = 0,
  notifications = [],
  notificationsOpen = false,
  onToggleNotifications,
  onOpenNotification,
  children,
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Grouped so the panel reads as a timeline: today, yesterday, then backwards.
  const notifSections = groupNotifications(notifications);

  let activeLabel = "";
  for (const section of navSections) {
    const found = section.items.find((item) => item.value === activeTab);
    if (found) {
      activeLabel = found.label;
      break;
    }
  }

  const closeDrawer = () => setDrawerOpen(false);

  return (
    <div className="shell">
      <aside className={`sidebar ${drawerOpen ? "is-open" : ""}`.trim()}>
        <div className="sidebar-brand">
          <span className="brand-mark">
            <HeartPulse size={20} aria-hidden="true" />
          </span>
          <div className="brand-text">
            <div className="brand-name">Swasthya Sewa</div>
            <div className="brand-role">{brandSubtitle}</div>
          </div>
          <button
            type="button"
            className="icon-btn menu-toggle"
            onClick={closeDrawer}
            aria-label="Close navigation"
            style={{ marginLeft: "auto" }}
          >
            <X size={18} />
          </button>
        </div>

        <nav className="sidebar-nav">
          {navSections.map((section) => (
            <div key={section.label}>
              <div className="nav-section">{section.label}</div>
              {section.items.map((item) => {
                const Icon = item.icon;
                const active = item.value === activeTab;
                return (
                  <button
                    key={item.value}
                    type="button"
                    className={`nav-item ${active ? "is-active" : ""}`.trim()}
                    onClick={() => {
                      onNavigate?.(item.value);
                      closeDrawer();
                    }}
                    aria-current={active ? "page" : undefined}
                  >
                    {Icon && <Icon size={18} aria-hidden="true" />}
                    <span className="grow">{item.label}</span>
                    {item.badge ? (
                      <span className="nav-count">{item.badge}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-foot">
          <button type="button" className="sidebar-user" onClick={onLogout}>
            <Avatar src={user?.avatar} name={user?.name} size="sm" />
            <div className="grow">
              <div className="t-sm t-bold truncate">{user?.name}</div>
              <div className="t-xs t-muted truncate">
                {user?.roleLabel ?? user?.email}
              </div>
            </div>
            <LogOut size={16} aria-hidden="true" />
          </button>
        </div>
      </aside>

      {drawerOpen && <div className="scrim" onClick={closeDrawer} />}

      <div className="shell-main">
        <header className="topbar">
          <button
            type="button"
            className="icon-btn menu-toggle"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
          >
            <Menu size={20} />
          </button>

          <div className="topbar-title">{activeLabel}</div>

          {showSearch && (
            <div className="search">
              <Search className="search-icon" size={17} aria-hidden="true" />
              <input
                type="search"
                value={searchValue}
                onChange={(e) => onSearchChange?.(e.target.value)}
                placeholder={searchPlaceholder}
                aria-label="Search"
              />
              <span className="search-kbd" aria-hidden="true">
                /
              </span>
            </div>
          )}

          <div className="grow" />

          <ThemeToggle />

          <div className="notif">
            <button
              type="button"
              className={`icon-btn ${notificationCount > 0 ? "icon-btn-dot" : ""}`.trim()}
              aria-label={`Notifications${notificationCount ? `, ${notificationCount} unread` : ""}`}
              aria-expanded={notificationsOpen}
              onClick={onToggleNotifications}
            >
              <Bell size={18} />
            </button>
            {notificationsOpen && (
              <>
                <div
                  className="scrim-clear"
                  onClick={onToggleNotifications}
                  aria-hidden="true"
                />
                <div className="notif-panel" role="dialog" aria-label="Notifications">
                  <div className="notif-head">
                    <div className="t-sm t-bold">Notifications</div>
                    <button
                      type="button"
                      className="icon-btn icon-btn-sm"
                      aria-label="Close notifications"
                      onClick={onToggleNotifications}
                    >
                      <X size={16} />
                    </button>
                  </div>
                  {notifications.length === 0 ? (
                    <div className="notif-empty">
                      <Bell size={20} />
                      <div className="t-sm">Nothing to show yet</div>
                      <div className="t-xs t-muted">
                        Bookings, payments, reports and replies will appear here.
                      </div>
                    </div>
                  ) : (
                    <div className="notif-list">
                      {notifSections.map((section) => (
                        <section key={section.label} className="notif-section">
                          <div className="notif-section-head">
                            {section.label}
                            <span className="notif-section-count">{section.items.length}</span>
                          </div>
                          {section.items.map((n) => (
                            <button
                              key={n.id}
                              type="button"
                              className={`notif-row is-${n.tone ?? 'info'}`}
                              onClick={() => onOpenNotification?.(n)}
                            >
                              <div className="notif-row-body">
                                <div className="t-sm t-bold">{n.title}</div>
                                <div className="t-xs t-muted">{n.message}</div>
                                <div className="t-xs notif-time">{formatRelative(n.createdAt)}</div>
                              </div>
                            </button>
                          ))}
                        </section>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          <button type="button" className="user-chip" onClick={onLogout}>
            <Avatar src={user?.avatar} name={user?.name} size="sm" />
            <div className="user-chip-text">
              <div className="t-sm t-bold">{user?.name}</div>
              <div className="t-xs t-muted">{user?.email}</div>
            </div>
          </button>
        </header>

        <main className="page">{children}</main>
      </div>
    </div>
  );
}
