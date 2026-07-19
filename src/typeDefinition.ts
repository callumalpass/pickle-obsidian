import type { FieldDefinition, TypeDefinition } from "./types";

type UnknownRecord = Record<string, unknown>;

export function normalizeTypeDefinition(value: unknown): TypeDefinition {
	const raw = asRecord(value);
	const name = typeof raw.name === "string" ? raw.name : "";
	const legacyFields = asOptionalRecord(raw.fields);
	if (legacyFields) {
		return raw as unknown as TypeDefinition;
	}

	const schemaWrapper = asRecord(raw.schema);
	const schema = asRecord(schemaWrapper.value);
	const properties = asRecord(schema.properties);
	const required = new Set(
		Array.isArray(schema.required)
			? schema.required.filter((item): item is string => typeof item === "string")
			: []
	);
	const fields: Record<string, FieldDefinition> = {};
	for (const [fieldName, property] of Object.entries(properties)) {
		fields[fieldName] = jsonSchemaField(property, required.has(fieldName));
	}

	const collection = asRecord(raw.collection);
	const defaults = asRecord(collection.read_defaults);
	for (const [fieldName, defaultValue] of Object.entries(defaults)) {
		fields[fieldName] ??= { type: "any" };
		fields[fieldName].default = defaultValue;
	}

	const links = asRecord(collection.links);
	for (const [fieldPath, ruleValue] of Object.entries(links)) {
		if (fieldPath.includes(".") || fieldPath.endsWith("[]")) continue;
		const rule = asRecord(ruleValue);
		fields[fieldPath] ??= { type: "link" };
		fields[fieldPath].type = "link";
		if (typeof rule.target_type === "string") {
			fields[fieldPath].target_type = rule.target_type;
		}
		if (typeof rule.validate_exists === "boolean") {
			fields[fieldPath].validate_exists = rule.validate_exists;
		}
	}

	const uniqueRules = Array.isArray(collection.unique) ? collection.unique : [];
	for (const ruleValue of uniqueRules) {
		const rule = asRecord(ruleValue);
		if (typeof rule.field === "string" && fields[rule.field]) {
			fields[rule.field].unique = true;
		}
	}

	applyLifecycle(fields, raw.lifecycle);
	const display = asRecord(collection.display);
	return {
		name,
		description: typeof raw.description === "string" ? raw.description : undefined,
		display_name_key:
			typeof display.name_field === "string" ? display.name_field : undefined,
		fields,
	};
}

function jsonSchemaField(value: unknown, required = false): FieldDefinition {
	const schema = asRecord(value);
	const field: FieldDefinition = {
		type: jsonSchemaType(schema),
		...(required ? { required: true } : {}),
	};

	const enumValues = jsonSchemaEnum(schema);
	if (enumValues) {
		field.type = "enum";
		field.values = enumValues;
	}
	if (field.type === "list") {
		field.items = jsonSchemaField(schema.items);
	}
	if (field.type === "object") {
		const childProperties = asRecord(schema.properties);
		const childRequired = new Set(
			Array.isArray(schema.required)
				? schema.required.filter((item): item is string => typeof item === "string")
				: []
		);
		field.fields = Object.fromEntries(
			Object.entries(childProperties).map(([name, property]) => [
				name,
				jsonSchemaField(property, childRequired.has(name)),
			])
		);
	}

	if (schema.default !== undefined) field.default = schema.default;
	if (typeof schema.description === "string") field.description = schema.description;
	if (typeof schema.minLength === "number") field.min_length = schema.minLength;
	if (typeof schema.maxLength === "number") field.max_length = schema.maxLength;
	if (typeof schema.minimum === "number") field.min = schema.minimum;
	if (typeof schema.maximum === "number") field.max = schema.maximum;
	if (typeof schema.minItems === "number") field.min_items = schema.minItems;
	if (typeof schema.maxItems === "number") field.max_items = schema.maxItems;
	return field;
}

function jsonSchemaType(schema: UnknownRecord): string {
	const rawType: unknown = schema.type;
	const type: unknown = Array.isArray(rawType)
		? rawType.find((item: unknown) => item !== "null")
		: rawType;
	switch (type) {
		case "string":
			if (schema.format === "date") return "date";
			if (schema.format === "date-time") return "datetime";
			if (schema.format === "time") return "time";
			return "string";
		case "integer":
			return "integer";
		case "number":
			return "number";
		case "boolean":
			return "boolean";
		case "array":
			return "list";
		case "object":
			return "object";
		default:
			return schema.const !== undefined ? "enum" : "any";
	}
}

function jsonSchemaEnum(schema: UnknownRecord): string[] | undefined {
	if (Array.isArray(schema.enum) && schema.enum.every((item) => typeof item === "string")) {
		return schema.enum;
	}
	if (typeof schema.const === "string") return [schema.const];
	if (Array.isArray(schema.oneOf)) {
		const values = schema.oneOf
			.map((entry) => asRecord(entry).const)
			.filter((item): item is string => typeof item === "string");
		if (values.length === schema.oneOf.length) return values;
	}
	return undefined;
}

function applyLifecycle(
	fields: Record<string, FieldDefinition>,
	value: unknown
): void {
	const lifecycle = asRecord(value);
	for (const event of ["on_create", "on_update"] as const) {
		const rawActions = lifecycle[event];
		const actions = Array.isArray(rawActions) ? rawActions : [rawActions];
		for (const actionValue of actions) {
			const set = asRecord(asRecord(actionValue).set);
			for (const [fieldName, generatorValue] of Object.entries(set)) {
				const generator = asRecord(generatorValue);
				fields[fieldName] ??= { type: "any" };
				if (generator.ulid === true) fields[fieldName].generated = "ulid";
				if (generator.uuid === true) fields[fieldName].generated = "uuid";
				if (generator.now === true) {
					fields[fieldName].generated = event === "on_update" ? "now_on_write" : "now";
				}
			}
		}
	}
}

function asRecord(value: unknown): UnknownRecord {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? value as UnknownRecord
		: {};
}

function asOptionalRecord(value: unknown): UnknownRecord | undefined {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? value as UnknownRecord
		: undefined;
}
