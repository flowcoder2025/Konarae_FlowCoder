/**
 * True under a CI runner (GitHub Actions sets CI=true). A suite gated on local
 * tooling (a disposable Postgres, a pty) must fail there instead of skipping,
 * or the check passes without running it. Not a test file.
 */
export function isCi(): boolean {
  const ci = process.env.CI;
  return !!ci && ci !== "false" && ci !== "0";
}
