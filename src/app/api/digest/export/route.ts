import {
  getSoonDays,
  listCertificates,
  listRequirements,
  listVendors,
} from "@/lib/db";
import { buildDigest, digestCsv } from "@/lib/digest";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;

  const digest = buildDigest({
    certs: listCertificates(),
    vendors: listVendors(),
    requirements: listRequirements(),
    soonDays: getSoonDays(),
  });

  const body = digestCsv(digest, (id) => `${origin}/certificates/${id}`);
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="coi-hero-digest-${stamp}.csv"`,
    },
  });
}
