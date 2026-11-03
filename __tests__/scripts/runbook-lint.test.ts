/**
 * @jest-environment node
 *
 * Runbook lint: in `ssh <host> <command>`, an unquoted `~` is expanded by the LOCAL shell
 * (the Mini's /Users/jerome), not on the server. Every remote path must be absolute or quoted.
 */
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "../..");

// ssh options that take a separate argument
const OPTS_WITH_ARG = new Set(["-b", "-c", "-D", "-E", "-e", "-F", "-I", "-i", "-J", "-L", "-l", "-m", "-O", "-o", "-p", "-Q", "-R", "-S", "-W", "-w", "-B"]);

/** Returns the 1-based line numbers where `ssh [options] <host> ~...` appears unquoted. */
export function findUnquotedRemoteTilde(text: string): number[] {
  const hits: number[] = [];
  text.split("\n").forEach((line, i) => {
    const re = /(?:^|[\s`(;|&])ssh\s+([^\n]*)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      const tokens = m[1].split(/\s+/).filter(Boolean);
      let k = 0;
      while (k < tokens.length && tokens[k].startsWith("-")) {
        k += OPTS_WITH_ARG.has(tokens[k]) ? 2 : 1;
      }
      const next = tokens[k + 1]; // token after the host
      if (next !== undefined && next.startsWith("~")) hits.push(i + 1);
    }
  });
  return hits;
}

function filesUnder(dir: string, exts: string[]): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return filesUnder(full, exts);
    return exts.some((e) => name.endsWith(e)) ? [full] : [];
  });
}

describe("runbook lint: no unquoted remote ~ in ssh commands", () => {
  it("detects the bad pattern and accepts absolute or quoted remote paths", () => {
    expect(findUnquotedRemoteTilde("ssh oci ~/flowmate-db/install.sh")).toEqual([1]);
    expect(findUnquotedRemoteTilde("x\n   `ssh -t oci ~/flowmate-db/switch-workers.sh --rollback`")).toEqual([2]);
    expect(findUnquotedRemoteTilde("ssh -o BatchMode=yes -L 5433:127.0.0.1:5433 oci ~/x")).toEqual([1]);
    expect(findUnquotedRemoteTilde("ssh oci /home/ubuntu/flowmate-db/install.sh")).toEqual([]);
    expect(findUnquotedRemoteTilde("ssh oci '~/flowmate-db/install.sh'")).toEqual([]);
    expect(findUnquotedRemoteTilde('ssh oci "FLOWMATE_CONFIRM_SWAP=$B ~/flowmate-db/restore.sh x"')).toEqual([]);
    expect(findUnquotedRemoteTilde("ssh -f -N -L 5433:127.0.0.1:5433 oci")).toEqual([]);
  });

  it("deploy/oci/**/*.md, deploy/oci/**/*.sh and claude.md are clean", () => {
    const files = [
      ...filesUnder(path.join(ROOT, "deploy/oci"), [".md", ".sh"]),
      path.join(ROOT, "claude.md"),
    ];
    expect(files.length).toBeGreaterThan(5);
    const offenders = files.flatMap((f) =>
      findUnquotedRemoteTilde(readFileSync(f, "utf8")).map((line) => `${path.relative(ROOT, f)}:${line}`),
    );
    expect(offenders).toEqual([]);
  });
});
