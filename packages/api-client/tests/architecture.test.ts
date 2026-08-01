import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, expect, it } from "vitest";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(packageRoot, "../..");
const handwrittenRoots = [join(packageRoot, "src"), join(repositoryRoot, "apps/web/src")];
const metadataFields = new Set([
  "api_version",
  "application_name",
  "application_version",
  "build_commit",
  "feature_flags",
]);
const compilerOptions: ts.CompilerOptions = {
  jsx: ts.JsxEmit.ReactJSX,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  noEmit: true,
  skipLibCheck: true,
  strict: true,
  target: ts.ScriptTarget.ES2024,
};
const zodObjectConstructors = new Set(["looseObject", "object", "strictObject"]);
const zodStringConstructors = new Set(["enum", "literal", "string"]);

type DtoKind = "generated liveness/readiness response" | "generated metadata response";

type DtoViolation = Readonly<{
  fileName: string;
  kind: DtoKind;
  line: number;
}>;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (path.includes("/generated/")) return [];
    return statSync(path).isDirectory()
      ? sourceFiles(path)
      : path.endsWith(".ts") || path.endsWith(".tsx")
        ? [path]
        : [];
  });
}

function normalizedPath(path: string): string {
  return path.replaceAll("\\", "/");
}

function isGeneratedDeclaration(declaration: ts.Declaration): boolean {
  return normalizedPath(declaration.getSourceFile().fileName).includes("/src/generated/");
}

function isZodDeclaration(declaration: ts.Declaration): boolean {
  return normalizedPath(declaration.getSourceFile().fileName).includes("/node_modules/zod/");
}

function rootSymbols(checker: ts.TypeChecker, symbol: ts.Symbol): readonly ts.Symbol[] {
  const resolved = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  const roots = checker.getRootSymbols(resolved);
  return roots.length === 0 ? [resolved] : roots;
}

function propertyIsGenerated(checker: ts.TypeChecker, symbol: ts.Symbol): boolean {
  const roots = rootSymbols(checker, symbol);
  return roots.every((root) => {
    const declarations = root.getDeclarations() ?? [];
    return declarations.length !== 0 && declarations.every(isGeneratedDeclaration);
  });
}

function resolvedPropertyParts(
  checker: ts.TypeChecker,
  property: ts.Symbol,
  location: ts.Node,
  allowOptional: boolean,
): readonly ts.Type[] | undefined {
  const optional = (property.flags & ts.SymbolFlags.Optional) !== 0;
  if (optional && !allowOptional) return undefined;
  const value = checker.getTypeOfSymbolAtLocation(property, location);
  const parts = value.isUnion() ? value.types : [value];
  const concrete = allowOptional
    ? parts.filter((part) => (part.flags & ts.TypeFlags.Undefined) === 0)
    : parts;
  return concrete.length === 0 ? undefined : concrete;
}

function isStringEquivalent(checker: ts.TypeChecker, type: ts.Type): boolean {
  const plainString = checker.getStringType();
  return (
    checker.isTypeAssignableTo(type, plainString) && checker.isTypeAssignableTo(plainString, type)
  );
}

function isStringProperty(
  checker: ts.TypeChecker,
  property: ts.Symbol,
  location: ts.Node,
): boolean {
  const parts = resolvedPropertyParts(checker, property, location, true);
  return parts !== undefined && parts.every((part) => isStringEquivalent(checker, part));
}

function isNullableStringProperty(
  checker: ts.TypeChecker,
  property: ts.Symbol,
  location: ts.Node,
): boolean {
  const parts = resolvedPropertyParts(checker, property, location, true);
  return (
    parts !== undefined &&
    parts.some((part) => isStringEquivalent(checker, part)) &&
    parts.some((part) => (part.flags & ts.TypeFlags.Null) !== 0) &&
    parts.every(
      (part) => isStringEquivalent(checker, part) || (part.flags & ts.TypeFlags.Null) !== 0,
    )
  );
}

function isObjectProperty(
  checker: ts.TypeChecker,
  property: ts.Symbol,
  location: ts.Node,
): boolean {
  const parts = resolvedPropertyParts(checker, property, location, true);
  return parts !== undefined && parts.every((part) => (part.flags & ts.TypeFlags.Object) !== 0);
}

function duplicateKindsForType(
  checker: ts.TypeChecker,
  type: ts.Type,
  location: ts.Node,
): Set<DtoKind> {
  const kinds = new Set<DtoKind>();
  const inspect = (candidate: ts.Type): void => {
    if (candidate.isUnion()) {
      for (const part of candidate.types) inspect(part);
      return;
    }
    const apparent = checker.getApparentType(candidate);
    const properties = new Map(
      checker.getPropertiesOfType(apparent).map((property) => [property.getName(), property]),
    );
    const status = properties.get("status");
    if (
      status !== undefined &&
      !propertyIsGenerated(checker, status) &&
      isStringProperty(checker, status, location)
    ) {
      kinds.add("generated liveness/readiness response");
    }
    if ([...metadataFields].every((field) => properties.has(field))) {
      const apiVersion = properties.get("api_version");
      const applicationName = properties.get("application_name");
      const applicationVersion = properties.get("application_version");
      const buildCommit = properties.get("build_commit");
      const featureFlags = properties.get("feature_flags");
      const metadataProperties = [
        apiVersion,
        applicationName,
        applicationVersion,
        buildCommit,
        featureFlags,
      ];
      if (
        metadataProperties.some(
          (property) => property !== undefined && !propertyIsGenerated(checker, property),
        ) &&
        apiVersion !== undefined &&
        isStringProperty(checker, apiVersion, location) &&
        applicationName !== undefined &&
        isStringProperty(checker, applicationName, location) &&
        applicationVersion !== undefined &&
        isStringProperty(checker, applicationVersion, location) &&
        buildCommit !== undefined &&
        isNullableStringProperty(checker, buildCommit, location) &&
        featureFlags !== undefined &&
        isObjectProperty(checker, featureFlags, location)
      ) {
        kinds.add("generated metadata response");
      }
    }
  };
  inspect(type);
  return kinds;
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  if (
    ts.isAsExpression(expression) ||
    ts.isSatisfiesExpression(expression) ||
    ts.isTypeAssertionExpression(expression) ||
    ts.isNonNullExpression(expression) ||
    ts.isParenthesizedExpression(expression)
  ) {
    return unwrapExpression(expression.expression);
  }
  return expression;
}

function zodExportNames(
  checker: ts.TypeChecker,
  expression: ts.Expression,
  seenSymbols = new Set<ts.Symbol>(),
): Set<string> {
  const unwrapped = unwrapExpression(expression);
  const lookup = ts.isPropertyAccessExpression(unwrapped) ? unwrapped.name : unwrapped;
  const symbol = checker.getSymbolAtLocation(lookup);
  return symbol === undefined ? new Set() : zodExportNamesForSymbol(checker, symbol, seenSymbols);
}

function zodExportNamesForSymbol(
  checker: ts.TypeChecker,
  symbol: ts.Symbol,
  seenSymbols: Set<ts.Symbol>,
): Set<string> {
  if (seenSymbols.has(symbol)) return new Set();
  seenSymbols.add(symbol);

  const names = new Set<string>();
  for (const root of rootSymbols(checker, symbol)) {
    if ((root.getDeclarations() ?? []).some(isZodDeclaration)) names.add(root.getName());
  }
  for (const declaration of symbol.getDeclarations() ?? []) {
    if (ts.isVariableDeclaration(declaration) && declaration.initializer !== undefined) {
      for (const name of zodExportNames(checker, declaration.initializer, seenSymbols)) {
        names.add(name);
      }
    } else if (ts.isBindingElement(declaration)) {
      const bindingPattern = declaration.parent;
      const variable = bindingPattern.parent;
      if (
        !ts.isObjectBindingPattern(bindingPattern) ||
        !ts.isVariableDeclaration(variable) ||
        variable.initializer === undefined
      ) {
        continue;
      }
      const memberName = declaration.propertyName ?? declaration.name;
      if (!ts.isIdentifier(memberName) && !ts.isStringLiteral(memberName)) continue;
      const member = checker.getPropertyOfType(
        checker.getTypeAtLocation(variable.initializer),
        memberName.text,
      );
      if (member === undefined) continue;
      for (const name of zodExportNamesForSymbol(checker, member, seenSymbols)) {
        names.add(name);
      }
    }
  }
  return names;
}

function objectLiteralForExpression(
  checker: ts.TypeChecker,
  expression: ts.Expression,
  seenSymbols = new Set<ts.Symbol>(),
): ts.ObjectLiteralExpression | undefined {
  const unwrapped = unwrapExpression(expression);
  if (ts.isObjectLiteralExpression(unwrapped)) return unwrapped;
  if (!ts.isIdentifier(unwrapped)) return undefined;
  const symbol = checker.getSymbolAtLocation(unwrapped);
  if (symbol === undefined || seenSymbols.has(symbol)) return undefined;
  seenSymbols.add(symbol);
  for (const declaration of symbol.getDeclarations() ?? []) {
    if (ts.isVariableDeclaration(declaration) && declaration.initializer !== undefined) {
      const objectLiteral = objectLiteralForExpression(
        checker,
        declaration.initializer,
        seenSymbols,
      );
      if (objectLiteral !== undefined) return objectLiteral;
    }
  }
  return undefined;
}

function propertyName(node: ts.PropertyName): string | undefined {
  return ts.isIdentifier(node) || ts.isStringLiteral(node) ? node.text : undefined;
}

function zodShapeFields(
  checker: ts.TypeChecker,
  objectLiteral: ts.ObjectLiteralExpression,
): Map<string, ts.Expression> {
  const fields = new Map<string, ts.Expression>();
  const collect = (literal: ts.ObjectLiteralExpression): void => {
    for (const property of literal.properties) {
      if (ts.isPropertyAssignment(property)) {
        const name = propertyName(property.name);
        if (name !== undefined) fields.set(name, property.initializer);
      } else if (ts.isShorthandPropertyAssignment(property)) {
        fields.set(property.name.text, property.name);
      } else if (ts.isSpreadAssignment(property)) {
        const spread = objectLiteralForExpression(checker, property.expression);
        if (spread !== undefined) collect(spread);
      }
    }
  };
  collect(objectLiteral);
  return fields;
}

function isZodStringSchema(checker: ts.TypeChecker, expression: ts.Expression): boolean {
  const unwrapped = unwrapExpression(expression);
  if (ts.isIdentifier(unwrapped)) {
    const symbol = checker.getSymbolAtLocation(unwrapped);
    for (const declaration of symbol?.getDeclarations() ?? []) {
      if (
        ts.isVariableDeclaration(declaration) &&
        declaration.initializer !== undefined &&
        isZodStringSchema(checker, declaration.initializer)
      ) {
        return true;
      }
    }
    return false;
  }
  if (!ts.isCallExpression(unwrapped)) return false;
  if (
    [...zodExportNames(checker, unwrapped.expression)].some((name) =>
      zodStringConstructors.has(name),
    )
  ) {
    return true;
  }
  return (
    ts.isPropertyAccessExpression(unwrapped.expression) &&
    isZodStringSchema(checker, unwrapped.expression.expression)
  );
}

function duplicateZodKind(checker: ts.TypeChecker, call: ts.CallExpression): DtoKind | undefined {
  if (
    ![...zodExportNames(checker, call.expression)].some((name) => zodObjectConstructors.has(name))
  ) {
    return undefined;
  }
  const argument = call.arguments[0];
  if (argument === undefined) return undefined;
  const objectLiteral = objectLiteralForExpression(checker, argument);
  if (objectLiteral === undefined) return undefined;
  const fields = zodShapeFields(checker, objectLiteral);
  const status = fields.get("status");
  if (status !== undefined && isZodStringSchema(checker, status)) {
    return "generated liveness/readiness response";
  }
  if ([...metadataFields].every((field) => fields.has(field))) {
    return "generated metadata response";
  }
  return undefined;
}

function violationsForProgram(program: ts.Program, rootNames: ReadonlySet<string>): DtoViolation[] {
  const checker = program.getTypeChecker();
  const violations = new Map<string, DtoViolation>();
  for (const source of program.getSourceFiles()) {
    if (!rootNames.has(resolve(source.fileName))) continue;
    const record = (node: ts.Node, kind: DtoKind): void => {
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      violations.set(`${source.fileName}:${String(node.pos)}:${kind}`, {
        fileName: source.fileName,
        kind,
        line,
      });
    };
    const inspect = (node: ts.Node): void => {
      if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) {
        for (const kind of duplicateKindsForType(checker, checker.getTypeAtLocation(node), node)) {
          record(node, kind);
        }
      } else if (ts.isTypeNode(node)) {
        for (const kind of duplicateKindsForType(checker, checker.getTypeAtLocation(node), node)) {
          record(node, kind);
        }
      }
      if (ts.isCallExpression(node)) {
        const duplicate = duplicateZodKind(checker, node);
        if (duplicate !== undefined) record(node, duplicate);
      }
      ts.forEachChild(node, inspect);
    };
    inspect(source);
  }
  return [...violations.values()];
}

function fixtureViolations(sourceText: string): DtoViolation[] {
  const fixturePath = join(packageRoot, "__architecture-fixture__.ts");
  const moduleSource = `export {};\n${sourceText}`;
  const host = ts.createCompilerHost(compilerOptions);
  const originalGetSourceFile = host.getSourceFile.bind(host);
  host.fileExists = (fileName) => resolve(fileName) === fixturePath || ts.sys.fileExists(fileName);
  host.readFile = (fileName) =>
    resolve(fileName) === fixturePath ? moduleSource : ts.sys.readFile(fileName);
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) =>
    resolve(fileName) === fixturePath
      ? ts.createSourceFile(fileName, moduleSource, languageVersion, true, ts.ScriptKind.TS)
      : originalGetSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
  const program = ts.createProgram({
    host,
    options: compilerOptions,
    rootNames: [fixturePath],
  });
  return violationsForProgram(program, new Set([fixturePath]));
}

const rejectedFixtures: ReadonlyArray<readonly [string, string, DtoKind]> = [
  [
    "direct liveness",
    "type Replica = { status: string };",
    "generated liveness/readiness response",
  ],
  [
    "generic-nested liveness",
    "type Result<T> = { data: T }; type Replica = Result<{ status: string }> ;",
    "generated liveness/readiness response",
  ],
  [
    "Readonly liveness",
    "type Replica = Readonly<{ status: string }> ;",
    "generated liveness/readiness response",
  ],
  [
    "alias-chain liveness",
    "type Text = string; type Shape = { status: Text }; type Replica = Shape;",
    "generated liveness/readiness response",
  ],
  [
    "intersection and union liveness",
    "type Replica = ({ status: string } & { observed: boolean }) | { offline: true };",
    "generated liveness/readiness response",
  ],
  [
    "array tuple and function liveness",
    "type Replica = Array<[() => { status: string }]>;",
    "generated liveness/readiness response",
  ],
  [
    "metadata",
    "type Replica = { api_version: string; application_name: string; application_version: string; build_commit: string | null; feature_flags: {} };",
    "generated metadata response",
  ],
  [
    "extended metadata",
    "type Replica = { api_version: string; application_name: string; application_version: string; build_commit: string | null; feature_flags: {}; extra: true };",
    "generated metadata response",
  ],
  [
    "Record liveness",
    'type Replica = Record<"status", string>;',
    "generated liveness/readiness response",
  ],
  [
    "Readonly Record liveness",
    'type Replica = Readonly<Record<"status", string>>;',
    "generated liveness/readiness response",
  ],
  [
    "Pick Required Partial liveness",
    'type Fields = Record<"status" | "other", string>; type Replica = Partial<Required<Pick<Fields, "status">>>;',
    "generated liveness/readiness response",
  ],
  [
    "mapped key-union liveness",
    'type HealthKey = "status"; type Replica = { [Key in HealthKey]: string };',
    "generated liveness/readiness response",
  ],
  [
    "mapped alias-chain liveness",
    'type HealthKey = "status"; type Mapped = Record<HealthKey, string>; type Replica = Mapped;',
    "generated liveness/readiness response",
  ],
  [
    "mapped metadata",
    'type MetadataKey = "api_version" | "application_name" | "application_version" | "build_commit" | "feature_flags"; type MetadataValue<Key> = Key extends "build_commit" ? string | null : Key extends "feature_flags" ? Record<string, never> : string; type Replica = { [Key in MetadataKey]: MetadataValue<Key> };',
    "generated metadata response",
  ],
  [
    "generic mapped instantiation",
    'type Envelope<T> = { data: T }; type HealthKey = "status"; type Replica = Envelope<Record<HealthKey, string>>;',
    "generated liveness/readiness response",
  ],
  [
    "string intersection liveness",
    'type Replica = Record<"status", string & {}>;',
    "generated liveness/readiness response",
  ],
  [
    "reversed string intersection liveness",
    'type Replica = Record<"status", {} & string>;',
    "generated liveness/readiness response",
  ],
  [
    "unknown string intersection liveness",
    'type Replica = Record<"status", string & unknown>;',
    "generated liveness/readiness response",
  ],
  [
    "Readonly string intersection liveness",
    'type Replica = Readonly<Record<"status", string & {}>>;',
    "generated liveness/readiness response",
  ],
  [
    "direct Zod liveness",
    'import { z } from "zod"; const replica = z.object({ status: z.string() });',
    "generated liveness/readiness response",
  ],
  [
    "aliased z import",
    'import { z as schema } from "zod"; const replica = schema.object({ status: schema.string() });',
    "generated liveness/readiness response",
  ],
  [
    "Zod namespace alias",
    'import * as schema from "zod"; const replica = schema.object({ status: schema.string() });',
    "generated liveness/readiness response",
  ],
  [
    "named Zod import aliases",
    'import { object as makeObject, string as makeString } from "zod"; const replica = makeObject({ status: makeString() });',
    "generated liveness/readiness response",
  ],
  [
    "local Zod constructor aliases",
    'import { z } from "zod"; const makeObject = z.object; const makeString = z.string; const replica = makeObject({ status: makeString() });',
    "generated liveness/readiness response",
  ],
  [
    "Zod strictObject alias",
    'import { z as schema } from "zod"; const makeObject = schema.strictObject; const replica = makeObject({ status: schema.string() });',
    "generated liveness/readiness response",
  ],
  [
    "Zod looseObject alias",
    'import * as schema from "zod"; const makeObject = schema.looseObject; const replica = makeObject({ status: schema.string() });',
    "generated liveness/readiness response",
  ],
  [
    "destructured Zod aliases with local chain",
    'import { z } from "zod"; const { object: makeObject, string: makeString } = z; const createObject = makeObject; const replica = createObject({ status: makeString() });',
    "generated liveness/readiness response",
  ],
  [
    "destructured Zod strictObject aliases",
    'import { z as schema } from "zod"; const { strictObject: makeObject, string: makeString } = schema; const replica = makeObject({ status: makeString() });',
    "generated liveness/readiness response",
  ],
  [
    "destructured Zod looseObject aliases",
    'import * as schema from "zod"; const { looseObject: makeObject, string: makeString } = schema; const replica = makeObject({ status: makeString() });',
    "generated liveness/readiness response",
  ],
  [
    "destructured Zod metadata aliases",
    'import { z } from "zod"; const { object: makeObject, string: makeString } = z; const replica = makeObject({ api_version: makeString(), application_name: makeString(), application_version: makeString(), build_commit: makeString(), feature_flags: makeObject({}) });',
    "generated metadata response",
  ],
];

const permittedFixtures: ReadonlyArray<readonly [string, string]> = [
  [
    "generic transport envelope",
    "type Result<T> = Readonly<{ data: T; kind: 'ok'; status: number }> | Readonly<{ kind: 'http-error'; status: number }> ;",
  ],
  [
    "internal status-state union",
    "type State = { kind: 'ready'; meta: null } | { kind: 'not-ready'; meta: null } ;",
  ],
  [
    "configuration control and timeout",
    "type Config = { origin: string }; type Control = { mode: 'ready' | 'disconnect' }; type Timeout = { timeoutMs?: number };",
  ],
  [
    "generated import and re-export",
    "import type { LiveResponse } from './src/generated/types.gen'; export type { LiveResponse };",
  ],
  [
    "generated-derived indexed access",
    "import type { LiveResponse, MetaResponse } from './src/generated/types.gen'; type HealthStatus = LiveResponse['status']; type Version = MetaResponse['api_version'];",
  ],
  [
    "generated-derived utility alias",
    'import type { MetaResponse } from "./src/generated/types.gen"; type View = Pick<MetaResponse, "api_version" | "application_version">;',
  ],
  [
    "view-only intersection",
    "import type { LiveResponse } from './src/generated/types.gen'; type View = LiveResponse & { label: string; observed: boolean };",
  ],
  [
    "unrelated local object functions",
    "function object<T>(shape: T): T { return shape; } function string(): number { return 1; } const local = object({ status: string() });",
  ],
  [
    "generated Zod validator",
    'import { zLiveResponse } from "./src/generated/zod.gen"; const validator = zLiveResponse;',
  ],
  ["narrow literal response field", 'type Replica = Record<"status", "live" | "ready">;'],
  [
    "branded response field",
    'type Brand = string & { readonly __brand: "health" }; type Replica = Record<"status", Brand>;',
  ],
  [
    "unrelated destructured local object",
    "const local = { object: <T>(shape: T): T => shape, string: (): number => 1 }; const { object: makeObject, string: makeString } = local; const replica = makeObject({ status: makeString() });",
  ],
];

describe("handwritten API boundary architecture", () => {
  it("contains no handwritten response-shaped replicas of generated API DTOs", () => {
    const files = handwrittenRoots.flatMap(sourceFiles);
    const program = ts.createProgram({ options: compilerOptions, rootNames: files });
    const violations = violationsForProgram(
      program,
      new Set(files.map((file) => resolve(file))),
    ).map(({ fileName, kind, line }) => `${fileName}:${String(line)} ${kind}`);
    expect(violations).toEqual([]);
  });

  it.each(rejectedFixtures)("rejects the %s fixture", (_name, source, expectedKind) => {
    expect(fixtureViolations(source).map(({ kind }) => kind)).toContain(expectedKind);
  });

  it.each(permittedFixtures)("permits the %s fixture", (_name, source) => {
    expect(fixtureViolations(source)).toEqual([]);
  });

  it("publishes only source-backed package exports", () => {
    const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as {
      exports: Record<string, string>;
      private: boolean;
      type: string;
    };
    expect(manifest.private).toBe(true);
    expect(manifest.type).toBe("module");
    expect(manifest.exports).toEqual({
      ".": "./src/index.ts",
      "./contract": "./src/contract.ts",
      "./generated/types": "./src/generated/types.gen.ts",
      "./generated/zod": "./src/generated/zod.gen.ts",
      "./transport": "./src/transport.ts",
    });
    for (const target of Object.values(manifest.exports)) {
      expect(statSync(join(packageRoot, target)).isFile()).toBe(true);
    }
  });
});
