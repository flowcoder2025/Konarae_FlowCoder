/**
 * @jest-environment node
 *
 * Ops lint for the OCI runbook and scripts:
 *  1. `ssh <host> <command>`: an unquoted `~` anywhere in the remote command is expanded by the
 *     LOCAL shell (the Mini's /Users/jerome), not on the server. Remote paths must be absolute or
 *     quoted.
 *  2. Plain `docker inspect NAME` resolves an IMAGE when no container has that name (all worker
 *     names are image tags on OCI). Always say `docker container|image|network|volume inspect`.
 *  3. In the DB README, once the runbook enters a tmux session, every fenced bash block must say
 *     which host it runs on (`# on Mini` / `# on OCI ...`).
 *  4. The deploy.sh guard marker switch-workers.sh checks for must appear in deploy.sh exactly once.
 */
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "../..");

// ssh options that take a separate argument
const OPTS_WITH_ARG = new Set(["-b", "-c", "-D", "-E", "-e", "-F", "-I", "-i", "-J", "-L", "-l", "-m", "-O", "-o", "-p", "-Q", "-R", "-S", "-W", "-w", "-B"]);
const STOP_TOKENS = new Set([";", "&&", "||", "|", ")", "}"]);

/** 1-based line numbers where `ssh [options] <host> ...` has an unquoted token starting with `~`. */
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
      // tokens[k] is the host; check every remote-command token until quoting or a shell operator
      for (let t = k + 1; t < tokens.length; t++) {
        const tok = tokens[t];
        if (/['"`]/.test(tok.replace(/`$/, "")) || STOP_TOKENS.has(tok)) break;
        if (tok.startsWith("~")) {
          hits.push(i + 1);
          break;
        }
        if (/[;`]$/.test(tok) || tok.endsWith("&&")) break; // `...cmd;` / end of inline code
      }
    }
  });
  return hits;
}

/** 1-based line numbers with `docker inspect` not followed by container|image|network|volume. */
export function findPlainDockerInspect(text: string): number[] {
  const hits: number[] = [];
  text.split("\n").forEach((line, i) => {
    if (/\bdocker\s+inspect\b(?!\s+(?:container|image|network|volume)\b)/.test(line)) hits.push(i + 1);
  });
  return hits;
}

/** Fenced ```bash blocks opened after the first `tmux new` line whose first line is not a host label. */
export function findUnlabeledBlocksAfterTmux(text: string): number[] {
  const lines = text.split("\n");
  const firstTmux = lines.findIndex((l) => /tmux new\b/.test(l));
  if (firstTmux < 0) return [];
  const hits: number[] = [];
  let inBlock = false;
  lines.forEach((line, i) => {
    const fence = line.trim();
    if (!inBlock && /^```bash$/.test(fence)) {
      inBlock = true;
      if (i > firstTmux && !/^#\s*on\s+(Mini|OCI)\b/.test((lines[i + 1] ?? "").trim())) hits.push(i + 1);
    } else if (inBlock && fence === "```") {
      inBlock = false;
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
const scanned = () => [...filesUnder(path.join(ROOT, "deploy/oci"), [".md", ".sh"]), path.join(ROOT, "claude.md")];
const offendersOf = (check: (t: string) => number[], files: string[]) =>
  files.flatMap((f) => check(readFileSync(f, "utf8")).map((line) => `${path.relative(ROOT, f)}:${line}`));

describe("ops lint: no unquoted remote ~ in ssh commands", () => {
  it("detects the bad pattern anywhere in the unquoted remote command", () => {
    expect(findUnquotedRemoteTilde("ssh oci ~/flowmate-db/install.sh")).toEqual([1]);
    expect(findUnquotedRemoteTilde("x\n   `ssh -t oci ~/flowmate-db/switch-workers.sh --rollback`")).toEqual([2]);
    expect(findUnquotedRemoteTilde("ssh -o BatchMode=yes -L 5433:127.0.0.1:5433 oci ~/x")).toEqual([1]);
    expect(findUnquotedRemoteTilde("ssh oci FOO=1 ~/x")).toEqual([1]);
    expect(findUnquotedRemoteTilde("ssh oci cd ~/x")).toEqual([1]);
    expect(findUnquotedRemoteTilde("ssh oci cat ~/x")).toEqual([1]);
  });

  it("accepts absolute or quoted remote paths and local ~ after a shell operator", () => {
    expect(findUnquotedRemoteTilde("ssh oci /home/ubuntu/flowmate-db/install.sh")).toEqual([]);
    expect(findUnquotedRemoteTilde("ssh oci '~/flowmate-db/install.sh'")).toEqual([]);
    expect(findUnquotedRemoteTilde("ssh oci 'cd ~/x && ls'")).toEqual([]);
    expect(findUnquotedRemoteTilde('ssh oci "FLOWMATE_CONFIRM_SWAP=$B ~/flowmate-db/restore.sh x"')).toEqual([]);
    expect(findUnquotedRemoteTilde("ssh -f -N -L 5433:127.0.0.1:5433 oci")).toEqual([]);
    expect(findUnquotedRemoteTilde("ssh oci true && cp ~/a ~/b")).toEqual([]);
  });

  it("deploy/oci/**/*.md, deploy/oci/**/*.sh and claude.md are clean", () => {
    const files = scanned();
    expect(files.length).toBeGreaterThan(5);
    expect(offendersOf(findUnquotedRemoteTilde, files)).toEqual([]);
  });
});

describe("ops lint: docker inspect must name the object type", () => {
  it("flags plain `docker inspect` only", () => {
    expect(findPlainDockerInspect("docker inspect -f '{{.Id}}' flowmate-crawler")).toEqual([1]);
    expect(findPlainDockerInspect("x=$(docker inspect flowmate-db)")).toEqual([1]);
    expect(findPlainDockerInspect("docker container inspect -f '{{.Id}}' flowmate-crawler")).toEqual([]);
    expect(findPlainDockerInspect("docker image inspect x; docker network inspect flowmate; docker volume inspect v")).toEqual([]);
  });

  it("deploy/oci/** and claude.md use typed inspects", () => {
    expect(offendersOf(findPlainDockerInspect, scanned())).toEqual([]);
  });
});

describe("ops lint: host labels after the runbook enters tmux", () => {
  it("flags an unlabeled bash block after a tmux line and accepts labeled ones", () => {
    const doc = ["```bash", "echo before tmux", "```", "ssh -t oci tmux new -A -s cutover", "```bash", "# on OCI (inside tmux cutover)", "x", "```", "```bash", "ssh oci y", "```"].join("\n");
    expect(findUnlabeledBlocksAfterTmux(doc)).toEqual([9]);
  });

  it("deploy/oci/db/README.md labels every bash block after the first tmux line", () => {
    const readme = readFileSync(path.join(ROOT, "deploy/oci/db/README.md"), "utf8");
    expect(readme).toMatch(/tmux new -A -s cutover/);
    expect(findUnlabeledBlocksAfterTmux(readme)).toEqual([]);
  });
});

describe("ops lint: deploy.sh guard marker", () => {
  it("deploy.sh contains switch-workers.sh's DEPLOY_GUARD_MARKER exactly once", () => {
    const sw = readFileSync(path.join(ROOT, "deploy/oci/db/switch-workers.sh"), "utf8");
    const m = sw.match(/^DEPLOY_GUARD_MARKER='([^']+)'$/m);
    expect(m).not.toBeNull();
    const marker = m![1];
    const deploy = readFileSync(path.join(ROOT, "deploy/oci/deploy.sh"), "utf8");
    expect(deploy.split(marker).length - 1).toBe(1);
  });
});
