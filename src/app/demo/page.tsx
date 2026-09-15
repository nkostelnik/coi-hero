import Link from "next/link";
import DemoButton from "@/components/DemoButton";

export const dynamic = "force-dynamic";

export default function DemoPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Demo &amp; sample data</h1>
        <p className="text-sm text-slate-500">
          Populate COI Hero with a realistic set of vendors and certificates so
          you can try every screen without an API key or real files.
        </p>
      </div>

      <DemoButton panel />

      <div className="card space-y-2 p-5 text-sm text-slate-600">
        <h2 className="font-semibold text-slate-800">What you get</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>~11 vendors, 12 certificates with generated stand-in PDFs</li>
          <li>
            A spread of statuses: active, expiring soon, expired, under-limit,
            missing coverage
          </li>
          <li>One vendor with its own requirement overrides</li>
          <li>One vendor with an outstanding “updated COI requested” date</li>
          <li>An unassigned certificate and an unreviewed one to triage</li>
        </ul>
      </div>

      <div className="card space-y-2 p-5 text-sm text-slate-600">
        <h2 className="font-semibold text-slate-800">
          Demo the upload flow too
        </h2>
        <p>
          Add <code>COI_DEMO_MODE=1</code> to <code>coi-hero/.env.local</code> and
          restart. Then any PDF you drop on{" "}
          <Link href="/upload" className="text-brand-700 hover:underline">
            Add certificate
          </Link>{" "}
          gets realistic <em>mock</em> extracted fields (generated from the file
          name, not a real reading of the document).
        </p>
      </div>
    </div>
  );
}
