import "server-only";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type {
  Certificate,
  CertificateWithRelations,
  Contract,
  Coverage,
  Insurer,
  LimitLine,
  Requirement,
  Vendor,
} from "./types";
import { DEFAULT_GLOBAL_REQUIREMENTS, DEFAULT_SOON_DAYS } from "./defaults";

export const DATA_DIR = path.join(process.cwd(), "data");
export const FILES_DIR = path.join(DATA_DIR, "files");
const DB_PATH = path.join(DATA_DIR, "coi-hero.db");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS vendors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  aliases TEXT NOT NULL DEFAULT '[]',
  contact_name TEXT,
  contact_email TEXT,
  notes TEXT,
  update_requested_on TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_vendors_name ON vendors (name COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS certificates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vendor_id INTEGER REFERENCES vendors(id) ON DELETE SET NULL,
  file_name TEXT NOT NULL,
  original_file_name TEXT NOT NULL,
  file_size INTEGER,
  content_type TEXT,
  source TEXT NOT NULL DEFAULT 'upload',
  source_meta TEXT,
  certificate_date TEXT,
  producer_name TEXT,
  producer_contact TEXT,
  producer_phone TEXT,
  producer_email TEXT,
  insured_name TEXT,
  insured_address TEXT,
  certificate_holder_name TEXT,
  certificate_holder_address TEXT,
  description_of_operations TEXT,
  contract_reference TEXT,
  internal_owner TEXT,
  date_received TEXT,
  insurers_json TEXT NOT NULL DEFAULT '[]',
  raw_extraction_json TEXT,
  extraction_status TEXT NOT NULL DEFAULT 'pending',
  extraction_error TEXT,
  extraction_model TEXT,
  reviewed INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_certificates_vendor ON certificates (vendor_id);

CREATE TABLE IF NOT EXISTS coverages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  certificate_id INTEGER NOT NULL REFERENCES certificates(id) ON DELETE CASCADE,
  coverage_type TEXT NOT NULL,
  coverage_type_raw TEXT,
  insurer_name TEXT,
  insurer_letter TEXT,
  naic TEXT,
  policy_number TEXT,
  effective_date TEXT,
  expiration_date TEXT,
  additional_insured INTEGER,
  subrogation_waived INTEGER,
  primary_noncontributory INTEGER,
  per_project_aggregate INTEGER,
  notice_of_cancellation_days INTEGER,
  limits_json TEXT NOT NULL DEFAULT '[]',
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_coverages_cert ON coverages (certificate_id);

CREATE TABLE IF NOT EXISTS contracts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  counterparty TEXT,
  vendor_id INTEGER REFERENCES vendors(id) ON DELETE SET NULL,
  reference TEXT,
  effective_date TEXT,
  expiration_date TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  owner TEXT,
  notes TEXT,
  inherit_global_requirements INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_contracts_vendor ON contracts (vendor_id);

CREATE TABLE IF NOT EXISTS certificate_contracts (
  certificate_id INTEGER NOT NULL REFERENCES certificates(id) ON DELETE CASCADE,
  contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  PRIMARY KEY (certificate_id, contract_id)
);

CREATE TABLE IF NOT EXISTS requirements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope TEXT NOT NULL DEFAULT 'global',
  vendor_id INTEGER REFERENCES vendors(id) ON DELETE CASCADE,
  contract_id INTEGER,
  coverage_type TEXT NOT NULL,
  min_each_occurrence REAL,
  min_aggregate REAL,
  min_combined_single_limit REAL,
  require_additional_insured INTEGER NOT NULL DEFAULT 0,
  require_waiver_of_subrogation INTEGER NOT NULL DEFAULT 0,
  required INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_requirements_scope ON requirements (scope, vendor_id);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
`;


let _db: Database.Database | null =
  (globalThis as { __coiHeroDb?: Database.Database }).__coiHeroDb ?? null;

export function db(): Database.Database {
  if (_db) return _db;
  fs.mkdirSync(FILES_DIR, { recursive: true });
  const instance = new Database(DB_PATH);
  instance.pragma("journal_mode = WAL");
  instance.pragma("foreign_keys = ON");
  instance.exec(SCHEMA);
  migrate(instance);
  seed(instance);
  _db = instance;
  (globalThis as { __coiHeroDb?: Database.Database }).__coiHeroDb = instance;
  return instance;
}

/** Additive column migrations for databases created by an earlier version. */
function migrate(instance: Database.Database) {
  const columns: Array<[string, string, string]> = [
    ["vendors", "update_requested_on", "TEXT"],
    ["certificates", "contract_reference", "TEXT"],
    ["certificates", "internal_owner", "TEXT"],
    ["certificates", "date_received", "TEXT"],
    ["coverages", "primary_noncontributory", "INTEGER"],
    ["coverages", "per_project_aggregate", "INTEGER"],
    ["coverages", "notice_of_cancellation_days", "INTEGER"],
    ["requirements", "contract_id", "INTEGER"],
  ];
  for (const [table, col, type] of columns) {
    const existing = instance
      .prepare(`PRAGMA table_info(${table})`)
      .all() as Array<{ name: string }>;
    if (!existing.some((c) => c.name === col)) {
      instance.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
    }
  }
}

function seed(instance: Database.Database) {
  const row = instance
    .prepare("SELECT value FROM settings WHERE key = 'seeded'")
    .get() as { value?: string } | undefined;
  if (row?.value === "1") return;

  const insertReq = instance.prepare(`
    INSERT INTO requirements
      (scope, vendor_id, coverage_type, min_each_occurrence, min_aggregate,
       min_combined_single_limit, require_additional_insured,
       require_waiver_of_subrogation, required)
    VALUES ('global', NULL, @coverage_type, @min_each_occurrence, @min_aggregate,
       @min_combined_single_limit, @require_additional_insured,
       @require_waiver_of_subrogation, @required)
  `);
  const tx = instance.transaction(() => {
    for (const r of DEFAULT_GLOBAL_REQUIREMENTS) {
      insertReq.run({
        coverage_type: r.coverage_type,
        min_each_occurrence: r.min_each_occurrence ?? null,
        min_aggregate: r.min_aggregate ?? null,
        min_combined_single_limit: r.min_combined_single_limit ?? null,
        require_additional_insured: r.require_additional_insured ?? 0,
        require_waiver_of_subrogation: r.require_waiver_of_subrogation ?? 0,
        required: r.required ?? 1,
      });
    }
    instance
      .prepare(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('expiring_soon_days', ?)",
      )
      .run(String(DEFAULT_SOON_DAYS));
    instance
      .prepare(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('seeded', '1')",
      )
      .run();
  });
  tx();
}

/* ----------------------------- settings ----------------------------- */

export function getSetting(key: string): string | null {
  const row = db().prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  db()
    .prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(key, value);
}

export function getSoonDays(): number {
  const n = Number(getSetting("expiring_soon_days"));
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_SOON_DAYS;
}

/* ----------------------------- vendors ----------------------------- */

function mapVendor(row: Record<string, unknown>): Vendor {
  return {
    id: row.id as number,
    name: row.name as string,
    aliases: safeJson<string[]>(row.aliases as string, []),
    contact_name: (row.contact_name as string) ?? null,
    contact_email: (row.contact_email as string) ?? null,
    notes: (row.notes as string) ?? null,
    update_requested_on: (row.update_requested_on as string) ?? null,
    created_at: row.created_at as string,
  };
}

export function listVendors(): Vendor[] {
  return (
    db()
      .prepare("SELECT * FROM vendors ORDER BY name COLLATE NOCASE")
      .all() as Record<string, unknown>[]
  ).map(mapVendor);
}

export function getVendor(id: number): Vendor | null {
  const row = db().prepare("SELECT * FROM vendors WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? mapVendor(row) : null;
}

export function createVendor(input: {
  name: string;
  aliases?: string[];
  contact_name?: string | null;
  contact_email?: string | null;
  notes?: string | null;
}): Vendor {
  const info = db()
    .prepare(
      `INSERT INTO vendors (name, aliases, contact_name, contact_email, notes)
       VALUES (@name, @aliases, @contact_name, @contact_email, @notes)`,
    )
    .run({
      name: input.name.trim(),
      aliases: JSON.stringify(input.aliases ?? []),
      contact_name: input.contact_name ?? null,
      contact_email: input.contact_email ?? null,
      notes: input.notes ?? null,
    });
  return getVendor(Number(info.lastInsertRowid))!;
}

export function updateVendor(
  id: number,
  patch: Partial<Omit<Vendor, "id" | "created_at">>,
): Vendor | null {
  const current = getVendor(id);
  if (!current) return null;
  const next = { ...current, ...patch };
  db()
    .prepare(
      `UPDATE vendors SET name=@name, aliases=@aliases, contact_name=@contact_name,
       contact_email=@contact_email, notes=@notes,
       update_requested_on=@update_requested_on WHERE id=@id`,
    )
    .run({
      id,
      name: next.name.trim(),
      aliases: JSON.stringify(next.aliases ?? []),
      contact_name: next.contact_name ?? null,
      contact_email: next.contact_email ?? null,
      notes: next.notes ?? null,
      update_requested_on: next.update_requested_on ?? null,
    });
  return getVendor(id);
}

export function deleteVendor(id: number): void {
  db().prepare("DELETE FROM vendors WHERE id = ?").run(id);
}

/** Match an existing vendor by name/alias (case-insensitive) or create one. */
export function findOrCreateVendorByName(rawName: string): Vendor {
  const name = rawName.trim();
  const exact = db()
    .prepare("SELECT * FROM vendors WHERE name = ? COLLATE NOCASE")
    .get(name) as Record<string, unknown> | undefined;
  if (exact) return mapVendor(exact);

  const lc = name.toLowerCase();
  for (const v of listVendors()) {
    if (v.aliases.some((a) => a.trim().toLowerCase() === lc)) return v;
  }
  return createVendor({ name });
}

/* --------------------------- certificates -------------------------- */

function mapCoverage(row: Record<string, unknown>): Coverage {
  return {
    id: row.id as number,
    certificate_id: row.certificate_id as number,
    coverage_type: row.coverage_type as Coverage["coverage_type"],
    coverage_type_raw: (row.coverage_type_raw as string) ?? null,
    insurer_name: (row.insurer_name as string) ?? null,
    insurer_letter: (row.insurer_letter as string) ?? null,
    naic: (row.naic as string) ?? null,
    policy_number: (row.policy_number as string) ?? null,
    effective_date: (row.effective_date as string) ?? null,
    expiration_date: (row.expiration_date as string) ?? null,
    additional_insured: (row.additional_insured as 0 | 1 | null) ?? null,
    subrogation_waived: (row.subrogation_waived as 0 | 1 | null) ?? null,
    primary_noncontributory:
      (row.primary_noncontributory as 0 | 1 | null) ?? null,
    per_project_aggregate: (row.per_project_aggregate as 0 | 1 | null) ?? null,
    notice_of_cancellation_days:
      (row.notice_of_cancellation_days as number | null) ?? null,
    limits: safeJson<LimitLine[]>(row.limits_json as string, []),
    sort_order: (row.sort_order as number) ?? 0,
  };
}

function mapCertificate(row: Record<string, unknown>): Certificate {
  return {
    id: row.id as number,
    vendor_id: (row.vendor_id as number) ?? null,
    file_name: row.file_name as string,
    original_file_name: row.original_file_name as string,
    file_size: (row.file_size as number) ?? null,
    content_type: (row.content_type as string) ?? null,
    source: (row.source as "upload" | "email") ?? "upload",
    source_meta: row.source_meta
      ? safeJson<Record<string, unknown>>(row.source_meta as string, {})
      : null,
    certificate_date: (row.certificate_date as string) ?? null,
    producer_name: (row.producer_name as string) ?? null,
    producer_contact: (row.producer_contact as string) ?? null,
    producer_phone: (row.producer_phone as string) ?? null,
    producer_email: (row.producer_email as string) ?? null,
    insured_name: (row.insured_name as string) ?? null,
    insured_address: (row.insured_address as string) ?? null,
    certificate_holder_name: (row.certificate_holder_name as string) ?? null,
    certificate_holder_address:
      (row.certificate_holder_address as string) ?? null,
    description_of_operations: (row.description_of_operations as string) ?? null,
    contract_reference: (row.contract_reference as string) ?? null,
    internal_owner: (row.internal_owner as string) ?? null,
    date_received: (row.date_received as string) ?? null,
    insurers: safeJson<Insurer[]>(row.insurers_json as string, []),
    raw_extraction_json: row.raw_extraction_json
      ? safeJson<unknown>(row.raw_extraction_json as string, null)
      : null,
    extraction_status: row.extraction_status as Certificate["extraction_status"],
    extraction_error: (row.extraction_error as string) ?? null,
    extraction_model: (row.extraction_model as string) ?? null,
    reviewed: (row.reviewed as 0 | 1) ?? 0,
    notes: (row.notes as string) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export interface NewCertificate {
  file_name: string;
  original_file_name: string;
  file_size: number | null;
  content_type: string | null;
  source?: "upload" | "email";
  source_meta?: Record<string, unknown> | null;
  date_received?: string | null;
}

export function insertCertificate(input: NewCertificate): number {
  const info = db()
    .prepare(
      `INSERT INTO certificates
        (file_name, original_file_name, file_size, content_type, source,
         source_meta, date_received)
       VALUES (@file_name, @original_file_name, @file_size, @content_type,
         @source, @source_meta, @date_received)`,
    )
    .run({
      file_name: input.file_name,
      original_file_name: input.original_file_name,
      file_size: input.file_size,
      content_type: input.content_type,
      source: input.source ?? "upload",
      source_meta: input.source_meta ? JSON.stringify(input.source_meta) : null,
      date_received: input.date_received ?? new Date().toISOString().slice(0, 10),
    });
  return Number(info.lastInsertRowid);
}

const CERT_TEXT_FIELDS = [
  "certificate_date",
  "producer_name",
  "producer_contact",
  "producer_phone",
  "producer_email",
  "insured_name",
  "insured_address",
  "certificate_holder_name",
  "certificate_holder_address",
  "description_of_operations",
  "contract_reference",
  "internal_owner",
  "date_received",
  "extraction_status",
  "extraction_error",
  "extraction_model",
  "notes",
] as const;

export function updateCertificate(
  id: number,
  patch: Record<string, unknown>,
): void {
  const sets: string[] = [];
  const params: Record<string, unknown> = { id };

  for (const key of CERT_TEXT_FIELDS) {
    if (key in patch) {
      sets.push(`${key} = @${key}`);
      params[key] = patch[key] ?? null;
    }
  }
  if ("vendor_id" in patch) {
    sets.push("vendor_id = @vendor_id");
    params.vendor_id = patch.vendor_id ?? null;
  }
  if ("reviewed" in patch) {
    sets.push("reviewed = @reviewed");
    params.reviewed = patch.reviewed ? 1 : 0;
  }
  if ("insurers" in patch) {
    sets.push("insurers_json = @insurers_json");
    params.insurers_json = JSON.stringify(patch.insurers ?? []);
  }
  if ("raw_extraction_json" in patch) {
    sets.push("raw_extraction_json = @raw_extraction_json");
    params.raw_extraction_json =
      patch.raw_extraction_json == null
        ? null
        : JSON.stringify(patch.raw_extraction_json);
  }
  sets.push("updated_at = datetime('now')");

  db()
    .prepare(`UPDATE certificates SET ${sets.join(", ")} WHERE id = @id`)
    .run(params);
}

export interface CoverageInput {
  coverage_type: Coverage["coverage_type"];
  coverage_type_raw?: string | null;
  insurer_name?: string | null;
  insurer_letter?: string | null;
  naic?: string | null;
  policy_number?: string | null;
  effective_date?: string | null;
  expiration_date?: string | null;
  additional_insured?: 0 | 1 | null;
  subrogation_waived?: 0 | 1 | null;
  primary_noncontributory?: 0 | 1 | null;
  per_project_aggregate?: 0 | 1 | null;
  notice_of_cancellation_days?: number | null;
  limits?: LimitLine[];
}

export function setCoveragesForCertificate(
  certificateId: number,
  coverages: CoverageInput[],
): void {
  const tx = db().transaction(() => {
    db()
      .prepare("DELETE FROM coverages WHERE certificate_id = ?")
      .run(certificateId);
    const insert = db().prepare(`
      INSERT INTO coverages
        (certificate_id, coverage_type, coverage_type_raw, insurer_name,
         insurer_letter, naic, policy_number, effective_date, expiration_date,
         additional_insured, subrogation_waived, primary_noncontributory,
         per_project_aggregate, notice_of_cancellation_days, limits_json, sort_order)
      VALUES
        (@certificate_id, @coverage_type, @coverage_type_raw, @insurer_name,
         @insurer_letter, @naic, @policy_number, @effective_date, @expiration_date,
         @additional_insured, @subrogation_waived, @primary_noncontributory,
         @per_project_aggregate, @notice_of_cancellation_days, @limits_json, @sort_order)
    `);
    coverages.forEach((c, i) => {
      insert.run({
        certificate_id: certificateId,
        coverage_type: c.coverage_type,
        coverage_type_raw: c.coverage_type_raw ?? null,
        insurer_name: c.insurer_name ?? null,
        insurer_letter: c.insurer_letter ?? null,
        naic: c.naic ?? null,
        policy_number: c.policy_number ?? null,
        effective_date: c.effective_date ?? null,
        expiration_date: c.expiration_date ?? null,
        additional_insured:
          c.additional_insured === null || c.additional_insured === undefined
            ? null
            : c.additional_insured
              ? 1
              : 0,
        subrogation_waived:
          c.subrogation_waived === null || c.subrogation_waived === undefined
            ? null
            : c.subrogation_waived
              ? 1
              : 0,
        primary_noncontributory:
          c.primary_noncontributory == null ? null : c.primary_noncontributory ? 1 : 0,
        per_project_aggregate:
          c.per_project_aggregate == null ? null : c.per_project_aggregate ? 1 : 0,
        notice_of_cancellation_days:
          c.notice_of_cancellation_days == null
            ? null
            : Number(c.notice_of_cancellation_days) || null,
        limits_json: JSON.stringify(c.limits ?? []),
        sort_order: i,
      });
    });
  });
  tx();
}

export function getCertificate(id: number): CertificateWithRelations | null {
  const row = db().prepare("SELECT * FROM certificates WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  if (!row) return null;
  const cert = mapCertificate(row);
  const coverages = (
    db()
      .prepare(
        "SELECT * FROM coverages WHERE certificate_id = ? ORDER BY sort_order",
      )
      .all(id) as Record<string, unknown>[]
  ).map(mapCoverage);
  const vendor = cert.vendor_id ? getVendor(cert.vendor_id) : null;
  const contracts = (
    db()
      .prepare(
        `SELECT c.* FROM contracts c
         JOIN certificate_contracts cc ON cc.contract_id = c.id
         WHERE cc.certificate_id = ? ORDER BY c.title COLLATE NOCASE`,
      )
      .all(id) as Record<string, unknown>[]
  ).map(mapContract);
  return { ...cert, coverages, vendor, contracts };
}

export function listCertificates(): CertificateWithRelations[] {
  const rows = db()
    .prepare("SELECT * FROM certificates ORDER BY created_at DESC, id DESC")
    .all() as Record<string, unknown>[];
  const allCoverages = db()
    .prepare("SELECT * FROM coverages ORDER BY sort_order")
    .all() as Record<string, unknown>[];
  const vendorsById = new Map(listVendors().map((v) => [v.id, v]));
  const contractsById = new Map(listContracts().map((c) => [c.id, c]));
  const coveragesByCert = new Map<number, Coverage[]>();
  for (const r of allCoverages) {
    const c = mapCoverage(r);
    const list = coveragesByCert.get(c.certificate_id) ?? [];
    list.push(c);
    coveragesByCert.set(c.certificate_id, list);
  }
  const contractsByCert = new Map<number, Contract[]>();
  for (const link of db()
    .prepare("SELECT certificate_id, contract_id FROM certificate_contracts")
    .all() as Array<{ certificate_id: number; contract_id: number }>) {
    const c = contractsById.get(link.contract_id);
    if (!c) continue;
    const list = contractsByCert.get(link.certificate_id) ?? [];
    list.push(c);
    contractsByCert.set(link.certificate_id, list);
  }
  return rows.map((row) => {
    const cert = mapCertificate(row);
    return {
      ...cert,
      coverages: coveragesByCert.get(cert.id) ?? [],
      vendor: cert.vendor_id ? (vendorsById.get(cert.vendor_id) ?? null) : null,
      contracts: contractsByCert.get(cert.id) ?? [],
    };
  });
}

export function deleteCertificate(id: number): Certificate | null {
  const existing = getCertificate(id);
  if (!existing) return null;
  db().prepare("DELETE FROM certificates WHERE id = ?").run(id);
  return existing;
}

/* --------------------------- requirements -------------------------- */

function mapRequirement(row: Record<string, unknown>): Requirement {
  return {
    id: row.id as number,
    scope: row.scope as Requirement["scope"],
    vendor_id: (row.vendor_id as number) ?? null,
    contract_id: (row.contract_id as number) ?? null,
    coverage_type: row.coverage_type as Requirement["coverage_type"],
    min_each_occurrence: (row.min_each_occurrence as number) ?? null,
    min_aggregate: (row.min_aggregate as number) ?? null,
    min_combined_single_limit: (row.min_combined_single_limit as number) ?? null,
    require_additional_insured: (row.require_additional_insured as 0 | 1) ?? 0,
    require_waiver_of_subrogation:
      (row.require_waiver_of_subrogation as 0 | 1) ?? 0,
    required: (row.required as 0 | 1) ?? 1,
    notes: (row.notes as string) ?? null,
    created_at: row.created_at as string,
  };
}

export function listRequirements(): Requirement[] {
  return (
    db()
      .prepare(
        "SELECT * FROM requirements ORDER BY scope, vendor_id, contract_id, coverage_type",
      )
      .all() as Record<string, unknown>[]
  ).map(mapRequirement);
}

export function createRequirement(
  input: Omit<Requirement, "id" | "created_at">,
): Requirement {
  const info = db()
    .prepare(
      `INSERT INTO requirements
        (scope, vendor_id, contract_id, coverage_type, min_each_occurrence,
         min_aggregate, min_combined_single_limit, require_additional_insured,
         require_waiver_of_subrogation, required, notes)
       VALUES (@scope, @vendor_id, @contract_id, @coverage_type, @min_each_occurrence,
         @min_aggregate, @min_combined_single_limit, @require_additional_insured,
         @require_waiver_of_subrogation, @required, @notes)`,
    )
    .run({
      scope: input.scope,
      vendor_id: input.vendor_id ?? null,
      contract_id: input.contract_id ?? null,
      coverage_type: input.coverage_type,
      min_each_occurrence: input.min_each_occurrence ?? null,
      min_aggregate: input.min_aggregate ?? null,
      min_combined_single_limit: input.min_combined_single_limit ?? null,
      require_additional_insured: input.require_additional_insured ?? 0,
      require_waiver_of_subrogation: input.require_waiver_of_subrogation ?? 0,
      required: input.required ?? 1,
      notes: input.notes ?? null,
    });
  return mapRequirement(
    db()
      .prepare("SELECT * FROM requirements WHERE id = ?")
      .get(Number(info.lastInsertRowid)) as Record<string, unknown>,
  );
}

export function updateRequirement(
  id: number,
  patch: Partial<Omit<Requirement, "id" | "created_at">>,
): Requirement | null {
  const current = db()
    .prepare("SELECT * FROM requirements WHERE id = ?")
    .get(id) as Record<string, unknown> | undefined;
  if (!current) return null;
  const next = { ...mapRequirement(current), ...patch };
  db()
    .prepare(
      `UPDATE requirements SET
        coverage_type=@coverage_type, min_each_occurrence=@min_each_occurrence,
        min_aggregate=@min_aggregate, min_combined_single_limit=@min_combined_single_limit,
        require_additional_insured=@require_additional_insured,
        require_waiver_of_subrogation=@require_waiver_of_subrogation,
        required=@required, notes=@notes
       WHERE id=@id`,
    )
    .run({
      id,
      coverage_type: next.coverage_type,
      min_each_occurrence: next.min_each_occurrence ?? null,
      min_aggregate: next.min_aggregate ?? null,
      min_combined_single_limit: next.min_combined_single_limit ?? null,
      require_additional_insured: next.require_additional_insured ?? 0,
      require_waiver_of_subrogation: next.require_waiver_of_subrogation ?? 0,
      required: next.required ?? 1,
      notes: next.notes ?? null,
    });
  return mapRequirement(
    db().prepare("SELECT * FROM requirements WHERE id = ?").get(id) as Record<
      string,
      unknown
    >,
  );
}

export function deleteRequirement(id: number): void {
  db().prepare("DELETE FROM requirements WHERE id = ?").run(id);
}

/* ----------------------------- contracts -------------------------- */

function mapContract(row: Record<string, unknown>): Contract {
  return {
    id: row.id as number,
    title: row.title as string,
    counterparty: (row.counterparty as string) ?? null,
    vendor_id: (row.vendor_id as number) ?? null,
    reference: (row.reference as string) ?? null,
    effective_date: (row.effective_date as string) ?? null,
    expiration_date: (row.expiration_date as string) ?? null,
    status: (row.status as Contract["status"]) ?? "active",
    owner: (row.owner as string) ?? null,
    notes: (row.notes as string) ?? null,
    inherit_global_requirements:
      (row.inherit_global_requirements as 0 | 1) ?? 1,
    created_at: row.created_at as string,
  };
}

export function listContracts(): Contract[] {
  return (
    db()
      .prepare("SELECT * FROM contracts ORDER BY created_at DESC, id DESC")
      .all() as Record<string, unknown>[]
  ).map(mapContract);
}

export function getContract(id: number): Contract | null {
  const row = db().prepare("SELECT * FROM contracts WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? mapContract(row) : null;
}

export function createContract(input: {
  title: string;
  counterparty?: string | null;
  vendor_id?: number | null;
  reference?: string | null;
  effective_date?: string | null;
  expiration_date?: string | null;
  status?: Contract["status"];
  owner?: string | null;
  notes?: string | null;
  inherit_global_requirements?: 0 | 1;
}): Contract {
  const info = db()
    .prepare(
      `INSERT INTO contracts
        (title, counterparty, vendor_id, reference, effective_date,
         expiration_date, status, owner, notes, inherit_global_requirements)
       VALUES (@title, @counterparty, @vendor_id, @reference, @effective_date,
         @expiration_date, @status, @owner, @notes, @inherit_global_requirements)`,
    )
    .run({
      title: input.title.trim(),
      counterparty: input.counterparty ?? null,
      vendor_id: input.vendor_id ?? null,
      reference: input.reference ?? null,
      effective_date: input.effective_date ?? null,
      expiration_date: input.expiration_date ?? null,
      status: input.status ?? "active",
      owner: input.owner ?? null,
      notes: input.notes ?? null,
      inherit_global_requirements: input.inherit_global_requirements ?? 1,
    });
  return getContract(Number(info.lastInsertRowid))!;
}

export function updateContract(
  id: number,
  patch: Partial<Omit<Contract, "id" | "created_at">>,
): Contract | null {
  const current = getContract(id);
  if (!current) return null;
  const next = { ...current, ...patch };
  db()
    .prepare(
      `UPDATE contracts SET title=@title, counterparty=@counterparty,
        vendor_id=@vendor_id, reference=@reference, effective_date=@effective_date,
        expiration_date=@expiration_date, status=@status, owner=@owner,
        notes=@notes, inherit_global_requirements=@inherit_global_requirements
       WHERE id=@id`,
    )
    .run({
      id,
      title: next.title.trim(),
      counterparty: next.counterparty ?? null,
      vendor_id: next.vendor_id ?? null,
      reference: next.reference ?? null,
      effective_date: next.effective_date ?? null,
      expiration_date: next.expiration_date ?? null,
      status: next.status ?? "active",
      owner: next.owner ?? null,
      notes: next.notes ?? null,
      inherit_global_requirements: next.inherit_global_requirements ? 1 : 0,
    });
  return getContract(id);
}

export function deleteContract(id: number): void {
  const tx = db().transaction(() => {
    db().prepare("DELETE FROM certificate_contracts WHERE contract_id = ?").run(id);
    db().prepare("DELETE FROM requirements WHERE contract_id = ?").run(id);
    db().prepare("DELETE FROM contracts WHERE id = ?").run(id);
  });
  tx();
}

export function setCertificateContracts(
  certificateId: number,
  contractIds: number[],
): void {
  const tx = db().transaction(() => {
    db()
      .prepare("DELETE FROM certificate_contracts WHERE certificate_id = ?")
      .run(certificateId);
    const insert = db().prepare(
      "INSERT OR IGNORE INTO certificate_contracts (certificate_id, contract_id) VALUES (?, ?)",
    );
    for (const cid of contractIds) insert.run(certificateId, cid);
  });
  tx();
}

export function setContractCertificates(
  contractId: number,
  certificateIds: number[],
): void {
  const tx = db().transaction(() => {
    db()
      .prepare("DELETE FROM certificate_contracts WHERE contract_id = ?")
      .run(contractId);
    const insert = db().prepare(
      "INSERT OR IGNORE INTO certificate_contracts (certificate_id, contract_id) VALUES (?, ?)",
    );
    for (const id of certificateIds) insert.run(id, contractId);
  });
  tx();
}

export function certificatesForContract(contractId: number): number[] {
  return (
    db()
      .prepare(
        "SELECT certificate_id FROM certificate_contracts WHERE contract_id = ?",
      )
      .all(contractId) as Array<{ certificate_id: number }>
  ).map((r) => r.certificate_id);
}

/* ------------------------------ utils ------------------------------ */

function safeJson<T>(text: string | null | undefined, fallback: T): T {
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}
