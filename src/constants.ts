import type { PickleApprovalSettings } from "./types";

export const REQUEST_TYPE = "pickle_request";
export const DEFAULT_APPROVAL_RESPONSE_TYPE = "pickle_response_approval";
export const DEFAULT_ACK_RESPONSE_TYPE = "pickle_response_ack";
export const BASES_VIEW_TYPE = "pickleApprovalRequests";

export const DEFAULT_SETTINGS: PickleApprovalSettings = {
	collectionFolder: "_pickle",
	requestsFolder: "requests",
	responsesFolder: "responses",
	attachmentsFolder: "attachments",
	baseFile: "Pickle Requests.base",
	defaultResponder: "human",
};
