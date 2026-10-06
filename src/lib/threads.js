// Groups a flat message list into conversation threads, ordered by recency.
// Shared by the patient portal and the admin portal so both sides highlight the
// same conversations and unread counts.
//
// Nobody logs in as a doctor, so the hospital desk answers on behalf of the
// clinic. Replies from the admin side are therefore attributed to the hospital
// rather than to the doctor the conversation is about, which keeps the patient
// from believing a named doctor personally replied.

// Deleting a message hides it from one party's own view only, so a patient's
// view and the hospital's record are separate. The row itself is kept.
export const viewSideFor = (role) => (role === "ADMIN" ? "HOSPITAL" : "PATIENT");

export const isHiddenFor = (message, role) =>
  (message?.hiddenFor ?? []).includes(viewSideFor(role));

export function buildThreads(messages, role) {
  const ownSender = role === "ADMIN" ? "HOSPITAL" : "PATIENT";
  const map = new Map();

  messages.filter((m) => !isHiddenFor(m, role)).forEach((m) => {
    const key = m.threadId;
    if (!map.has(key)) {
      // The counterpart is decided by which portal is looking, never by who
      // happened to send first — otherwise a thread started by the hospital
      // shows the patient their own name. There is one conversation per patient,
      // so the patient side always deals with the hospital team.
      const counterpart =
        role === "ADMIN"
          ? m.patient ?? { name: "Patient" }
          : { name: "Hospital team", subtitle: "Replies from the hospital desk" };
      map.set(key, {
        threadId: key,
        patientId: m.patientId,
        patient: m.patient,
        counterpart,
        messages: [],
        last: null,
        unread: 0,
      });
    }
    const thread = map.get(key);
    thread.messages.push(m);
    thread.last = m;
    if (m.sender !== ownSender && !m.readAt) thread.unread += 1;
  });

  return [...map.values()].sort((a, b) =>
    String(b.last?.createdAt ?? "").localeCompare(String(a.last?.createdAt ?? ""))
  );
}

export const ownSenderFor = (role) => (role === "ADMIN" ? "HOSPITAL" : "PATIENT");

// Shown wherever a reply is credited, so it matches who actually answers.
export const senderNameFor = (message) =>
  message?.sender === "HOSPITAL" ? "Hospital team" : null;