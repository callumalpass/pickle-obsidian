import { describe, expect, it } from "vitest";
import { uniqueTimestamp } from "../src/path";

describe("path helpers", () => {
	it("keeps milliseconds in generated timestamps", () => {
		expect(uniqueTimestamp(new Date("2026-05-24T11:10:01.123Z"))).toBe(
			"20260524T111001123Z"
		);
	});
});
