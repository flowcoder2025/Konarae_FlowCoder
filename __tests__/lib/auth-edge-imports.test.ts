/**
 * `auth.config.ts` is bundled into the Edge middleware. The admin credentials
 * provider (scrypt, Prisma, throttle) must stay out of it, so the config may
 * import only an allowlist, and its local imports must import nothing.
 *
 * @jest-environment node
 */

import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const LIB_DIR = path.join(process.cwd(), "src", "lib");

const AUTH_CONFIG_ALLOWLIST = [
  "next-auth",
  "next-auth/providers/google",
  "next-auth/providers/kakao",
  "./auth-routes",
  "./admin-login/constants",
];

// Local modules the config may import; they must not import anything themselves.
const LEAF_MODULES = ["auth-routes.ts", path.join("admin-login", "constants.ts")];

function importsOf(file: string): string[] {
  const source = fs.readFileSync(file, "utf8");
  // Reports import/export-from declarations, require() calls and dynamic import().
  const info = ts.preProcessFile(source, true, true);
  return info.importedFiles.map((ref) => ref.fileName);
}

function sourceOf(file: string): ts.SourceFile {
  return ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
}

function hasRuntimeLoader(sourceFile: ts.SourceFile): boolean {
  let found = false;
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) found = true;
      if (ts.isIdentifier(node.expression) && node.expression.text === "require") found = true;
    }
    if (ts.isImportEqualsDeclaration(node)) found = true;
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

describe("auth.config.ts (Edge bundle)", () => {
  const configFile = path.join(LIB_DIR, "auth.config.ts");

  it("imports only the allowlisted modules", () => {
    const imports = importsOf(configFile);

    expect(imports.length).toBeGreaterThan(0);
    expect(imports.filter((name) => !AUTH_CONFIG_ALLOWLIST.includes(name))).toEqual([]);
  });

  it("uses no require() or dynamic import()", () => {
    expect(hasRuntimeLoader(sourceOf(configFile))).toBe(false);
  });

  it.each(LEAF_MODULES)("%s imports nothing", (relative) => {
    const file = path.join(LIB_DIR, relative);

    expect(importsOf(file)).toEqual([]);
    expect(hasRuntimeLoader(sourceOf(file))).toBe(false);
  });
});

describe("middleware.ts (Edge bundle)", () => {
  it("builds its auth only from the edge config", () => {
    const imports = importsOf(path.join(process.cwd(), "src", "middleware.ts"));

    expect(imports.sort()).toEqual(["@/lib/auth.config", "next-auth"]);
  });
});
