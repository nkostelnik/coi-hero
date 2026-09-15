import "server-only";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  FILES_DIR,
  findOrCreateVendorByName,
  getCertificate,
  insertCertificate,
  setCoveragesForCertificate,
  updateCertificate,
} from "./db";
import { demoMode, extractCoi, hasApiKey } from "./extract";
import type { CertificateWithRelations, ExtractionResult } from "./types";

export function storeFile(
  buffer: Buffer,
  originalName: string,
): { fileName: string; size: number } {
  fs.mkdirSync(FILES_DIR, { recursive: true });
  const ext = path.extname(originalName).toLowerCase() || ".pdf";
  const fileName = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`;
  fs.writeFileSync(path.join(FILES_DIR, fileName), buffer);
  return { fileName, size: buffer.length };
}

export function filePathFor(fileName: string): string {
  // Guard against path traversal from a stored name.
  const safe = path.basename(fileName);
  return path.join(FILES_DIR, safe);
}

/** Write an extraction result onto an existing certificate row. */
export function applyExtraction(
  certificateId: number,
  result: ExtractionResult,
  model: string,
): void {
  const existing = getCertificate(certificateId);
  const patch: Record<string, unknown> = {
    certificate_date: result.certificate_date,
    producer_name: result.producer.name,
    producer_contact: result.producer.contact_name,
    producer_phone: result.producer.phone,
    producer_email: result.producer.email,
    insured_name: result.insured.name,
    insured_address: result.insured.address,
    certificate_holder_name: result.certificate_holder.name,
    certificate_holder_address: result.certificate_holder.address,
    description_of_operations: result.description_of_operations,
    insurers: result.insurers,
    raw_extraction_json: result,
    extraction_status: "ok",
    extraction_error: null,
    extraction_model: model,
  };

  // Only auto-assign a vendor if one isn't already set.
  if (existing && !existing.vendor_id && result.insured.name) {
    patch.vendor_id = findOrCreateVendorByName(result.insured.name).id;
  }

  updateCertificate(certificateId, patch);
  setCoveragesForCertificate(
    certificateId,
    result.coverages.map((c) => ({
      coverage_type: c.coverage_type,
      coverage_type_raw: c.coverage_type_raw,
      insurer_name: c.insurer_name,
      insurer_letter: c.insurer_letter,
      policy_number: c.policy_number,
      effective_date: c.effective_date,
      expiration_date: c.expiration_date,
      additional_insured:
        c.additional_insured == null ? null : c.additional_insured ? 1 : 0,
      subrogation_waived:
        c.subrogation_waived == null ? null : c.subrogation_waived ? 1 : 0,
      primary_noncontributory:
        c.primary_noncontributory == null ? null : c.primary_noncontributory ? 1 : 0,
      per_project_aggregate:
        c.per_project_aggregate == null ? null : c.per_project_aggregate ? 1 : 0,
      notice_of_cancellation_days: c.notice_of_cancellation_days ?? null,
      limits: c.limits,
    })),
  );
}

/**
 * Full ingest for one uploaded file: store bytes, create the row, then try
 * extraction. Never throws on extraction failure; the certificate is still
 * saved for manual entry.
 */
export async function ingestUpload(params: {
  buffer: Buffer;
  originalName: string;
  contentType: string | null;
  source?: "upload" | "email";
  sourceMeta?: Record<string, unknown> | null;
}): Promise<CertificateWithRelations> {
  const { buffer, originalName, contentType, source, sourceMeta } = params;
  const { fileName, size } = storeFile(buffer, originalName);

  const id = insertCertificate({
    file_name: fileName,
    original_file_name: originalName,
    file_size: size,
    content_type: contentType,
    source: source ?? "upload",
    source_meta: sourceMeta ?? null,
  });

  if (!hasApiKey() && !demoMode()) {
    updateCertificate(id, {
      extraction_status: "skipped",
      extraction_error: "No ANTHROPIC_API_KEY set; enter fields manually.",
    });
    return getCertificate(id)!;
  }

  try {
    const { result, model } = await extractCoi(buffer, originalName);
    applyExtraction(id, result, model);
  } catch (err) {
    updateCertificate(id, {
      extraction_status: "failed",
      extraction_error: err instanceof Error ? err.message : String(err),
    });
  }
  return getCertificate(id)!;
}
