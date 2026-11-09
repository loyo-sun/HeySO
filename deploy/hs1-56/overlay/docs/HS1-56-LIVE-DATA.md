# HS1-56 live data backend

Introduces live-v1 project actions, latest-state reads and authenticated long-poll notifications. Same user locks, business validation, quota transactions, idempotency and editor/MCP permissions remain in force. Successful live saves update the mutable current JSON, without the legacy timed history window. Existing named/packed history remains recoverable. BaizeFig storage paths keep their behavior.

Additive migration: cloud_documents.heyso_live. Legacy clients still use their previous-head check; once a document is migrated, both protocols use mutable current storage. Internal heads invalidate caches; they are not user-facing history versions. Stale text edits without a base are rejected for explicit review.

Tests: tests/heyso-live.test.mjs runs real routes and PGlite transactions without listening on a network port. This is not production/browser verification. Deploy only as a matched frontend/backend pair, after checking the production baseline and taking the existing backup. Frontend deployment sources and the server overlay are in the HeySO HS1-56 candidate branch.
