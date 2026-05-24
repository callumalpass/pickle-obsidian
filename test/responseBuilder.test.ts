import { describe, expect, it } from "vitest";
import {
	buildResponseFrontmatter,
	linkTargetsRequest,
	normalizeLinkTarget,
	requestLinkValue,
} from "../src/responseBuilder";

describe("response builder", () => {
	it("links responses to collection-relative request paths", () => {
		expect(requestLinkValue("requests/approve-build.md")).toBe("[[requests/approve-build]]");
		expect(linkTargetsRequest("[[requests/approve-build]]", "requests/approve-build.md")).toBe(
			true
		);
		expect(
			linkTargetsRequest("[[requests/approve-build|Approve build]]", "requests/approve-build.md")
		).toBe(true);
	});

	it("normalizes common link syntaxes", () => {
		expect(normalizeLinkTarget("[[requests/approve-build.md#Notes|Approve]]")).toBe(
			"requests/approve-build"
		);
		expect(normalizeLinkTarget("[Approve](requests/approve-build.md)")).toBe(
			"requests/approve-build"
		);
	});

	it("builds response frontmatter with system fields", () => {
		const frontmatter = buildResponseFrontmatter({
			responseType: "pickle_response_approval",
			requestPath: "requests/approve-build.md",
			values: {
				decision: "approve",
				comment: "Looks right.",
			},
			responder: "callum",
			attachmentPaths: ["attachments/r1/context.txt"],
			now: new Date("2026-05-24T00:00:00.000Z"),
		});

		expect(frontmatter).toMatchObject({
			type: "pickle_response_approval",
			request: "[[requests/approve-build]]",
			decision: "approve",
			comment: "Looks right.",
			responder: "callum",
			responded_at: "2026-05-24T00:00:00.000Z",
			attachment_paths: ["attachments/r1/context.txt"],
		});
	});

	it("preserves nested response values for complex response schemas", () => {
		const frontmatter = buildResponseFrontmatter({
			responseType: "pickle_response_complex",
			requestPath: "requests/complex-approval.md",
			values: {
				decision: "approve",
				risk_accepted: true,
				rollout_steps: ["Deploy canary", "Promote after review"],
				review: {
					summary: "The staged rollout is acceptable.",
					severity: "medium",
				},
			},
			responder: "callum",
			attachmentPaths: [],
			now: new Date("2026-05-24T00:00:00.000Z"),
		});

		expect(frontmatter).toMatchObject({
			type: "pickle_response_complex",
			decision: "approve",
			risk_accepted: true,
			rollout_steps: ["Deploy canary", "Promote after review"],
			review: {
				summary: "The staged rollout is acceptable.",
				severity: "medium",
			},
		});
	});
});
