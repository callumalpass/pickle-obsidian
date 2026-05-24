import { stripMarkdownExtension } from "./path";

export function requestLinkValue(requestRelativePath: string): string {
	return `[[${stripMarkdownExtension(requestRelativePath)}]]`;
}

export function normalizeLinkTarget(rawValue: unknown): string | null {
	if (typeof rawValue !== "string") {
		return null;
	}

	let value = rawValue.trim();
	const wikiMatch = /^\[\[([\s\S]+)\]\]$/u.exec(value);
	if (wikiMatch) {
		value = wikiMatch[1] ?? "";
	} else {
		const markdownMatch = /^\[[^\]]*\]\(([^)]+)\)$/u.exec(value);
		if (markdownMatch) {
			value = markdownMatch[1] ?? "";
		}
	}

	const pipeIndex = value.indexOf("|");
	if (pipeIndex >= 0) {
		value = value.slice(0, pipeIndex);
	}

	const hashIndex = value.indexOf("#");
	if (hashIndex >= 0) {
		value = value.slice(0, hashIndex);
	}

	return stripMarkdownExtension(value.replace(/\\/gu, "/").replace(/^\/+/u, "")).replace(
		/^\.\//u,
		""
	);
}

export function linkTargetsRequest(
	rawValue: unknown,
	requestRelativePath: string,
	collectionFolder?: string
): boolean {
	const target = normalizeLinkTarget(rawValue);
	if (!target) return false;

	const requestWithoutExtension = stripMarkdownExtension(requestRelativePath);
	const candidates = new Set<string>([requestWithoutExtension]);

	if (collectionFolder) {
		candidates.add(`${stripMarkdownExtension(collectionFolder)}/${requestWithoutExtension}`);
	}

	if (!target.includes("/")) {
		const requestName = requestWithoutExtension.split("/").pop();
		if (requestName) {
			candidates.add(requestName);
		}
	}

	return candidates.has(target);
}

export function buildResponseFrontmatter(input: {
	responseType: string;
	requestPath: string;
	values: Record<string, unknown>;
	responder: string;
	attachmentPaths: string[];
	now?: Date;
}): Record<string, unknown> {
	const frontmatter: Record<string, unknown> = {
		type: input.responseType,
		request: requestLinkValue(input.requestPath),
		responded_at: (input.now ?? new Date()).toISOString(),
		responder: input.responder,
		...input.values,
	};

	if (input.attachmentPaths.length > 0) {
		frontmatter.attachment_paths = input.attachmentPaths;
	}

	return frontmatter;
}
