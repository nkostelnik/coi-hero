import path from "node:path";
import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // better-sqlite3 is a native module; keep it out of the bundler.
  serverExternalPackages: ["better-sqlite3"],
  // This project sits inside another repo; pin the tracing root to itself.
  outputFileTracingRoot: path.dirname(fileURLToPath(import.meta.url)),
};

export default nextConfig;
