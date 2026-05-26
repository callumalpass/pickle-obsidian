import { afterEach, describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { parse } from "yaml";
import { VaultCollection } from "../src/vaultCollection";
import { parseMarkdown } from "../src/frontmatter";
import type { ValidationIssue } from "../src/types";
import { createFakeApp } from "./fakeObsidianApp";

const SPEC_ROOT = resolve("..", "mdbase-spec");
const COLLECTION_FOLDER = "collection";

const SELECTED_SPEC_CASES: Record<string, Record<string, string[]>> = {
	"tests/level-1/types-basic.yaml": {
		"type loading": ["type is loaded from types folder", "type with no fields is valid"],
		"type name validation": [
			"valid type name with lowercase letters",
			"valid type name with hyphens and underscores",
			"valid type name with numbers",
		],
	},
	"tests/level-1/validation.yaml": {
		"required field validation": [
			"present required field passes",
			"missing required field fails",
			"null required field fails",
			"empty-value null required field fails",
			"tilde null required field fails",
			"empty string satisfies required (string value present)",
			"required field with default is satisfied by default",
		],
	},
	"tests/level-1/operations.yaml": {
		"create operation": [
			"create a valid file",
			"create applies default values in effective output",
			"create with invalid data fails validation",
			"create with unknown type fails",
			"create at existing path fails",
			"create with body content",
			"create with constraint violation fails",
		],
		"read operation": [
			"read returns frontmatter and body",
			"read applies defaults for missing fields",
			"read nonexistent file fails",
		],
		"update operation": [
			"update single field",
			"update multiple fields",
			"update adds new field",
			"update preserves body",
			"update with body replacement",
			"update nonexistent file fails",
			"update with invalid value fails validation",
		],
	},
};

interface SpecDocument {
	setup?: SpecSetup;
	groups?: SpecGroup[];
}

interface SpecGroup {
	name: string;
	setup?: SpecSetup;
	tests?: SpecCase[];
}

interface SpecCase {
	name: string;
	operation: string;
	input?: Record<string, unknown>;
	setup?: SpecSetup;
	expect?: SpecExpectation;
}

interface SpecSetup {
	config?: string;
	types?: Record<string, string>;
	files?: Record<string, string>;
}

interface SpecExpectation {
	valid?: boolean;
	error?: { code?: string };
	path?: string;
	type?: Record<string, unknown>;
	frontmatter?: Record<string, unknown>;
	issues?: Array<Record<string, unknown>>;
	body_contains?: string;
}

interface OperationResult {
	valid?: boolean;
	error?: { code: string; message: string };
	path?: string;
	type?: Record<string, unknown>;
	frontmatter?: Record<string, unknown>;
	issues?: ValidationIssue[];
	body?: string | null;
}

let tempRoots: string[] = [];

afterEach(async () => {
	for (const root of tempRoots) {
		await rm(root, { recursive: true, force: true });
	}
	tempRoots = [];
});

if (!existsSync(SPEC_ROOT)) {
	describe.skip("mdbase spec compatibility", () => {
		it("requires the sibling mdbase-spec repository", () => {
			expect(SPEC_ROOT).toBeTruthy();
		});
	});
} else {
	describe("mdbase spec compatibility", () => {
		for (const [relativeSpecPath, selectedGroups] of Object.entries(SELECTED_SPEC_CASES)) {
			const specPath = join(SPEC_ROOT, relativeSpecPath);
			const document = parse(readTextSync(specPath)) as SpecDocument;

			for (const group of document.groups ?? []) {
				const selectedTests = selectedGroups[group.name];
				if (!selectedTests) continue;

				for (const testCase of group.tests ?? []) {
					if (!selectedTests.includes(testCase.name)) continue;

					it(`${relativeSpecPath}: ${group.name} > ${testCase.name}`, async () => {
						const root = await createTempVault();
						const setup = mergeSetup(
							mergeSetup(document.setup, group.setup),
							testCase.setup
						);
						await setupCollection(root, setup);

						const collection = new VaultCollection(createFakeApp(root), COLLECTION_FOLDER);
						const result = await runOperation(collection, root, testCase);
						assertExpectation(testCase.expect ?? {}, result);
					});
				}
			}
		}
	});
}

function readTextSync(path: string): string {
	return existsSync(path) ? readFileSync(path, "utf8") : "";
}

async function createTempVault(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "pickle-mdbase-spec-"));
	tempRoots.push(root);
	return root;
}

function mergeSetup(base?: SpecSetup, override?: SpecSetup): SpecSetup {
	return {
		...(base ?? {}),
		...(override ?? {}),
	};
}

async function setupCollection(root: string, setup: SpecSetup): Promise<void> {
	const collectionRoot = join(root, COLLECTION_FOLDER);
	await mkdir(collectionRoot, { recursive: true });

	if (setup.config !== undefined) {
		await writeVaultFile(root, "mdbase.yaml", setup.config);
	}

	for (const [filename, content] of Object.entries(setup.types ?? {})) {
		await writeVaultFile(root, join("_types", filename), content);
	}

	for (const [path, content] of Object.entries(setup.files ?? {})) {
		await writeVaultFile(root, path, content);
	}
}

async function writeVaultFile(root: string, collectionPath: string, content: string): Promise<void> {
	const absolutePath = join(root, COLLECTION_FOLDER, collectionPath);
	await mkdir(dirname(absolutePath), { recursive: true });
	await writeFile(absolutePath, content);
}

async function runOperation(
	collection: VaultCollection,
	root: string,
	testCase: SpecCase
): Promise<OperationResult> {
	const input = testCase.input ?? {};
	switch (testCase.operation) {
		case "get_type":
			return await getType(root, stringInput(input, "type"));
		case "validate": {
			const validation = await collection.validatePath(stringInput(input, "path"));
			return {
				valid: validation.valid,
				issues: validation.issues,
			};
		}
		case "read": {
			const result = await collection.read(stringInput(input, "path"));
			if (result.error) return { valid: false, error: result.error };
			return {
				valid: true,
				path: result.path,
				frontmatter: result.frontmatter,
				body: result.body,
			};
		}
		case "create": {
			const path = optionalStringInput(input, "path");
			if (!path) {
				return {
					valid: false,
					error: { code: "path_required", message: "Path is required." },
				};
			}
			const result = await collection.create({
				type: stringInput(input, "type"),
				path,
				frontmatter: recordInput(input, "frontmatter"),
				body: optionalStringInput(input, "body"),
			});
			if (result.error) return { valid: false, error: result.error, issues: result.issues };
			const readResult = await collection.read(result.path ?? path);
			return {
				valid: true,
				path: result.path,
				frontmatter: result.frontmatter,
				body: readResult.body,
			};
		}
		case "update": {
			const path = stringInput(input, "path");
			const result = await collection.update({
				path,
				fields: recordInput(input, "fields"),
				body: optionalStringInput(input, "body"),
			});
			if (result.error) return { valid: false, error: result.error, issues: result.issues };
			const readResult = await collection.read(path);
			return {
				valid: true,
				path: result.path,
				frontmatter: result.frontmatter,
				body: readResult.body,
			};
		}
		default:
			return {
				valid: false,
				error: {
					code: "unsupported_operation",
					message: `Unsupported operation: ${testCase.operation}`,
				},
			};
	}
}

async function getType(root: string, typeName: string): Promise<OperationResult> {
	const typesRoot = join(root, COLLECTION_FOLDER, "_types");
	const candidates = [
		join(typesRoot, `${typeName}.md`),
		join(typesRoot, `${typeName.toLowerCase()}.md`),
	];
	for (const path of candidates) {
		if (!existsSync(path)) continue;
		const parsed = parseMarkdown(await readFile(path, "utf8"));
		return {
			valid: true,
			type: parsed.frontmatter,
		};
	}
	return {
		valid: false,
		error: { code: "type_not_found", message: `Type not found: ${typeName}` },
	};
}

function assertExpectation(expectation: SpecExpectation, result: OperationResult): void {
	if (expectation.valid !== undefined) {
		expect(result.valid).toBe(expectation.valid);
	}
	if (expectation.error) {
		expect(result.error?.code).toBe(expectation.error.code);
		return;
	}

	expect(result.error).toBeUndefined();
	if (expectation.path !== undefined) {
		expect(result.path).toBe(expectation.path);
	}
	if (expectation.type !== undefined) {
		expect(result.type).toEqual(expect.objectContaining(expectation.type));
	}
	if (expectation.frontmatter !== undefined) {
		expect(result.frontmatter).toEqual(expect.objectContaining(expectation.frontmatter));
	}
	if (expectation.issues !== undefined) {
		assertIssues(expectation.issues, result.issues ?? []);
	}
	if (expectation.body_contains !== undefined) {
		expect(result.body ?? "").toContain(expectation.body_contains);
	}
}

function assertIssues(
	expectedIssues: Array<Record<string, unknown>>,
	actualIssues: ValidationIssue[]
): void {
	if (expectedIssues.length === 0) {
		expect(actualIssues).toEqual([]);
		return;
	}

	for (const expectedIssue of expectedIssues) {
		expect(
			actualIssues.some((actualIssue) => {
				const actual = actualIssue as unknown as Record<string, unknown>;
				return Object.entries(expectedIssue)
					.filter(([key]) => key !== "message")
					.every(([key, value]) => actual[key] === value);
			})
		).toBe(true);
	}
}

function stringInput(input: Record<string, unknown>, key: string): string {
	const value = input[key];
	if (typeof value !== "string") {
		throw new Error(`Expected string input: ${key}`);
	}
	return value;
}

function optionalStringInput(input: Record<string, unknown>, key: string): string | undefined {
	const value = input[key];
	return typeof value === "string" ? value : undefined;
}

function recordInput(input: Record<string, unknown>, key: string): Record<string, unknown> {
	const value = input[key];
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}
