import { describe, expect, it } from "vitest";
import { REQUEST_TYPE } from "../src/constants";
import { frontmatterHasPickleRequestType, isPickleRequestFile } from "../src/requestDetection";

describe("request detection", () => {
	it("recognizes request files in the pickle collection", () => {
		expect(
			isPickleRequestFile(
				{ path: "_pickle/requests/approval.md", extension: "md" },
				{ type: REQUEST_TYPE },
				"_pickle"
			)
		).toBe(true);
	});

	it("recognizes request files that use the types frontmatter key", () => {
		expect(
			isPickleRequestFile(
				{ path: "_pickle/requests/approval.md", extension: "md" },
				{ types: ["other", REQUEST_TYPE] },
				"_pickle"
			)
		).toBe(true);
	});

	it("rejects markdown files outside the pickle collection", () => {
		expect(
			isPickleRequestFile(
				{ path: "Inbox/approval.md", extension: "md" },
				{ type: REQUEST_TYPE },
				"_pickle"
			)
		).toBe(false);
	});

	it("rejects non-request files in the pickle collection", () => {
		expect(
			isPickleRequestFile(
				{ path: "_pickle/responses/approval.md", extension: "md" },
				{ type: "pickle_response_approval" },
				"_pickle"
			)
		).toBe(false);
	});

	it("rejects non-markdown files", () => {
		expect(
			isPickleRequestFile(
				{ path: "_pickle/requests/approval.base", extension: "base" },
				{ type: REQUEST_TYPE },
				"_pickle"
			)
		).toBe(false);
	});

	it("checks type and types values exactly", () => {
		expect(frontmatterHasPickleRequestType(REQUEST_TYPE)).toBe(true);
		expect(frontmatterHasPickleRequestType(["request", REQUEST_TYPE])).toBe(true);
		expect(frontmatterHasPickleRequestType("pickle_request_extra")).toBe(false);
		expect(frontmatterHasPickleRequestType(["request"])).toBe(false);
	});
});
