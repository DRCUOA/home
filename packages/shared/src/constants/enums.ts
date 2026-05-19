export const PROJECT_TYPES = ["sell", "buy"] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

export const SELL_MILESTONES = [
  "planning",
  "listed",
  "open_homes_underway",
  "offer_received",
  "under_contract",
  "unconditional",
  "settled",
] as const;
export type SellMilestone = (typeof SELL_MILESTONES)[number];

export const BUY_MILESTONES = [
  "researching",
  "due_diligence",
  "preparing_offer",
  "under_offer",
  "conditional",
  "unconditional",
  "settled",
] as const;
export type BuyMilestone = (typeof BUY_MILESTONES)[number];

export const SALE_STRATEGIES = [
  "auction",
  "tender",
  "deadline_sale",
  "price_by_negotiation",
  "fixed_price",
] as const;
export type SaleStrategy = (typeof SALE_STRATEGIES)[number];

export const WATCHLIST_STATUSES = [
  "researching",
  "inspecting",
  "shortlisted",
  "offer_candidate",
  "rejected",
] as const;
export type WatchlistStatus = (typeof WATCHLIST_STATUSES)[number];

export const PROPERTY_TYPES = [
  "house",
  "townhouse",
  "apartment",
  "unit",
  "lifestyle",
  "section",
  "other",
] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

export const LISTING_METHODS = [
  "auction",
  "tender",
  "deadline_sale",
  "price_by_negotiation",
  "fixed_price",
  "enquiries_over",
  "negotiation",
] as const;
export type ListingMethod = (typeof LISTING_METHODS)[number];

export const COMMUNICATION_TYPES = [
  "call",
  "email",
  "text",
  "meeting",
] as const;
export type CommunicationType = (typeof COMMUNICATION_TYPES)[number];

export const TASK_STATUSES = [
  "todo",
  "in_progress",
  "waiting",
  "done",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_KINDS = ["task", "event"] as const;
export type TaskKind = (typeof TASK_KINDS)[number];

export const CHECKLIST_STATES = [
  "not_started",
  "in_progress",
  "complete",
  "waiting_on_third_party",
] as const;
export type ChecklistState = (typeof CHECKLIST_STATES)[number];

export const OFFER_DIRECTIONS = ["received", "submitted"] as const;
export type OfferDirection = (typeof OFFER_DIRECTIONS)[number];

export const OFFER_STATUSES = [
  "draft",
  "submitted",
  "countered",
  "accepted",
  "rejected",
  "withdrawn",
  "expired",
] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

export const OFFER_CONDITIONS = [
  "finance",
  "builders_report",
  "lim",
  "sale_of_existing_home",
  "solicitor_approval",
  "valuation",
  "insurance",
  "other",
] as const;
export type OfferCondition = (typeof OFFER_CONDITIONS)[number];

export const RISK_SEVERITIES = ["low", "medium", "high"] as const;
export type RiskSeverity = (typeof RISK_SEVERITIES)[number];

export const AGENT_SELL_STATUSES = [
  "shortlisted",
  "rejected",
  "selected",
] as const;
export type AgentSellStatus = (typeof AGENT_SELL_STATUSES)[number];

export const RESEARCH_CATEGORIES = [
  "suburb_research",
  "sale_process",
  "legal",
  "lending",
  "property_checks",
  "market_trends",
  "other",
] as const;
export type ResearchCategory = (typeof RESEARCH_CATEGORIES)[number];

export const FILE_CATEGORIES = [
  "title",
  "lim",
  "builders_report",
  "rates_info",
  "body_corporate",
  "contract",
  "brochure",
  "photo",
  "appraisal",
  "rental_appraisal",
  "valuation",
  "insurance",
  "correspondence",
  "other",
] as const;
export type FileCategory = (typeof FILE_CATEGORIES)[number];

export const CONTACT_ROLES = [
  "selling_agent",
  "buying_agent",
  "solicitor",
  "conveyancer",
  "mortgage_broker",
  "bank_contact",
  "valuer",
  "inspector",
  "builder",
  "mover",
  "other",
] as const;
export type ContactRole = (typeof CONTACT_ROLES)[number];

export const CHECKLIST_TYPES = [
  "pre_sale",
  "sell_documents",
  "staging",
  "open_home_prep",
  "repair_improvement",
  "buy_due_diligence",
  "open_home_visit",
  "offer_preparation",
  "settlement",
  "custom",
] as const;
export type ChecklistType = (typeof CHECKLIST_TYPES)[number];

export const AGENT_WORKFLOW_TYPES = [
  "summarise_document",
  "extract_key_points",
  "suggest_follow_up_questions",
  "clean_up_notes",
  "compare_properties",
  "explain_scenario",
  "identify_missing_info",
  "recommend_next_actions",
  "project_state_summary",
  "semantic_search",
  "qa",
  "enrich_property",
  "propose_actions",
] as const;
export type AgentWorkflowType = (typeof AGENT_WORKFLOW_TYPES)[number];

export const OPENAI_MODELS = [
  "gpt-5.5",
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.4-nano",
] as const;
export type OpenAIModel = (typeof OPENAI_MODELS)[number];

export const OPENAI_MODEL_LABELS: Record<OpenAIModel, string> = {
  "gpt-5.5": "GPT-5.5 (frontier)",
  "gpt-5.4": "GPT-5.4",
  "gpt-5.4-mini": "GPT-5.4 Mini",
  "gpt-5.4-nano": "GPT-5.4 Nano",
};

export const ASSISTANT_TOOLS = [
  "web_search",
] as const;
export type AssistantTool = (typeof ASSISTANT_TOOLS)[number];

export const ASSISTANT_TOOL_LABELS: Record<AssistantTool, string> = {
  web_search: "Web search",
};

export const PLAN_IDS = ["free", "pro", "lifetime"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export const MOVE_STATUSES = [
  "planning",
  "packing",
  "in_transit",
  "unpacking",
  "done",
] as const;
export type MoveStatus = (typeof MOVE_STATUSES)[number];

export const MOVE_SIDES = ["origin", "destination"] as const;
export type MoveSide = (typeof MOVE_SIDES)[number];

/* ---------- Floor Plan Designer primitives (phase 2) ---------- */

export const FLOOR_PLAN_LINE_STYLE_VALUES = [
  "solid",
  "dashed",
  "dotted",
] as const;
export type FloorPlanLineStyleValue =
  (typeof FLOOR_PLAN_LINE_STYLE_VALUES)[number];

export const MOVE_OPENING_KINDS = [
  "door",
  "door_double",
  "sliding_door",
  "garage_door",
  "window",
] as const;
export type MoveOpeningKind = (typeof MOVE_OPENING_KINDS)[number];

export const MOVE_OPENING_SWINGS = ["left", "right", "none"] as const;
export type MoveOpeningSwing = (typeof MOVE_OPENING_SWINGS)[number];

export const MOVE_ANNOTATION_KINDS = [
  "label",
  "note",
  "callout",
  "dimension",
  "arrow",
] as const;
export type MoveAnnotationKind = (typeof MOVE_ANNOTATION_KINDS)[number];

/** Item workflow lifecycle. Covers the full sell/buy move:
 *  surveyed → awaiting_action → ready_to_pack → packed → staged →
 *  loaded → delivered → unpacked → installed. Plus terminal/exception
 *  states (removed, missing, damaged).
 *
 *  Backward-compat: the prior vocabulary was
 *  ["unpacked","packed","loaded","delivered","unpacked_at_destination"]
 *  where "unpacked" meant "not yet packed". Migration 0013 remaps
 *  default-state "unpacked" → "surveyed" and "unpacked_at_destination"
 *  → "unpacked" (terminal). New default for fresh rows is "surveyed". */
export const MOVE_ITEM_STATUSES = [
  "surveyed",
  "awaiting_action",
  "ready_to_pack",
  "packed",
  "staged",
  "loaded",
  "delivered",
  "unpacked",
  "installed",
  "removed",
  "missing",
  "damaged",
] as const;
export type MoveItemStatus = (typeof MOVE_ITEM_STATUSES)[number];

/** Workflow disposition: what the user has decided to do with the
 *  item. Drives the Declutter tab and links repair/sell/donate/dump
 *  items into tasks. Independent of the lifecycle status. */
export const MOVE_ITEM_DISPOSITIONS = [
  "unassessed",
  "keep",
  "sell",
  "donate",
  "recycle",
  "dump",
  "stage_only",
  "repair_clean_first",
] as const;
export type MoveItemDisposition = (typeof MOVE_ITEM_DISPOSITIONS)[number];

export const MOVE_ITEM_DISPOSITION_LABELS: Record<MoveItemDisposition, string> = {
  unassessed: "Unassessed",
  keep: "Keep",
  sell: "Sell",
  donate: "Donate",
  recycle: "Recycle",
  dump: "Dump",
  stage_only: "Stage only",
  repair_clean_first: "Repair / clean first",
};

/** Room behaviour. Existing rooms default to `normal_room` so the
 *  floor-plan renderer keeps the current look. Holding/staging/vehicle/
 *  storage zones drive the Stage and Load tabs. */
export const MOVE_ROOM_TYPES = [
  "normal_room",
  "holding_zone",
  "staging_area",
  "vehicle_zone",
  "storage_zone",
] as const;
export type MoveRoomType = (typeof MOVE_ROOM_TYPES)[number];

export const MOVE_ROOM_TYPE_LABELS: Record<MoveRoomType, string> = {
  normal_room: "Normal room",
  holding_zone: "Holding zone",
  staging_area: "Staging area",
  vehicle_zone: "Vehicle / truck",
  storage_zone: "Storage",
};

export const MOVE_BOX_PRIORITIES = [
  "low",
  "normal",
  "high",
  "first_night",
] as const;
export type MoveBoxPriority = (typeof MOVE_BOX_PRIORITIES)[number];

/** Box lifecycle, driven by scan events. Mirrors the item status
 *  vocabulary but at the container level. `preparing` is the default
 *  on create; later stages advance as scans land.
 *
 *  `staged` slots between packed and loaded: a box that's sealed and
 *  parked in a staging area / holding zone waiting for the truck. */
export const MOVE_BOX_STATUSES = [
  "preparing",
  "packed",
  "staged",
  "loaded",
  "delivered",
  "unpacked",
] as const;
export type MoveBoxStatus = (typeof MOVE_BOX_STATUSES)[number];

/** Barcode symbology used on printed labels. Scanner accepts both;
 *  the renderer picks based on this. */
export const MOVE_CODE_TYPES = ["qr", "code128"] as const;
export type MoveCodeType = (typeof MOVE_CODE_TYPES)[number];

/** Action recorded with each scan event. `lookup` is a no-op read
 *  (e.g. scan-to-inspect); all others advance the box / item lifecycle.
 *
 *  Original vocabulary (preserved): pack, load, transit, arrive, unpack,
 *  lookup. Workflow extensions: stage (move to staging area / holding
 *  zone), deliver_to_room (place at destination room), install (item
 *  installed in final position), remove (sold/donated/dumped — removes
 *  from inventory rollup), mark_missing, mark_damaged (exception logging
 *  during pack/load/unpack). */
export const MOVE_SCAN_ACTIONS = [
  "pack",
  "load",
  "transit",
  "arrive",
  "unpack",
  "lookup",
  "stage",
  "deliver_to_room",
  "install",
  "remove",
  "mark_missing",
  "mark_damaged",
] as const;
export type MoveScanAction = (typeof MOVE_SCAN_ACTIONS)[number];

/** Scan target kind — boxes are the primary thing scanned; high-value
 *  items can also carry their own barcode and be scanned directly. */
export const MOVE_SCAN_TARGET_KINDS = ["box", "item"] as const;
export type MoveScanTargetKind = (typeof MOVE_SCAN_TARGET_KINDS)[number];

/** Pre-cut label-sheet templates supported by the print dialog. The
 *  values map to physical Avery / Pelltech sheets; the renderer adapts
 *  layout (cells per page, cell size, content density) per template.
 *
 *  - a4-8up: large 99×67mm labels (Avery L7165 / J8165) — full content
 *    incl. contents list. The current/default layout.
 *  - lc30:   compact 64×25mm labels (LC30 inkjet) — QR + box name +
 *    barcode text only; no contents list (no room).
 */
export const MOVE_LABEL_TEMPLATES = ["a4-8up", "lc30"] as const;
export type MoveLabelTemplate = (typeof MOVE_LABEL_TEMPLATES)[number];

export const MOVE_STICKER_KINDS = [
  // --- Openings & structural ---
  "door",
  "door_double",
  "sliding_door",
  "garage_door",
  "window",
  "wall",
  "archway",
  "column",
  "stairs",
  "fireplace",
  // --- Kitchen ---
  "sink",
  "fridge",
  "stove",
  "oven",
  "microwave",
  "dishwasher",
  "kitchen_island",
  "pantry",
  // --- Bathroom & laundry ---
  "toilet",
  "bathtub",
  "shower",
  "vanity",
  "mirror",
  "washer",
  "dryer",
  // --- Bedroom ---
  "bed",
  "bunk_bed",
  "crib",
  "wardrobe",
  "closet",
  "dresser",
  "nightstand",
  // --- Living & dining ---
  "sofa",
  "armchair",
  "table",
  "dining_table",
  "chair",
  "tv",
  "bookshelf",
  "piano",
  // --- Office ---
  "desk",
  "filing_cabinet",
  // --- Outdoor ---
  "bbq",
  "pool",
  "hot_tub",
  "trampoline",
  "shed",
  "firepit",
  "car",
  "outdoor_deck",
  "fence",
  "outdoor_gate",
  // --- Connectors & nooks ---
  "hallway",
  "nook",
  "alcove",
  "foyer",
  "landing",
  "vestibule",
  // --- HVAC & utilities ---
  "radiator",
  "water_heater",
  "ceiling_fan",
  "air_conditioner",
  // --- Misc ---
  "plant",
  "rug",
  "lamp",
  "label",
  "arrow",
] as const;
export type MoveStickerKind = (typeof MOVE_STICKER_KINDS)[number];

export const MOVE_STICKER_LABELS: Record<MoveStickerKind, string> = {
  door: "Door",
  door_double: "Double door",
  sliding_door: "Sliding door",
  garage_door: "Garage door",
  window: "Window",
  wall: "Wall",
  archway: "Archway",
  column: "Column",
  stairs: "Stairs",
  fireplace: "Fireplace",
  sink: "Sink",
  fridge: "Fridge",
  stove: "Stove",
  oven: "Oven",
  microwave: "Microwave",
  dishwasher: "Dishwasher",
  kitchen_island: "Island",
  pantry: "Pantry",
  toilet: "Toilet",
  bathtub: "Bathtub",
  shower: "Shower",
  vanity: "Vanity",
  mirror: "Mirror",
  washer: "Washer",
  dryer: "Dryer",
  bed: "Bed",
  bunk_bed: "Bunk bed",
  crib: "Crib",
  wardrobe: "Wardrobe",
  closet: "Closet",
  dresser: "Dresser",
  nightstand: "Nightstand",
  sofa: "Sofa",
  armchair: "Armchair",
  table: "Table",
  dining_table: "Dining table",
  chair: "Chair",
  tv: "TV",
  bookshelf: "Bookshelf",
  piano: "Piano",
  desk: "Desk",
  filing_cabinet: "Filing cab.",
  bbq: "BBQ",
  pool: "Pool",
  hot_tub: "Hot tub",
  trampoline: "Trampoline",
  shed: "Shed",
  firepit: "Fire pit",
  car: "Car",
  outdoor_deck: "Deck",
  fence: "Fence",
  outdoor_gate: "Gate",
  hallway: "Hallway",
  nook: "Nook",
  alcove: "Alcove",
  foyer: "Foyer",
  landing: "Landing",
  vestibule: "Vestibule",
  radiator: "Radiator",
  water_heater: "Water heater",
  ceiling_fan: "Ceiling fan",
  air_conditioner: "A/C",
  plant: "Plant",
  rug: "Rug",
  lamp: "Lamp",
  label: "Text label",
  arrow: "Arrow",
};

export const MOVE_ITEM_CATEGORIES = [
  "furniture",
  "appliance",
  "electronics",
  "kitchen",
  "clothing",
  "books",
  "art",
  "plants",
  "garage",
  "garden",
  "sentimental",
  "other",
] as const;
export type MoveItemCategory = (typeof MOVE_ITEM_CATEGORIES)[number];

export const PLAN_LIMITS: Record<PlanId, {
  maxProperties: number;
  maxScenarios: number;
  maxPhotos: number;
  aiEnrich: boolean;
  aiAssistant: boolean;
  advancedSearch: boolean;
  comparison: boolean;
  offerManagement: boolean;
  dueDiligence: boolean;
  multiProject: boolean;
}> = {
  free: {
    maxProperties: 3,
    maxScenarios: 1,
    maxPhotos: 25,
    aiEnrich: false,
    aiAssistant: false,
    advancedSearch: false,
    comparison: false,
    offerManagement: false,
    dueDiligence: false,
    multiProject: false,
  },
  pro: {
    maxProperties: Infinity,
    maxScenarios: Infinity,
    maxPhotos: Infinity,
    aiEnrich: true,
    aiAssistant: false,
    advancedSearch: true,
    comparison: true,
    offerManagement: true,
    dueDiligence: true,
    multiProject: false,
  },
  lifetime: {
    maxProperties: Infinity,
    maxScenarios: Infinity,
    maxPhotos: Infinity,
    aiEnrich: true,
    aiAssistant: true,
    advancedSearch: true,
    comparison: true,
    offerManagement: true,
    dueDiligence: true,
    multiProject: true,
  },
};
