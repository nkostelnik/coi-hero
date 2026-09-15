import fs from "node:fs";
import { NextResponse } from "next/server";
import {
  deleteCertificate,
  findOrCreateVendorByName,
  updateCertificate,
} from "@/lib/db";
import { filePathFor } from "@/lib/ingest";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    ids?: number[];
    action?: string;
    vendor_id?: number | null;
    vendor_name?: string;
  };
  const ids = (body.ids ?? []).map(Number).filter((n) => Number.isFinite(n));
  if (!ids.length) {
    return NextResponse.json({ error: "No ids" }, { status: 400 });
  }

  switch (body.action) {
    case "review":
      for (const id of ids) updateCertificate(id, { reviewed: 1 });
      break;
    case "unreview":
      for (const id of ids) updateCertificate(id, { reviewed: 0 });
      break;
    case "assign_vendor": {
      const vendorId = body.vendor_name
        ? findOrCreateVendorByName(body.vendor_name).id
        : body.vendor_id
          ? Number(body.vendor_id)
          : null;
      for (const id of ids) updateCertificate(id, { vendor_id: vendorId });
      break;
    }
    case "delete":
      for (const id of ids) {
        const removed = deleteCertificate(id);
        if (removed) {
          try {
            const p = filePathFor(removed.file_name);
            if (fs.existsSync(p)) fs.unlinkSync(p);
          } catch {
            /* best effort */
          }
        }
      }
      break;
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  return NextResponse.json({ ok: true, count: ids.length });
}
