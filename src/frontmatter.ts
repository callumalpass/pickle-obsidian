import { parse, stringify } from "yaml";
import type { ParsedMarkdown } from "./types";

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n([\s\S]*))?$/u;

function asRecord(value: unknown): Record<string, unknown> {
	if (value !== null && typeof value === "object" && !Array.isArray(value)) {
		return value as Record<string, unknown>;
	}

	return {};
}

export function parseMarkdown(content: string): ParsedMarkdown {
	const match = FRONTMATTER_PATTERN.exec(content);
	if (!match) {
		return {
			frontmatter: {},
			body: content,
		};
	}

	return {
		frontmatter: asRecord(parse(match[1] ?? "")),
		body: match[2] ?? "",
	};
}

export function markdownWithFrontmatter(
	frontmatter: Record<string, unknown>,
	body = ""
): string {
	const serialized = stringify(frontmatter).trimEnd();
	const normalizedBody = body.replace(/^\s+/u, "");
	return `---\n${serialized}\n---\n\n${normalizedBody}`;
}
