// Renders a medical record as a self-contained printable document.
//
// Records in this project are structured data rather than uploaded files, so the
// "download" is a generated report. It opens in any browser and prints to PDF,
// which keeps the feature working without needing a file-upload backend.

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const prettyDate = (value) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const prettyDateTime = (value) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return `${prettyDate(value)}, ${d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
};

const reportFileName = (record) => {
  const base = String(record?.title ?? 'medical-report')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${base || 'medical-report'}.html`;
};

// `notes` is the doctor's free-text findings when one exists.
export function buildRecordHtml(record, { patient, notes } = {}) {
  const subject = patient ?? record?.patient ?? {};
  const rows = [
    ['Report title', record?.title],
    ['Report type', record?.type],
    ['Reported by', record?.doctor?.name],
    ['Patient name', subject.name],
    ['Patient email', subject.email],
    ['Date of report', prettyDate(record?.createdAt)],
    ['Reference ID', record?.id],
  ].filter(([, value]) => value !== undefined && value !== null && value !== '');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(record?.title ?? 'Medical report')} — Swasthya Sewa</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 40px 24px;
    background: #f4f6f8;
    font-family: "Segoe UI", system-ui, -apple-system, Arial, sans-serif;
    color: #1c2530;
    line-height: 1.6;
  }
  .sheet {
    max-width: 760px;
    margin: 0 auto;
    background: #fff;
    border: 1px solid #dfe4ea;
    border-radius: 10px;
    overflow: hidden;
  }
  header {
    padding: 28px 32px;
    background: #0b8571;
    color: #fff;
  }
  header h1 { margin: 0; font-size: 22px; letter-spacing: 0.01em; }
  header p { margin: 6px 0 0; font-size: 13px; opacity: 0.9; }
  .body { padding: 28px 32px 32px; }
  h2 {
    margin: 28px 0 10px;
    font-size: 12px;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    color: #64748b;
  }
  table { width: 100%; border-collapse: collapse; }
  td {
    padding: 9px 0;
    border-bottom: 1px solid #eef1f4;
    font-size: 14px;
    vertical-align: top;
  }
  td:first-child { width: 42%; color: #64748b; }
  td:last-child { font-weight: 600; }
  .findings {
    margin: 0;
    padding: 14px 16px;
    background: #f8fafb;
    border-left: 3px solid #0b8571;
    border-radius: 0 6px 6px 0;
    font-size: 14px;
  }
  footer {
    padding: 18px 32px;
    background: #f8fafb;
    border-top: 1px solid #eef1f4;
    font-size: 11px;
    color: #7b8794;
  }
  .actions { max-width: 760px; margin: 16px auto 0; text-align: right; }
  button {
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    padding: 9px 18px;
    border-radius: 6px;
    border: 1px solid #0b8571;
    background: #0b8571;
    color: #fff;
    cursor: pointer;
  }
  @media print {
    body { background: #fff; padding: 0; }
    .sheet { border: 0; border-radius: 0; max-width: none; }
    .actions { display: none; }
  }
</style>
</head>
<body>
  <div class="sheet">
    <header>
      <h1>${escapeHtml(record?.title ?? 'Medical report')}</h1>
      <p>Swasthya Sewa &middot; Medical record issued ${escapeHtml(prettyDate(record?.createdAt))}</p>
    </header>
    <div class="body">
      <h2>Report details</h2>
      <table>${rows
        .map(
          ([label, value]) =>
            `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`
        )
        .join('')}</table>
      <h2>Findings</h2>
      <p class="findings">${escapeHtml(
        notes || record?.description || 'No further details were recorded.'
      )}</p>
      ${
        record?.fileUrl
          ? `<h2>Attachment</h2><p class="findings"><a href="${escapeHtml(
              record.fileUrl
            )}">Open the attached document</a></p>`
          : ''
      }
    </div>
    <footer>
      Generated on ${escapeHtml(prettyDateTime(new Date()))} &middot; This document is
      a computer-generated copy of the record held in the Swasthya Sewa patient portal.
      Please consult your doctor before acting on it.
    </footer>
  </div>
  <div class="actions">
    <button type="button" onclick="window.print()">Print / Save as PDF</button>
  </div>
</body>
</html>`;
}

// Triggers a browser download of the generated report.
export function downloadRecordFile(record, opts = {}) {
  const html = buildRecordHtml(record, opts);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = reportFileName(record);
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the browser a moment to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return reportFileName(record);
}