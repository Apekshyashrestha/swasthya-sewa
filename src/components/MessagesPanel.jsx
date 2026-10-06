// Shared patient <-> hospital chat used by both portals. The only difference
// between the two sides is who the "other side" is, so the panel takes the
// counterpart label and the current role as props instead of duplicating the
// whole conversation UI.
//
// On the patient side the counterpart is the doctor the enquiry is *about*, not
// the party that answers it, so `replyNote` spells out who replies instead.

import { useMemo, useState } from "react";
import { MessageSquare, Pencil, Send, Stethoscope, Trash2 } from "lucide-react";
import { formatRelative, formatTime, isToday } from "../lib/format.js";
import { ownSenderFor, senderNameFor } from "../lib/threads.js";
import { Avatar } from "./ui/Avatar.jsx";
import { Badge } from "./ui/Badge.jsx";
import { Button } from "./ui/Button.jsx";
import { Card, CardBody } from "./ui/Card.jsx";
import { EmptyState, LoadingBlock } from "./ui/Feedback.jsx";
import { Field, Select, Textarea } from "./ui/Field.jsx";
import { Modal } from "./ui/Modal.jsx";

const bubble = {
  maxWidth: "78%",
  padding: "var(--sp-3) var(--sp-4)",
  borderRadius: "var(--r-md)",
  fontSize: "var(--text-sm)",
  lineHeight: 1.5,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  boxShadow: "var(--shadow-sm)",
};

const mine = {
  ...bubble,
  background: "var(--primary)",
  color: "#fff",
  borderBottomRightRadius: 4,
};

const theirs = {
  ...bubble,
  background: "var(--bg-surface-2)",
  color: "var(--text-primary)",
  border: "1px solid var(--border)",
  borderBottomLeftRadius: 4,
};

function dayLabel(value) {
  if (isToday(value)) return "Today";
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

export default function MessagesPanel({
  threads,
  activeId,
  onSelect,
  onSend,
  onStartThread,
  onOpen,
  role,
  counterpartLabel = "Doctor",
  replyNote = "",
  composeTitle = `New message to a ${counterpartLabel.toLowerCase()}`,
  composeDescription = "Choose who you want to talk to and write your first message.",
  // null hides the picker: a hospital-wide conversation has no addressee.
  composeFieldLabel = counterpartLabel,
  replyPlaceholder = `Write a message to your ${counterpartLabel.toLowerCase()}…`,
  composeTargets = [],
  initialComposeOpen = false,
  onComposeOpenChange,
  loading,
  sending,
  onDelete,
  onDeleteThread,
}) {
  const [draft, setDraft] = useState("");
  const [composeOpen, setComposeOpen] = useState(initialComposeOpen);
  const [composeTargetId, setComposeTargetId] = useState("");
  const [composeText, setComposeText] = useState("");
  const own = ownSenderFor(role);
  const active = threads.find((t) => t.threadId === activeId) ?? threads[0];
  // A one-to-one conversation has nothing to start once it exists, so the New
  // button is reserved for the admin's multi-patient inbox.
  const canStartNew = composeTargets.length > 0 || threads.length === 0;

  const targetId = composeTargetId || composeTargets[0]?.id || "";
  const target = composeTargets.find((t) => t.id === targetId) ?? null;

  const grouped = useMemo(() => {
    if (!active) return [];
    return active.messages.map((m) => ({
      ...m,
      isMine: m.sender === own,
      day: dayLabel(m.createdAt),
    }));
  }, [active, own]);

  const submit = () => {
    const text = draft.trim();
    if (!text || !active) return;
    onSend(active, text);
    setDraft("");
  };

  const setCompose = (next) => {
    setComposeOpen(next);
    onComposeOpenChange?.(next);
  };

  // With no addressee the text is all that is needed; otherwise the chosen
  // contact travels with it. The callback always receives the contact first so
  // both the admin inbox and the single patient conversation share one shape.
  const submitCompose = () => {
    const text = composeText.trim();
    if (!text) return;
    if (composeFieldLabel && !target) return;
    onStartThread(composeFieldLabel ? target : null, text);
    setComposeText("");
    setCompose(false);
  };

  const confirmDelete = (message) => {
    const ok = window.confirm(
      role === "ADMIN"
        ? "Hide this message from the hospital dashboard? The patient keeps their copy."
        : "Hide this message from your view? The hospital keeps their copy."
    );
    if (ok) onDelete(message);
  };

  // Deleting the conversation hides every message in it from this side only, so
  // the other party keeps the whole thread and the record is untouched.
  const confirmDeleteThread = (thread) => {
    const who = thread.counterpart?.name ?? `your ${counterpartLabel.toLowerCase()}`;
    const count = thread.messages.length;
    const ok = window.confirm(
      role === "ADMIN"
        ? `Delete this conversation with ${who}? All ${count} messages will be hidden from the dashboard. ${thread.patient?.name ?? 'The patient'} keeps their copy.`
        : `Delete this conversation with ${who}? All ${count} messages will be hidden from your view. The hospital keeps their copy.`
    );
    if (ok) onDeleteThread(thread);
  };

  if (loading) {
    return (
      <Card>
        <CardBody>
          <LoadingBlock rows={5} label="Loading conversations" />
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="chat">
      <Card className="chat-list">
        <div className="chat-list-head">
          <span className="t-sm t-bold">Conversations</span>
          <div className="row row-2">
            <Badge tone="neutral" dot={false}>
              {threads.length}
            </Badge>
            {canStartNew && (
              <Button size="sm" icon={Pencil} onClick={() => setCompose(true)}>
                New
              </Button>
            )}
          </div>
        </div>

        {threads.length === 0 ? (
          <EmptyState
            compact
            icon={MessageSquare}
            title="No messages yet"
            text={
              canStartNew
                ? `Tap New to send your first message to a ${counterpartLabel.toLowerCase()}.`
                : `Start the conversation with your ${counterpartLabel.toLowerCase()}.`
            }
          />
        ) : (
          <div className="list">
            {threads.map((t) => (
              <button
                key={t.threadId}
                type="button"
                className={`list-row is-clickable chat-list-row${
                  active?.threadId === t.threadId ? " is-active" : ""
                }`}
                onClick={() => {
                  onSelect(t.threadId);
                  onOpen?.(t);
                }}
              >
                <Avatar
                  src={t.counterpart?.avatar}
                  name={t.counterpart?.name}
                  size="md"
                />
                <span className="list-main">
                  <span className="list-title truncate">
                    {t.counterpart?.name ?? counterpartLabel}
                  </span>
                  <span className="list-meta truncate">
                    {t.last?.sender === own ? "You: " : ""}
                    {t.last?.text}
                  </span>
                </span>
                <span className="list-side chat-list-side">
                  <span className="t-xs t-muted">
                    {formatRelative(t.last?.createdAt)}
                  </span>
                  {t.unread > 0 && <span className="chat-unread">{t.unread}</span>}
                </span>
              </button>
            ))}
          </div>
        )}
      </Card>

      <Card className="chat-main">
        {active && (
          <>
            <div className="chat-head">
              <Avatar
                src={active.counterpart?.avatar}
                name={active.counterpart?.name}
                size="sm"
              />
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="list-title truncate">
                  {active.counterpart?.name ?? counterpartLabel}
                </div>
                <div className="list-meta truncate">
                  {replyNote ||
                    active.counterpart?.subtitle ||
                    active.counterpart?.specialty ||
                    active.counterpart?.email ||
                    `Chat with your ${counterpartLabel.toLowerCase()}`}
                </div>
              </div>
              {onDeleteThread && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => confirmDeleteThread(active)}
                  title={`Delete this conversation with ${active.counterpart?.name ?? counterpartLabel}`}
                >
                  <Trash2 size={15} />
                  <span className="hide-sm">Delete chat</span>
                </button>
              )}
            </div>

            {grouped.length === 0 ? (
              <div className="chat-body">
                <EmptyState
                  compact
                  icon={MessageSquare}
                  title="No messages yet"
                  text={replyNote || `${counterpartLabel}s usually reply within a few hours.`}
                />
              </div>
            ) : (
              <div className="chat-body">
                {grouped.map((m, i) => {
                  const showDay = i === 0 || grouped[i - 1].day !== m.day;
                  // A hospital reply is credited to the team that sent it, so
                  // the patient never reads it as the doctor writing personally.
                  const credit = !m.isMine ? senderNameFor(m) : null;
                  return (
                    <div key={m.id} className="stack stack-2 chat-group">
                      {showDay && <div className="chat-day">{m.day}</div>}
                      <div
                        className="chat-row"
                        style={{ alignItems: m.isMine ? "flex-end" : "flex-start" }}
                      >
                        <div style={m.isMine ? mine : theirs}>
                          {credit && (
                            <div className="chat-sender">{credit}</div>
                          )}
                          {m.text}
                          <div
                            className="chat-meta"
                            style={{
                              color: m.isMine
                                ? "rgba(255,255,255,0.75)"
                                : "var(--text-muted)",
                            }}
                          >
                            {formatTime(m.createdAt)}
                            {m.isMine && m.readAt ? " · Read" : ""}
                            {/* Deleting hides a message from this side only, so
                                the other party's copy and the record survive. */}
                            {onDelete && (
                              <button
                                type="button"
                                className="chat-delete"
                                title={
                                  role === "ADMIN"
                                    ? "Hide from the hospital dashboard"
                                    : "Hide from your view"
                                }
                                aria-label="Delete message"
                                onClick={() => confirmDelete(m)}
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="chat-compose">
              <textarea
                className="input chat-input"
                rows={1}
                placeholder={replyPlaceholder}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  }
                }}
              />
              <Button icon={Send} loading={sending} onClick={submit}>
                Send
              </Button>
            </div>
          </>
        )}
      </Card>

      <Modal
        open={composeOpen}
        onClose={() => setCompose(false)}
        title={composeTitle}
        description={composeDescription}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCompose(false)}>
              Cancel
            </Button>
            <Button
              icon={Send}
              loading={sending}
              disabled={!composeText.trim() || (!!composeFieldLabel && !target)}
              onClick={submitCompose}
            >
              Send message
            </Button>
          </>
        }
      >
        <div className="stack stack-4">
          {composeFieldLabel && (
            <Field label={composeFieldLabel} htmlFor="compose-target">
              <Select
                id="compose-target"
                icon={Stethoscope}
                value={targetId}
                onChange={(e) => setComposeTargetId(e.target.value)}
              >
                {composeTargets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.subtitle ? ` — ${t.subtitle}` : ""}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <Field label="Message" htmlFor="compose-text">
            <Textarea
              id="compose-text"
              rows={4}
              placeholder="Describe your symptoms or ask about your appointment…"
              value={composeText}
              onChange={(e) => setComposeText(e.target.value)}
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}