import { NextResponse } from "next/server";
import { createVendor, listVendors } from "@/lib/db";

export async function GET() {
  return NextResponse.json({ vendors: listVendors() });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const name = String(body.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  try {
    const vendor = createVendor({
      name,
      aliases: Array.isArray(body.aliases) ? (body.aliases as string[]) : [],
      contact_name: (body.contact_name as string) ?? null,
      contact_email: (body.contact_email as string) ?? null,
      notes: (body.notes as string) ?? null,
    });
    return NextResponse.json({ vendor });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not create vendor" },
      { status: 409 },
    );
  }
}
