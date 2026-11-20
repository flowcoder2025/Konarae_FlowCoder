/**
 * @jest-environment node
 *
 * scripts/hash-admin-password.mjs prints the ADMIN_PASSWORD_HASH value. Its
 * scrypt parameters are a copy of password.ts's defaults (an .mjs script cannot
 * import TypeScript), so this test pins them: the output must verify with
 * `verifyPassword` and use exactly `SCRYPT_PARAMS`, which keeps a real sign-in
 * as slow as the dummy-hash path.
 *
 * The script is always run by a separate `node` process, never imported into
 * jest (it is an ES module that checks `import.meta.url`). The interactive
 * behaviour (echo, typed-ahead input, Ctrl-C, terminal restore) is driven
 * through a real pseudo-terminal by a small python3 harness; see `runInPty`.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { SCRYPT_PARAMS, verifyPassword } from "@/lib/admin-login/password";
import { isCi } from "../ci-env";

const SCRIPT = path.join(process.cwd(), "scripts", "hash-admin-password.mjs");
const PASSWORD = "correct horse battery staple";
const PASSWORD_WORDS = PASSWORD.split(" ");

/** Imports the script in a child process and runs `body` with its exports. */
function runModule(body: string, input = "") {
  const code = `
    import * as script from ${JSON.stringify(pathToFileURL(SCRIPT).href)};
    let input = "";
    for await (const chunk of process.stdin) input += chunk;
    ${body}
  `;
  return spawnSync(process.execPath, ["--input-type=module", "-e", code], {
    input,
    encoding: "utf8",
    timeout: 30_000,
  });
}

function runScript(args: string[], input: string, env: NodeJS.ProcessEnv = {}) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    input,
    encoding: "utf8",
    timeout: 30_000,
    env: { ...process.env, ...env },
  });
}

describe("hashAdminPassword (exported by the script)", () => {
  let hashes: string[];
  let params: Record<string, number>;
  let stderr: string;

  beforeAll(() => {
    const result = runModule(
      `
      const hashes = [await script.hashAdminPassword(input), await script.hashAdminPassword(input)];
      process.stdout.write(JSON.stringify({ hashes, params: script.HASH_PARAMS }));
      `,
      PASSWORD
    );
    expect(result.status).toBe(0);
    ({ hashes, params } = JSON.parse(result.stdout));
    stderr = result.stderr;
  });

  it("does not start the interactive prompt when imported", () => {
    expect(stderr).toBe("");
  });

  it("produces a hash that verifyPassword accepts for the same password only", async () => {
    await expect(verifyPassword(PASSWORD, hashes[0])).resolves.toBe(true);
    await expect(verifyPassword(`${PASSWORD}!`, hashes[0])).resolves.toBe(false);
  });

  it("uses password.ts's default scrypt parameters", () => {
    const [scheme, N, r, p, salt, hash] = hashes[0].split(":");

    expect(scheme).toBe("scrypt");
    expect(Number(N)).toBe(SCRYPT_PARAMS.N);
    expect(Number(r)).toBe(SCRYPT_PARAMS.r);
    expect(Number(p)).toBe(SCRYPT_PARAMS.p);
    expect(Buffer.from(salt, "base64url")).toHaveLength(SCRYPT_PARAMS.saltBytes);
    expect(Buffer.from(hash, "base64url")).toHaveLength(SCRYPT_PARAMS.keyLength);
    expect(params).toEqual({
      N: SCRYPT_PARAMS.N,
      r: SCRYPT_PARAMS.r,
      p: SCRYPT_PARAMS.p,
      saltBytes: SCRYPT_PARAMS.saltBytes,
      keyLength: SCRYPT_PARAMS.keyLength,
    });
  });

  it("salts every hash and never uses `$`", () => {
    expect(hashes[0]).not.toBe(hashes[1]);
    expect(hashes.join("")).not.toContain("$");
  });
});

describe("passwordProblem (exported by the script)", () => {
  it.each([
    ["13 characters", "a".repeat(13), true],
    ["14 characters", "a".repeat(14), false],
    ["14 Hangul characters", "가".repeat(14), false],
    ["the sign-in form's maximum length", "a".repeat(1024), false],
    ["longer than the sign-in form accepts", "a".repeat(1025), true],
    ["a Tab", `${"a".repeat(14)}\tb`, true],
    ["an arrow key escape sequence", `${"a".repeat(14)}\u001b[D`, true],
    ["a line feed", `${"a".repeat(14)}\nb`, true],
    ["DEL", `${"a".repeat(14)}\u007f`, true],
    ["a C1 control character", `${"a".repeat(14)}\u0085`, true],
    ["spaces and symbols", "correct horse battery staple!", false],
  ])("judges %s", (_label, password, rejected) => {
    const result = runModule(
      `process.stdout.write(JSON.stringify(script.passwordProblem(input)));`,
      password
    );

    expect(result.status).toBe(0);
    const problem = JSON.parse(result.stdout);
    if (rejected) expect(typeof problem).toBe("string");
    else expect(problem).toBeNull();
  });
});

describe("hash-admin-password.mjs as a command", () => {
  const piped = `${PASSWORD}\n${PASSWORD}\n`;

  it("refuses when stdin is not a terminal", () => {
    const result = runScript([], piped);

    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/not a terminal/);
  });

  it("refuses arguments without echoing them", () => {
    const result = runScript([PASSWORD], piped);

    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/no arguments/);
    expect(result.stderr).not.toContain(PASSWORD);
  });

  it("does not take the password from the environment", () => {
    const result = runScript([], "", { ADMIN_PASSWORD: PASSWORD, PASSWORD });

    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(fs.readFileSync(SCRIPT, "utf8")).not.toMatch(/process\.env/);
  });
});

/*
 * pty harness. python3 opens a pseudo-terminal, starts the script with the
 * terminal as its stdin, stderr and controlling terminal (so a Ctrl-C byte in
 * cooked mode becomes SIGINT, as in a real shell), and stdout as a pipe (as in
 * `... | pbcopy`). It runs the steps, never sleeping blindly: it waits for
 * text on the terminal or for the terminal to leave echo mode. It reports
 * everything the terminal showed, the piped stdout, the exit code (negative =
 * killed by that signal) and whether the terminal settings after exit equal
 * the ones before start.
 */
type PtyStep =
  | { wait: string } // wait for text on the terminal; records whether echo was on at that moment
  | { raw: true } // wait until the terminal's echo is off
  | { send: string } // type bytes into the terminal
  | { signal: "SIGINT" } // send a real signal to the script
  | { alive: number }; // let it run for N seconds; records whether it is still running

interface PtyResult {
  code: number | null;
  terminal: string;
  stdout: string;
  restored: boolean;
  waits: { text: string; echo: boolean }[];
  alive: boolean[];
  error: string | null;
}

const PTY_HARNESS = String.raw`
import fcntl, json, os, select, signal, subprocess, sys, termios, time

cfg = json.loads(sys.argv[1])
master, slave = os.openpty()
# Settings are read through the master: on macOS the slave fd stops answering
# once the script (the session leader) exits, the master keeps reporting them.
initial = termios.tcgetattr(master)
out = bytearray()
result = {"waits": [], "alive": [], "error": None}

def echo_on():
    return bool(termios.tcgetattr(master)[3] & termios.ECHO)

def pump(wait):
    ready, _, _ = select.select([master], [], [], wait)
    if not ready:
        return False
    try:
        data = os.read(master, 4096)
    except OSError:
        data = b""
    out.extend(data)
    return bool(data)

def controlling_tty():
    fcntl.ioctl(0, termios.TIOCSCTTY, 0)

proc = subprocess.Popen(
    cfg["argv"], stdin=slave, stdout=subprocess.PIPE, stderr=slave,
    start_new_session=True, preexec_fn=controlling_tty,
)
deadline = time.monotonic() + cfg["timeout"]

def until(cond, label):
    while not cond():
        if proc.poll() is not None:
            while pump(0.05):
                pass
            if cond():
                return
            raise RuntimeError("exited before " + label)
        if time.monotonic() > deadline:
            raise RuntimeError("timed out waiting for " + label)
        pump(0.01)

try:
    for step in cfg["steps"]:
        if "wait" in step:
            text = step["wait"].encode()
            until(lambda: text in out, repr(step["wait"]))
            result["waits"].append({"text": step["wait"], "echo": echo_on()})
        elif "raw" in step:
            until(lambda: not echo_on(), "echo off")
        elif "send" in step:
            os.write(master, step["send"].encode())
        elif "signal" in step:
            proc.send_signal(getattr(signal, step["signal"]))
        elif "alive" in step:
            end = time.monotonic() + step["alive"]
            while time.monotonic() < end:
                pump(0.01)
            result["alive"].append(proc.poll() is None)
    while proc.poll() is None:
        if time.monotonic() > deadline:
            raise RuntimeError("timed out waiting for exit")
        pump(0.01)
except RuntimeError as error:
    result["error"] = str(error)
    if proc.poll() is None:
        os.killpg(proc.pid, signal.SIGKILL)
proc.wait()
while pump(0.05):
    pass
result["code"] = proc.returncode
result["terminal"] = out.decode("utf-8", "replace")
result["stdout"] = proc.stdout.read().decode("utf-8", "replace")
result["restored"] = termios.tcgetattr(master) == initial
print(json.dumps(result))
`;

const PTY_PROBE = "import fcntl, json, os, select, signal, subprocess, termios; m, s = os.openpty(); termios.tcgetattr(m)";

function ptyUnavailableReason(): string | null {
  const probe = spawnSync("python3", ["-I", "-c", PTY_PROBE], { encoding: "utf8", timeout: 10_000 });
  if (probe.error) return `python3 is not available (${probe.error.message})`;
  if (probe.status !== 0) return `python3 cannot open a pseudo-terminal (${probe.stderr.trim()})`;
  return null;
}

function runInPty(steps: PtyStep[]): PtyResult {
  const config = { argv: [process.execPath, SCRIPT], steps, timeout: 20 };
  const run = spawnSync("python3", ["-I", "-c", PTY_HARNESS, JSON.stringify(config)], {
    encoding: "utf8",
    timeout: 40_000,
  });
  if (run.status !== 0) throw new Error(`pty harness failed: ${run.stderr}`);
  return JSON.parse(run.stdout) as PtyResult;
}

const HASH_LINE = /^scrypt:\d+:\d+:\d+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+\n$/;
const PROMPT = "Admin password";
const REPEAT_PROMPT = "Repeat the password";
// The line break after the second entry is written after the script restores the terminal.
const AFTER_REPEAT = "Repeat the password: \r\n";

/**
 * The script gave the terminal back itself. Node also resets the terminal when
 * it exits, so `restored` (settings after exit) alone would not notice a
 * missing restore. The last `wait` step waits for text the script writes only
 * after its own restore, while it is still running, and records echo then.
 */
function expectRestoredByScript(result: PtyResult, text: string) {
  expect(result.waits.at(-1)).toEqual({ text, echo: true });
  expect(result.restored).toBe(true);
}

/** Nothing typed at the prompts reached the screen. */
function expectNothingEchoed(result: PtyResult, typed: string[] = [PASSWORD]) {
  for (const text of typed) expect(result.terminal).not.toContain(text);
  for (const word of PASSWORD_WORDS) expect(result.terminal).not.toContain(word);
}

const ptyUnavailable = ptyUnavailableReason();
if (ptyUnavailable && isCi()) {
  throw new Error(`CI is set but the pty tests cannot run: ${ptyUnavailable}`);
}
if (ptyUnavailable) {
  // Visible in the jest output; the pure-function and non-TTY tests above still run.
  console.warn(`SKIPPED: hash-admin-password.mjs pty tests: ${ptyUnavailable}`);
}
const describePty = ptyUnavailable ? describe.skip : describe;

describePty("hash-admin-password.mjs in a terminal (pty)", () => {
  jest.setTimeout(60_000);

  it("turns echo off before the first prompt, so entries typed ahead stay hidden", async () => {
    // Both entries are typed in one burst as soon as echo is off, before
    // either prompt is necessarily on screen.
    const result = runInPty([{ raw: true }, { send: `${PASSWORD}\r${PASSWORD}\r` }]);

    expect(result.error).toBeNull();
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(HASH_LINE);
    await expect(verifyPassword(PASSWORD, result.stdout.trim())).resolves.toBe(true);
    expectNothingEchoed(result);
    // stdout is piped: the hash goes only there, never to the terminal.
    expect(result.terminal).not.toContain(result.stdout.trim());
    expect(result.terminal).not.toContain("scrypt:");
    expect(result.terminal).toContain(PROMPT);
    expect(result.terminal).toContain(REPEAT_PROMPT);
    expect(result.restored).toBe(true);
  });

  it("shows each prompt with echo already off when entries are typed one at a time", async () => {
    const result = runInPty([
      { wait: PROMPT },
      { send: `${PASSWORD}\r` },
      { wait: REPEAT_PROMPT },
      { send: `${PASSWORD}\r` },
      { wait: AFTER_REPEAT },
    ]);

    expect(result.error).toBeNull();
    expect(result.waits.slice(0, 2)).toEqual([
      { text: PROMPT, echo: false },
      { text: REPEAT_PROMPT, echo: false },
    ]);
    expect(result.code).toBe(0);
    await expect(verifyPassword(PASSWORD, result.stdout.trim())).resolves.toBe(true);
    expectNothingEchoed(result);
    expectRestoredByScript(result, AFTER_REPEAT);
  });

  it("applies Backspace and Ctrl-U as edits, not as password characters", async () => {
    const result = runInPty([
      { wait: PROMPT },
      { send: `wrong start\u0015${PASSWORD}x\u007f\r` },
      { wait: REPEAT_PROMPT },
      { send: `${PASSWORD}\r` },
    ]);

    expect(result.code).toBe(0);
    await expect(verifyPassword(PASSWORD, result.stdout.trim())).resolves.toBe(true);
  });

  it("rejects passwords that do not match", () => {
    const result = runInPty([
      { wait: PROMPT },
      { send: `${PASSWORD}\r` },
      { wait: REPEAT_PROMPT },
      { send: `${PASSWORD}?\r` },
      { wait: "do not match" },
    ]);

    expect(result.error).toBeNull();
    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expectNothingEchoed(result);
    expectRestoredByScript(result, "do not match");
  });

  it("rejects a password shorter than 14 characters without asking again", () => {
    const result = runInPty([{ wait: PROMPT }, { send: "short-secret\r" }, { wait: "at least 14 characters" }]);

    expect(result.error).toBeNull();
    expect(result.code).toBe(1);
    expect(result.terminal).not.toContain(REPEAT_PROMPT);
    expect(result.terminal).not.toContain("short-secret");
    expect(result.stdout).toBe("");
    expectRestoredByScript(result, "at least 14 characters");
  });

  it.each([
    ["Tab", "\t"],
    ["an arrow key", "\u001b[D"],
    ["Esc", "\u001b"],
    ["Ctrl-A", "\u0001"],
  ])("rejects a password containing %s instead of dropping it", (_label, control) => {
    const [head, ...rest] = PASSWORD_WORDS;
    const result = runInPty([
      { wait: PROMPT },
      { send: `${head}${control}` },
      // The rest of the line is still read (not left for the shell to echo or run).
      { alive: 0.3 },
      { send: `${rest.join(" ")}\r` },
      { wait: "control character" },
    ]);

    expect(result.error).toBeNull();
    expect(result.alive).toEqual([true]);
    expect(result.code).toBe(1);
    expect(result.terminal).not.toContain(REPEAT_PROMPT);
    expect(result.stdout).toBe("");
    expectNothingEchoed(result, [head, rest.join(" ")]);
    expectRestoredByScript(result, "control character");
  });

  it("cancels on Ctrl-C right after the prompt, restores the terminal and exits 130", () => {
    const result = runInPty([{ wait: PROMPT }, { send: "\u0003" }, { wait: "cancelled" }]);

    expect(result.error).toBeNull();
    expect(result.code).toBe(130);
    expect(result.stdout).toBe("");
    expectRestoredByScript(result, "cancelled");
  });

  it("cancels on Ctrl-C typed ahead into the second entry", () => {
    const result = runInPty([
      { wait: PROMPT },
      { send: `${PASSWORD}\r${PASSWORD.slice(0, 5)}\u0003` },
      { wait: "cancelled" },
    ]);

    expect(result.error).toBeNull();
    expect(result.code).toBe(130);
    expect(result.stdout).toBe("");
    expectNothingEchoed(result, [PASSWORD, PASSWORD.slice(0, 5)]);
    expectRestoredByScript(result, "cancelled");
  });

  it("cancels on Ctrl-D", () => {
    const result = runInPty([{ wait: PROMPT }, { send: "\u0004" }, { wait: "cancelled" }]);

    expect(result.error).toBeNull();
    expect(result.code).toBe(130);
    expectRestoredByScript(result, "cancelled");
  });

  it("handles a real SIGINT: restores the terminal and exits 130 with a message", () => {
    const result = runInPty([{ wait: PROMPT }, { send: "corr" }, { signal: "SIGINT" }, { wait: "cancelled" }]);

    expect(result.error).toBeNull();
    expect(result.code).toBe(130);
    expect(result.stdout).toBe("");
    expectRestoredByScript(result, "cancelled");
  });
});
