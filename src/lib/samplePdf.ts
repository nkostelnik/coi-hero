import "server-only";

/**
 * Tiny zero-dependency PDF writer: one page, Helvetica, left-aligned lines.
 * Enough to produce readable stand-in "certificate" PDFs for the demo data so
 * every PDF link and the inline preview work without any real files.
 */

function escapePdfText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    // drop anything outside printable Latin-1
    .replace(/[^\x20-\x7E]/g, " ");
}

export interface PdfLine {
  text: string;
  size?: number;
  gapBefore?: number;
}

export function renderTextPdf(lines: PdfLine[]): Buffer {
  const left = 56;
  const top = 760;
  const leading = 15;

  let y = top;
  let currentSize = 10;
  const ops: string[] = ["BT", `/F1 ${currentSize} Tf`, `${left} ${y} Td`];

  for (const line of lines) {
    const size = line.size ?? 10;
    const gap = line.gapBefore ?? 0;
    const dy = -(leading + gap);
    y += dy;
    ops.push(`0 ${dy} Td`);
    if (size !== currentSize) {
      ops.push(`/F1 ${size} Tf`);
      currentSize = size;
    }
    ops.push(`(${escapePdfText(line.text)}) Tj`);
  }
  ops.push("ET");

  const content = ops.join("\n");
  const contentLen = Buffer.byteLength(content, "latin1");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] " +
      "/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${contentLen} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets[i] = Buffer.byteLength(pdf, "latin1");
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefStart = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (const off of offsets) {
    pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  }
  pdf +=
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n` +
    `startxref\n${xrefStart}\n%%EOF`;

  return Buffer.from(pdf, "latin1");
}

export interface SampleCertPdfInput {
  certificateDate: string;
  producer: string;
  insured: string;
  holder: string;
  description: string | null;
  coverages: Array<{
    label: string;
    carrier: string;
    policyNumber: string;
    effective: string;
    expiration: string;
    limits: Array<{ label: string; amount: string }>;
    addlInsured: boolean;
    subrWaived: boolean;
  }>;
}

export function renderCertificatePdf(input: SampleCertPdfInput): Buffer {
  const lines: PdfLine[] = [
    { text: "CERTIFICATE OF LIABILITY INSURANCE", size: 15 },
    {
      text: "SAMPLE / DEMO DOCUMENT - not a real certificate",
      size: 8,
      gapBefore: 2,
    },
    { text: `DATE (MM/DD/YYYY): ${input.certificateDate}`, gapBefore: 6 },
    {
      text: "This certificate is issued as a matter of information only and confers no rights upon the holder.",
      size: 8,
    },
    { text: `PRODUCER:  ${input.producer}`, gapBefore: 10 },
    { text: `INSURED:   ${input.insured}` },
    { text: `CERTIFICATE HOLDER:  ${input.holder}` },
    { text: "COVERAGES", size: 12, gapBefore: 12 },
  ];

  input.coverages.forEach((c, i) => {
    lines.push({
      text: `${i + 1}. ${c.label}`,
      size: 11,
      gapBefore: 8,
    });
    lines.push({ text: `   Carrier: ${c.carrier}` });
    lines.push({ text: `   Policy #: ${c.policyNumber}` });
    lines.push({
      text: `   Effective: ${c.effective}    Expiration: ${c.expiration}`,
    });
    lines.push({
      text: `   ADDL INSD: ${c.addlInsured ? "Y" : "N"}    SUBR WVD: ${
        c.subrWaived ? "Y" : "N"
      }`,
    });
    for (const l of c.limits) {
      lines.push({ text: `   ${l.label}: ${l.amount}` });
    }
  });

  if (input.description) {
    lines.push({
      text: "DESCRIPTION OF OPERATIONS",
      size: 11,
      gapBefore: 12,
    });
    for (const chunk of wrap(input.description, 92)) {
      lines.push({ text: chunk });
    }
  }

  return renderTextPdf(lines);
}

function wrap(text: string, width: number): string[] {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > width) {
      if (line) out.push(line);
      line = w;
    } else {
      line = (line + " " + w).trim();
    }
  }
  if (line) out.push(line);
  return out;
}
