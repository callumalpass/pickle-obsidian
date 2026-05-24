import { afterEach, describe, expect, it } from "vitest";
import { existsSync, statSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TFile, type App } from "obsidian";
import { PickleCollectionService } from "../src/collectionService";
import { DEFAULT_SETTINGS, DEFAULT_APPROVAL_RESPONSE_TYPE } from "../src/constants";
import { stripMarkdownExtension } from "../src/path";

let tempRoots: string[] = [];

afterEach(async () => {
	for (const root of tempRoots) {
		await rm(root, { recursive: true, force: true });
	}
	tempRoots = [];
});

describe("collection service attachments", () => {
	it("updates the generated mdbase collection name when maintaining existing files", async () => {
		const { root, service } = await createService();
		await mkdir(join(root, "_pickle"), { recursive: true });
		await writeFile(
			join(root, "_pickle", "mdbase.yaml"),
			[
				'spec_version: "0.2.1"',
				"name: Pickle approval center",
				"description: Local mdbase collection for async human approvals.",
				"settings:",
				'  cache_folder: ".mdbase"',
				"",
			].join("\n")
		);

		await service.ensureCollection();

		const config = await readFile(join(root, "_pickle", "mdbase.yaml"), "utf8");
		expect(config).toContain("name: Pickle");
		expect(config).toContain("description: Local mdbase collection for Pickle requests and responses.");
		expect(config).not.toContain("approval center");
	});

	it("does not create a per-response attachment folder when there are no attachments", async () => {
		const { root, service } = await createService();
		const request = await service.seedSampleRequest();

		const response = await service.createResponse({
			requestPath: request.path,
			responseType: DEFAULT_APPROVAL_RESPONSE_TYPE,
			values: { decision: "approve" },
			attachments: [],
		});

		const responseId = stripMarkdownExtension(response.path.split("/").pop() ?? response.path);
		expect(existsSync(join(root, "_pickle", "attachments"))).toBe(true);
		expect(existsSync(join(root, "_pickle", "attachments", responseId))).toBe(false);
		expect(response.attachmentPaths).toEqual([]);
	});

	it("creates the per-response attachment folder when attachments are added", async () => {
		const { root, service } = await createService();
		const request = await service.seedSampleRequest();

		const response = await service.createResponse({
			requestPath: request.path,
			responseType: DEFAULT_APPROVAL_RESPONSE_TYPE,
			values: { decision: "approve" },
			attachments: [
				{
					name: "context.txt",
					data: new TextEncoder().encode("approval context").buffer,
				},
			],
		});

		const responseId = stripMarkdownExtension(response.path.split("/").pop() ?? response.path);
		const attachmentFolder = join(root, "_pickle", "attachments", responseId);
		expect(statSync(attachmentFolder).isDirectory()).toBe(true);
		expect(response.attachmentPaths).toEqual([
			`attachments/${responseId}/1-context.txt`,
		]);
	});
});

async function createService(): Promise<{ root: string; service: PickleCollectionService }> {
	const root = await mkdtemp(join(tmpdir(), "pickle-approval-center-service-"));
	tempRoots.push(root);

	const app = createFakeApp(root);
	const service = new PickleCollectionService(app, () => ({ ...DEFAULT_SETTINGS }));
	return { root, service };
}

function createFakeApp(root: string): App {
	const pathFor = (vaultPath: string): string => join(root, vaultPath);
	const vault = {
		adapter: {
			getBasePath: () => root,
			writeBinary: async (vaultPath: string, data: ArrayBuffer): Promise<void> => {
				const absolutePath = pathFor(vaultPath);
				await mkdir(join(absolutePath, ".."), { recursive: true });
				await writeFile(absolutePath, Buffer.from(data));
			},
		},
		getAbstractFileByPath: (vaultPath: string): { path: string } | null => {
			const absolutePath = pathFor(vaultPath);
			if (!existsSync(absolutePath)) return null;
			if (!statSync(absolutePath).isFile()) return { path: vaultPath };

			const file = Object.create(TFile.prototype) as { path: string };
			file.path = vaultPath;
			return file;
		},
		createFolder: async (vaultPath: string): Promise<void> => {
			await mkdir(pathFor(vaultPath));
		},
		create: async (vaultPath: string, content: string): Promise<{ path: string }> => {
			await writeFile(pathFor(vaultPath), content);
			return { path: vaultPath };
		},
		cachedRead: async (file: { path: string }): Promise<string> => {
			return await readFile(pathFor(file.path), "utf8");
		},
		modify: async (file: { path: string }, content: string): Promise<void> => {
			await writeFile(pathFor(file.path), content);
		},
	};

	return { vault } as unknown as App;
}
