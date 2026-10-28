# Location-only checkpoint integration

Approved design: checkpoint phones record a box at their selected location. The dashboard shows wards and counts. No pickup scans, collection action, round selection, or porter confirmations. Boxes remain listed at wards until scanned at Blood Bank.

Implementation plan:
- Replace toggle transitions with idempotent location recording; test repeat reads, ward movement and Blood Bank returns.
- Add a Node SQLite store and HTTP API sharing boxes and tag mappings between clients. Test persistence, unknown IDs, invalid locations and repeated scans.
- Split dashboard and checkpoint views, keep setup/demo controls secondary, add cancellable continuous NFC scanning.
- Document one-server demo setup and HTTPS requirement. Run tests, build, lint and HTTP smoke checks.

Use the existing React/Vite stack and Node built-ins. No paid services, deployment, commits or pushes. Existing package-lock modifications are user-owned.

Completed: location-only rules, SQLite API, two views, tag setup, cancellable reader, demo guide. Verified 12 unit/render/store tests, production build, lint, server type-check through build, and isolated HTTP smoke test. Physical NFC remains unverified.

User correction: retain original prototype tracking JSX and inline styles exactly; move original location, scan, unknown-tag mapping, simulation and reset to reader. Restored from initial Git version. Source comparison verifies tracking markup and inline styles match. Shared location-only updates remain.
