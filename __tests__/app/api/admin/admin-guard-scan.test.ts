/**
 * Every admin API handler and every admin server action must start with
 * `await requireAdmin()` in its own body (first statement, or first statement
 * of a top-level `try`). Files are discovered from disk and parsed with the
 * TypeScript compiler, so a new handler or action is covered automatically,
 * and an export form the scan does not understand fails the test.
 *
 * @jest-environment node
 */

import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = process.cwd();
const ADMIN_API_DIR = path.join(ROOT, "src", "app", "api", "admin");
const ADMIN_ACTIONS_FILE = path.join(ROOT, "src", "lib", "actions", "admin-actions.ts");

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

function findRouteFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return findRouteFiles(full);
    return /^route\.(ts|tsx|js|jsx)$/.test(entry.name) ? [full] : [];
  });
}

function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
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

function startsWithGuard(fn: FunctionNode): boolean {
  const body = fn.body;
  if (!body || !ts.isBlock(body)) return false;
  const [first] = body.statements;
  if (isGuardStatement(first)) return true;
  return !!first && ts.isTryStatement(first) && isGuardStatement(first.tryBlock.statements[0]);
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

const actionsSource = parse(ADMIN_ACTIONS_FILE);
const actionsScan = scanExports(
  actionsSource,
  () => true,
  () => false
);

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

describe("admin server actions (src/lib/actions/admin-actions.ts)", () => {
  it("finds the actions", () => {
    expect(actionsScan.functions.length).toBeGreaterThanOrEqual(8);
  });

  it("exports only functions the scan understands", () => {
    expect(actionsScan.problems).toEqual([]);
  });

  it("imports requireAdmin from @/lib/auth-utils", () => {
    expect(importsRequireAdmin(actionsSource)).toBe(true);
  });

  it.each(actionsScan.functions.map((fn) => ({ name: fn.name, fn })))(
    "$name starts with await requireAdmin()",
    ({ fn }) => {
      expect(startsWithGuard(fn.node)).toBe(true);
    }
  );
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

  it.each([
    ["a re-export", "export { handler as GET } from './x';"],
    ["a wrapped handler", "export const GET = withAdmin(handler);"],
    ["an unknown export", "export function helper() {}"],
    ["a default export", "export default function handler() {}"],
  ])("flags %s", (_label, code) => {
    expect(check(code).problems.length).toBeGreaterThan(0);
  });
});
