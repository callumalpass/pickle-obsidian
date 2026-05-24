import { BASES_VIEW_TYPE, DEFAULT_APPROVAL_RESPONSE_TYPE, REQUEST_TYPE } from "./constants";

export const MDBASE_CONFIG = `spec_version: "0.2.1"
name: Pickle approval center
description: Local mdbase collection for async human approvals.
settings:
  types_folder: "_types"
  migrations_folder: "_types/_migrations"
  default_validation: "error"
  default_strict: false
  include_subfolders: true
  explicit_type_keys: ["type", "types"]
  cache_folder: ".mdbase"
`;

export const PICKLE_REQUEST_TYPE = `---
name: ${REQUEST_TYPE}
description: Async request that needs a human response.
display_name_key: title
fields:
  id:
    type: string
    generated: ulid
    unique: true
  title:
    type: string
    required: true
  source:
    type: string
  kind:
    type: enum
    values: [approval, choice, input, notice]
    default: approval
  status:
    type: enum
    values: [pending, answered, cancelled]
    default: pending
  priority:
    type: enum
    values: [low, normal, high, urgent]
    default: normal
  response_type:
    type: string
    required: true
  created_at:
    type: datetime
    generated: now
  due_at:
    type: datetime
  dedupe_key:
    type: string
  attachment_paths:
    type: list
    items:
      type: string
  context:
    type: object
    fields:
      cwd:
        type: string
      repo:
        type: string
      task:
        type: string
---
`;

export const PICKLE_APPROVAL_RESPONSE_TYPE = `---
name: ${DEFAULT_APPROVAL_RESPONSE_TYPE}
description: Approve, reject, or request revision for a Pickle request.
display_name_key: decision
fields:
  id:
    type: string
    generated: ulid
    unique: true
  request:
    type: link
    target: ${REQUEST_TYPE}
    validate_exists: true
    required: true
  decision:
    type: enum
    values: [approve, reject, revise]
    required: true
  comment:
    type: string
  responded_at:
    type: datetime
    generated: now
  responder:
    type: string
  attachment_paths:
    type: list
    items:
      type: string
---
`;

export function defaultBaseFile(): string {
	return `filters:
  and:
    - type == "${REQUEST_TYPE}"
properties:
  title:
    displayName: Title
  source:
    displayName: Source
  kind:
    displayName: Kind
  priority:
    displayName: Priority
  response_type:
    displayName: Response type
  created_at:
    displayName: Created
  status:
    displayName: Status
views:
  - type: ${BASES_VIEW_TYPE}
    name: Pending
    filters:
      and:
        - status == "pending"
    order:
      - priority
      - title
      - source
      - kind
      - response_type
      - created_at
      - status
      - file.name
  - type: ${BASES_VIEW_TYPE}
    name: Answered
    filters:
      and:
        - status == "answered"
    order:
      - priority
      - title
      - source
      - kind
      - response_type
      - created_at
      - status
      - file.name
  - type: table
    name: All
    order:
      - status
      - priority
      - title
      - source
      - kind
      - response_type
      - created_at
      - file.name
	`;
}
