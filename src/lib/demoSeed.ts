import "server-only";
import fs from "node:fs";
import {
  createContract,
  createRequirement,
  db,
  findOrCreateVendorByName,
  FILES_DIR,
  insertCertificate,
  setContractCertificates,
  setCoveragesForCertificate,
  updateCertificate,
  updateVendor,
} from "./db";
import { storeFile } from "./ingest";
import { renderCertificatePdf } from "./samplePdf";
import {
  DEMO_CERTS,
  DEMO_CONTRACTS,
  DEMO_RENEWAL_REQUESTS,
  DEMO_VENDOR_REQUIREMENTS,
  type DemoCoverage,
} from "./demoData";

function isoOffset(days: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function usDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}

function money(n: number): string {
  return `$${n.toLocaleString("en-US")}`;
}

const tri = (b: boolean | undefined): 0 | 1 | null =>
  b === undefined ? null : b ? 1 : 0;

export interface DemoState {
  certificates: number;
  looksLikeDemo: boolean;
}

export function demoState(): DemoState {
  const total = (
    db().prepare("SELECT COUNT(*) AS n FROM certificates").get() as { n: number }
  ).n;
  const demo = (
    db()
      .prepare(
        "SELECT COUNT(*) AS n FROM certificates WHERE extraction_model = 'demo'",
      )
      .get() as { n: number }
  ).n;
  return { certificates: total, looksLikeDemo: total > 0 && demo === total };
}

export function wipeAll(): void {
  const tx = db().transaction(() => {
    db().exec("DELETE FROM certificate_contracts");
    db().exec("DELETE FROM coverages");
    db().exec("DELETE FROM certificates");
    db().exec("DELETE FROM requirements WHERE scope IN ('vendor','contract')");
    db().exec("DELETE FROM contracts");
    db().exec("DELETE FROM vendors");
    db().exec(
      "UPDATE sqlite_sequence SET seq = 0 WHERE name IN ('certificates','vendors','coverages','contracts')",
    );
  });
  tx();
  try {
    for (const f of fs.readdirSync(FILES_DIR)) {
      fs.unlinkSync(`${FILES_DIR}/${f}`);
    }
  } catch {
    /* best effort */
  }
}

export function seedDemo(): { vendors: number; certificates: number } {
  if (demoState().certificates > 0) {
    throw new Error(
      "The database already has certificates. Use “Reset demo data” to replace them.",
    );
  }

  const vendorNames = new Set<string>();
  const certIdsByVendor = new Map<string, number[]>();

  for (const spec of DEMO_CERTS) {
    const certDate = isoOffset(spec.cert_date_offset);
    const covs = spec.coverages.map((c) => ({
      ...c,
      eff: isoOffset(c.eff_offset),
      exp: isoOffset(c.exp_offset),
    }));

    const pdf = renderCertificatePdf({
      certificateDate: usDate(certDate),
      producer: spec.producer,
      insured: `${spec.insured_name}, ${spec.insured_address}`,
      holder: `${spec.holder}, ${spec.holder_address}`,
      description: spec.description ?? null,
      coverages: covs.map((c) => ({
        label: c.coverage_type,
        carrier: c.carrier,
        policyNumber: c.policy_number,
        effective: usDate(c.eff),
        expiration: usDate(c.exp),
        limits: c.limits.map((l) => ({ label: l.label, amount: money(l.amount) })),
        addlInsured: !!c.additional_insured,
        subrWaived: !!c.subrogation_waived,
      })),
    });

    const { fileName, size } = storeFile(
      Buffer.from(pdf, "latin1"),
      spec.original_file_name,
    );
    const id = insertCertificate({
      file_name: fileName,
      original_file_name: spec.original_file_name,
      file_size: size,
      content_type: "application/pdf",
      source: "upload",
      date_received: isoOffset(spec.date_received_offset),
    });

    const insurers = uniqueCarriers(spec.coverages);
    updateCertificate(id, {
      certificate_date: certDate,
      producer_name: spec.producer,
      insured_name: spec.insured_name,
      insured_address: spec.insured_address,
      certificate_holder_name: spec.holder,
      certificate_holder_address: spec.holder_address,
      description_of_operations: spec.description ?? null,
      contract_reference: spec.contract_reference ?? null,
      internal_owner: spec.internal_owner ?? null,
      notes: "Demo data: generated sample, not a real certificate.",
      reviewed: spec.reviewed ? 1 : 0,
      extraction_status: "ok",
      extraction_model: "demo",
      insurers,
    });

    if (spec.vendor) {
      const vendor = findOrCreateVendorByName(spec.vendor);
      vendorNames.add(spec.vendor);
      if (spec.aliases?.length) {
        updateVendor(vendor.id, { aliases: spec.aliases });
      }
      updateCertificate(id, { vendor_id: vendor.id });
      const list = certIdsByVendor.get(spec.vendor) ?? [];
      list.push(id);
      certIdsByVendor.set(spec.vendor, list);
    }

    setCoveragesForCertificate(
      id,
      covs.map((c: DemoCoverage & { eff: string; exp: string }) => ({
        coverage_type: c.coverage_type,
        insurer_name: c.carrier,
        policy_number: c.policy_number,
        effective_date: c.eff,
        expiration_date: c.exp,
        additional_insured: tri(c.additional_insured),
        subrogation_waived: tri(c.subrogation_waived),
        primary_noncontributory: tri(c.primary_noncontributory),
        per_project_aggregate: tri(c.per_project_aggregate),
        notice_of_cancellation_days: c.notice_of_cancellation_days ?? null,
        limits: c.limits.map((l) => ({
          label: l.label,
          amount: l.amount,
          amount_raw: money(l.amount),
        })),
      })),
    );
  }

  for (const req of DEMO_VENDOR_REQUIREMENTS) {
    const vendor = findOrCreateVendorByName(req.vendor);
    createRequirement({
      scope: "vendor",
      vendor_id: vendor.id,
      contract_id: null,
      coverage_type: req.coverage_type,
      min_each_occurrence: req.min_each_occurrence ?? null,
      min_aggregate: req.min_aggregate ?? null,
      min_combined_single_limit: null,
      require_additional_insured: req.require_additional_insured ? 1 : 0,
      require_waiver_of_subrogation: 0,
      required: req.required === false ? 0 : 1,
      notes: "Demo data",
    });
  }

  for (const r of DEMO_RENEWAL_REQUESTS) {
    const vendor = findOrCreateVendorByName(r.vendor);
    updateVendor(vendor.id, { update_requested_on: isoOffset(-r.days_ago) });
  }

  for (const dc of DEMO_CONTRACTS) {
    const vendor = findOrCreateVendorByName(dc.vendor);
    const contract = createContract({
      title: dc.title,
      counterparty: dc.counterparty,
      vendor_id: vendor.id,
      reference: dc.reference,
      effective_date: isoOffset(dc.effective_offset),
      expiration_date: isoOffset(dc.expiration_offset),
      status: dc.status ?? "active",
      owner: dc.owner ?? null,
      notes: dc.notes ?? null,
      inherit_global_requirements:
        dc.inherit_global_requirements === false ? 0 : 1,
    });
    for (const req of dc.requirements) {
      createRequirement({
        scope: "contract",
        vendor_id: null,
        contract_id: contract.id,
        coverage_type: req.coverage_type,
        min_each_occurrence: req.min_each_occurrence ?? null,
        min_aggregate: req.min_aggregate ?? null,
        min_combined_single_limit: req.min_combined_single_limit ?? null,
        require_additional_insured: req.require_additional_insured ? 1 : 0,
        require_waiver_of_subrogation: req.require_waiver_of_subrogation ? 1 : 0,
        required: 1,
        notes: "Demo data",
      });
    }
    setContractCertificates(
      contract.id,
      certIdsByVendor.get(dc.vendor) ?? [],
    );
  }

  return {
    vendors: vendorNames.size,
    certificates: DEMO_CERTS.length,
  };
}

export function resetDemo(): { vendors: number; certificates: number } {
  wipeAll();
  return seedDemo();
}

function uniqueCarriers(coverages: DemoCoverage[]) {
  const names = [...new Set(coverages.map((c) => c.carrier))];
  return names.map((name, i) => ({
    letter: String.fromCharCode(65 + i),
    name,
    naic: null,
  }));
}
