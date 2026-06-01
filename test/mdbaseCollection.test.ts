import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
	DEFAULT_ACK_RESPONSE_TYPE,
	DEFAULT_APPROVAL_RESPONSE_TYPE,
	REQUEST_TYPE,
} from "../src/constants";
import {
	MDBASE_CONFIG,
	PICKLE_ACK_RESPONSE_TYPE,
	PICKLE_APPROVAL_RESPONSE_TYPE,
	PICKLE_REQUEST_TYPE,
} from "../src/templates";
import { buildResponseFrontmatter, linkTargetsRequest } from "../src/responseBuilder";
import { VaultCollection } from "../src/vaultCollection";
import { createFakeApp } from "./fakeObsidianApp";

let tempRoots: string[] = [];
const COLLECTION_FOLDER = "_pickle";

async function createCollectionRoot(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "pickle-"));
	tempRoots.push(root);
	await mkdir(join(root, COLLECTION_FOLDER, "_types"), { recursive: true });
	await mkdir(join(root, COLLECTION_FOLDER, "requests"), { recursive: true });
	await mkdir(join(root, COLLECTION_FOLDER, "responses"), { recursive: true });
	await mkdir(join(root, COLLECTION_FOLDER, "attachments"), { recursive: true });
	await writeFile(join(root, COLLECTION_FOLDER, "mdbase.yaml"), MDBASE_CONFIG);
	await writeFile(
		join(root, COLLECTION_FOLDER, "_types", `${REQUEST_TYPE}.md`),
		PICKLE_REQUEST_TYPE
	);
	await writeFile(
		join(root, COLLECTION_FOLDER, "_types", `${DEFAULT_APPROVAL_RESPONSE_TYPE}.md`),
		PICKLE_APPROVAL_RESPONSE_TYPE
	);
	await writeFile(
		join(root, COLLECTION_FOLDER, "_types", `${DEFAULT_ACK_RESPONSE_TYPE}.md`),
		PICKLE_ACK_RESPONSE_TYPE
	);
	return root;
}

afterEach(async () => {
	for (const root of tempRoots) {
		await rm(root, { recursive: true, force: true });
	}
	tempRoots = [];
});

describe("vault collection contract", () => {
	it("creates a request and validates a linked response", async () => {
		const root = await createCollectionRoot();
		const collection = new VaultCollection(createFakeApp(root), COLLECTION_FOLDER);

		const request = await collection.create({
			type: REQUEST_TYPE,
			path: "requests/approve-build.md",
			frontmatter: {
				title: "Approve build",
				source: "vitest",
				kind: "approval",
				priority: "normal",
				response_type: DEFAULT_APPROVAL_RESPONSE_TYPE,
			},
		});
		expect(request.error).toBeUndefined();

		const response = await collection.create({
			type: DEFAULT_APPROVAL_RESPONSE_TYPE,
			path: "responses/approve-build-response.md",
			frontmatter: buildResponseFrontmatter({
				responseType: DEFAULT_APPROVAL_RESPONSE_TYPE,
				requestPath: "requests/approve-build.md",
				values: {
					decision: "approve",
				},
				responder: "vitest",
				attachmentPaths: ["attachments/approve-build/context.txt"],
			}),
		});
		expect(response.error).toBeUndefined();

		const validation = await collection.validate();
		expect(validation.valid).toBe(true);

		const query = await collection.query({ types: [REQUEST_TYPE] });
		expect(query.results).toHaveLength(1);
		expect(
			linkTargetsRequest(
				response.frontmatter?.request,
				"requests/approve-build.md",
				COLLECTION_FOLDER
			)
		).toBe(true);
	});

	it("honors mdbase exclude globs when scanning markdown files", async () => {
		const root = await createCollectionRoot();
		await writeFile(
			join(root, COLLECTION_FOLDER, "requests", "approve-build.md"),
			[
				"---",
				`type: ${REQUEST_TYPE}`,
				"title: Approve build",
				`response_type: ${DEFAULT_APPROVAL_RESPONSE_TYPE}`,
				"---",
				"",
			].join("\n")
		);
		await mkdir(join(root, COLLECTION_FOLDER, "attachments", "approve-build"), {
			recursive: true,
		});
		await writeFile(
			join(root, COLLECTION_FOLDER, "attachments", "approve-build", "context.md"),
			["---", "title: 'unterminated", "", "---", ""].join("\n")
		);

		const collection = new VaultCollection(createFakeApp(root), COLLECTION_FOLDER);
		const query = await collection.query({ types: [REQUEST_TYPE] });
		const validation = await collection.validate();

		expect(query.error).toBeUndefined();
		expect(query.results).toHaveLength(1);
		expect(query.results?.[0]?.path).toBe("requests/approve-build.md");
		expect(validation.valid).toBe(true);
	});

	it("rejects responses that do not satisfy their response type", async () => {
		const root = await createCollectionRoot();
		const collection = new VaultCollection(createFakeApp(root), COLLECTION_FOLDER);

		await collection.create({
			type: REQUEST_TYPE,
			path: "requests/missing-decision.md",
			frontmatter: {
				title: "Missing decision",
				source: "vitest",
				response_type: DEFAULT_APPROVAL_RESPONSE_TYPE,
			},
		});

		const response = await collection.create({
			type: DEFAULT_APPROVAL_RESPONSE_TYPE,
			path: "responses/missing-decision-response.md",
			frontmatter: buildResponseFrontmatter({
				responseType: DEFAULT_APPROVAL_RESPONSE_TYPE,
				requestPath: "requests/missing-decision.md",
				values: {
					comment: "No decision field.",
				},
				responder: "vitest",
				attachmentPaths: [],
			}),
		});

		const issues = response.issues ?? [];
		expect(response.error?.code).toBe("validation_failed");
		expect(issues.some((issue) => issue.field === "decision")).toBe(true);
	});

	it("creates a message request and validates an acknowledgement response", async () => {
		const root = await createCollectionRoot();
		const collection = new VaultCollection(createFakeApp(root), COLLECTION_FOLDER);

		const request = await collection.create({
			type: REQUEST_TYPE,
			path: "requests/read-update.md",
			frontmatter: {
				title: "Read update",
				source: "vitest",
				message: "Deployment finished cleanly.",
				kind: "message",
				response_type: DEFAULT_ACK_RESPONSE_TYPE,
			},
		});
		expect(request.error).toBeUndefined();

		const response = await collection.create({
			type: DEFAULT_ACK_RESPONSE_TYPE,
			path: "responses/read-update-ack.md",
			frontmatter: buildResponseFrontmatter({
				responseType: DEFAULT_ACK_RESPONSE_TYPE,
				requestPath: "requests/read-update.md",
				values: {
					message: "Acknowledged.",
				},
				responder: "vitest",
				attachmentPaths: [],
			}),
		});
		expect(response.error).toBeUndefined();

		const validation = await collection.validate();
		expect(validation.valid).toBe(true);
		expect(
			linkTargetsRequest(
				response.frontmatter?.request,
				"requests/read-update.md",
				COLLECTION_FOLDER
			)
		).toBe(true);
	});
});
