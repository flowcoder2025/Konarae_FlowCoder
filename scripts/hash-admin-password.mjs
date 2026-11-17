#!/usr/bin/env node
/**
 * Prints the ADMIN_PASSWORD_HASH value for the admin email + password sign-in.
 *
 *   node scripts/hash-admin-password.mjs            # hash on the terminal
 *   node scripts/hash-admin-password.mjs | pbcopy   # hash on the clipboard
 *
 * Run it in an interactive terminal. It asks for the password twice with echo
 * off and prints exactly one line on stdout: the hash, in the format of
 * src/lib/admin-login/password.ts (`scrypt:<N>:<r>:<p>:<salt>:<hash>`).
 * Prompts and errors go to stderr, so stdout may be a pipe.
 *
 * To store it in Vercel, capture it first and pipe it afterwards. `vercel env
 * add` waits only about half a second for piped input, much less than it
 * takes to type the password twice:
 *
 *   H=$(node scripts/hash-admin-password.mjs) && printf '%s\n' "$H" | vercel env add ADMIN_PASSWORD_HASH production; unset H
 *
 * The password is read from the terminal only: never from arguments (shell
 * history), the environment, or a pipe. Echo is turned off before the first
 * prompt and stays off until both entries are read, so input typed ahead of a
 * prompt is never shown. Enter ends an entry; Backspace and Ctrl-U edit it;
 * Ctrl-C or Ctrl-D cancels (exit 130). Any other control character (Tab, Esc,
 * arrow keys...) is kept and makes the entry invalid: the sign-in form would
 * not send it the same way, so the hash would never match.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

// A copy of SCRYPT_PARAMS' defaults in password.ts (this .mjs file cannot
// import TypeScript). __tests__/scripts/hash-admin-password.test.ts pins them,
// so a real sign-in costs the same scrypt time as the dummy-hash path.
export const HASH_PARAMS = Object.freeze({
  N: 2 ** 15,
  r: 8,
  p: 1,
  saltBytes: 16,
  keyLength: 32,
});
// Same memory ceiling as password.ts.
const MAX_MEM = 128 * 1024 * 1024;

export const MIN_PASSWORD_LENGTH = 14;
// The sign-in rejects longer passwords (authorize.ts, counted in UTF-16 units).
export const MAX_PASSWORD_LENGTH = 1024;

// C0 controls, DEL and C1 controls.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/;

/** Why the password cannot be used, or null when it can. */
export function passwordProblem(password) {
  if (CONTROL_CHARACTER.test(password)) {
    return "the password contains a control character (Tab, Esc, an arrow key...); use printable characters only";
  }
  if ([...password].length < MIN_PASSWORD_LENGTH) {
    return `the password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `the password must be at most ${MAX_PASSWORD_LENGTH} characters`;
  }
  return null;
}

export async function hashAdminPassword(password) {
  if (typeof password !== "string") throw new TypeError("password must be a string");
  const { N, r, p, saltBytes, keyLength } = HASH_PARAMS;
  const salt = crypto.randomBytes(saltBytes);
  const hash = await new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keyLength, { N, r, p, maxmem: MAX_MEM }, (err, key) =>
      err ? reject(err) : resolve(key)
    );
  });
  return ["scrypt", N, r, p, salt.toString("base64url"), hash.toString("base64url")].join(":");
}

class Cancelled extends Error {}

/**
 * Puts the terminal in raw mode (no echo, no line editing, Ctrl-C as a byte)
 * and reads entries from it until `close()`. One reader serves every prompt,
 * so typed-ahead input is queued for the next entry instead of being lost or
 * echoed between prompts. `close()` restores the terminal; it is idempotent.
 */
function openHiddenInput(stdin) {
  const entries = [];
  let current = "";
  let afterCR = false;
  let cancelled = false;
  let waiting = null;
  let open = true;

  const settle = () => {
    if (!waiting) return;
    const { resolve, reject } = waiting;
    if (cancelled) {
      waiting = null;
      reject(new Cancelled());
    } else if (entries.length > 0) {
      waiting = null;
      resolve(entries.shift());
    }
  };

  const onData = (chunk) => {
    for (const ch of chunk) {
      if (cancelled) break;
      const wasCR = afterCR;
      afterCR = ch === "\r";
      if (ch === "\n" && wasCR) continue; // CR LF counts as one Enter
      if (ch === "\r" || ch === "\n") {
        entries.push(current);
        current = "";
      } else if (ch === "\u0003" || ch === "\u0004") {
        cancelled = true; // Ctrl-C, Ctrl-D
      } else if (ch === "\u007f" || ch === "\b") {
        current = [...current].slice(0, -1).join(""); // Backspace
      } else if (ch === "\u0015") {
        current = ""; // Ctrl-U
      } else {
        current += ch; // control characters included; passwordProblem rejects them
      }
    }
    settle();
  };

  stdin.setRawMode(true);
  stdin.setEncoding("utf8");
  stdin.on("data", onData);
  stdin.resume();

  return {
    /** The next entry (without the Enter); rejects with Cancelled on Ctrl-C/Ctrl-D. */
    read() {
      return new Promise((resolve, reject) => {
        waiting = { resolve, reject };
        settle();
      });
    },
    close() {
      if (!open) return;
      open = false;
      stdin.removeListener("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
    },
  };
}

function report(message) {
  process.stderr.write(`hash-admin-password: ${message}\n`);
}

async function main() {
  if (process.argv.length > 2) {
    report("takes no arguments; run it without any and type the password at the prompt");
    process.exitCode = 2;
    return;
  }
  if (!process.stdin.isTTY) {
    report("stdin is not a terminal; run it in an interactive terminal (the password is never read from a pipe, arguments or the environment)");
    process.exitCode = 2;
    return;
  }

  let input = null;
  const restore = () => input?.close();
  const exitOnSignal = (code, message) => () => {
    restore();
    process.stderr.write("\n");
    report(message);
    process.exit(code);
  };
  // In raw mode Ctrl-C arrives as a byte; these cover real signals (kill,
  // a closed terminal), which would otherwise leave the terminal in raw mode.
  process.on("SIGINT", exitOnSignal(130, "cancelled"));
  process.on("SIGTERM", exitOnSignal(143, "terminated"));
  process.on("SIGHUP", exitOnSignal(129, "terminal closed"));
  process.on("exit", restore);

  // Echo goes off before the first prompt is written.
  input = openHiddenInput(process.stdin);
  try {
    process.stderr.write("Admin password (min 14 characters): ");
    const password = await input.read();
    process.stderr.write("\n");
    const problem = passwordProblem(password);
    if (problem) {
      restore();
      report(problem);
      process.exitCode = 1;
      return;
    }

    process.stderr.write("Repeat the password: ");
    const repeated = await input.read();
    // Both entries are in: give the terminal back (a Ctrl-C while hashing is
    // then a real SIGINT, handled above).
    restore();
    process.stderr.write("\n");
    if (repeated !== password) {
      report("the passwords do not match");
      process.exitCode = 1;
      return;
    }

    process.stdout.write(`${await hashAdminPassword(password)}\n`);
  } catch (error) {
    restore();
    if (error instanceof Cancelled) {
      process.stderr.write("\n");
      report("cancelled");
      process.exitCode = 130;
      return;
    }
    throw error;
  } finally {
    restore();
  }
}

// Run only as a command, not when imported (the test imports the exports).
// Compared after realpath + NFC so a symlinked or differently normalized
// (e.g. Hangul) path still counts as the same file.
function isMain() {
  if (!process.argv[1]) return false;
  try {
    const self = fs.realpathSync(fileURLToPath(import.meta.url)).normalize("NFC");
    return fs.realpathSync(process.argv[1]).normalize("NFC") === self;
  } catch {
    return false;
  }
}

if (isMain()) {
  await main();
}
