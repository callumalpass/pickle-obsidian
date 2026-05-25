import { afterEach, describe, expect, it } from "vitest";
import { existsSync, statSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PickleCollectionService } from "../src/collectionService";
import {
	DEFAULT_ACK_RESPONSE_TYPE,
	DEFAULT_SETTINGS,
	DEFAULT_APPROVAL_RESPONSE_TYPE,
} from "../src/constants";
import { stripMarkdownExtension } from "../src/path";
import { createFakeApp } from "./fakeObsidianApp";

let tempRoots: string[] = [];

afterEach(async () => {
	for (const root of tempRoots) {
		await rm(root, { recursive: true, force: true });
	}
	tempRoots = [];
});

describe("collection service attachments", () => {
	it("maintains the acknowledgement response type", async () => {
		const { root, service } = await createService();

		await service.ensureCollection();

		const ackType = await readFile(
			join(root, "_pickle", "_types", `${DEFAULT_ACK_RESPONSE_TYPE}.md`),
			"utf8"
		);
		expect(ackType).toContain(`name: ${DEFAULT_ACK_RESPONSE_TYPE}`);
		expect(ackType).toContain("message:");
	});

	it("removes field defaults from existing bundled request type files", async () => {
		const { root, service } = await createService();
		await mkdir(join(root, "_pickle", "_types"), { recursive: true });
		await writeFile(
			join(root, "_pickle", "_types", "pickle_request.md"),
			[
				"---",
				"name: pickle_request",
				"fields:",
				"  kind:",
				"    type: enum",
				"    values: [approval, choice, input, notice]",
				"    default: approval",
				"  status:",
				"    type: enum",
				"    values: [pending, answered, cancelled]",
				"    default: pending",
				"  priority:",
				"    type: enum",
				"    values: [low, normal, high, urgent]",
				"    default: normal",
				"---",
				"",
			].join("\n")
		);

		await service.ensureCollection();

		const typeFile = await readFile(
			join(root, "_pickle", "_types", "pickle_request.md"),
			"utf8"
		);
		expect(typeFile).not.toContain("default: approval");
		expect(typeFile).not.toContain("default: pending");
		expect(typeFile).not.toContain("default: normal");
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

	it("derives answered state from response links without mutating request status", async () => {
		const { root, service } = await createService();
		const request = await service.seedSampleRequest();

		await service.createResponse({
			requestPath: request.path,
			responseType: DEFAULT_APPROVAL_RESPONSE_TYPE,
			values: { decision: "approve" },
		});

		const requestContent = await readFile(join(root, "_pickle", request.path), "utf8");
		const reread = await service.readRequest(`_pickle/${request.path}`);
		expect(requestContent).not.toContain("status: answered");
		expect(reread.responseCount).toBe(1);
		expect(reread.answered).toBe(true);
		expect(reread.derivedStatus).toBe("answered");
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
	const root = await mkdtemp(join(tmpdir(), "pickle-service-"));
	tempRoots.push(root);

	const app = createFakeApp(root);
	const service = new PickleCollectionService(app, () => ({ ...DEFAULT_SETTINGS }));
	return { root, service };
}
