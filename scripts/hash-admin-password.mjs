#!/usr/bin/env node
/**
 * Prints the ADMIN_PASSWORD_HASH value for the admin email + password sign-in.
 *
 *   node scripts/hash-admin-password.mjs
 *
 * Run it in an interactive terminal. It asks for the password twice with echo
 * off and prints exactly one line: the hash, in the format of
 * src/lib/admin-login/password.ts (`scrypt:<N>:<r>:<p>:<salt>:<hash>`). Prompts
 * and errors go to stderr, so `... | pbcopy` copies only the hash.
 *
 * The password is read from the terminal only: never from arguments (shell
 * history), the environment, or a pipe.
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

/** Why the password cannot be used, or null when it can. */
export function passwordProblem(password) {
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

function restoreTerminal() {
  if (process.stdin.isTTY && process.stdin.isRaw) process.stdin.setRawMode(false);
}

/** Reads one line from the terminal with echo off (raw mode). */
function readHidden(prompt) {
  const { stdin, stderr } = process;
  return new Promise((resolve, reject) => {
    let value = "";
    const finish = (error) => {
      stdin.removeListener("data", onData);
      restoreTerminal();
      stdin.pause();
      stderr.write("\n");
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") return finish();
        if (ch === "\u0003") return finish(new Cancelled()); // Ctrl-C
        if (ch === "\u0004") {
          // Ctrl-D on an empty line cancels; otherwise it is ignored.
          if (value === "") return finish(new Cancelled());
          continue;
        }
        if (ch === "\u007f" || ch === "\b") {
          value = [...value].slice(0, -1).join("");
          continue;
        }
        if (ch === "\u0015") {
          value = ""; // Ctrl-U
          continue;
        }
        // Escape sequences (arrow keys and the like): drop the rest of the chunk.
        if (ch === "\u001b") return;
        if (ch < " ") continue;
        value += ch;
      }
    };
    stderr.write(prompt);
    stdin.setEncoding("utf8");
    stdin.setRawMode(true);
    stdin.on("data", onData);
    stdin.resume();
  });
}

function fail(message, code = 1) {
  restoreTerminal();
  process.stderr.write(`hash-admin-password: ${message}\n`);
  process.exit(code);
}

async function main() {
  if (process.argv.length > 2) {
    fail("takes no arguments; run it without any and type the password at the prompt", 2);
  }
  if (!process.stdin.isTTY) {
    fail("stdin is not a terminal; run it in an interactive terminal (the password is never read from a pipe, arguments or the environment)", 2);
  }

  process.on("SIGTERM", () => fail("terminated", 143));
  process.on("SIGHUP", () => fail("terminal closed", 129));

  try {
    const password = await readHidden("Admin password (min 14 characters): ");
    const problem = passwordProblem(password);
    if (problem) fail(problem);
    const repeated = await readHidden("Repeat the password: ");
    if (repeated !== password) fail("the passwords do not match");

    process.stdout.write(`${await hashAdminPassword(password)}\n`);
  } catch (error) {
    if (error instanceof Cancelled) fail("cancelled", 130);
    throw error;
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
