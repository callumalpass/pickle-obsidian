import { describe, expect, it } from "vitest";
import { deriveRequestState } from "../src/requestState";

describe("request state derivation", () => {
	it("uses response link count as the source of truth for answered state", () => {
		expect(deriveRequestState({ status: "answered" }, 0)).toBe("pending");
		expect(deriveRequestState({ status: "pending" }, 1)).toBe("answered");
		expect(deriveRequestState({ status: "pending" }, 2)).toBe("conflict");
	});

	it("preserves explicit cancellation as request lifecycle state", () => {
		expect(deriveRequestState({ status: "cancelled" }, 0)).toBe("cancelled");
		expect(deriveRequestState({ status: "cancelled" }, 1)).toBe("cancelled");
	});
});
