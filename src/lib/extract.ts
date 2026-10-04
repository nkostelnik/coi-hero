import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import {
  CERTIFICATE_SCHEMA,
  EXTRACTION_RULES,
  normalize,
} from "./extractShared";
import type { ExtractionResult } from "./types";

export function hasApiKey(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

/** When on, uploads get realistic mock data instead of a real API reading. */
export function demoMode(): boolean {
  return process.env.COI_DEMO_MODE === "1";
}

export function extractionModel(): string {
  return process.env.COI_EXTRACT_MODEL?.trim() || "claude-sonnet-5";
}

const RECORD_TOOL: Anthropic.Tool = {
  name: "record_certificate",
  description: "Record the structured contents of the certificate of insurance.",
  input_schema: CERTIFICATE_SCHEMA as unknown as Anthropic.Tool["input_schema"],
};

export async function extractCoi(
  pdf: Buffer,
  filename: string,
): Promise<{ result: ExtractionResult; model: string }> {
  if (demoMode() && !hasApiKey()) {
    return { result: fakeExtraction(filename), model: "demo" };
  }
  if (!hasApiKey()) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  const model = extractionModel();
  const client = new Anthropic();

  const isPdf =
    filename.toLowerCase().endsWith(".pdf") ||
    pdf.subarray(0, 5).toString("latin1") === "%PDF-";

  const documentBlock = isPdf
    ? ({
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: pdf.toString("base64"),
        },
      } as const)
    : ({
        type: "image",
        source: {
          type: "base64",
          media_type: guessImageMedia(filename),
          data: pdf.toString("base64"),
        },
      } as const);

  const response = await client.messages.create({
    model,
    max_tokens: 8000,
    system: EXTRACTION_RULES,
    tools: [RECORD_TOOL],
    tool_choice: { type: "tool", name: "record_certificate" },
    messages: [
      {
        role: "user",
        content: [
          documentBlock as Anthropic.ContentBlockParam,
          {
            type: "text",
            text: `Extract every field from this certificate of insurance (${filename}).`,
          },
        ],
      },
    ],
  });

  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  );
  if (!toolUse) {
    throw new Error("Model did not return structured data");
  }
  return { result: normalize(toolUse.input as Record<string, unknown>), model };
}

/* --------------------- demo / offline extraction --------------------- */

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function isoFromToday(days: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Plausible structured data derived from the filename, no API call. */
export function fakeExtraction(filename: string): ExtractionResult {
  const seed = hashString(filename || "certificate");
  const pick = <T,>(arr: T[], salt = 0): T => arr[(seed + salt) % arr.length];

  const carriers = [
    "Travelers",
    "The Hartford",
    "Liberty Mutual",
    "Chubb",
    "Zurich American",
    "CNA",
    "Nationwide",
  ];
  const producers = [
    "Marsh McLennan Agency",
    "HUB International",
    "Lockton Companies",
    "AON Risk Services",
    "Gallagher",
  ];

  const base = filename
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[_\-]+/g, " ")
    .replace(
      /\b(coi|certificate|cert|of|insurance|acord|acord ?25|liability|final|signed|new|copy|scan|updated?|renewal|20\d{2})\b/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
  const insured =
    (base ? base.replace(/\b\w/g, (m) => m.toUpperCase()) : "Sample Vendor") +
    (/\b(llc|inc|co|corp|company|group|services|ltd)\b/i.test(base) ? "" : " LLC");

  const expDays = 300 + (seed % 60); // ~10-12 months out
  const effDays = expDays - 365;
  const poly = (n: number) =>
    `${String.fromCharCode(65 + (seed % 6))}${((seed >> n) % 900000) + 100000}`;

  const glLimit = pick([1_000_000, 1_000_000, 2_000_000], 3);
  const result: ExtractionResult = {
    certificate_date: isoFromToday(-((seed % 25) + 3)),
    producer: {
      name: pick(producers),
      contact_name: null,
      phone: `(415) 555-${String(1000 + (seed % 9000))}`,
      email: null,
      address: "San Francisco, CA",
    },
    insured: { name: insured, address: "San Francisco Bay Area, CA" },
    certificate_holder: {
      name: "Meridian Property Group",
      address: "400 Market Street, San Francisco, CA 94105",
    },
    description_of_operations:
      "Demo extraction generated offline from the file name. General Liability includes the holder as additional insured on a primary & non-contributory basis where required by written contract.",
    insurers: [
      { letter: "A", name: pick(carriers), naic: null },
      { letter: "B", name: pick(carriers, 5), naic: null },
    ],
    coverages: [
      {
        coverage_type: "Commercial General Liability",
        coverage_type_raw: "COMMERCIAL GENERAL LIABILITY",
        insurer_letter: "A",
        insurer_name: pick(carriers),
        policy_number: poly(2),
        effective_date: isoFromToday(effDays),
        expiration_date: isoFromToday(expDays),
        additional_insured: true,
        subrogation_waived: seed % 2 === 0,
        primary_noncontributory: true,
        per_project_aggregate: seed % 3 === 0,
        notice_of_cancellation_days: 30,
        limits: [
          { label: "Each Occurrence", amount: glLimit, amount_raw: `$${glLimit.toLocaleString()}` },
          { label: "General Aggregate", amount: glLimit * 2, amount_raw: `$${(glLimit * 2).toLocaleString()}` },
        ],
      },
      {
        coverage_type: "Automobile Liability",
        coverage_type_raw: "AUTOMOBILE LIABILITY",
        insurer_letter: "A",
        insurer_name: pick(carriers),
        policy_number: poly(4),
        effective_date: isoFromToday(effDays),
        expiration_date: isoFromToday(expDays),
        additional_insured: true,
        subrogation_waived: false,
        primary_noncontributory: null,
        per_project_aggregate: null,
        notice_of_cancellation_days: 30,
        limits: [
          { label: "Combined Single Limit", amount: 1_000_000, amount_raw: "$1,000,000" },
        ],
      },
      {
        coverage_type: "Workers Compensation & Employers Liability",
        coverage_type_raw: "WORKERS COMPENSATION",
        insurer_letter: "B",
        insurer_name: pick(carriers, 5),
        policy_number: poly(6),
        effective_date: isoFromToday(effDays),
        expiration_date: isoFromToday(expDays),
        additional_insured: null,
        subrogation_waived: true,
        primary_noncontributory: null,
        per_project_aggregate: null,
        notice_of_cancellation_days: 30,
        limits: [
          { label: "EL Each Accident", amount: 1_000_000, amount_raw: "$1,000,000" },
          { label: "EL Disease - Policy Limit", amount: 1_000_000, amount_raw: "$1,000,000" },
        ],
      },
    ],
    notes: "Demo mode: fields were synthesized offline, not read from the PDF.",
  };

  return result;
}

function guessImageMedia(
  filename: string,
): "image/png" | "image/jpeg" | "image/webp" {
  const f = filename.toLowerCase();
  if (f.endsWith(".png")) return "image/png";
  if (f.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

export { normalize, normalizeCoverageType } from "./extractShared";
