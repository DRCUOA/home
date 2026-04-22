export interface BaseEntity {
  id: string;
  created_at: string;
  updated_at: string;
}

export interface User extends BaseEntity {
  email: string;
  name: string;
  plan: "free" | "pro" | "lifetime";
}

export interface Project extends BaseEntity {
  type: "sell" | "buy";
  name: string;
  household_id: string;
  user_id: string;
  sale_strategy?: string;
  target_sale_price_low?: number;
  target_sale_price_high?: number;
  minimum_acceptable_price?: number;
  sale_timing_start?: string;
  sale_timing_end?: string;
  sell_milestone?: string;
  buy_milestone?: string;
}

export interface Property extends BaseEntity {
  project_id: string;
  address: string;
  suburb?: string;
  city?: string;
  price_asking?: number;
  price_guide_low?: number;
  price_guide_high?: number;
  bedrooms?: number;
  bathrooms?: number;
  parking?: number;
  land_area_sqm?: number;
  floor_area_sqm?: number;
  property_type?: string;
  listing_method?: string;
  listing_url?: string;
  listing_description?: string;
  watchlist_status?: string;
  rejection_reason?: string;
  is_own_home: boolean;
  favourite_rank?: number;
  latitude?: number;
  longitude?: number;
}

export interface Contact extends BaseEntity {
  user_id: string;
  name: string;
  email?: string;
  phone?: string;
  organisation?: string;
  role_tags: string[];
  notes?: string;
}

export interface CommunicationLog extends BaseEntity {
  user_id: string;
  contact_id?: string;
  project_id?: string;
  property_id?: string;
  type: string;
  subject?: string;
  body: string;
  occurred_at: string;
  follow_up_date?: string;
  task_id?: string;
  decision_id?: string;
}

export interface Note extends BaseEntity {
  user_id: string;
  body: string;
  project_id?: string;
  property_id?: string;
  contact_id?: string;
  communication_id?: string;
  tags: string[];
}

export interface FileRecord extends BaseEntity {
  user_id: string;
  filename: string;
  s3_key: string;
  mime_type: string;
  size_bytes: number;
  category: string;
  project_id?: string;
  property_id?: string;
  contact_id?: string;
  communication_id?: string;
  is_pinned: boolean;
}

export interface Task extends BaseEntity {
  user_id: string;
  title: string;
  description?: string;
  due_date?: string;
  priority: string;
  status: string;
  project_id?: string;
  property_id?: string;
  template_source?: string;
  owner_user_id?: string;
}

export interface ChecklistItem extends BaseEntity {
  user_id: string;
  task_id?: string;
  project_id?: string;
  property_id?: string;
  label: string;
  state: string;
  checklist_type: string;
  sort_order: number;
}

export interface FinancialScenario extends BaseEntity {
  user_id: string;
  name: string;
  project_id: string;
  property_id?: string;
  sale_price?: number;
  commission_rate?: number;
  commission_amount?: number;
  marketing_cost?: number;
  legal_fees_sell?: number;
  repairs_cost?: number;
  mortgage_balance?: number;
  mortgage_break_fee?: number;
  moving_cost?: number;
  savings?: number;
  kiwisaver?: number;
  other_funds?: number;
  borrowing_capacity?: number;
  purchase_price?: number;
  deposit?: number;
  loan_amount?: number;
  interest_rate?: number;
  loan_term_years?: number;
  repayment_monthly?: number;
  legal_fees_buy?: number;
  transaction_costs?: number;
  contingency?: number;
  net_cash_remaining?: number;
  is_shortfall?: boolean;
  estimated_equity?: number;
  total_available_budget?: number;
}

export interface Offer extends BaseEntity {
  user_id: string;
  property_id: string;
  project_id: string;
  direction: string;
  price: number;
  conditions: string[];
  conditions_detail?: string;
  settlement_date?: string;
  deposit?: number;
  status: string;
  counter_offer_parent_id?: string;
  decision_reasoning?: string;
  notes?: string;
}

export interface Decision extends BaseEntity {
  user_id: string;
  project_id?: string;
  property_id?: string;
  title: string;
  reasoning?: string;
  assumptions: string[];
  risks_accepted?: string;
  alternatives_considered?: string;
}

export interface ResearchItem extends BaseEntity {
  user_id: string;
  url?: string;
  title: string;
  category: string;
  notes?: string;
  tags: string[];
  project_id?: string;
  property_id?: string;
}

export interface SellAgent extends BaseEntity {
  project_id: string;
  contact_id?: string;
  name: string;
  agency?: string;
  phone?: string;
  email?: string;
  appraisal_low?: number;
  appraisal_high?: number;
  commission_rate?: number;
  marketing_estimate?: number;
  recommended_method?: string;
  notes?: string;
  status: string;
  rejection_reason?: string;
}

export interface PropertyEvaluation extends BaseEntity {
  property_id: string;
  pros: string[];
  cons: string[];
  red_flags: string[];
  criteria_fit: Record<string, string>;
  risk_severity?: string;
  visit_notes?: string;
  visit_date?: string;
  room_observations: Record<string, string>;
  questions_for_agent: string[];
  commute_notes?: string;
  neighbourhood_notes?: string;
  renovation_notes?: string;
  ongoing_cost_notes?: string;
}

export interface PropertyCriteria extends BaseEntity {
  project_id: string;
  must_haves: string[];
  nice_to_haves: string[];
  exclusions: string[];
  property_types: string[];
  locations: string[];
  budget_ceiling?: number;
  timing_window_start?: string;
  timing_window_end?: string;
  financing_assumptions?: {
    deposit_percent?: number;
    interest_rate?: number;
    loan_term_years?: number;
    pre_approval_amount?: number;
  };
}

export interface MapPin extends BaseEntity {
  user_id: string;
  label: string;
  color: string;
  icon: string;
  latitude: number;
  longitude: number;
  notes?: string;
}

export interface AuditLog {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  user_id: string;
  user_name: string;
  changes: Record<string, { old?: unknown; new?: unknown }>;
  created_at: string;
}

export interface AgentRun extends BaseEntity {
  user_id: string;
  workflow_type: string;
  input_summary: string;
  output_summary?: string;
  model?: string;
  tools?: string[];
  project_id?: string;
  property_id?: string;
  status: string;
  completed_at?: string;
}

export interface Move extends BaseEntity {
  user_id: string;
  project_id: string;
  origin_property_id?: string;
  destination_property_id?: string;
  origin_floor_plan_file_id?: string;
  destination_floor_plan_file_id?: string;
  move_date?: string;
  status: string;
  notes?: string;
}

export interface MoveRoomPolygonPoint {
  x: number;
  y: number;
}

export interface MoveRoom extends BaseEntity {
  move_id: string;
  side: "origin" | "destination";
  name: string;
  color: string;
  /** Legacy free-draw polygon. Empty for rooms created after the
   *  rooms-as-stickers refactor — those rely on the rect fields below. */
  polygon: MoveRoomPolygonPoint[];
  /** Sticker-compatible rectangle geometry (0..1 normalized). Rooms
   *  move/resize/rotate with the same UX as stickers in the editor. */
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  sort_order: number;
}

export interface MoveBox extends BaseEntity {
  move_id: string;
  barcode: string;
  label: string;
  destination_room_id?: string;
  fragile: boolean;
  priority: string;
  notes?: string;
}

export interface MoveItem extends BaseEntity {
  move_id: string;
  name: string;
  quantity: number;
  origin_room_id?: string;
  destination_room_id?: string;
  box_id?: string;
  status: string;
  category?: string;
  value_estimate?: number;
  fragile: boolean;
  photo_file_id?: string;
  notes?: string;
}

export interface MoveSticker extends BaseEntity {
  move_id: string;
  side: "origin" | "destination";
  kind: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  color?: string;
  label?: string;
  sort_order: number;
}

/* -------------------------------------------------------------------------
 * Floor Plan Designer (UI/UX refactor, Major 1)
 *
 * These types describe the extended client-side document that the new
 * designer operates on. In phase 1 they are additive: the server-persisted
 * MoveRoom + MoveSticker rows stay the source of truth, and any new
 * primitives (walls, openings, annotations, layers) are derived/projected
 * on the client. Phase 2 introduces dedicated tables.
 * ---------------------------------------------------------------------- */

export type FloorPlanUnit = "metric" | "imperial";
export type FloorPlanTheme = "light" | "dark" | "high-contrast";
export type FloorPlanMode = "beginner" | "advanced";
export type FloorPlanLineStyle = "solid" | "dashed" | "dotted";
export type FloorPlanUIDensity = "comfortable" | "compact";

export type FloorPlanTool =
  | "select"
  | "pan"
  | "wall"
  | "room-rect"
  | "room-polygon"
  | "door"
  | "window"
  | "dimension"
  | "text"
  | "note"
  | "arrow";

/** A single editable layer — visibility and lock gate every primitive that
 *  references the layer id. Beginner mode pins everything to the default
 *  "Main" layer and hides the layers panel. */
export interface FloorPlanLayer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  sort_order: number;
}

/** Canonical layer ids. The store seeds these on first open. */
export const DEFAULT_LAYER_IDS = {
  walls: "walls",
  furniture: "furniture",
  annotations: "annotations",
  electrical: "electrical",
  plumbing: "plumbing",
} as const;

/** Wall primitive — two endpoints in 0..1 normalized coords, rendered with
 *  configurable thickness + line style. Auto-join corners are computed by
 *  the geometry helpers, not stored. */
export interface FloorPlanWall {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Normalized thickness along the wall's perpendicular. Presets: thin
   *  0.006, standard 0.012, thick 0.02. Custom input goes 0.002..0.04. */
  thickness: number;
  lineStyle: FloorPlanLineStyle;
  color: string;
  layerId: string;
  locked: boolean;
  hidden: boolean;
  /** Optional label displayed along the wall (e.g., "Load-bearing"). */
  label?: string;
}

/** Door/window opening — always bound to a wall, positioned as a parameter
 *  along the wall's length [0..1], plus an opening width. Doors get an
 *  optional swing arc. */
export interface FloorPlanOpening {
  id: string;
  kind: "door" | "door_double" | "sliding_door" | "garage_door" | "window";
  wallId: string;
  /** 0..1 along the wall from (x1,y1) → (x2,y2). */
  t: number;
  /** Opening width as a fraction of the wall length (0..1). */
  width: number;
  swing?: "left" | "right" | "none";
  layerId: string;
  locked: boolean;
  hidden: boolean;
  label?: string;
}

/** Text-like annotation: labels, notes, callouts, free-text dimensions,
 *  and arrows. Arrows/dimensions use both point + second point; the rest
 *  use point + width/height. */
export interface FloorPlanAnnotation {
  id: string;
  kind: "label" | "note" | "callout" | "dimension" | "arrow";
  x: number;
  y: number;
  /** Used for label/note/callout bounds and for dimension/arrow endpoints. */
  width?: number;
  height?: number;
  x2?: number;
  y2?: number;
  text?: string;
  fontSizePx: number;
  bold: boolean;
  color: string;
  layerId: string;
  locked: boolean;
  hidden: boolean;
}

/** Extended style attached to stickers + rooms on the client. These fields
 *  land in the object's `label` JSON payload in phase 1 (prefixed with
 *  `"__style_v1:"`) and become first-class columns in phase 2. */
export interface FloorPlanObjectStyle {
  outlineColor?: string;
  fillColor?: string;
  outlineThickness?: number;
  lineStyle?: FloorPlanLineStyle;
  opacity?: number;
  material?: string;
  layerId?: string;
  locked?: boolean;
  hidden?: boolean;
  /** Show a translucent clearance zone around the object (doors, fridges). */
  clearanceZone?: boolean;
}

/** Viewport state — owned by the editor store, persisted per-move in
 *  localStorage (not the server). */
export interface FloorPlanViewport {
  zoom: number;
  panX: number;
  panY: number;
  gridSizePx: number;
  showGrid: boolean;
  snapToGrid: boolean;
  snapToObjects: boolean;
  unit: FloorPlanUnit;
  /** How many real-world meters the full canvas height represents. Used
   *  to convert normalized coords into shown dimensions. */
  realWorldHeightMeters: number;
}

/** The full in-memory document the editor works on. Server-synced pieces
 *  (rooms, stickers) reference the backing MoveRoom / MoveSticker rows; the
 *  rest live only on the client in phase 1. */
export interface FloorPlanDocument {
  walls: FloorPlanWall[];
  openings: FloorPlanOpening[];
  annotations: FloorPlanAnnotation[];
  layers: FloorPlanLayer[];
  /** Per-entity style overlay, keyed by room/sticker id. */
  styles: Record<string, FloorPlanObjectStyle>;
}

export interface ApiResponse<T> {
  data: T;
}

export interface ApiListResponse<T> {
  data: T[];
  total: number;
}

export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
}
