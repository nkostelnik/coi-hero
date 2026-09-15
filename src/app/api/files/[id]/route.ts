import fs from "node:fs";
import { NextResponse } from "next/server";
import { getCertificate } from "@/lib/db";
import { filePathFor } from "@/lib/ingest";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const cert = getCertificate(Number(id));
  if (!cert) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const path = filePathFor(cert.file_name);
  if (!fs.existsSync(path)) {
    return NextResponse.json({ error: "File missing on disk" }, { status: 410 });
  }
  const bytes = fs.readFileSync(path);
  const isPdf = cert.file_name.toLowerCase().endsWith(".pdf");
  return new NextResponse(bytes, {
    headers: {
      "Content-Type":
        cert.content_type ||
        (isPdf ? "application/pdf" : "application/octet-stream"),
      "Content-Disposition": `inline; filename="${cert.original_file_name.replace(/"/g, "")}"`,
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  });
}
