export type PickleRequestState = "pending" | "answered" | "conflict" | "cancelled";

export function deriveRequestState(
	frontmatter: Record<string, unknown>,
	responseCount: number
): PickleRequestState {
	if (frontmatter.status === "cancelled") return "cancelled";
	if (responseCount === 0) return "pending";
	if (responseCount === 1) return "answered";
	return "conflict";
}
