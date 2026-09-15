import fs from "node:fs";
import { NextResponse } from "next/server";
import {
  deleteCertificate,
  findOrCreateVendorByName,
  getCertificate,
  setCertificateContracts,
  setCoveragesForCertificate,
  updateCertificate,
} from "@/lib/db";
import { filePathFor } from "@/lib/ingest";
import { toIsoDate } from "@/lib/dates";
import { normalizeCoverageType } from "@/lib/extract";
import type { CoverageInput } from "@/lib/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const cert = getCertificate(Number(id));
  if (!cert) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ certificate: cert });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const certId = Number(id);
  const existing = getCertificate(certId);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};

  const textFields = [
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
    "notes",
  ];
  for (const f of textFields) {
    if (f in body) patch[f] = body[f] === "" ? null : body[f];
  }
  if ("certificate_date" in body) {
    patch.certificate_date = toIsoDate(body.certificate_date as string);
  }
  if ("date_received" in body) {
    patch.date_received = toIsoDate(body.date_received as string);
  }
  if ("insurers" in body) patch.insurers = body.insurers;
  if ("reviewed" in body) {
    patch.reviewed = body.reviewed ? 1 : 0;
    if (body.reviewed && existing.extraction_status === "skipped") {
      patch.extraction_status = "manual";
    }
  }

  if ("vendor_name" in body && body.vendor_name) {
    patch.vendor_id = findOrCreateVendorByName(String(body.vendor_name)).id;
  } else if ("vendor_id" in body) {
    patch.vendor_id = body.vendor_id ? Number(body.vendor_id) : null;
  }

  if (Object.keys(patch).length) updateCertificate(certId, patch);

  if (Array.isArray(body.coverages)) {
    const coverages: CoverageInput[] = (body.coverages as Record<string, unknown>[]).map(
      (c) => ({
        coverage_type: normalizeCoverageType(c.coverage_type),
        coverage_type_raw: (c.coverage_type_raw as string) ?? null,
        insurer_name: (c.insurer_name as string) ?? null,
        insurer_letter: (c.insurer_letter as string) ?? null,
        naic: (c.naic as string) ?? null,
        policy_number: (c.policy_number as string) ?? null,
        effective_date: toIsoDate(c.effective_date as string),
        expiration_date: toIsoDate(c.expiration_date as string),
        additional_insured: triBool(c.additional_insured),
        subrogation_waived: triBool(c.subrogation_waived),
        primary_noncontributory: triBool(c.primary_noncontributory),
        per_project_aggregate: triBool(c.per_project_aggregate),
        notice_of_cancellation_days:
          c.notice_of_cancellation_days === "" ||
          c.notice_of_cancellation_days == null
            ? null
            : Number(
                String(c.notice_of_cancellation_days).replace(/[^0-9]/g, ""),
              ) || null,
        limits: Array.isArray(c.limits)
          ? (c.limits as Record<string, unknown>[]).map((l) => ({
              label: String(l.label ?? "").trim(),
              amount:
                l.amount === "" || l.amount == null
                  ? null
                  : Number(String(l.amount).replace(/[^0-9.]/g, "")) || null,
              amount_raw: (l.amount_raw as string) ?? null,
            }))
          : [],
      }),
    );
    setCoveragesForCertificate(certId, coverages);
  }

  if (Array.isArray(body.contract_ids)) {
    setCertificateContracts(
      certId,
      (body.contract_ids as unknown[]).map(Number).filter((n) => Number.isFinite(n)),
    );
  }

  return NextResponse.json({ certificate: getCertificate(certId) });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const removed = deleteCertificate(Number(id));
  if (!removed) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const p = filePathFor(removed.file_name);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch {
    /* best effort */
  }
  return NextResponse.json({ ok: true });
}

function triBool(v: unknown): 0 | 1 | null {
  if (v === true || v === 1 || v === "1" || v === "yes") return 1;
  if (v === false || v === 0 || v === "0" || v === "no") return 0;
  return null;
}
