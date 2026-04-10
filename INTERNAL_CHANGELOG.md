# Internal Changelog

This is an internal catch-up changelog. Entries are inferred and grouped for practicality, not exact historical sequencing.

## Build 0.9.3

- Stabilized map hazard rendering and fixed live layer visibility for flood and earthquake datasets.
- Added authenticated map request handling for protected API-backed map resources.
- Added footer build stamp above the bottom navigation with copyright notice.
- Hardened database migration scripts for idempotent re-runs in partially migrated environments.

## Build 0.9.2

- Expanded map experience with custom pins, layer control, map search, legends, and property popups.
- Introduced location insights and nearby amenity overlays.
- Added measurement tool and supporting map interaction improvements.
- Improved mobile map experience and route-level map page integration.

## Build 0.9.1

- Added backend map routing for map config, map properties, pin CRUD, and geocoding endpoints.
- Added geocoding service integration and map-oriented API wiring.
- Added supporting DB schema and migrations for map pin and map-related entities.
- Improved map-related shared types and frontend/backend alignment.

## Build 0.9.0

- Established baseline authenticated app shell with bottom navigation and core route structure.
- Added foundational property workflows and cross-feature data plumbing.
- Improved UI consistency and global styling for core app screens.
- Prepared initial map-capable architecture and dependencies for later build iterations.
