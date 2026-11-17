/**
 * Every admin API handler and every admin server action must start with
 * `await requireAdmin()` in its own body (first statement, or first statement
 * of a top-level `try`). A guarding `try` has no `finally`, and it is either
 * the function's only statement or its `catch` ends in `return`/`throw` on
 * every path, so a failed guard cannot fall through to later code. Files are
 * discovered from disk and parsed with the TypeScript compiler, so a new
 * handler or action is covered automatically, and an export form the scan
 * does not understand fails the test. Not detected: data read inside a
 * `catch` before its `return`.
 *
 * Admin server actions are:
 * - every export of a file under src/lib/actions/ whose top-level directive is
 *   "use server" and whose path contains "admin";
 * - every inline server action (a function whose body starts with the
 *   "use server" directive) in any file under src/app/admin/. Its guard comes
 *   right after the directive. The one exception is the sign-out action in
 *   src/app/admin/layout.tsx, whose whole body is `await signOut(...)`.
 * A "use server" string the scan cannot place (not a function's or the file's
 * directive), or a file-level "use server" under src/app/admin/, fails.
 *
 * Every other server action in src/ must be listed: a file-level "use server"
 * outside src/lib/actions/, or one there without "admin" in its path, fails
 * unless it is in OTHER_ACTION_FILES, and a file outside src/app/admin/ must
 * have exactly the number of inline actions PUBLIC_INLINE_ACTIONS gives it
 * (none if absent), each of which is only the one call listed there. A new
 * server action anywhere therefore fails until it is
 * guarded as an admin action or listed here with the reason it needs no admin.
 *
 * @jest-environment node
 */

import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, "src");
const ADMIN_API_DIR = path.join(ROOT, "src", "app", "api", "admin");
const ACTIONS_DIR = path.join(ROOT, "src", "lib", "actions");
const ADMIN_APP_DIR = path.join(ROOT, "src", "app", "admin");
const ADMIN_LAYOUT = path.join("src", "app", "admin", "layout.tsx");
const SOURCE_FILE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const USE_SERVER = "use server";

/**
 * Inline server actions outside src/app/admin/: file -> how many, and the one
 * call each action's whole body must be (`await <call>(...)`). Each is a
 * public endpoint, so each entry says why it needs no admin.
 */
const PUBLIC_INLINE_ACTIONS: Record<string, { count: number; call: string }> = {
  // Kakao and Google sign-in buttons: start an OAuth redirect, nothing else.
  [path.join("src", "app", "login", "page.tsx")]: { count: 2, call: "signIn" },
  // The admin password sign-in form; attempts are throttled in authorizeAdmin.
  [path.join("src", "app", "admin-login", "page.tsx")]: { count: 1, call: "submitAdminLogin" },
};

/**
 * "use server" files that are not admin action files (src/lib/actions/, path
 * containing "admin"), with the reason they need no admin. None today.
 */
const OTHER_ACTION_FILES: ReadonlySet<string> = new Set<string>();

const HTTP_METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);
// Next.js route segment config: plain values, not handlers.
const ROUTE_CONFIG_EXPORTS = new Set([
  "dynamic",
  "dynamicParams",
  "revalidate",
  "fetchCache",
  "runtime",
  "preferredRegion",
  "maxDuration",
]);

type FunctionNode = ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression;
type ExportedFunction = { name: string; node: FunctionNode };
type ScanResult = { functions: ExportedFunction[]; problems: string[] };

function findFiles(dir: string, pattern: RegExp): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return findFiles(full, pattern);
    return pattern.test(entry.name) ? [full] : [];
  });
}

function findRouteFiles(dir: string): string[] {
  return findFiles(dir, /^route\.(ts|tsx|js|jsx)$/);
}

function parseSource(fileName: string, code: string): ts.SourceFile {
  const kind = /\.(tsx|jsx)$/.test(fileName) ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, kind);
}

function parse(file: string): ts.SourceFile {
  return parseSource(file, fs.readFileSync(file, "utf8"));
}

/** The leading string-literal statements (directives) and what follows them. */
function splitDirectives(statements: readonly ts.Statement[]): {
  directives: string[];
  rest: readonly ts.Statement[];
} {
  let i = 0;
  const directives: string[] = [];
  while (i < statements.length) {
    const statement = statements[i];
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) break;
    directives.push(statement.expression.text);
    i++;
  }
  return { directives, rest: statements.slice(i) };
}

function hasUseServerDirective(statements: readonly ts.Statement[]): boolean {
  return splitDirectives(statements).directives.includes(USE_SERVER);
}

/** A "use server" file (top-level directive) whose path contains "admin". */
function isAdminActionFile(relativePath: string, source: ts.SourceFile): boolean {
  return /admin/i.test(relativePath) && hasUseServerDirective(source.statements);
}

function isExported(node: ts.Node): boolean {
  return (
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
  );
}

function isDefaultExport(node: ts.Node): boolean {
  return (
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)
  );
}

/** `requireAdmin` imported by that exact name from "@/lib/auth-utils". */
function importsRequireAdmin(source: ts.SourceFile): boolean {
  return source.statements.some((statement) => {
    if (!ts.isImportDeclaration(statement)) return false;
    if (!ts.isStringLiteral(statement.moduleSpecifier)) return false;
    if (statement.moduleSpecifier.text !== "@/lib/auth-utils") return false;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) return false;
    return bindings.elements.some(
      (element) => element.name.text === "requireAdmin" && element.propertyName === undefined
    );
  });
}

function isAwaitedRequireAdmin(expression: ts.Expression | undefined): boolean {
  if (!expression || !ts.isAwaitExpression(expression)) return false;
  const call = expression.expression;
  return (
    ts.isCallExpression(call) &&
    ts.isIdentifier(call.expression) &&
    call.expression.text === "requireAdmin" &&
    call.arguments.length === 0
  );
}

/** `await requireAdmin();` or `const x = await requireAdmin();` */
function isGuardStatement(statement: ts.Statement | undefined): boolean {
  if (!statement) return false;
  if (ts.isExpressionStatement(statement)) return isAwaitedRequireAdmin(statement.expression);
  if (ts.isVariableStatement(statement)) {
    const [declaration, ...rest] = statement.declarationList.declarations;
    return rest.length === 0 && isAwaitedRequireAdmin(declaration?.initializer);
  }
  return false;
}

/**
 * Every path through `statement` ends in `return` or `throw`. Deliberately
 * narrow: a trailing `return`/`throw`, or an `if`/`else` whose branches both
 * qualify. Anything else (switch, loops, labels...) counts as falling through.
 */
function alwaysExits(statement: ts.Statement | undefined): boolean {
  if (!statement) return false;
  if (ts.isReturnStatement(statement) || ts.isThrowStatement(statement)) return true;
  if (ts.isBlock(statement)) return alwaysExits(statement.statements[statement.statements.length - 1]);
  if (ts.isIfStatement(statement)) {
    return alwaysExits(statement.thenStatement) && alwaysExits(statement.elseStatement);
  }
  return false;
}

function statementsStartWithGuard(statements: readonly ts.Statement[]): boolean {
  const [first] = statements;
  if (isGuardStatement(first)) return true;
  if (!first || !ts.isTryStatement(first) || !isGuardStatement(first.tryBlock.statements[0])) {
    return false;
  }
  // A failed guard throws into the catch (and the finally). Code there, or
  // after the try when the catch can finish normally, runs without an admin.
  if (first.finallyBlock) return false;
  const tryIsLast = statements.length === 1;
  return tryIsLast || alwaysExits(first.catchClause?.block);
}

function startsWithGuard(fn: FunctionNode): boolean {
  const body = fn.body;
  if (!body || !ts.isBlock(body)) return false;
  return statementsStartWithGuard(body.statements);
}

type InlineAction = { line: number; rest: readonly ts.Statement[] };

type InlineScan = {
  actions: InlineAction[];
  /** The file starts with the "use server" directive. */
  fileLevel: boolean;
  /** "use server" strings that are neither the file's nor a function's directive. */
  strays: string[];
  /** For a file under src/app/admin/: the file-level directive and the strays. */
  problems: string[];
};

/** Functions whose body starts with the "use server" directive, and stray "use server" strings. */
function scanInlineActions(source: ts.SourceFile): InlineScan {
  const actions: InlineAction[] = [];
  const directiveNodes = new Set<ts.Node>();
  const line = (node: ts.Node) => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;

  const fileDirectives = splitDirectives(source.statements);
  source.statements.slice(0, fileDirectives.directives.length).forEach((s) => directiveNodes.add(s));

  const visit = (node: ts.Node): void => {
    if (
      (ts.isFunctionDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isArrowFunction(node) ||
        ts.isMethodDeclaration(node)) &&
      node.body &&
      ts.isBlock(node.body)
    ) {
      const { directives, rest } = splitDirectives(node.body.statements);
      if (directives.includes(USE_SERVER)) {
        actions.push({ line: line(node), rest });
        node.body.statements.slice(0, directives.length).forEach((s) => directiveNodes.add(s));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  const fileLevel = fileDirectives.directives.includes(USE_SERVER);
  const strayNodes: ts.Node[] = [];
  const findStrays = (node: ts.Node): void => {
    if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      node.text === USE_SERVER &&
      !directiveNodes.has(node.parent)
    ) {
      strayNodes.push(node);
    }
    ts.forEachChild(node, findStrays);
  };
  findStrays(source);
  const strays = strayNodes.map((stray) => `"use server" the scan cannot place, line ${line(stray)}`);

  const problems = [
    ...(fileLevel ? ["file-level \"use server\": put admin actions in src/lib/actions/ (scanned there)"] : []),
    ...strays,
  ];
  return { actions, fileLevel, strays, problems };
}

const isUnder = (relativePath: string, dir: string) => relativePath.startsWith(path.relative(ROOT, dir) + path.sep);

/**
 * Server actions of one file outside src/app/admin/ that are neither admin
 * actions the scan guards nor listed as public (see the module comment).
 */
function unaccountedServerActions(relativePath: string, source: ts.SourceFile): string[] {
  const { actions, fileLevel, strays } = scanInlineActions(source);
  const failures = [...strays];
  if (
    fileLevel &&
    !(isUnder(relativePath, ACTIONS_DIR) && isAdminActionFile(relativePath, source)) &&
    !OTHER_ACTION_FILES.has(relativePath)
  ) {
    failures.push(
      "file-level \"use server\" outside the admin action files: put admin actions in src/lib/actions/ with admin in the path, or list the file in OTHER_ACTION_FILES"
    );
  }
  const listed = PUBLIC_INLINE_ACTIONS[relativePath];
  const expected = listed?.count ?? 0;
  if (actions.length !== expected) {
    failures.push(
      `${actions.length} inline server action(s), PUBLIC_INLINE_ACTIONS lists ${expected}: guard admin actions under src/app/admin/, or list public ones`
    );
  }
  if (listed) {
    for (const action of actions) {
      if (!isOnlyAwaitedCall(action.rest, listed.call)) {
        failures.push(`line ${action.line}: a listed public action must be only \`await ${listed.call}(...)\``);
      }
    }
  }
  return failures;
}

/** `await <name>(...)` and nothing else. */
function isOnlyAwaitedCall(statements: readonly ts.Statement[], name: string): boolean {
  if (statements.length !== 1) return false;
  const [only] = statements;
  if (!ts.isExpressionStatement(only) || !ts.isAwaitExpression(only.expression)) return false;
  const call = only.expression.expression;
  return ts.isCallExpression(call) && ts.isIdentifier(call.expression) && call.expression.text === name;
}

/** `await signOut(...)` and nothing else. */
function isSignOutOnly(statements: readonly ts.Statement[]): boolean {
  return isOnlyAwaitedCall(statements, "signOut");
}

/** Inline actions of one file under src/app/admin that are not guarded (and not the exempt sign-out). */
function unguardedInlineActions(relativePath: string, source: ts.SourceFile): string[] {
  const { actions } = scanInlineActions(source);
  const guarded = (action: InlineAction) =>
    statementsStartWithGuard(action.rest) ||
    (relativePath === ADMIN_LAYOUT && isSignOutOnly(action.rest));
  const failures = actions.filter((action) => !guarded(action)).map((action) => `line ${action.line}`);
  const needsImport = actions.some((action) => statementsStartWithGuard(action.rest));
  if (needsImport && !importsRequireAdmin(source)) failures.push("requireAdmin not imported from @/lib/auth-utils");
  return failures;
}

function scanExports(
  source: ts.SourceFile,
  isGuardedName: (name: string) => boolean,
  isAllowedValue: (name: string) => boolean
): ScanResult {
  const functions: ExportedFunction[] = [];
  const problems: string[] = [];

  for (const statement of source.statements) {
    if (ts.isExportDeclaration(statement) || ts.isExportAssignment(statement)) {
      problems.push(`unsupported export form: ${statement.getText(source).slice(0, 80)}`);
      continue;
    }
    if (!isExported(statement)) continue;
    if (isDefaultExport(statement)) {
      problems.push("default export");
      continue;
    }

    if (ts.isFunctionDeclaration(statement)) {
      const name = statement.name?.text ?? "<anonymous>";
      if (isGuardedName(name)) functions.push({ name, node: statement });
      else problems.push(`unexpected exported function ${name}`);
      continue;
    }

    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        const name = ts.isIdentifier(declaration.name) ? declaration.name.text : "<pattern>";
        const init = declaration.initializer;
        if (isGuardedName(name)) {
          if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
            functions.push({ name, node: init });
          } else {
            problems.push(`${name} is not a plain function the scan can check`);
          }
        } else if (!isAllowedValue(name)) {
          problems.push(`unexpected export ${name}`);
        }
      }
      continue;
    }

    // Types and interfaces are erased; anything else is unexpected.
    if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) continue;
    problems.push(`unsupported export: ${ts.SyntaxKind[statement.kind]}`);
  }

  return { functions, problems };
}

const relative = (file: string) => path.relative(ROOT, file);

const routeFiles = findRouteFiles(ADMIN_API_DIR).sort();
const routeScans = routeFiles.map((file) => {
  const source = parse(file);
  return {
    file: relative(file),
    source,
    ...scanExports(
      source,
      (name) => HTTP_METHODS.has(name),
      (name) => ROUTE_CONFIG_EXPORTS.has(name)
    ),
  };
});
const routeHandlers = routeScans.flatMap((scan) =>
  scan.functions.map((fn) => ({ label: `${scan.file} ${fn.name}`, fn }))
);

const actionFiles = findFiles(ACTIONS_DIR, SOURCE_FILE)
  .map((file) => ({ file: relative(file), source: parse(file) }))
  .filter(({ file, source }) => isAdminActionFile(file, source))
  .sort((a, b) => a.file.localeCompare(b.file))
  .map(({ file, source }) => ({
    file,
    source,
    ...scanExports(
      source,
      () => true,
      () => false
    ),
  }));
const actionFunctions = actionFiles.flatMap((scan) =>
  scan.functions.map((fn) => ({ label: `${scan.file} ${fn.name}`, fn }))
);

const adminAppFiles = findFiles(ADMIN_APP_DIR, SOURCE_FILE)
  .map((file) => ({ file: relative(file), source: parse(file) }))
  .sort((a, b) => a.file.localeCompare(b.file));

// Everything else in src/ (src/app/admin/ is covered by the inline scan above).
const otherSrcFiles = findFiles(SRC_DIR, SOURCE_FILE)
  .map(relative)
  .filter((file) => !isUnder(file, ADMIN_APP_DIR))
  .sort()
  .map((file) => ({ file, source: parse(path.join(ROOT, file)) }));

describe("admin API route handlers (src/app/api/admin/**/route.ts)", () => {
  it("finds the admin routes on disk", () => {
    expect(routeFiles.length).toBeGreaterThanOrEqual(19);
    expect(routeHandlers.length).toBeGreaterThanOrEqual(27);
  });

  it.each(routeScans)("$file exports only handlers the scan understands", ({ problems }) => {
    expect(problems).toEqual([]);
  });

  it.each(routeScans)("$file imports requireAdmin from @/lib/auth-utils", ({ source }) => {
    expect(importsRequireAdmin(source)).toBe(true);
  });

  it.each(routeHandlers)("$label starts with await requireAdmin()", ({ fn }) => {
    expect(startsWithGuard(fn.node)).toBe(true);
  });
});

describe("admin server action files (src/lib/actions/**, \"use server\", path contains admin)", () => {
  it("finds admin-actions.ts and its actions", () => {
    expect(actionFiles.map((scan) => scan.file)).toContain(path.join("src", "lib", "actions", "admin-actions.ts"));
    expect(actionFunctions.length).toBeGreaterThanOrEqual(8);
  });

  it.each(actionFiles)("$file exports only functions the scan understands", ({ problems }) => {
    expect(problems).toEqual([]);
  });

  it.each(actionFiles)("$file imports requireAdmin from @/lib/auth-utils", ({ source }) => {
    expect(importsRequireAdmin(source)).toBe(true);
  });

  it.each(actionFunctions)("$label starts with await requireAdmin()", ({ fn }) => {
    expect(startsWithGuard(fn.node)).toBe(true);
  });
});

describe("inline server actions (src/app/admin/**)", () => {
  // Plain loops, not it.each: there may legitimately be no inline action in a page.
  it("finds the admin files and the layout's sign-out action", () => {
    const files = adminAppFiles.map((entry) => entry.file);
    expect(files.filter((file) => /page\.tsx$/.test(file)).length).toBeGreaterThanOrEqual(8);
    const layout = adminAppFiles.find((entry) => entry.file === ADMIN_LAYOUT);
    expect(layout && scanInlineActions(layout.source).actions.length).toBeGreaterThanOrEqual(1);
  });

  it("every \"use server\" is a function directive the scan understands", () => {
    const problems = adminAppFiles.flatMap(({ file, source }) =>
      scanInlineActions(source).problems.map((problem) => `${file}: ${problem}`)
    );
    expect(problems).toEqual([]);
  });

  it("every inline action starts with await requireAdmin() (only the layout sign-out is exempt)", () => {
    const failures = adminAppFiles.flatMap(({ file, source }) =>
      unguardedInlineActions(file, source).map((failure) => `${file}: ${failure}`)
    );
    expect(failures).toEqual([]);
  });
});

describe("every other server action in src/ is listed", () => {
  it("finds the source files and the listed public actions", () => {
    const files = otherSrcFiles.map((entry) => entry.file);
    expect(files.length).toBeGreaterThanOrEqual(300);
    for (const file of Object.keys(PUBLIC_INLINE_ACTIONS)) expect(files).toContain(file);
    for (const file of OTHER_ACTION_FILES) expect(files).toContain(file);
  });

  it("has no unlisted \"use server\" file or inline action outside src/app/admin/", () => {
    const failures = otherSrcFiles.flatMap(({ file, source }) =>
      unaccountedServerActions(file, source).map((failure) => `${file}: ${failure}`)
    );
    expect(failures).toEqual([]);
  });
});

describe("the scan itself", () => {
  const check = (code: string) => {
    const source = ts.createSourceFile("probe.ts", code, ts.ScriptTarget.Latest, true);
    const scan = scanExports(source, (name) => HTTP_METHODS.has(name), (name) => ROUTE_CONFIG_EXPORTS.has(name));
    return { ...scan, guarded: scan.functions.map((fn) => startsWithGuard(fn.node)) };
  };

  it.each([
    ["a guard in a nested callback", "export async function GET() { const f = async () => { await requireAdmin(); }; await f(); }"],
    ["a conditional guard", "export async function GET(r) { if (r) { await requireAdmin(); } }"],
    ["a guard after other work", "export async function GET() { try { await load(); await requireAdmin(); } catch {} }"],
    ["an un-awaited guard", "export async function GET() { try { requireAdmin(); } catch {} }"],
    ["a guard with arguments", "export async function GET() { await requireAdmin(x); }"],
  ])("rejects %s", (_label, code) => {
    expect(check(code).guarded).toEqual([false]);
  });

  it.each([
    ["a guard first in try", "export async function GET() { try { await requireAdmin(); } catch {} }"],
    ["an assigned guard", "export const POST = async () => { const s = await requireAdmin(); return s; };"],
  ])("accepts %s", (_label, code) => {
    expect(check(code).guarded).toEqual([true]);
  });

  // A failed guard throws into the catch. If the catch can finish normally,
  // whatever follows the try runs without an admin.
  describe("a guard in a try followed by more code", () => {
    it.each([
      [
        "a catch that only logs",
        `export async function GET() {
          try { await requireAdmin(); } catch (error) { console.error(error); }
          return Response.json(await prisma.user.findMany());
        }`,
      ],
      [
        "a catch that returns on one path only",
        `export async function GET() {
          try { await requireAdmin(); } catch (error) {
            if (error instanceof AuthError) { return deny(error); }
            console.error(error);
          }
          return Response.json(await prisma.user.findMany());
        }`,
      ],
      [
        "a catch whose return is not its last statement on every path",
        `export async function GET() {
          try { await requireAdmin(); } catch (error) { if (error) return deny(error); }
          return Response.json(await prisma.user.findMany());
        }`,
      ],
      [
        "a finally block (it runs after a failed guard)",
        `export async function GET() {
          try { await requireAdmin(); return ok(); } catch (error) { return deny(error); }
          finally { await prisma.user.findMany(); }
        }`,
      ],
    ])("rejects %s", (_label, code) => {
      expect(check(code).guarded).toEqual([false]);
    });

    it.each([
      [
        "a catch that ends in return",
        `export async function GET() {
          try { await requireAdmin(); const users = await prisma.user.findMany(); return Response.json(users); }
          catch (error) { console.error(error); return deny(error); }
        }`,
      ],
      [
        "a catch that ends in throw, with code after the try",
        `export async function GET() {
          try { await requireAdmin(); } catch (error) { console.error(error); throw error; }
          return Response.json(await prisma.user.findMany());
        }`,
      ],
      [
        "a catch whose if/else ends in return or throw on both paths",
        `export async function GET() {
          try { await requireAdmin(); } catch (error) {
            if (error instanceof AuthError) { return deny(error); } else { throw error; }
          }
          return Response.json(await prisma.user.findMany());
        }`,
      ],
      [
        "a swallowing catch when the try is the last statement",
        `export async function GET() {
          try { await requireAdmin(); return Response.json(await prisma.user.findMany()); }
          catch (error) { console.error(error); }
        }`,
      ],
    ])("accepts %s", (_label, code) => {
      expect(check(code).guarded).toEqual([true]);
    });
  });

  it.each([
    ["a re-export", "export { handler as GET } from './x';"],
    ["a wrapped handler", "export const GET = withAdmin(handler);"],
    ["an unknown export", "export function helper() {}"],
    ["a default export", "export default function handler() {}"],
  ])("flags %s", (_label, code) => {
    expect(check(code).problems.length).toBeGreaterThan(0);
  });

  describe("admin action file discovery", () => {
    const isAction = (file: string, code: string) => isAdminActionFile(file, parseSource(file, code));

    it.each([
      ["admin-actions.ts", "src/lib/actions/admin-actions.ts", '"use server";\nexport async function a() {}'],
      ["a nested admin directory", "src/lib/actions/admin/users.ts", "'use server';"],
      ["admin in a nested file name", "src/lib/actions/billing/admin-credits.ts", '"use server";'],
      ["a doc comment before the directive", "src/lib/actions/admin-x.ts", '/** doc */\n"use server";'],
      ["another directive first", "src/lib/actions/Admin-y.ts", '"use strict";\n"use server";'],
    ])("includes %s", (_label, file, code) => {
      expect(isAction(file, code)).toBe(true);
    });

    it.each([
      ["no admin in the path", "src/lib/actions/user-actions.ts", '"use server";'],
      ["no directive", "src/lib/actions/admin-helpers.ts", "export function f() {}"],
      ["a directive after an import (not a directive)", "src/lib/actions/admin-z.ts", 'import x from "y";\n"use server";'],
    ])("excludes %s", (_label, file, code) => {
      expect(isAction(file, code)).toBe(false);
    });
  });

  describe("inline server actions under src/app/admin", () => {
    const PAGE = path.join("src", "app", "admin", "users", "page.tsx");
    const IMPORT = 'import { requireAdmin } from "@/lib/auth-utils";\n';
    const inline = (file: string, code: string) => {
      const source = parseSource(file, code);
      return { ...scanInlineActions(source), failures: unguardedInlineActions(file, source) };
    };

    it.each([
      [
        "an arrow action guarded first",
        PAGE,
        `${IMPORT}export default async function Page() {
          return <form action={async (fd: FormData) => { "use server"; await requireAdmin(); await save(fd); }} />;
        }`,
      ],
      [
        "a function declaration guarded first",
        PAGE,
        `${IMPORT}export default async function Page() {
          async function save(fd: FormData) { "use server"; const s = await requireAdmin(); await store(s, fd); }
          return <form action={save} />;
        }`,
      ],
      [
        "a guard first in a try whose catch ends in throw",
        PAGE,
        `${IMPORT}export default function Page() {
          return <form action={async () => { "use server"; try { await requireAdmin(); } catch (e) { throw e; } await go(); }} />;
        }`,
      ],
      [
        "the layout's sign-out action",
        ADMIN_LAYOUT,
        `export default function Layout() {
          return <form action={async () => { "use server"; await signOut({ redirectTo: "/admin-login" }); }} />;
        }`,
      ],
      ["a page with no inline action", PAGE, "export default function Page() { return <div />; }"],
    ])("accepts %s", (_label, file, code) => {
      const result = inline(file, code);
      expect(result.problems).toEqual([]);
      expect(result.failures).toEqual([]);
    });

    it.each([
      [
        "an unguarded action",
        PAGE,
        `${IMPORT}export default function Page() {
          return <form action={async (fd: FormData) => { "use server"; await prisma.user.delete({ where: { id: fd.get("id") } }); }} />;
        }`,
      ],
      [
        "a guard after other work",
        PAGE,
        `${IMPORT}export default function Page() {
          return <form action={async () => { "use server"; await load(); await requireAdmin(); }} />;
        }`,
      ],
      [
        "an un-awaited guard",
        PAGE,
        `${IMPORT}export default function Page() {
          return <form action={async () => { "use server"; requireAdmin(); await go(); }} />;
        }`,
      ],
      [
        "a sign-out-only action outside the layout",
        PAGE,
        `export default function Page() {
          return <form action={async () => { "use server"; await signOut(); }} />;
        }`,
      ],
      [
        "a layout action that does more than sign out",
        ADMIN_LAYOUT,
        `export default function Layout() {
          return <form action={async () => { "use server"; await signOut(); await prisma.user.deleteMany(); }} />;
        }`,
      ],
      [
        "a layout action that does something else first",
        ADMIN_LAYOUT,
        `export default function Layout() {
          return <form action={async () => { "use server"; await audit(); await signOut(); }} />;
        }`,
      ],
      [
        "a guarded action without the requireAdmin import",
        PAGE,
        `export default function Page() {
          return <form action={async () => { "use server"; await requireAdmin(); await go(); }} />;
        }`,
      ],
    ])("rejects %s", (_label, file, code) => {
      const result = inline(file, code);
      expect(result.actions.length).toBeGreaterThan(0);
      expect(result.failures.length).toBeGreaterThan(0);
    });

    it.each([
      ["a file-level directive", PAGE, '"use server";\nexport async function act() { await go(); }'],
      [
        "a directive after another statement (not a directive)",
        PAGE,
        `export default function Page() {
          return <form action={async () => { await go(); "use server"; }} />;
        }`,
      ],
      ["the string elsewhere", PAGE, 'const mode = "use server";\nexport default function Page() { return <div />; }'],
    ])("flags %s as a problem", (_label, file, code) => {
      expect(inline(file, code).problems.length).toBeGreaterThan(0);
    });
  });

  describe("server actions elsewhere in src/", () => {
    const LOGIN = path.join("src", "app", "login", "page.tsx");
    const unaccounted = (file: string, code: string) => unaccountedServerActions(file, parseSource(file, code));
    const action = 'async () => { "use server"; await go(); }';
    const signInAction = 'async () => { "use server"; await signIn("kakao", { redirectTo }); }';

    it.each([
      ["an admin action file", path.join("src", "lib", "actions", "admin-actions.ts"), '"use server";\nexport async function a() {}'],
      ["the listed login actions", LOGIN, `export default function P() { return <><form action={${signInAction}} /><form action={${signInAction}} /></>; }`],
      ["a file without server actions", path.join("src", "lib", "rag.ts"), "export async function f() {}"],
    ])("accepts %s", (_label, file, code) => {
      expect(unaccounted(file, code)).toEqual([]);
    });

    it.each([
      ["a \"use server\" file outside src/lib/actions", path.join("src", "features", "admin", "actions.ts"), '"use server";\nexport async function a() {}'],
      ["a \"use server\" file without admin in the path", path.join("src", "lib", "actions", "user-actions.ts"), '"use server";\nexport async function a() {}'],
      ["an inline action in an unlisted page", path.join("src", "app", "(app)", "settings", "page.tsx"), `export default function P() { return <form action={${action}} />; }`],
      ["a third login action", LOGIN, `export default function P() { return <><form action={${signInAction}} /><form action={${signInAction}} /><form action={${signInAction}} /></>; }`],
      ["a login action replaced by another call (same count)", LOGIN, `export default function P() { return <><form action={${signInAction}} /><form action={${action}} /></>; }`],
      [
        "a login action that does more than sign in",
        LOGIN,
        `export default function P() { return <><form action={${signInAction}} /><form action={async () => { "use server"; await prisma.user.deleteMany(); await signIn("google"); }} /></>; }`,
      ],
      ["a stray \"use server\" string", path.join("src", "lib", "x.ts"), 'export const mode = "use server";'],
    ])("rejects %s", (_label, file, code) => {
      expect(unaccounted(file, code).length).toBeGreaterThan(0);
    });
  });
});
