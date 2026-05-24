import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { BASES_VIEW_TYPE, DEFAULT_APPROVAL_RESPONSE_TYPE, REQUEST_TYPE } from "../src/constants";
import { defaultBaseFile } from "../src/templates";

interface BaseViewConfig {
	type: string;
	name: string;
	filters?: {
		and?: string[];
	};
	options?: Record<string, unknown>;
}

interface BaseFileConfig {
	filters?: {
		and?: string[];
	};
	views?: BaseViewConfig[];
}

describe("default templates", () => {
	it("maintains a Bases file with the custom request view", () => {
		const baseFile = parse(defaultBaseFile()) as BaseFileConfig;
		const pendingView = baseFile.views?.find((view) => view.name === "Pending");
		const answeredView = baseFile.views?.find((view) => view.name === "Answered");

		expect(baseFile.filters?.and).toContain(`type == "${REQUEST_TYPE}"`);
		expect(pendingView).toMatchObject({
			type: BASES_VIEW_TYPE,
			filters: { and: ['status == "pending"'] },
		});
		expect(answeredView).toMatchObject({
			type: BASES_VIEW_TYPE,
			filters: { and: ['status == "answered"'] },
		});
		expect(pendingView?.options).toBeUndefined();
		expect(answeredView?.options).toBeUndefined();
	});

	it("uses the default approval response type name consistently", () => {
		expect(DEFAULT_APPROVAL_RESPONSE_TYPE).toBe("pickle_response_approval");
	});
});
