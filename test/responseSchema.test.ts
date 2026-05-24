import { describe, expect, it } from "vitest";
import { coerceFieldValue, getEditableResponseFields } from "../src/responseSchema";
import type { TypeDefinition } from "../src/types";

describe("response schema", () => {
	it("excludes system-managed response fields", () => {
		const typeDefinition: TypeDefinition = {
			name: "pickle_response_approval",
			fields: {
				id: { type: "string", generated: "ulid" },
				request: { type: "link", required: true },
				decision: { type: "enum", values: ["approve", "reject"], required: true },
				comment: { type: "string" },
				responded_at: { type: "datetime", generated: "now" },
			},
		};

		expect(getEditableResponseFields(typeDefinition).map((field) => field.name)).toEqual([
			"decision",
			"comment",
		]);
	});

	it("coerces mdbase scalar and collection inputs", () => {
		expect(coerceFieldValue({ type: "integer" }, "42")).toBe(42);
		expect(coerceFieldValue({ type: "number" }, "4.5")).toBe(4.5);
		expect(coerceFieldValue({ type: "list" }, "a\nb, c")).toEqual(["a", "b", "c"]);
		expect(coerceFieldValue({ type: "boolean" }, true)).toBe(true);
	});
});
