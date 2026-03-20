import CommitGuardClient from "./home-client";

/**
 * Server Component shell so the client UI is not the route default export.
 * Next.js 16 passes `params` / `searchParams` as Promises on page props; dev tools
 * that enumerate props (e.g. element picker) would otherwise trigger sync-dynamic-api warnings.
 */
export default function Page() {
  return <CommitGuardClient />;
}
