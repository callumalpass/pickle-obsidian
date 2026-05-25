import { TFile, type App } from "obsidian";
import { parseMarkdown, markdownWithFrontmatter } from "./frontmatter";
import {
	collectionRelativePath,
	ensureMarkdownExtension,
	normalizeVaultPath,
	vaultPathForCollectionPath,
} from "./path";
import { linkTargetsRequest, normalizeLinkTarget } from "./responseBuilder";
import type { FieldDefinition, ParsedMarkdown, TypeDefinition, ValidationIssue } from "./types";

export interface VaultCollectionRow {
	path: string;
	frontmatter: Record<string, unknown>;
	rawFrontmatter: Record<string, unknown>;
	types: string[];
	body?: string | null;
}

export interface VaultCollectionQueryOptions {
	types?: string[];
	include_body?: boolean;
	order_by?: Array<{
		field: string;
		direction?: "asc" | "desc";
	}>;
}

export interface VaultCollectionResult {
	path?: string;
	frontmatter?: Record<string, unknown>;
	error?: { code: string; message: string };
	issues?: ValidationIssue[];
}

export interface VaultCollectionQueryResult {
	results?: VaultCollectionRow[];
	error?: { code: string; message: string };
}

export interface VaultCollectionReadResult extends VaultCollectionRow {
	error?: { code: string; message: string };
}

export interface VaultCollectionValidationResult {
	valid: boolean;
	issues: ValidationIssue[];
}

export class VaultCollection {
	private readonly app: App;
	private readonly collectionFolder: string;
	private typeDefinitions: Map<string, TypeDefinition> | null = null;

	constructor(app: App, collectionFolder: string) {
		this.app = app;
		this.collectionFolder = normalizeVaultPath(collectionFolder);
	}

	async read(relativePath: string): Promise<VaultCollectionReadResult> {
		const normalizedPath = normalizeVaultPath(relativePath);
		const vaultPath = vaultPathForCollectionPath(this.collectionFolder, normalizedPath);
		const file = this.app.vault.getAbstractFileByPath(vaultPath);
		if (!(file instanceof TFile)) {
			return {
				path: normalizedPath,
				frontmatter: {},
				rawFrontmatter: {},
				types: [],
				error: { code: "file_not_found", message: `File not found: ${normalizedPath}` },
			};
		}

		const parsed = parseMarkdown(await this.app.vault.cachedRead(file));
		return await this.rowForParsedMarkdown(normalizedPath, parsed, true);
	}

	async create(input: {
		type: string;
		path: string;
		frontmatter: Record<string, unknown>;
		body?: string;
	}): Promise<VaultCollectionResult> {
		const path = ensureMarkdownExtension(normalizeVaultPath(input.path));
		const vaultPath = vaultPathForCollectionPath(this.collectionFolder, path);
		if (this.app.vault.getAbstractFileByPath(vaultPath)) {
			return {
				error: { code: "path_conflict", message: `File already exists: ${path}` },
				issues: [],
			};
		}

		const frontmatter = {
			type: input.type,
			...input.frontmatter,
		};
		const issues = await this.validateFrontmatter(path, frontmatter);
		if (issues.length > 0) {
			return {
				error: {
					code: this.errorCodeForIssues(issues),
					message: `Validation failed for ${path}`,
				},
				issues,
			};
		}

		await this.ensureParentFolder(vaultPath);
		await this.app.vault.create(vaultPath, markdownWithFrontmatter(frontmatter, input.body ?? ""));
		this.linkValidationRows = null;
		return { path, frontmatter: await this.effectiveFrontmatter(frontmatter) };
	}

	async update(input: {
		path: string;
		fields: Record<string, unknown>;
		body?: string;
	}): Promise<VaultCollectionResult> {
		const path = ensureMarkdownExtension(normalizeVaultPath(input.path));
		const vaultPath = vaultPathForCollectionPath(this.collectionFolder, path);
		const file = this.app.vault.getAbstractFileByPath(vaultPath);
		if (!(file instanceof TFile)) {
			return {
				error: { code: "file_not_found", message: `File not found: ${path}` },
				issues: [],
			};
		}

		const parsed = parseMarkdown(await this.app.vault.cachedRead(file));
		const frontmatter = {
			...parsed.frontmatter,
			...input.fields,
		};
		const issues = await this.validateFrontmatter(path, frontmatter);
		if (issues.length > 0) {
			return {
				error: {
					code: this.errorCodeForIssues(issues),
					message: `Validation failed for ${path}`,
				},
				issues,
			};
		}

		await this.app.vault.modify(
			file,
			markdownWithFrontmatter(frontmatter, input.body ?? parsed.body)
		);
		this.linkValidationRows = null;
		return { path, frontmatter: await this.effectiveFrontmatter(frontmatter) };
	}

	async query(options: VaultCollectionQueryOptions = {}): Promise<VaultCollectionQueryResult> {
		try {
			const rows = await this.allRows(options.include_body === true);
			const filtered = options.types
				? rows.filter((row) => options.types?.some((type) => row.types.includes(type)))
				: rows;
			return { results: this.sortRows(filtered, options.order_by) };
		} catch (error) {
			return {
				error: {
					code: "query_failed",
					message: error instanceof Error ? error.message : String(error),
				},
			};
		}
	}

	async validate(): Promise<VaultCollectionValidationResult> {
		const rows = await this.allRows(false);
		const issues: ValidationIssue[] = [];
		for (const row of rows) {
			issues.push(...(await this.validateFrontmatter(row.path, row.frontmatter)));
		}
		return {
			valid: issues.length === 0,
			issues,
		};
	}

	async validatePath(relativePath: string): Promise<VaultCollectionValidationResult> {
		const readResult = await this.read(relativePath);
		if (readResult.error) {
			return {
				valid: false,
				issues: [
					{
						code: readResult.error.code,
						message: readResult.error.message,
						path: relativePath,
					},
				],
			};
		}

		const issues = await this.validateFrontmatter(readResult.path, readResult.rawFrontmatter);
		return {
			valid: issues.length === 0,
			issues,
		};
	}

	private async allRows(
		includeBody: boolean,
		applyDefaults = true
	): Promise<VaultCollectionRow[]> {
		const rows: VaultCollectionRow[] = [];
		for (const file of this.markdownFiles()) {
			const relativePath = collectionRelativePath(file.path, this.collectionFolder);
			if (relativePath === null || relativePath.length === 0) continue;
			const parsed = parseMarkdown(await this.app.vault.cachedRead(file));
			rows.push(
				await this.rowForParsedMarkdown(relativePath, parsed, includeBody, applyDefaults)
			);
		}
		return rows;
	}

	private markdownFiles(): TFile[] {
		const vaultWithMarkdownFiles = this.app.vault as typeof this.app.vault & {
			getMarkdownFiles?: () => TFile[];
		};
		return (vaultWithMarkdownFiles.getMarkdownFiles?.() ?? []).filter(
			(file) => collectionRelativePath(file.path, this.collectionFolder) !== null
		);
	}

	private async rowForParsedMarkdown(
		path: string,
		parsed: ParsedMarkdown,
		includeBody: boolean,
		applyDefaults = true
	): Promise<VaultCollectionRow> {
		const frontmatter = applyDefaults
			? this.effectiveFrontmatter(parsed.frontmatter)
			: Promise.resolve(parsed.frontmatter);
		return {
			path,
			frontmatter: await frontmatter,
			rawFrontmatter: parsed.frontmatter,
			types: this.typesFor(parsed.frontmatter),
			body: includeBody ? parsed.body : undefined,
		};
	}

	private typesFor(frontmatter: Record<string, unknown>): string[] {
		const rawTypes = frontmatter.types;
		if (Array.isArray(rawTypes)) {
			return rawTypes.filter((item): item is string => typeof item === "string");
		}

		const rawType = frontmatter.type;
		return typeof rawType === "string" ? [rawType] : [];
	}

	private async validateFrontmatter(
		path: string,
		frontmatter: Record<string, unknown>
	): Promise<ValidationIssue[]> {
		const issues: ValidationIssue[] = [];
		const typeDefinitions = await this.prepareValidationCache();
		for (const type of this.typesFor(frontmatter)) {
			const definition = typeDefinitions.get(type);
			if (!definition) {
				issues.push({
					code: "unknown_type",
					message: `Unknown type: ${type}`,
					path,
					field: "type",
				});
				continue;
			}

			issues.push(
				...this.validateObjectFields(path, frontmatter, definition.fields ?? {}, type)
			);
		}
		return issues;
	}

	private validateObjectFields(
		path: string,
		values: Record<string, unknown>,
		fields: Record<string, FieldDefinition>,
		prefix: string
	): ValidationIssue[] {
		const issues: ValidationIssue[] = [];
		for (const [name, definition] of Object.entries(fields)) {
			const fieldPath = prefix.length > 0 ? `${prefix}.${name}` : name;
			issues.push(...this.validateField(path, fieldPath, values[name], definition));
		}
		return issues;
	}

	private validateField(
		path: string,
		field: string,
		value: unknown,
		definition: FieldDefinition
	): ValidationIssue[] {
		const issues: ValidationIssue[] = [];
		if (value === undefined || value === null) {
			if (definition.required === true && definition.default === undefined) {
				issues.push({
					code: "missing_required",
					message: `${field} is required.`,
					path,
					field: this.leafField(field),
				});
			}
			return issues;
		}

		switch (definition.type) {
			case "string":
				if (typeof value !== "string") {
					issues.push(this.typeIssue(path, field, "expected a string"));
					return issues;
				}
				return this.validateLengthConstraints(path, field, value, definition);
			case "enum":
				if (typeof value !== "string" || !definition.values?.includes(value)) {
					issues.push(this.typeIssue(path, field, "expected one of the allowed values"));
				}
				return issues;
			case "boolean":
				if (typeof value !== "boolean") {
					issues.push(this.typeIssue(path, field, "expected a boolean"));
				}
				return issues;
			case "integer":
				if (typeof value !== "number" || !Number.isInteger(value)) {
					issues.push(this.typeIssue(path, field, "expected an integer"));
				} else {
					issues.push(...this.validateNumberConstraints(path, field, value, definition));
				}
				return issues;
			case "number":
				if (typeof value !== "number" || Number.isNaN(value)) {
					issues.push(this.typeIssue(path, field, "expected a number"));
				} else {
					issues.push(...this.validateNumberConstraints(path, field, value, definition));
				}
				return issues;
			case "datetime":
				if (typeof value !== "string" || Number.isNaN(new Date(value).getTime())) {
					issues.push(this.typeIssue(path, field, "expected a datetime string"));
				}
				return issues;
			case "list":
				return this.validateListField(path, field, value, definition);
			case "object":
				return this.validateNestedObjectField(path, field, value, definition);
			case "link":
				return this.validateLinkField(path, field, value, definition);
			default:
				return issues;
		}
	}

	private validateListField(
		path: string,
		field: string,
		value: unknown,
		definition: FieldDefinition
	): ValidationIssue[] {
		const issues: ValidationIssue[] = [];
		if (!Array.isArray(value)) {
			return [this.typeIssue(path, field, "expected a list")];
		}

		if (definition.min_items !== undefined && value.length < definition.min_items) {
			issues.push({
				code: "min_items",
				message: `${field} needs at least ${definition.min_items} items.`,
				path,
				field: this.leafField(field),
			});
		}
		if (definition.max_items !== undefined && value.length > definition.max_items) {
			issues.push({
				code: "max_items",
				message: `${field} can include at most ${definition.max_items} items.`,
				path,
				field: this.leafField(field),
			});
		}

		if (definition.items) {
			for (const [index, item] of value.entries()) {
				issues.push(...this.validateField(path, `${field}[${index + 1}]`, item, definition.items));
			}
		}
		return issues;
	}

	private validateLengthConstraints(
		path: string,
		field: string,
		value: string,
		definition: FieldDefinition
	): ValidationIssue[] {
		const issues: ValidationIssue[] = [];
		if (definition.min_length !== undefined && value.length < definition.min_length) {
			issues.push({
				code: "string_too_short",
				message: `${field} needs at least ${definition.min_length} characters.`,
				path,
				field: this.leafField(field),
			});
		}
		if (definition.max_length !== undefined && value.length > definition.max_length) {
			issues.push({
				code: "string_too_long",
				message: `${field} can include at most ${definition.max_length} characters.`,
				path,
				field: this.leafField(field),
			});
		}
		return issues;
	}

	private validateNumberConstraints(
		path: string,
		field: string,
		value: number,
		definition: FieldDefinition
	): ValidationIssue[] {
		const issues: ValidationIssue[] = [];
		if (definition.min !== undefined && value < definition.min) {
			issues.push({
				code: "number_too_small",
				message: `${field} must be at least ${definition.min}.`,
				path,
				field: this.leafField(field),
			});
		}
		if (definition.max !== undefined && value > definition.max) {
			issues.push({
				code: "number_too_large",
				message: `${field} must be at most ${definition.max}.`,
				path,
				field: this.leafField(field),
			});
		}
		return issues;
	}

	private validateNestedObjectField(
		path: string,
		field: string,
		value: unknown,
		definition: FieldDefinition
	): ValidationIssue[] {
		if (!value || typeof value !== "object" || Array.isArray(value)) {
			return [this.typeIssue(path, field, "expected an object")];
		}

		return this.validateObjectFields(
			path,
			value as Record<string, unknown>,
			definition.fields ?? {},
			field
		);
	}

	private validateLinkField(
		path: string,
		field: string,
		value: unknown,
		definition: FieldDefinition
	): ValidationIssue[] {
		if (typeof value !== "string") {
			return [this.typeIssue(path, field, "expected a link")];
		}

		if (definition.validate_exists !== true) return [];
		const target = normalizeLinkTarget(value);
		if (!target) {
			return [this.typeIssue(path, field, "expected a valid link")];
		}

		const targetType = definition.target ?? definition.target_type;
		if (!targetType) return [];

		const matchingRow = this.cachedRowsForLinkValidation().find((row) => {
			if (!row.types.includes(targetType)) return false;
			return linkTargetsRequest(value, row.path, this.collectionFolder);
		});
		if (!matchingRow) {
			return [
				{
					code: "link_target_missing",
					message: `${field} target does not exist.`,
					path,
					field: this.leafField(field),
				},
			];
		}

		return [];
	}

	private cachedRowsForLinkValidation(): VaultCollectionRow[] {
		return this.linkValidationRows ?? [];
	}

	private linkValidationRows: VaultCollectionRow[] | null = null;

	private async prepareValidationCache(): Promise<Map<string, TypeDefinition>> {
		const definitions = await this.readTypeDefinitions();
		if (!this.linkValidationRows) {
			this.linkValidationRows = await this.allRows(false, false);
		}
		return definitions;
	}

	private async readTypeDefinitions(): Promise<Map<string, TypeDefinition>> {
		if (this.typeDefinitions) return this.typeDefinitions;

		const definitions = new Map<string, TypeDefinition>();
		for (const file of this.markdownFiles()) {
			const relativePath = collectionRelativePath(file.path, this.collectionFolder);
			if (!relativePath?.startsWith("_types/")) continue;
			const parsed = parseMarkdown(await this.app.vault.cachedRead(file));
			const name = parsed.frontmatter.name;
			if (typeof name !== "string") continue;
			definitions.set(name, parsed.frontmatter as unknown as TypeDefinition);
		}
		this.typeDefinitions = definitions;
		return definitions;
	}

	private sortRows(
		rows: VaultCollectionRow[],
		orderBy: VaultCollectionQueryOptions["order_by"]
	): VaultCollectionRow[] {
		if (!orderBy || orderBy.length === 0) return rows;

		return [...rows].sort((left, right) => {
			for (const order of orderBy) {
				const comparison = this.compareValues(
					left.frontmatter[order.field],
					right.frontmatter[order.field]
				);
				if (comparison !== 0) {
					return order.direction === "desc" ? -comparison : comparison;
				}
			}
			return left.path.localeCompare(right.path);
		});
	}

	private compareValues(left: unknown, right: unknown): number {
		const leftText = this.sortableText(left);
		const rightText = this.sortableText(right);
		return leftText.localeCompare(rightText);
	}

	private async effectiveFrontmatter(
		frontmatter: Record<string, unknown>
	): Promise<Record<string, unknown>> {
		const effective = { ...frontmatter };
		const definitions = await this.readTypeDefinitions();
		for (const type of this.typesFor(frontmatter)) {
			const definition = definitions.get(type);
			for (const [fieldName, fieldDefinition] of Object.entries(definition?.fields ?? {})) {
				if (effective[fieldName] === undefined && fieldDefinition.default !== undefined) {
					effective[fieldName] = fieldDefinition.default;
				}
			}
		}
		return effective;
	}

	private errorCodeForIssues(issues: ValidationIssue[]): string {
		return issues.some((issue) => issue.code === "unknown_type")
			? "unknown_type"
			: "validation_failed";
	}

	private sortableText(value: unknown): string {
		if (value === undefined || value === null) return "";
		if (typeof value === "string") return value;
		if (typeof value === "number" || typeof value === "boolean") return String(value);
		if (Array.isArray(value)) {
			return value.map((item) => this.sortableText(item)).join(", ");
		}
		return JSON.stringify(value) ?? "";
	}

	private async ensureParentFolder(vaultPath: string): Promise<void> {
		const parent = normalizeVaultPath(vaultPath).split("/").slice(0, -1).join("/");
		if (parent.length === 0) return;

		const existing = this.app.vault.getAbstractFileByPath(parent);
		if (existing) return;

		await this.ensureParentFolder(parent);
		await this.app.vault.createFolder(parent);
	}

	private typeIssue(path: string, field: string, message: string): ValidationIssue {
		return {
			code: "invalid_type",
			message: `${field} ${message}.`,
			path,
			field: this.leafField(field),
		};
	}

	private leafField(field: string): string {
		const parts = field.split(".");
		return parts[parts.length - 1]?.replace(/\[\d+\]$/u, "") ?? field;
	}
}
