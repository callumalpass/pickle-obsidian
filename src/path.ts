export function normalizeVaultPath(value: string): string {
	return value
		.replace(/\\/gu, "/")
		.replace(/^\/+/u, "")
		.replace(/\/+/gu, "/")
		.replace(/\/$/u, "");
}

export function joinVaultPath(...parts: string[]): string {
	return normalizeVaultPath(parts.filter((part) => part.length > 0).join("/"));
}

export function ensureMarkdownExtension(value: string): string {
	return value.toLowerCase().endsWith(".md") ? value : `${value}.md`;
}

export function stripMarkdownExtension(value: string): string {
	return value.replace(/\.md$/iu, "");
}

export function collectionRelativePath(vaultPath: string, collectionFolder: string): string | null {
	const normalizedVaultPath = normalizeVaultPath(vaultPath);
	const normalizedCollectionFolder = normalizeVaultPath(collectionFolder);
	const prefix = `${normalizedCollectionFolder}/`;

	if (normalizedVaultPath === normalizedCollectionFolder) {
		return "";
	}

	if (!normalizedVaultPath.startsWith(prefix)) {
		return null;
	}

	return normalizedVaultPath.slice(prefix.length);
}

export function vaultPathForCollectionPath(
	collectionFolder: string,
	relativePath: string
): string {
	return joinVaultPath(collectionFolder, relativePath);
}

export function slugify(value: string): string {
	const slug = value
		.trim()
		.toLowerCase()
		.replace(/['"]/gu, "")
		.replace(/[^a-z0-9]+/gu, "-")
		.replace(/^-+|-+$/gu, "")
		.slice(0, 72);

	return slug.length > 0 ? slug : "pickle-request";
}

export function uniqueTimestamp(date = new Date()): string {
	return date.toISOString().replace(/[-:]/gu, "").replace(/\.(\d{3})Z$/u, "$1Z");
}

export function safeAttachmentName(name: string): string {
	const normalized = name.replace(/\\/gu, "/");
	const basename = normalized.split("/").pop() ?? normalized;
	const safe = basename.replace(/[^A-Za-z0-9._-]+/gu, "-").replace(/^-+|-+$/gu, "");
	return safe.length > 0 ? safe : "attachment.bin";
}
