import {
	BASES_VIEW_TYPE,
	DEFAULT_ACK_RESPONSE_TYPE,
	DEFAULT_APPROVAL_RESPONSE_TYPE,
	REQUEST_TYPE,
} from "./constants";

export const MDBASE_CONFIG = `spec_version: "0.3.0"
name: Pickle
description: Local mdbase collection for Pickle requests and responses.
settings:
  types_folder: "_types"
  record_extensions: [md]
  validation: error
  exclude:
    - ".git"
    - "node_modules"
    - ".mdbase"
    - "attachments/**"
  include_subfolders: true
  explicit_type_keys: [type, types]
`;

export const PICKLE_REQUEST_TYPE = `---
kind: mdbase.type
name: ${REQUEST_TYPE}
version: 1
description: Async request that needs a human response.
schema:
  dialect: json-schema-2020-12
  value:
    $schema: "https://json-schema.org/draft/2020-12/schema"
    type: object
    additionalProperties: true
    required: [title, response_type]
    properties:
      type: { const: ${REQUEST_TYPE} }
      id: { type: string }
      title: { type: string, minLength: 1 }
      source: { type: string }
      message: { type: string }
      kind: { enum: [approval, choice, input, notice, message] }
      status:
        enum: [pending, answered, cancelled]
        description: Legacy lifecycle marker. Response links are authoritative for answered state.
      priority: { enum: [low, normal, high, urgent] }
      response_type: { type: string }
      created_at: { type: string, format: date-time }
      due_at: { type: string, format: date-time }
      dedupe_key: { type: string }
      tags:
        type: array
        items: { type: string }
      links:
        type: array
        items:
          type: object
          additionalProperties: false
          properties:
            label: { type: string }
            url: { type: string }
            path: { type: string }
      attachment_paths:
        type: array
        items: { type: string }
      metadata:
        type: object
        additionalProperties: true
      context:
        type: object
        additionalProperties: false
        properties:
          cwd: { type: string }
          repo: { type: string }
          task: { type: string }
collection:
  display:
    name_field: title
  unique:
    - field: id
      scope: collection
lifecycle:
  on_create:
    set:
      id: { ulid: true }
      created_at: { now: true }
---
`;

export const PICKLE_APPROVAL_RESPONSE_TYPE = `---
kind: mdbase.type
name: ${DEFAULT_APPROVAL_RESPONSE_TYPE}
version: 1
description: Approve, reject, or request revision for a Pickle request.
schema:
  dialect: json-schema-2020-12
  value:
    $schema: "https://json-schema.org/draft/2020-12/schema"
    type: object
    additionalProperties: true
    required: [request, decision]
    properties:
      type: { const: ${DEFAULT_APPROVAL_RESPONSE_TYPE} }
      id: { type: string }
      request: { type: string }
      decision: { enum: [approve, reject, revise] }
      comment: { type: string }
      responded_at: { type: string, format: date-time }
      responder: { type: string }
      attachment_paths:
        type: array
        items: { type: string }
collection:
  display:
    name_field: decision
  links:
    request:
      target_type: ${REQUEST_TYPE}
      validate_exists: true
  unique:
    - field: id
      scope: collection
lifecycle:
  on_create:
    set:
      id: { ulid: true }
      responded_at: { now: true }
---
`;

export const PICKLE_ACK_RESPONSE_TYPE = `---
kind: mdbase.type
name: ${DEFAULT_ACK_RESPONSE_TYPE}
version: 1
description: Acknowledge that a Pickle message was read.
schema:
  dialect: json-schema-2020-12
  value:
    $schema: "https://json-schema.org/draft/2020-12/schema"
    type: object
    additionalProperties: true
    required: [request]
    properties:
      type: { const: ${DEFAULT_ACK_RESPONSE_TYPE} }
      id: { type: string }
      request: { type: string }
      message: { type: string }
      responded_at: { type: string, format: date-time }
      responder: { type: string }
      attachment_paths:
        type: array
        items: { type: string }
collection:
  display:
    name_field: message
  links:
    request:
      target_type: ${REQUEST_TYPE}
      validate_exists: true
  unique:
    - field: id
      scope: collection
lifecycle:
  on_create:
    set:
      id: { ulid: true }
      responded_at: { now: true }
---
`;

export const MDBASE_CONFIG_V02 = `spec_version: "0.2.1"
name: Pickle
description: Local mdbase collection for Pickle requests and responses.
settings:
  types_folder: "_types"
  default_validation: "error"
  default_strict: false
  exclude:
    - ".git"
    - "node_modules"
    - ".mdbase"
    - "attachments/**"
  include_subfolders: true
  explicit_type_keys: ["type", "types"]
  cache_folder: ".mdbase"
`;

export const PICKLE_REQUEST_TYPE_V02 = `---
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
  message:
    type: string
  kind:
    type: enum
    values: [approval, choice, input, notice, message]
  status:
    type: enum
    description: Legacy lifecycle marker. Response links are authoritative for answered state.
    values: [pending, answered, cancelled]
  priority:
    type: enum
    values: [low, normal, high, urgent]
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

export const PICKLE_APPROVAL_RESPONSE_TYPE_V02 = `---
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

export const PICKLE_ACK_RESPONSE_TYPE_V02 = `---
name: ${DEFAULT_ACK_RESPONSE_TYPE}
description: Acknowledge that a Pickle message was read.
display_name_key: message
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
  message:
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
	return `properties:
  title:
    displayName: Title
  source:
    displayName: Source
  message:
    displayName: Message
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
  request:
    displayName: Request
  decision:
    displayName: Decision
  comment:
    displayName: Comment
  responded_at:
    displayName: Responded
  responder:
    displayName: Responder
  attachment_paths:
    displayName: Attachments
views:
  - type: ${BASES_VIEW_TYPE}
    name: Pending
    filters:
      and:
        - type == "${REQUEST_TYPE}"
    options:
      state: pending
    order:
      - priority
      - title
      - source
      - message
      - kind
      - response_type
      - created_at
      - status
      - file.name
  - type: ${BASES_VIEW_TYPE}
    name: Answered
    filters:
      and:
        - type == "${REQUEST_TYPE}"
    options:
      state: answered
    order:
      - priority
      - title
      - source
      - message
      - kind
      - response_type
      - created_at
      - status
      - file.name
  - type: ${BASES_VIEW_TYPE}
    name: Conflicts
    filters:
      and:
        - type == "${REQUEST_TYPE}"
    options:
      state: conflict
    order:
      - priority
      - title
      - source
      - message
      - kind
      - response_type
      - created_at
      - status
      - file.name
  - type: table
    name: All requests
    filters:
      and:
        - type == "${REQUEST_TYPE}"
    order:
      - status
      - priority
      - title
      - source
      - message
      - kind
      - response_type
      - created_at
      - file.name
  - type: table
    name: Responses
    filters:
      and:
        - request != null
    order:
      - responded_at
      - decision
      - request
      - responder
      - comment
      - attachment_paths
      - file.name
  - type: table
    name: Approved
    filters:
      and:
        - request != null
        - decision == "approve"
    order:
      - responded_at
      - request
      - responder
      - comment
      - attachment_paths
      - file.name
  - type: table
    name: Rejected
    filters:
      and:
        - request != null
        - decision == "reject"
    order:
      - responded_at
      - request
      - responder
      - comment
      - attachment_paths
      - file.name
  - type: table
    name: Revisions
    filters:
      and:
        - request != null
        - decision == "revise"
    order:
      - responded_at
      - request
      - responder
      - comment
      - attachment_paths
      - file.name
	`;
}
