import { afterEach, describe, expect, it } from "vitest";
import { Collection } from "@callumalpass/mdbase";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DEFAULT_APPROVAL_RESPONSE_TYPE, REQUEST_TYPE } from "../src/constants";
import {
	MDBASE_CONFIG,
	PICKLE_APPROVAL_RESPONSE_TYPE,
	PICKLE_REQUEST_TYPE,
} from "../src/templates";
import { buildResponseFrontmatter, linkTargetsRequest } from "../src/responseBuilder";

let tempRoots: string[] = [];

async function createCollectionRoot(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "pickle-approval-center-"));
	tempRoots.push(root);
	await mkdir(join(root, "_types"), { recursive: true });
	await mkdir(join(root, "requests"), { recursive: true });
	await mkdir(join(root, "responses"), { recursive: true });
	await mkdir(join(root, "attachments"), { recursive: true });
	await writeFile(join(root, "mdbase.yaml"), MDBASE_CONFIG);
	await writeFile(join(root, "_types", `${REQUEST_TYPE}.md`), PICKLE_REQUEST_TYPE);
	await writeFile(
		join(root, "_types", `${DEFAULT_APPROVAL_RESPONSE_TYPE}.md`),
		PICKLE_APPROVAL_RESPONSE_TYPE
	);
	return root;
}

afterEach(async () => {
	for (const root of tempRoots) {
		await rm(root, { recursive: true, force: true });
	}
	tempRoots = [];
});

describe("mdbase collection contract", () => {
	it("creates a request and validates a linked response", async () => {
		const root = await createCollectionRoot();
		const opened = await Collection.open(root);
		expect(opened.error).toBeUndefined();
		const collection = opened.collection;
		if (!collection) throw new Error("Collection did not open.");

		try {
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
					"_pickle"
				)
			).toBe(true);
		} finally {
			await collection.close();
		}
	});

	it("rejects responses that do not satisfy their response type", async () => {
		const root = await createCollectionRoot();
		const opened = await Collection.open(root);
		expect(opened.error).toBeUndefined();
		const collection = opened.collection;
		if (!collection) throw new Error("Collection did not open.");

		try {
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

			const issues = (response as { issues?: Array<{ field?: string }> }).issues ?? [];
			expect(response.error?.code).toBe("validation_failed");
			expect(issues.some((issue) => issue.field === "decision")).toBe(true);
		} finally {
			await collection.close();
		}
	});
});
