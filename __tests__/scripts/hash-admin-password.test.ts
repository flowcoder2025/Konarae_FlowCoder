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
 * jest (it is an ES module that checks `import.meta.url`).
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { SCRYPT_PARAMS, verifyPassword } from "@/lib/admin-login/password";

const SCRIPT = path.join(process.cwd(), "scripts", "hash-admin-password.mjs");
const PASSWORD = "correct horse battery staple";

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
