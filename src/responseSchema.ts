import type { FieldDefinition, TypeDefinition } from "./types";

const SYSTEM_RESPONSE_FIELDS = new Set([
	"id",
	"type",
	"types",
	"request",
	"responded_at",
	"responder",
	"attachment_paths",
]);

export interface EditableField {
	name: string;
	definition: FieldDefinition;
}

export function getEditableResponseFields(typeDefinition: TypeDefinition): EditableField[] {
	return Object.entries(typeDefinition.fields ?? {})
		.filter(([name, definition]) => {
			if (SYSTEM_RESPONSE_FIELDS.has(name)) return false;
			if (definition.generated !== undefined) return false;
			if (definition.computed !== undefined) return false;
			return true;
		})
		.map(([name, definition]) => ({ name, definition }));
}

export function isRequiredField(definition: FieldDefinition): boolean {
	return definition.required === true && definition.default === undefined;
}

export function coerceFieldValue(definition: FieldDefinition, rawValue: string | boolean): unknown {
	if (definition.type === "boolean") {
		return Boolean(rawValue);
	}

	if (typeof rawValue !== "string") {
		return rawValue;
	}

	const trimmed = rawValue.trim();

	if (trimmed.length === 0) {
		return undefined;
	}

	switch (definition.type) {
		case "integer":
			return Number.parseInt(trimmed, 10);
		case "number":
			return Number.parseFloat(trimmed);
		case "list":
			return trimmed
				.split(/\r?\n|,/u)
				.map((item) => item.trim())
				.filter((item) => item.length > 0);
		case "object":
			return JSON.parse(trimmed) as unknown;
		default:
			return trimmed;
	}
}

export function defaultFieldValue(definition: FieldDefinition): string | boolean {
	if (definition.type === "boolean") {
		return Boolean(definition.default);
	}

	if (Array.isArray(definition.default)) {
		return definition.default.join("\n");
	}

	if (
		typeof definition.default === "string" ||
		typeof definition.default === "number" ||
		typeof definition.default === "boolean"
	) {
		return String(definition.default);
	}

	if (definition.default !== undefined && definition.default !== null) {
		return JSON.stringify(definition.default);
	}

	if (definition.type === "enum" && definition.values && definition.values.length > 0) {
		return definition.values[0] ?? "";
	}

	return "";
}

export function fieldDescription(name: string, definition: FieldDefinition): string {
	if (definition.description) {
		return definition.description;
	}

	if (definition.required) {
		return `${name} is required.`;
	}

	return "";
}
