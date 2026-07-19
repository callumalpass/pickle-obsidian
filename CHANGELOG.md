# Changelog

All notable changes to Pickle are documented in this file.

The format is based on Keep a Changelog, and this project follows Semantic
Versioning.

## [Unreleased]

### Changed

- Create new Pickle collections with mdbase v0.3 JSON Schema type wrappers.
- Preserve the legacy type grammar when maintaining an existing v0.2 collection.
- Normalize v0.3 schemas for the response form and vault-native validation.
- Apply v0.3 lifecycle-generated IDs and timestamps in the vault adapter.
- Reject unsupported collection versions before writing bundled type files.

## [0.1.1] - 2026-06-01

### Fixed

- Honor `mdbase.yaml` exclude rules when scanning collection markdown, so
  attachment files under `attachments/**` cannot break Pickle request base
  views.

## [0.1.0] - 2026-05-26

### Added

- Initial Pickle Obsidian plugin release.
- Maintained `_pickle` collection layout with request, response, type, base, and
  attachment folders.
- Default `pickle_request`, `pickle_response_approval`, and
  `pickle_response_ack` type definitions.
- `Pickle Requests.base` with pending, answered, conflict, response, approval,
  rejection, and revision views.
- Custom Bases request views with desktop table and mobile card layouts.
- Schema-driven response modal for enum, boolean, string, number, integer,
  datetime, list, object, and link fields.
- Response attachment support, copied into the collection attachments folder.
- Request-state derivation from linked response files.
- Commands for maintaining the collection, validating the collection, opening the
  request base, and responding to the active request.
- Release-ready build checks, GitHub artifact attestations, MIT license, and
  generated Obsidian plugin assets.
