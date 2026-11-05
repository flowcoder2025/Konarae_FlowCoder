/**
 * @jest-environment node
 *
 * Pins the Mini backup pull job's launchd program. Under launchd, macOS TCC checks the job's
 * program (the "responsible" process) against the portable volume. /bin/zsh holds Full Disk
 * Access on the Mini, /bin/bash does not: with `/bin/bash <script>` as the program every run failed
 * with "Operation not permitted" (2026-11-03..05). zsh must stay the parent: without the trailing
 * `; exit $?` zsh exec's bash as the last command and TCC denies the volume again. Nothing else
 * would notice until the OCI offsite alert fires after 48h.
 */
import { readFileSync } from "fs";
import path from "path";

const PLIST = path.resolve(
  __dirname,
  "../../deploy/oci/db/mini/com.flowcoder.flowmate-db-backup.plist",
);

function programArguments(xml: string): string[] {
  const block = xml.match(/<key>ProgramArguments<\/key>\s*<array>([\s\S]*?)<\/array>/);
  if (!block) throw new Error("ProgramArguments array not found");
  return [...block[1].matchAll(/<string>([\s\S]*?)<\/string>/g)].map((m) =>
    m[1].replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"),
  );
}

describe("Mini backup launchd plist", () => {
  const args = programArguments(readFileSync(PLIST, "utf8"));

  it("runs the pull script as a child of /bin/zsh, not via exec", () => {
    expect(args).toEqual([
      "/bin/zsh",
      "-f",
      "-c",
      '/bin/bash "$1"; exit $?',
      "flowmate-db-backup",
      "@HOME@/.local/bin/flowmate-db-pull-backups.sh",
    ]);
  });

  it("keeps a command after bash so zsh cannot exec it", () => {
    const script = args[args.indexOf("-c") + 1];
    expect(script).toMatch(/^\/bin\/bash "\$1"; exit \$\?$/);
  });
});
