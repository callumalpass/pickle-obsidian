import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import {
	BASES_VIEW_TYPE,
	DEFAULT_ACK_RESPONSE_TYPE,
	DEFAULT_APPROVAL_RESPONSE_TYPE,
	REQUEST_TYPE,
} from "../src/constants";
import { parseMarkdown } from "../src/frontmatter";
import {
	MDBASE_CONFIG,
	PICKLE_ACK_RESPONSE_TYPE,
	PICKLE_APPROVAL_RESPONSE_TYPE,
	PICKLE_REQUEST_TYPE,
	defaultBaseFile,
} from "../src/templates";

interface BaseViewConfig {
	type: string;
	name: string;
	filters?: {
		and?: string[];
	};
	order?: string[];
	options?: Record<string, unknown>;
}

interface BaseFileConfig {
	filters?: {
		and?: string[];
	};
	properties?: Record<string, { displayName?: string }>;
	views?: BaseViewConfig[];
}

describe("default templates", () => {
	it("uses Pickle as the collection name", () => {
		const collectionConfig = parse(MDBASE_CONFIG) as {
			name?: string;
			description?: string;
			settings?: Record<string, unknown>;
		};

		expect(collectionConfig.name).toBe("Pickle");
		expect(collectionConfig.description).toContain("Pickle requests");
		expect(collectionConfig.settings).toMatchObject({
			types_folder: "_types",
			default_validation: "error",
			default_strict: false,
			exclude: [".git", "node_modules", ".mdbase", "attachments/**"],
			include_subfolders: true,
			explicit_type_keys: ["type", "types"],
			cache_folder: ".mdbase",
		});
	});

	it("maintains Bases request views without hiding responses globally", () => {
		const baseFile = parse(defaultBaseFile()) as BaseFileConfig;
		const pendingView = baseFile.views?.find((view) => view.name === "Pending");
		const answeredView = baseFile.views?.find((view) => view.name === "Answered");
		const conflictView = baseFile.views?.find((view) => view.name === "Conflicts");
		const allRequestsView = baseFile.views?.find((view) => view.name === "All requests");

		expect(baseFile.filters).toBeUndefined();
		expect(pendingView).toMatchObject({
			type: BASES_VIEW_TYPE,
			filters: { and: [`type == "${REQUEST_TYPE}"`] },
			options: { state: "pending" },
		});
		expect(answeredView).toMatchObject({
			type: BASES_VIEW_TYPE,
			filters: { and: [`type == "${REQUEST_TYPE}"`] },
			options: { state: "answered" },
		});
		expect(conflictView).toMatchObject({
			type: BASES_VIEW_TYPE,
			filters: { and: [`type == "${REQUEST_TYPE}"`] },
			options: { state: "conflict" },
		});
		expect(allRequestsView).toMatchObject({
			type: "table",
			filters: { and: [`type == "${REQUEST_TYPE}"`] },
		});
	});

	it("adds response-focused Bases views", () => {
		const baseFile = parse(defaultBaseFile()) as BaseFileConfig;
		const responsesView = baseFile.views?.find((view) => view.name === "Responses");
		const approvedView = baseFile.views?.find((view) => view.name === "Approved");
		const rejectedView = baseFile.views?.find((view) => view.name === "Rejected");
		const revisionsView = baseFile.views?.find((view) => view.name === "Revisions");

		expect(baseFile.properties?.request?.displayName).toBe("Request");
		expect(baseFile.properties?.decision?.displayName).toBe("Decision");
		expect(baseFile.properties?.responded_at?.displayName).toBe("Responded");
		expect(responsesView).toMatchObject({
			type: "table",
			filters: { and: ["request != null"] },
		});
		expect(approvedView).toMatchObject({
			type: "table",
			filters: { and: ["request != null", 'decision == "approve"'] },
		});
		expect(rejectedView).toMatchObject({
			type: "table",
			filters: { and: ["request != null", 'decision == "reject"'] },
		});
		expect(revisionsView).toMatchObject({
			type: "table",
			filters: { and: ["request != null", 'decision == "revise"'] },
		});
		expect(responsesView?.order).toContain("request");
		expect(responsesView?.order).toContain("responded_at");
	});

	it("uses the default approval response type name consistently", () => {
		expect(DEFAULT_APPROVAL_RESPONSE_TYPE).toBe("pickle_response_approval");
		expect(DEFAULT_ACK_RESPONSE_TYPE).toBe("pickle_response_ack");
	});

	it("does not define field defaults in bundled type files", () => {
		for (const typeFile of [
			PICKLE_REQUEST_TYPE,
			PICKLE_APPROVAL_RESPONSE_TYPE,
			PICKLE_ACK_RESPONSE_TYPE,
		]) {
			const parsed = parseMarkdown(typeFile).frontmatter as {
				fields?: Record<string, Record<string, unknown>>;
			};
			for (const field of Object.values(parsed.fields ?? {})) {
				expect(field).not.toHaveProperty("default");
			}
		}
	});

	it("adds message request and acknowledgement response type fields", () => {
		const request = parseMarkdown(PICKLE_REQUEST_TYPE).frontmatter as {
			fields?: Record<string, { values?: string[]; type?: string }>;
		};
		const acknowledgement = parseMarkdown(PICKLE_ACK_RESPONSE_TYPE).frontmatter as {
			name?: string;
			fields?: Record<string, { type?: string; target?: string; validate_exists?: boolean }>;
		};

		expect(request.fields?.message?.type).toBe("string");
		expect(request.fields?.kind?.values).toContain("message");
		expect(acknowledgement.name).toBe(DEFAULT_ACK_RESPONSE_TYPE);
		expect(acknowledgement.fields?.request).toMatchObject({
			type: "link",
			target: REQUEST_TYPE,
			validate_exists: true,
		});
		expect(acknowledgement.fields?.message?.type).toBe("string");
	});
});
