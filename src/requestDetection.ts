import { REQUEST_TYPE } from "./constants";
import { collectionRelativePath } from "./path";

interface RequestFileCandidate {
	path: string;
	extension: string;
}

type Frontmatter = Record<string, unknown> | null | undefined;

export function isPickleRequestFile(
	file: RequestFileCandidate,
	frontmatter: Frontmatter,
	collectionFolder: string
): boolean {
	if (file.extension.toLowerCase() !== "md") return false;
	if (collectionRelativePath(file.path, collectionFolder) === null) return false;

	return (
		frontmatterHasPickleRequestType(frontmatter?.type) ||
		frontmatterHasPickleRequestType(frontmatter?.types)
	);
}

export function frontmatterHasPickleRequestType(value: unknown): boolean {
	if (typeof value === "string") return value === REQUEST_TYPE;
	if (Array.isArray(value)) {
		return value.some((item) => item === REQUEST_TYPE);
	}
	return false;
}
