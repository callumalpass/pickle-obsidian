# Pickle

Pickle is a local-first, file-based Obsidian inbox for typed agent requests and
structured human responses.

It turns a plain Markdown folder into a lightweight Pickle Inbox:

- agents create typed request files under `_pickle/requests/`
- humans review those requests in Obsidian Bases
- humans respond through a schema-driven modal
- response files are written under `_pickle/responses/`
- request and response files remain in the vault as the audit trail

## Why

Pickle is for human checkpoints in local automation. It is useful when an agent
or scheduled job needs a real decision before it changes state, posts a comment,
closes an issue, deploys something, or applies a generated plan.

The important idea is that request state is represented as files, not as
ephemeral UI state. A request is answered when a response file links back to it.
Downstream automation should consume the response file, copy the decision into
its own workflow state, and leave the Pickle files intact.

## Features

- Maintains the default `_pickle` collection layout.
- Creates `pickle_request`, `pickle_response_approval`, and `pickle_response_ack`
  type files.
- Creates a default `Pickle Requests.base` file with request and response views.
- Adds custom Bases views for pending, answered, and conflicting request rows.
- Opens a response modal directly from the base view or active request file.
- Renders request body and structured context beside the response form.
- Builds response forms from the requested response type.
- Supports nested response schemas, including object fields and list fields.
- Supports response attachments, copied into the collection attachments folder.
- Derives request state from response links. The plugin does not mark requests
  answered by mutating `status`.
- Uses a small custom Pickle icon in commands and request actions.

## Related Projects

Pickle works fine as a standalone Obsidian plugin, but can also be used with these related projects:

- [Pickle](https://github.com/callumalpass/pickle): the local server, CLI, API,
  and collection-backed inbox.
- [Pickle Android](https://github.com/callumalpass/pickle-android): the mobile
  client for reviewing and answering Pickle requests.
- [Pickle Obsidian skill](https://github.com/callumalpass/pickle-obsidian-skill):
  agent-facing instructions for creating and consuming Obsidian Pickle requests.
- [mdbase spec](https://github.com/callumalpass/mdbase-spec): the typed
  Markdown collection contract behind the `_pickle` schema.
- [mdbase](https://github.com/callumalpass/mdbase): the TypeScript mdbase
  implementation used by related tooling.
- [Tickle](https://github.com/callumalpass/tickle): the lightweight scheduler
  used by local automations that can create Pickle requests.

## Requirements

- Obsidian `1.12.2` or newer.
- Desktop or mobile Obsidian.
- Node.js and npm for development builds.

Pickle keeps the `mdbase.yaml` and `_types/` files so agents can share the same
schema contract, but the plugin itself reads and writes through Obsidian's vault
API. It does not need Node or a filesystem-backed vault at runtime.

## Collection Layout

By default the plugin maintains this folder in the vault:

```text
_pickle/
  mdbase.yaml
  Pickle Requests.base
  _types/
    pickle_request.md
    pickle_response_approval.md
    pickle_response_ack.md
  requests/
  responses/
  attachments/
```

The folder names can be changed in plugin settings.

## Request Files

Agents create request files with type `pickle_request`:

```yaml
---
type: pickle_request
title: "Approve issue close-out?"
source: "tasknotes-ops"
kind: approval
priority: normal
response_type: pickle_response_approval
message: "Please approve, reject, or revise this proposed close-out."
created_at: "2026-05-24T00:00:00.000Z"
dedupe_key: "tasknotes-closeout-1234"
attachment_paths:
  - "attachments/tasknotes-closeout-1234/context.md"
context:
  cwd: "/home/calluma/projects/tasknotes"
  repo: "callumalpass/tasknotes"
  task: "close issue 1234"
---
Please approve, reject, or revise this proposed close-out.
```

Key fields:

- `title`: human-readable request title.
- `source`: creator or automation source.
- `message`: short request text for clients that consume frontmatter directly.
- `kind`: request shape, such as `approval`, `choice`, `input`, `notice`, or
  `message`.
- `priority`: `low`, `normal`, `high`, or `urgent`.
- `status`: legacy lifecycle marker. It may be used for `cancelled`, but it is
  not authoritative for answered state.
- `response_type`: name of the response type file the modal should render.
- `dedupe_key`: stable key for repeated automation checks.
- `attachment_paths`: collection-relative paths to supporting files.
- `context`: small structured metadata for the request pane.

Large logs and long context should usually be attachments instead of frontmatter.

## Response Files

The default response type is `pickle_response_approval`:

```yaml
---
type: pickle_response_approval
request: "[[requests/approve-issue-close-out]]"
decision: approve
comment: "Looks good."
responded_at: "2026-05-24T00:05:00.000Z"
responder: human
---
```

Do not infer approval from the request body or request status alone. A request is
answered when a response file links back to it through `request`.

Message requests can use the bundled `pickle_response_ack` type:

```yaml
---
type: pickle_response_ack
request: "[[requests/read-update]]"
message: "Acknowledged."
responded_at: "2026-05-24T00:05:00.000Z"
responder: human
---
```

## Custom Response Types

A request can point at any response type in `_pickle/_types/` by setting
`response_type`.

For example, a richer response schema can ask for booleans, repeatable steps, and
nested review metadata:

```yaml
---
kind: mdbase.type
name: pickle_response_complex
version: 1
description: Complex approval response.
schema:
  dialect: json-schema-2020-12
  value:
    type: object
    required: [request, decision, risk_accepted]
    properties:
      request: { type: string }
      decision: { enum: [approve, reject, revise] }
      risk_accepted: { type: boolean }
      rollout_steps:
        type: array
        minItems: 2
        items: { type: string }
      review:
        type: object
        required: [summary]
        properties:
          summary: { type: string }
          severity: { enum: [low, medium, high] }
      comment: { type: string }
collection:
  display:
    name_field: decision
  links:
    request:
      target_type: pickle_request
      validate_exists: true
---
```

New Pickle collections use mdbase v0.3. The plugin continues to read and maintain
existing v0.2 collections without rewriting their type grammar.

The modal renders editable fields recursively:

- enum fields become dropdowns
- boolean fields become toggles
- list fields become repeatable rows
- object fields become nested field groups
- string comments become textareas

Generated, computed, and system-managed fields such as `id`, `request`,
`responded_at`, `responder`, and `attachment_paths` are written by the plugin and
are not shown as user-editable fields.

## Obsidian Workflow

1. Enable the plugin.
2. Run `Pickle: Maintain collection`, or let the plugin create the collection on
   load.
3. Open `Pickle: Open request base`.
4. Review pending requests in the `Pending` view.
5. Click the Pickle action button on a row.
6. Read the request body and structured context in the modal.
7. Fill the response form and create or update the response.

The default base file includes these views:

- `Pending`
- `Answered`
- `Conflicts`
- `All requests`
- `Responses`
- `Approved`
- `Rejected`
- `Revisions`

## Commands

Commands appear under the `Pickle:` prefix in Obsidian:

- `Maintain collection`: create or refresh folders, type files, and the base file.
- `Validate collection`: validate Pickle files against the local type files.
- `Open request base`: open the maintained base file.
- `Respond to current request`: open the response modal for the active request
  file.

## Settings

- `Collection folder`: default `_pickle`.
- `Requests folder`: default `requests`.
- `Responses folder`: default `responses`.
- `Attachments folder`: default `attachments`.
- `Base file`: default `Pickle Requests.base`.
- `Default responder`: default `human`.

## Agent Contract

The sibling skill in `../pickle-obsidian-skill` describes the agent-facing
workflow. In short:

1. Create one clear request file under `_pickle/requests/`.
2. Ensure the request's `response_type` exists under `_pickle/_types/`.
3. Put bulky context under `_pickle/attachments/<request-id>/`.
4. Reference attachments by collection-relative path.
5. Validate with `mdbase validate` from inside `_pickle` when available.
6. Wait for a response file whose `request` link targets the request.
7. Validate that the response type matches the request's `response_type`.
8. Copy the decision into the upstream workflow state before acting.

Keep rejection and revision handling explicit in the upstream workflow. Pickle is
the request inbox and audit trail, not the owner of every downstream state
machine.

## Development

Install dependencies:

```bash
npm install
```

Run checks:

```bash
npm run typecheck
npm run lint
npm test
```

`npm test` includes a compatibility harness that imports selected core fixtures
from `../mdbase-spec/tests` when that sibling repo is present. To run only those
imported mdbase-spec cases:

```bash
npm run test:mdbase-spec
```

Build the plugin:

```bash
npm run build
```

Build and copy into the configured test vault:

```bash
npm run build:test
```

`copy-files.mjs` copies `main.js`, `styles.css`, and `manifest.json`. By default
it copies to:

```text
/home/calluma/testvault/test/.obsidian/plugins/pickle
```

Set `OBSIDIAN_PLUGIN_PATH` or create `.copy-files.local` to copy elsewhere.

After copying, reload in Obsidian:

```bash
obsidian plugin:reload id=pickle
obsidian dev:errors limit=20
```

## Release

The build workflow runs linting, typechecking, tests, a production build,
release metadata checks, and GitHub artifact attestations for the Obsidian
install assets. It uploads these assets as a workflow artifact:

- `main.js`
- `manifest.json`
- `styles.css`

To publish a GitHub release for Obsidian, update `manifest.json`,
`package.json`, `versions.json`, and `CHANGELOG.md`, then push a tag that exactly
matches the manifest version:

```bash
git tag 0.1.0
git push origin 0.1.0
```

The workflow publishes or updates the matching GitHub Release with the three
plugin assets. Use plain semver tags such as `0.1.0`; do not prefix release tags
with `v`.
