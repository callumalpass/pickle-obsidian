import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { BASES_VIEW_TYPE, DEFAULT_APPROVAL_RESPONSE_TYPE, REQUEST_TYPE } from "../src/constants";
import { MDBASE_CONFIG, defaultBaseFile } from "../src/templates";

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
		const collectionConfig = parse(MDBASE_CONFIG) as { name?: string; description?: string };

		expect(collectionConfig.name).toBe("Pickle");
		expect(collectionConfig.description).toContain("Pickle requests");
	});

	it("maintains Bases request views without hiding responses globally", () => {
		const baseFile = parse(defaultBaseFile()) as BaseFileConfig;
		const pendingView = baseFile.views?.find((view) => view.name === "Pending");
		const answeredView = baseFile.views?.find((view) => view.name === "Answered");
		const allRequestsView = baseFile.views?.find((view) => view.name === "All requests");

		expect(baseFile.filters).toBeUndefined();
		expect(pendingView).toMatchObject({
			type: BASES_VIEW_TYPE,
			filters: { and: [`type == "${REQUEST_TYPE}"`, 'status == "pending"'] },
		});
		expect(answeredView).toMatchObject({
			type: BASES_VIEW_TYPE,
			filters: { and: [`type == "${REQUEST_TYPE}"`, 'status == "answered"'] },
		});
		expect(allRequestsView).toMatchObject({
			type: "table",
			filters: { and: [`type == "${REQUEST_TYPE}"`] },
		});
		expect(pendingView?.options).toBeUndefined();
		expect(answeredView?.options).toBeUndefined();
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
	});
});
