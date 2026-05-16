# Internal Changelog

This is an internal catch-up changelog. Entries are inferred and grouped for practicality, not exact historical sequencing.

## Build 0.13.0

- Added a workflow layer to the existing moving subsystem for a real sell/buy home move: item dispositions (keep / sell / donate / recycle / dump / stage_only / repair_clean_first), expanded item status vocabulary (surveyed → packed → staged → loaded → delivered → unpacked → installed, plus removed / missing / damaged), and room types (normal_room / holding_zone / staging_area / vehicle_zone / storage_zone).
- Extended the scan-event action vocabulary with stage / deliver_to_room / install / remove / mark_missing / mark_damaged. Existing pack / load / transit / arrive / unpack / lookup actions are preserved; new actions also cascade their item-status rollup to every item inside a scanned box.
- Added new `/moving` workflow tabs: Survey, Declutter, Stage, Pack, Load, Unpack, Exceptions — alongside the existing Floor Plan and Labels tabs. Legacy `inventory` / `boxes` / `scan` / `plans` tab deep links continue to resolve via aliases.
- Migration `0013_move_workflow.sql` adds the new columns + indexes and remaps legacy status values into the new vocabulary while keeping the floor-plan render unchanged (all existing rooms default to `normal_room`).

### Manual verification

The migration is idempotent and the API contract is additive, so the easiest verification flow is:

1. Run `pnpm db:migrate` against a database that already has moves data. Open the Moving page and confirm rooms still render on the Floor Plan tab and existing items still show in Survey.
2. **Item disposition update**: open an item from Survey → set Disposition to `sell` → check the Tasks tab — a "Sell: <item name>" task should appear linked to the same project.
3. **Room type creation / change**: in Stage, switch a room's type to `staging_area` — confirm it appears in the Zones list.
4. **Scan action creates scan event + updates rollup**: scan a box barcode with `pack` action from `/scan`; confirm a `move_scan_events` row was appended, `move_boxes.status = 'packed'`, and every `move_items.status` for items in that box is `packed` as well. Repeat with `stage` to verify the new `staged` box status. Repeat with `mark_damaged` on an item-targeted scan to verify the item rolls to `damaged`.
5. **Existing pack/load/arrive/unpack still work**: from `/scan`, run the legacy actions and confirm box status advances exactly as before. The legacy InventoryTab / BoxesTab focus deep links (`?tab=inventory&focusItemId=…`) still open the right modals.
6. **Box label rendering**: from Labels, open the print sheet for a4-8up and lc30 templates and confirm Box label / barcode renders unchanged.

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
