import { NextResponse } from "next/server";
import { createContract, listContracts } from "@/lib/db";
import { toIsoDate } from "@/lib/dates";

const STATUSES = ["active", "expired", "terminated"];

export async function GET() {
  return NextResponse.json({ contracts: listContracts() });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const title = String(body.title ?? "").trim();
  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  const contract = createContract({
    title,
    counterparty: (body.counterparty as string) || null,
    vendor_id: body.vendor_id ? Number(body.vendor_id) : null,
    reference: (body.reference as string) || null,
    effective_date: toIsoDate(body.effective_date as string),
    expiration_date: toIsoDate(body.expiration_date as string),
    status: STATUSES.includes(body.status as string)
      ? (body.status as "active" | "expired" | "terminated")
      : "active",
    owner: (body.owner as string) || null,
    notes: (body.notes as string) || null,
    inherit_global_requirements:
      body.inherit_global_requirements === false ? 0 : 1,
  });
  return NextResponse.json({ contract });
}
