import { NextResponse } from "next/server";
import { ingestUpload } from "@/lib/ingest";
import { listCertificates } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET() {
  return NextResponse.json({ certificates: listCertificates() });
}

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  const single = form.get("file");
  if (single instanceof File) files.push(single);

  if (files.length === 0) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }

  const results = [];
  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length === 0) continue;
    const cert = await ingestUpload({
      buffer,
      originalName: file.name || "certificate.pdf",
      contentType: file.type || null,
      source: "upload",
    });
    results.push(cert);
  }

  return NextResponse.json({ certificates: results });
}
