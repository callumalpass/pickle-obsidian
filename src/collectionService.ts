import { TFile, type App } from "obsidian";
import {
	DEFAULT_ACK_RESPONSE_TYPE,
	DEFAULT_APPROVAL_RESPONSE_TYPE,
	DEFAULT_SETTINGS,
	REQUEST_TYPE,
} from "./constants";
import { parseMarkdown } from "./frontmatter";
import {
	joinVaultPath,
	normalizeVaultPath,
	safeAttachmentName,
	slugify,
	stripMarkdownExtension,
	uniqueTimestamp,
	vaultPathForCollectionPath,
	collectionRelativePath,
} from "./path";
import { buildResponseFrontmatter, linkTargetsRequest } from "./responseBuilder";
import { deriveRequestState } from "./requestState";
import {
	MDBASE_CONFIG,
	PICKLE_ACK_RESPONSE_TYPE,
	PICKLE_APPROVAL_RESPONSE_TYPE,
	PICKLE_REQUEST_TYPE,
	defaultBaseFile,
} from "./templates";
import {
	VaultCollection,
	type VaultCollectionRow,
} from "./vaultCollection";
import type {
	CreateResponseInput,
	CreateResponseResult,
	UpdateResponseInput,
	PickleApprovalSettings,
	PickleRequestRecord,
	PickleResponseRecord,
	SmokeTestResult,
	TypeDefinition,
	ValidationSummary,
} from "./types";

export class PickleCollectionService {
	private readonly app: App;
	private readonly getSettings: () => PickleApprovalSettings;

	constructor(app: App, getSettings: () => PickleApprovalSettings) {
		this.app = app;
		this.getSettings = getSettings;
	}

	get settings(): PickleApprovalSettings {
		return {
			...DEFAULT_SETTINGS,
			...this.getSettings(),
		};
	}

	get collectionFolder(): string {
		return normalizeVaultPath(this.settings.collectionFolder);
	}

	get baseVaultPath(): string {
		return vaultPathForCollectionPath(this.collectionFolder, this.settings.baseFile);
	}

	async ensureCollection(): Promise<{ collectionPath: string; basePath: string }> {
		await this.ensureVaultFolder(this.collectionFolder);
		await this.ensureVaultFolder(joinVaultPath(this.collectionFolder, "_types"));
		await this.ensureVaultFolder(
			joinVaultPath(this.collectionFolder, this.settings.requestsFolder)
		);
		await this.ensureVaultFolder(
			joinVaultPath(this.collectionFolder, this.settings.responsesFolder)
		);
		await this.ensureVaultFolder(
			joinVaultPath(this.collectionFolder, this.settings.attachmentsFolder)
		);

		await this.writeTextFileIfMissing(
			joinVaultPath(this.collectionFolder, "mdbase.yaml"),
			MDBASE_CONFIG
		);
		await this.ensurePickleRequestTypeFile();
		await this.writeTextFileIfMissing(
			joinVaultPath(
				this.collectionFolder,
				"_types",
				`${DEFAULT_APPROVAL_RESPONSE_TYPE}.md`
			),
			PICKLE_APPROVAL_RESPONSE_TYPE
		);
		await this.writeTextFileIfMissing(
			joinVaultPath(this.collectionFolder, "_types", `${DEFAULT_ACK_RESPONSE_TYPE}.md`),
			PICKLE_ACK_RESPONSE_TYPE
		);
		await this.ensureDefaultBaseFile();

		return {
			collectionPath: this.collectionFolder,
			basePath: this.baseVaultPath,
		};
	}

	async ensureDefaultBaseFile(): Promise<string> {
		await this.writeTextFile(this.baseVaultPath, defaultBaseFile());
		return this.baseVaultPath;
	}

	private async ensurePickleRequestTypeFile(): Promise<void> {
		const typePath = joinVaultPath(this.collectionFolder, "_types", `${REQUEST_TYPE}.md`);
		const existing = this.app.vault.getAbstractFileByPath(typePath);
		if (!(existing instanceof TFile)) {
			await this.writeTextFile(typePath, PICKLE_REQUEST_TYPE);
			return;
		}

		const current = await this.app.vault.cachedRead(existing);
		const updated = this.removeBundledTypeDefaults(current);
		if (updated !== current) {
			await this.app.vault.modify(existing, updated);
		}
	}

	private removeBundledTypeDefaults(content: string): string {
		return content.replace(/^ {4}default: (approval|pending|normal)\r?\n/gmu, "");
	}

	async validateCollection(): Promise<ValidationSummary> {
		return await this.withCollection(async (collection) => {
			const result = await collection.validate();
			return {
				valid: result.valid,
				issues: result.issues ?? [],
			};
		});
	}

	async readTypeDefinition(responseType: string): Promise<TypeDefinition> {
		const typePath = joinVaultPath(
			this.collectionFolder,
			"_types",
			`${responseType.toLowerCase()}.md`
		);
		const parsed = parseMarkdown(await this.readVaultFile(typePath));
		const name = parsed.frontmatter.name;
		if (typeof name !== "string") {
			throw new Error(`Type file is missing a name: ${typePath}`);
		}

		return parsed.frontmatter as unknown as TypeDefinition;
	}

	async readRequest(vaultPath: string): Promise<PickleRequestRecord> {
		const relativePath = collectionRelativePath(vaultPath, this.collectionFolder);
		if (relativePath === null || relativePath.length === 0) {
			throw new Error(`File is outside the Pickle collection: ${vaultPath}`);
		}

		return await this.withCollection(async (collection) => {
			const readResult = await collection.read(relativePath);
			if (readResult.error) {
				throw new Error(readResult.error.message);
			}
			if (!readResult.types?.includes(REQUEST_TYPE)) {
				throw new Error(`File is not a Pickle request: ${vaultPath}`);
			}

			const responseCount = await this.countResponsesForRequest(collection, relativePath);
			const derivedStatus = deriveRequestState(
				readResult.frontmatter ?? {},
				responseCount
			);
			return {
				path: relativePath,
				vaultPath,
				frontmatter: readResult.frontmatter ?? {},
				body: readResult.body,
				answered: derivedStatus === "answered",
				responseCount,
				derivedStatus,
			};
		});
	}

	async listRequests(): Promise<PickleRequestRecord[]> {
		return await this.withCollection(async (collection) => {
			const requestResult = await collection.query({
				types: [REQUEST_TYPE],
				include_body: true,
				order_by: [{ field: "created_at", direction: "desc" }],
			});
			if (requestResult.error) {
				throw new Error(requestResult.error.message);
			}

			const allResult = await collection.query({ include_body: false });
			if (allResult.error) {
				throw new Error(allResult.error.message);
			}

			const rows = requestResult.results ?? [];
			const allRows = allResult.results ?? [];

			return rows.map((row) => {
				const responseCount = allRows.filter((candidate) =>
					linkTargetsRequest(
						candidate.frontmatter.request,
						row.path,
						this.collectionFolder
					)
				).length;
				const derivedStatus = deriveRequestState(row.frontmatter, responseCount);

				return {
					path: row.path,
					vaultPath: vaultPathForCollectionPath(this.collectionFolder, row.path),
					frontmatter: row.frontmatter,
					body: row.body,
					answered: derivedStatus === "answered",
					responseCount,
					derivedStatus,
				};
			});
		});
	}

	async isRequestAnswered(relativePath: string): Promise<boolean> {
		return await this.withCollection(async (collection) => {
			const responseCount = await this.countResponsesForRequest(collection, relativePath);
			return responseCount > 0;
		});
	}

	async findResponseForRequest(requestPath: string): Promise<PickleResponseRecord | null> {
		return await this.withCollection(async (collection) => {
			const response = await this.responseForRequest(collection, requestPath, true);
			if (!response) return null;

			return {
				path: response.path,
				vaultPath: vaultPathForCollectionPath(this.collectionFolder, response.path),
				frontmatter: response.frontmatter,
				body: response.body,
			};
		});
	}

	async createResponse(input: CreateResponseInput): Promise<CreateResponseResult> {
		await this.ensureCollection();

		return await this.withCollection(async (collection) => {
			const requestResult = await collection.read(input.requestPath);
			if (requestResult.error) {
				throw new Error(requestResult.error.message);
			}
			if (!requestResult.types?.includes(REQUEST_TYPE)) {
				throw new Error(`Response target is not a Pickle request: ${input.requestPath}`);
			}

			const title = this.stringValue(requestResult.frontmatter?.title, "response");
			const responseId = `${uniqueTimestamp()}-${slugify(title)}`;
			const responsePath = joinVaultPath(
				this.settings.responsesFolder,
				`${responseId}.md`
			);
			const attachmentPaths = await this.storeAttachments(responseId, input.attachments ?? []);
			const frontmatter = buildResponseFrontmatter({
				responseType: input.responseType,
				requestPath: input.requestPath,
				values: input.values,
				responder: this.settings.defaultResponder,
				attachmentPaths,
			});

			const createResult = await collection.create({
				type: input.responseType,
				path: responsePath,
				frontmatter,
				body: input.body ?? "",
			});

			if (createResult.error) {
				const detail = createResult.issues
					?.map((issue) => `${issue.path ?? input.responseType}: ${issue.message}`)
					.join("; ");
				throw new Error(detail ?? createResult.error.message);
			}

			return {
				path: createResult.path ?? responsePath,
				vaultPath: vaultPathForCollectionPath(
					this.collectionFolder,
					createResult.path ?? responsePath
				),
				frontmatter: createResult.frontmatter ?? frontmatter,
				attachmentPaths,
			};
		});
	}

	async updateResponse(input: UpdateResponseInput): Promise<CreateResponseResult> {
		await this.ensureCollection();

		return await this.withCollection(async (collection) => {
			const requestResult = await collection.read(input.requestPath);
			if (requestResult.error) {
				throw new Error(requestResult.error.message);
			}
			if (!requestResult.types?.includes(REQUEST_TYPE)) {
				throw new Error(`Response target is not a Pickle request: ${input.requestPath}`);
			}

			const existingResponse = await collection.read(input.responsePath);
			if (existingResponse.error) {
				throw new Error(existingResponse.error.message);
			}

			const existingAttachmentPaths = this.stringArray(
				existingResponse.frontmatter?.attachment_paths
			);
			const responseId = stripMarkdownExtension(
				input.responsePath.split("/").pop() ?? input.responsePath
			);
			const newAttachmentPaths = await this.storeAttachments(
				responseId,
				input.attachments ?? [],
				existingAttachmentPaths.length
			);
			const attachmentPaths = [...existingAttachmentPaths, ...newAttachmentPaths];
			const frontmatter = buildResponseFrontmatter({
				responseType: input.responseType,
				requestPath: input.requestPath,
				values: input.values,
				responder: this.settings.defaultResponder,
				attachmentPaths,
			});

			const updateResult = await collection.update({
				path: input.responsePath,
				fields: frontmatter,
				body: input.body ?? existingResponse.body ?? "",
			});
			if (updateResult.error) {
				const detail = updateResult.issues
					?.map((issue) => `${issue.path ?? input.responsePath}: ${issue.message}`)
					.join("; ");
				throw new Error(detail ?? updateResult.error.message);
			}

			return {
				path: input.responsePath,
				vaultPath: vaultPathForCollectionPath(this.collectionFolder, input.responsePath),
				frontmatter: updateResult.frontmatter ?? frontmatter,
				attachmentPaths,
			};
		});
	}

	async seedSampleRequest(): Promise<PickleRequestRecord> {
		await this.ensureCollection();

		return await this.withCollection(async (collection) => {
			const timestamp = uniqueTimestamp();
			const path = joinVaultPath(
				this.settings.requestsFolder,
				`smoke-${timestamp}.md`
			);
			const createResult = await collection.create({
				type: REQUEST_TYPE,
				path,
				frontmatter: {
					title: `Smoke approval ${timestamp}`,
					source: "pickle",
					message: "Smoke request created by the Pickle plugin.",
					kind: "approval",
					priority: "normal",
					response_type: DEFAULT_APPROVAL_RESPONSE_TYPE,
					context: {
						task: "plugin-smoke-test",
					},
				},
				body: "Smoke request created by the Pickle plugin.",
			});

			if (createResult.error) {
				throw new Error(createResult.error.message);
			}

			return {
				path: createResult.path ?? path,
				vaultPath: vaultPathForCollectionPath(this.collectionFolder, createResult.path ?? path),
				frontmatter: createResult.frontmatter ?? {},
				body: "Smoke request created by the Pickle plugin.",
				answered: false,
				responseCount: 0,
				derivedStatus: "pending",
			};
		});
	}

	async runSmokeTest(): Promise<SmokeTestResult> {
		const ensured = await this.ensureCollection();
		const request = await this.seedSampleRequest();
		const response = await this.createResponse({
			requestPath: request.path,
			responseType: DEFAULT_APPROVAL_RESPONSE_TYPE,
			values: {
				decision: "approve",
				comment: "Smoke test response.",
			},
		});
		const validation = await this.validateCollection();

		return {
			collectionPath: ensured.collectionPath,
			basePath: ensured.basePath,
			requestPath: request.vaultPath,
			responsePath: response.vaultPath,
			valid: validation.valid,
			issues: validation.issues,
		};
	}

	private async countResponsesForRequest(
		collection: VaultCollection,
		relativePath: string
	): Promise<number> {
		const allResult = await collection.query({ include_body: false });
		if (allResult.error) {
			throw new Error(allResult.error.message);
		}

		return (allResult.results ?? []).filter((row) =>
			linkTargetsRequest(row.frontmatter.request, relativePath, this.collectionFolder)
		).length;
	}

	private async responseForRequest(
		collection: VaultCollection,
		relativePath: string,
		includeBody: boolean
	): Promise<VaultCollectionRow | null> {
		const allResult = await collection.query({
			include_body: includeBody,
			order_by: [{ field: "responded_at", direction: "desc" }],
		});
		if (allResult.error) {
			throw new Error(allResult.error.message);
		}

		return (
			(allResult.results ?? []).find((row) =>
				linkTargetsRequest(row.frontmatter.request, relativePath, this.collectionFolder)
			) ?? null
		);
	}

	private async withCollection<T>(
		callback: (collection: VaultCollection) => Promise<T>
	): Promise<T> {
		return await callback(new VaultCollection(this.app, this.collectionFolder));
	}

	private async storeAttachments(
		responseId: string,
		attachments: Array<{ name: string; data: ArrayBuffer }>,
		startIndex = 0
	): Promise<string[]> {
		if (attachments.length === 0) return [];

		const stored: string[] = [];
		const attachmentFolder = joinVaultPath(this.settings.attachmentsFolder, responseId);
		await this.ensureVaultFolder(joinVaultPath(this.collectionFolder, attachmentFolder));

		for (const [index, attachment] of attachments.entries()) {
			const safeName = safeAttachmentName(attachment.name);
			const relativePath = joinVaultPath(
				attachmentFolder,
				`${startIndex + index + 1}-${safeName}`
			);
			await this.app.vault.adapter.writeBinary(
				vaultPathForCollectionPath(this.collectionFolder, relativePath),
				attachment.data
			);
			stored.push(relativePath);
		}

		return stored;
	}

	private async ensureVaultFolder(path: string): Promise<void> {
		const normalizedPath = normalizeVaultPath(path);
		if (normalizedPath.length === 0) return;

		const existing = this.app.vault.getAbstractFileByPath(normalizedPath);
		if (existing) return;

		const parent = normalizedPath.split("/").slice(0, -1).join("/");
		if (parent.length > 0) {
			await this.ensureVaultFolder(parent);
		}

		await this.app.vault.createFolder(normalizedPath);
	}

	private async writeTextFileIfMissing(path: string, content: string): Promise<void> {
		const existing = this.app.vault.getAbstractFileByPath(path);
		if (existing) return;
		await this.writeTextFile(path, content);
	}

	private async writeTextFile(path: string, content: string): Promise<void> {
		const normalizedPath = normalizeVaultPath(path);
		const parent = normalizedPath.split("/").slice(0, -1).join("/");
		if (parent.length > 0) {
			await this.ensureVaultFolder(parent);
		}

		const existing = this.app.vault.getAbstractFileByPath(normalizedPath);
		if (existing instanceof TFile) {
			const current = await this.app.vault.cachedRead(existing);
			if (current !== content) {
				await this.app.vault.modify(existing, content);
			}
			return;
		}

		if (existing) {
			throw new Error(`Path exists and is not a file: ${normalizedPath}`);
		}

		await this.app.vault.create(normalizedPath, content);
	}

	private async readVaultFile(path: string): Promise<string> {
		const file = this.app.vault.getAbstractFileByPath(normalizeVaultPath(path));
		if (!(file instanceof TFile)) {
			throw new Error(`File not found: ${path}`);
		}

		return await this.app.vault.cachedRead(file);
	}

	private stringValue(value: unknown, fallback: string): string {
		return typeof value === "string" && value.trim().length > 0 ? value : fallback;
	}

	private stringArray(value: unknown): string[] {
		return Array.isArray(value)
			? value.filter((item): item is string => typeof item === "string")
			: [];
	}
}
