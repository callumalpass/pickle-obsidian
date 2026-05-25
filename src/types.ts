import type { PickleRequestState } from "./requestState";

export interface PickleApprovalSettings {
	collectionFolder: string;
	requestsFolder: string;
	responsesFolder: string;
	attachmentsFolder: string;
	baseFile: string;
	defaultResponder: string;
}

export interface FieldDefinition {
	type: string;
	required?: boolean;
	default?: unknown;
	description?: string;
	deprecated?: boolean;
	unique?: boolean;
	generated?: unknown;
	computed?: string;
	min_length?: number;
	max_length?: number;
	min?: number;
	max?: number;
	values?: string[];
	items?: FieldDefinition;
	min_items?: number;
	max_items?: number;
	fields?: Record<string, FieldDefinition>;
	target?: string;
	target_type?: string;
	validate_exists?: boolean;
}

export interface TypeDefinition {
	name: string;
	description?: string;
	display_name_key?: string;
	fields?: Record<string, FieldDefinition>;
	strict?: boolean | "warn";
}

export interface ParsedMarkdown {
	frontmatter: Record<string, unknown>;
	body: string;
}

export interface PickleRequestRecord {
	path: string;
	vaultPath: string;
	frontmatter: Record<string, unknown>;
	body?: string | null;
	answered: boolean;
	responseCount: number;
	derivedStatus: PickleRequestState;
}

export interface PickleResponseRecord {
	path: string;
	vaultPath: string;
	frontmatter: Record<string, unknown>;
	body?: string | null;
}

export interface AttachmentDraft {
	name: string;
	data: ArrayBuffer;
}

export interface CreateResponseInput {
	requestPath: string;
	responseType: string;
	values: Record<string, unknown>;
	body?: string;
	attachments?: AttachmentDraft[];
}

export interface UpdateResponseInput extends CreateResponseInput {
	responsePath: string;
}

export interface CreateResponseResult {
	path: string;
	vaultPath: string;
	frontmatter: Record<string, unknown>;
	attachmentPaths: string[];
}

export interface ValidationIssue {
	code: string;
	message: string;
	path?: string;
	field?: string;
	severity?: string;
}

export interface ValidationSummary {
	valid: boolean;
	issues: ValidationIssue[];
}

export interface SmokeTestResult {
	collectionPath: string;
	basePath: string;
	requestPath: string;
	responsePath: string;
	valid: boolean;
	issues: ValidationIssue[];
}
