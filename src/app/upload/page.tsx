import Uploader from "@/components/Uploader";

export const dynamic = "force-dynamic";

export default function UploadPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Add certificates</h1>
        <p className="text-sm text-slate-500">
          Drop one or more COI PDFs (or photos/scans). COI Hero stores the
          original and pulls out the carriers, policy numbers, limits, and dates.
          You confirm the details on the next screen.
        </p>
      </div>
      <Uploader />
    </div>
  );
}
