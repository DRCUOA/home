import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  integer,
  real,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const id = () =>
  uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`);
const timestamps = () => ({
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export const users = pgTable("users", {
  id: id(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  password_hash: varchar("password_hash", { length: 255 }).notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  plan: varchar("plan", { length: 20 }).default("free").notNull(),
  stripe_customer_id: varchar("stripe_customer_id", { length: 255 }),
  stripe_subscription_id: varchar("stripe_subscription_id", { length: 255 }),
  plan_expires_at: timestamp("plan_expires_at"),
  ...timestamps(),
});

export const households = pgTable("households", {
  id: id(),
  name: varchar("name", { length: 200 }).notNull(),
  owner_user_id: uuid("owner_user_id")
    .notNull()
    .references(() => users.id),
  ...timestamps(),
});

export const householdMembers = pgTable("household_members", {
  id: id(),
  household_id: uuid("household_id")
    .notNull()
    .references(() => households.id),
  user_id: uuid("user_id")
    .notNull()
    .references(() => users.id),
  role: varchar("role", { length: 50 }).notNull().default("owner"),
  ...timestamps(),
});

export const projects = pgTable(
  "projects",
  {
    id: id(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id),
    household_id: uuid("household_id").references(() => households.id),
    type: varchar("type", { length: 10 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    sale_strategy: varchar("sale_strategy", { length: 50 }),
    target_sale_price_low: real("target_sale_price_low"),
    target_sale_price_high: real("target_sale_price_high"),
    minimum_acceptable_price: real("minimum_acceptable_price"),
    sale_timing_start: varchar("sale_timing_start", { length: 20 }),
    sale_timing_end: varchar("sale_timing_end", { length: 20 }),
    sell_milestone: varchar("sell_milestone", { length: 50 }).default(
      "planning"
    ),
    buy_milestone: varchar("buy_milestone", { length: 50 }).default(
      "researching"
    ),
    ...timestamps(),
  },
  (t) => [index("projects_user_idx").on(t.user_id)]
);

export const properties = pgTable(
  "properties",
  {
    id: id(),
    project_id: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    address: varchar("address", { length: 500 }).notNull(),
    suburb: varchar("suburb", { length: 200 }),
    city: varchar("city", { length: 200 }),
    price_asking: real("price_asking"),
    price_guide_low: real("price_guide_low"),
    price_guide_high: real("price_guide_high"),
    bedrooms: integer("bedrooms"),
    bathrooms: integer("bathrooms"),
    parking: integer("parking"),
    land_area_sqm: real("land_area_sqm"),
    floor_area_sqm: real("floor_area_sqm"),
    property_type: varchar("property_type", { length: 50 }),
    listing_method: varchar("listing_method", { length: 50 }),
    listing_url: text("listing_url"),
    listing_description: text("listing_description"),
    watchlist_status: varchar("watchlist_status", { length: 50 }).default(
      "researching"
    ),
    rejection_reason: text("rejection_reason"),
    is_own_home: boolean("is_own_home").default(false).notNull(),
    favourite_rank: integer("favourite_rank"),
    latitude: real("latitude"),
    longitude: real("longitude"),
    ...timestamps(),
  },
  (t) => [index("properties_project_idx").on(t.project_id)]
);

export const propertyCriteria = pgTable("property_criteria", {
  id: id(),
  project_id: uuid("project_id")
    .notNull()
    .unique()
    .references(() => projects.id, { onDelete: "cascade" }),
  must_haves: jsonb("must_haves").default([]).notNull(),
  nice_to_haves: jsonb("nice_to_haves").default([]).notNull(),
  exclusions: jsonb("exclusions").default([]).notNull(),
  property_types: jsonb("property_types").default([]).notNull(),
  locations: jsonb("locations").default([]).notNull(),
  budget_ceiling: real("budget_ceiling"),
  timing_window_start: varchar("timing_window_start", { length: 20 }),
  timing_window_end: varchar("timing_window_end", { length: 20 }),
  financing_assumptions: jsonb("financing_assumptions"),
  ...timestamps(),
});

export const contacts = pgTable(
  "contacts",
  {
    id: id(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id),
    name: varchar("name", { length: 200 }).notNull(),
    email: varchar("email", { length: 255 }),
    phone: varchar("phone", { length: 50 }),
    organisation: varchar("organisation", { length: 200 }),
    role_tags: jsonb("role_tags").default([]).notNull(),
    notes: text("notes"),
    ...timestamps(),
  },
  (t) => [index("contacts_user_idx").on(t.user_id)]
);

export const contactProjects = pgTable("contact_projects", {
  id: id(),
  contact_id: uuid("contact_id")
    .notNull()
    .references(() => contacts.id, { onDelete: "cascade" }),
  project_id: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
});

export const communicationLogs = pgTable(
  "communication_logs",
  {
    id: id(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id),
    contact_id: uuid("contact_id").references(() => contacts.id),
    project_id: uuid("project_id").references(() => projects.id),
    property_id: uuid("property_id").references(() => properties.id),
    type: varchar("type", { length: 20 }).notNull(),
    subject: varchar("subject", { length: 500 }),
    body: text("body").notNull(),
    occurred_at: timestamp("occurred_at").notNull(),
    follow_up_date: timestamp("follow_up_date"),
    task_id: uuid("task_id"),
    decision_id: uuid("decision_id"),
    ...timestamps(),
  },
  (t) => [
    index("comms_user_idx").on(t.user_id),
    index("comms_contact_idx").on(t.contact_id),
    index("comms_project_idx").on(t.project_id),
  ]
);

export const notes = pgTable(
  "notes",
  {
    id: id(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id),
    body: text("body").notNull(),
    project_id: uuid("project_id").references(() => projects.id),
    property_id: uuid("property_id").references(() => properties.id),
    contact_id: uuid("contact_id").references(() => contacts.id),
    communication_id: uuid("communication_id").references(
      () => communicationLogs.id
    ),
    tags: jsonb("tags").default([]).notNull(),
    ...timestamps(),
  },
  (t) => [index("notes_user_idx").on(t.user_id)]
);

export const files = pgTable(
  "files",
  {
    id: id(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id),
    filename: varchar("filename", { length: 500 }).notNull(),
    s3_key: varchar("s3_key", { length: 1000 }).notNull(),
    mime_type: varchar("mime_type", { length: 200 }).notNull(),
    size_bytes: integer("size_bytes").notNull(),
    category: varchar("category", { length: 50 }).default("other").notNull(),
    project_id: uuid("project_id").references(() => projects.id),
    property_id: uuid("property_id").references(() => properties.id),
    contact_id: uuid("contact_id").references(() => contacts.id),
    communication_id: uuid("communication_id").references(
      () => communicationLogs.id
    ),
    is_pinned: boolean("is_pinned").default(false).notNull(),
    ...timestamps(),
  },
  (t) => [index("files_user_idx").on(t.user_id)]
);

export const tasks = pgTable(
  "tasks",
  {
    id: id(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id),
    title: varchar("title", { length: 500 }).notNull(),
    description: text("description"),
    due_date: timestamp("due_date"),
    priority: varchar("priority", { length: 20 }).default("medium").notNull(),
    status: varchar("status", { length: 20 }).default("todo").notNull(),
    project_id: uuid("project_id").references(() => projects.id),
    property_id: uuid("property_id").references(() => properties.id),
    template_source: varchar("template_source", { length: 50 }),
    owner_user_id: uuid("owner_user_id").references(() => users.id),
    ...timestamps(),
  },
  (t) => [
    index("tasks_user_idx").on(t.user_id),
    index("tasks_project_idx").on(t.project_id),
    index("tasks_status_idx").on(t.status),
  ]
);

export const checklistItems = pgTable(
  "checklist_items",
  {
    id: id(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id),
    task_id: uuid("task_id").references(() => tasks.id, {
      onDelete: "cascade",
    }),
    project_id: uuid("project_id").references(() => projects.id),
    property_id: uuid("property_id").references(() => properties.id),
    label: varchar("label", { length: 500 }).notNull(),
    state: varchar("state", { length: 30 }).default("not_started").notNull(),
    checklist_type: varchar("checklist_type", { length: 50 }).notNull(),
    sort_order: integer("sort_order").default(0).notNull(),
    ...timestamps(),
  },
  (t) => [index("checklist_user_idx").on(t.user_id)]
);

export const financialScenarios = pgTable(
  "financial_scenarios",
  {
    id: id(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id),
    name: varchar("name", { length: 200 }).notNull(),
    project_id: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    property_id: uuid("property_id").references(() => properties.id),

    sale_price: real("sale_price"),
    commission_rate: real("commission_rate"),
    commission_amount: real("commission_amount"),
    marketing_cost: real("marketing_cost"),
    legal_fees_sell: real("legal_fees_sell"),
    repairs_cost: real("repairs_cost"),
    mortgage_balance: real("mortgage_balance"),
    mortgage_break_fee: real("mortgage_break_fee"),
    moving_cost: real("moving_cost"),

    savings: real("savings"),
    kiwisaver: real("kiwisaver"),
    other_funds: real("other_funds"),
    borrowing_capacity: real("borrowing_capacity"),

    purchase_price: real("purchase_price"),
    deposit: real("deposit"),
    loan_amount: real("loan_amount"),
    interest_rate: real("interest_rate"),
    loan_term_years: real("loan_term_years"),
    repayment_monthly: real("repayment_monthly"),
    legal_fees_buy: real("legal_fees_buy"),
    transaction_costs: real("transaction_costs"),
    contingency: real("contingency"),

    net_cash_remaining: real("net_cash_remaining"),
    is_shortfall: boolean("is_shortfall"),
    estimated_equity: real("estimated_equity"),
    total_available_budget: real("total_available_budget"),

    ...timestamps(),
  },
  (t) => [index("fin_user_idx").on(t.user_id)]
);

export const offers = pgTable(
  "offers",
  {
    id: id(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id),
    property_id: uuid("property_id")
      .notNull()
      .references(() => properties.id),
    project_id: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    direction: varchar("direction", { length: 20 }).notNull(),
    price: real("price").notNull(),
    conditions: jsonb("conditions").default([]).notNull(),
    conditions_detail: text("conditions_detail"),
    settlement_date: varchar("settlement_date", { length: 20 }),
    deposit: real("deposit"),
    status: varchar("status", { length: 20 }).default("draft").notNull(),
    counter_offer_parent_id: uuid("counter_offer_parent_id"),
    decision_reasoning: text("decision_reasoning"),
    notes: text("notes"),
    ...timestamps(),
  },
  (t) => [
    index("offers_property_idx").on(t.property_id),
    index("offers_project_idx").on(t.project_id),
  ]
);

export const decisions = pgTable("decisions", {
  id: id(),
  user_id: uuid("user_id")
    .notNull()
    .references(() => users.id),
  project_id: uuid("project_id").references(() => projects.id),
  property_id: uuid("property_id").references(() => properties.id),
  title: varchar("title", { length: 500 }).notNull(),
  reasoning: text("reasoning"),
  assumptions: jsonb("assumptions").default([]).notNull(),
  risks_accepted: text("risks_accepted"),
  alternatives_considered: text("alternatives_considered"),
  decided_at: timestamp("decided_at").defaultNow().notNull(),
  ...timestamps(),
});

export const researchItems = pgTable(
  "research_items",
  {
    id: id(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id),
    url: text("url"),
    title: varchar("title", { length: 500 }).notNull(),
    category: varchar("category", { length: 50 }).default("other").notNull(),
    notes: text("notes"),
    tags: jsonb("tags").default([]).notNull(),
    project_id: uuid("project_id").references(() => projects.id),
    property_id: uuid("property_id").references(() => properties.id),
    ...timestamps(),
  },
  (t) => [index("research_user_idx").on(t.user_id)]
);

export const sellAgents = pgTable(
  "sell_agents",
  {
    id: id(),
    project_id: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    contact_id: uuid("contact_id").references(() => contacts.id),
    name: varchar("name", { length: 200 }).notNull(),
    agency: varchar("agency", { length: 200 }),
    phone: varchar("phone", { length: 50 }),
    email: varchar("email", { length: 255 }),
    appraisal_low: real("appraisal_low"),
    appraisal_high: real("appraisal_high"),
    commission_rate: real("commission_rate"),
    marketing_estimate: real("marketing_estimate"),
    recommended_method: varchar("recommended_method", { length: 50 }),
    notes: text("notes"),
    status: varchar("status", { length: 20 }).default("shortlisted").notNull(),
    rejection_reason: text("rejection_reason"),
    ...timestamps(),
  },
  (t) => [index("sell_agents_project_idx").on(t.project_id)]
);

export const propertyEvaluations = pgTable("property_evaluations", {
  id: id(),
  property_id: uuid("property_id")
    .notNull()
    .references(() => properties.id, { onDelete: "cascade" }),
  pros: jsonb("pros").default([]).notNull(),
  cons: jsonb("cons").default([]).notNull(),
  red_flags: jsonb("red_flags").default([]).notNull(),
  criteria_fit: jsonb("criteria_fit").default({}).notNull(),
  risk_severity: varchar("risk_severity", { length: 20 }),
  visit_notes: text("visit_notes"),
  visit_date: varchar("visit_date", { length: 20 }),
  room_observations: jsonb("room_observations").default({}).notNull(),
  questions_for_agent: jsonb("questions_for_agent").default([]).notNull(),
  commute_notes: text("commute_notes"),
  neighbourhood_notes: text("neighbourhood_notes"),
  renovation_notes: text("renovation_notes"),
  ongoing_cost_notes: text("ongoing_cost_notes"),
  ...timestamps(),
});

export const tags = pgTable("tags", {
  id: id(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  ...timestamps(),
});

export const mapPins = pgTable(
  "map_pins",
  {
    id: id(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id),
    label: varchar("label", { length: 200 }).notNull(),
    color: varchar("color", { length: 20 }).default("#8b5cf6").notNull(),
    icon: varchar("icon", { length: 30 }).default("pin").notNull(),
    latitude: real("latitude").notNull(),
    longitude: real("longitude").notNull(),
    notes: text("notes"),
    ...timestamps(),
  },
  (t) => [index("map_pins_user_idx").on(t.user_id)]
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    entity_type: varchar("entity_type", { length: 50 }).notNull(),
    entity_id: uuid("entity_id").notNull(),
    action: varchar("action", { length: 20 }).notNull(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id),
    user_name: varchar("user_name", { length: 200 }).notNull(),
    changes: jsonb("changes").notNull(),
    created_at: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("audit_entity_idx").on(t.entity_type, t.entity_id),
    index("audit_user_idx").on(t.user_id),
  ]
);

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: id(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id),
    workflow_type: varchar("workflow_type", { length: 50 }).notNull(),
    input_summary: text("input_summary").notNull(),
    output_summary: text("output_summary"),
    model: varchar("model", { length: 50 }),
    tools: jsonb("tools").$type<string[]>().default([]),
    project_id: uuid("project_id").references(() => projects.id),
    property_id: uuid("property_id").references(() => properties.id),
    status: varchar("status", { length: 20 }).default("running").notNull(),
    completed_at: timestamp("completed_at"),
    ...timestamps(),
  },
  (t) => [index("agent_runs_user_idx").on(t.user_id)]
);

/* ------------------------------------------------------------------ */
/*  Moving house                                                        */
/*                                                                      */
/*  A `move` ties a project to an origin property (the user's current   */
/*  home, is_own_home=true) and a destination property (from the buy    */
/*  pipeline). Floor plan images are stored in the existing `files`     */
/*  table and referenced here. Rooms are polygons drawn on top of each  */
/*  floor plan image. Items are inventory to be moved — each item has   */
/*  an origin room, a destination room on the new plan, a packing       */
/*  status, and an optional box. Boxes carry a barcode (for scan +      */
/*  label print) and roll up item counts.                               */
/* ------------------------------------------------------------------ */

export const moves = pgTable(
  "moves",
  {
    id: id(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id),
    project_id: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    origin_property_id: uuid("origin_property_id").references(
      () => properties.id,
      { onDelete: "set null" }
    ),
    destination_property_id: uuid("destination_property_id").references(
      () => properties.id,
      { onDelete: "set null" }
    ),
    origin_floor_plan_file_id: uuid("origin_floor_plan_file_id").references(
      () => files.id,
      { onDelete: "set null" }
    ),
    destination_floor_plan_file_id: uuid(
      "destination_floor_plan_file_id"
    ).references(() => files.id, { onDelete: "set null" }),
    move_date: varchar("move_date", { length: 20 }),
    status: varchar("status", { length: 30 }).default("planning").notNull(),
    notes: text("notes"),
    ...timestamps(),
  },
  (t) => [
    index("moves_user_idx").on(t.user_id),
    index("moves_project_idx").on(t.project_id),
  ]
);

export const moveRooms = pgTable(
  "move_rooms",
  {
    id: id(),
    move_id: uuid("move_id")
      .notNull()
      .references(() => moves.id, { onDelete: "cascade" }),
    // "origin" = room on current home plan, "destination" = room on new home plan
    side: varchar("side", { length: 20 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    color: varchar("color", { length: 20 }).default("#8b5cf6").notNull(),
    // SVG polygon as array of {x,y} in 0..1 floor-plan coordinates (relative
    // to the image so it scales with any render size). Kept for backward
    // compat with rooms drawn before the room-as-sticker refactor; new rooms
    // use the rectangle fields below instead.
    polygon: jsonb("polygon").$type<{ x: number; y: number }[]>().default([]).notNull(),
    // Sticker-compatible rectangle geometry. Rooms are treated as special
    // stickers in the editor UX — same move/resize/rotate handles — while
    // the domain logic (drop targets for items/boxes, bulk assign) stays
    // keyed on this table.
    x: real("x").default(0.3).notNull(),
    y: real("y").default(0.3).notNull(),
    width: real("width").default(0.4).notNull(),
    height: real("height").default(0.3).notNull(),
    rotation: real("rotation").default(0).notNull(),
    sort_order: integer("sort_order").default(0).notNull(),
    ...timestamps(),
  },
  (t) => [
    index("move_rooms_move_idx").on(t.move_id),
    index("move_rooms_side_idx").on(t.side),
  ]
);

export const moveBoxes = pgTable(
  "move_boxes",
  {
    id: id(),
    move_id: uuid("move_id")
      .notNull()
      .references(() => moves.id, { onDelete: "cascade" }),
    // Human-scannable ID that goes on the label. Unique per move, so
    // scanning a barcode anywhere in the app lets us find the right box.
    barcode: varchar("barcode", { length: 64 }).notNull(),
    label: varchar("label", { length: 200 }).notNull(),
    destination_room_id: uuid("destination_room_id").references(
      () => moveRooms.id,
      { onDelete: "set null" }
    ),
    fragile: boolean("fragile").default(false).notNull(),
    priority: varchar("priority", { length: 20 }).default("normal").notNull(),
    notes: text("notes"),
    ...timestamps(),
  },
  (t) => [
    index("move_boxes_move_idx").on(t.move_id),
    index("move_boxes_barcode_idx").on(t.barcode),
  ]
);

export const moveItems = pgTable(
  "move_items",
  {
    id: id(),
    move_id: uuid("move_id")
      .notNull()
      .references(() => moves.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 300 }).notNull(),
    quantity: integer("quantity").default(1).notNull(),
    // Rooms on either plan. Both optional — an item starts unassigned and
    // is placed when the user drags it onto a room on a floor plan.
    origin_room_id: uuid("origin_room_id").references(() => moveRooms.id, {
      onDelete: "set null",
    }),
    destination_room_id: uuid("destination_room_id").references(
      () => moveRooms.id,
      { onDelete: "set null" }
    ),
    box_id: uuid("box_id").references(() => moveBoxes.id, {
      onDelete: "set null",
    }),
    status: varchar("status", { length: 30 }).default("unpacked").notNull(),
    category: varchar("category", { length: 50 }),
    value_estimate: real("value_estimate"),
    fragile: boolean("fragile").default(false).notNull(),
    photo_file_id: uuid("photo_file_id").references(() => files.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    ...timestamps(),
  },
  (t) => [
    index("move_items_move_idx").on(t.move_id),
    index("move_items_origin_room_idx").on(t.origin_room_id),
    index("move_items_destination_room_idx").on(t.destination_room_id),
    index("move_items_box_idx").on(t.box_id),
  ]
);

/**
 * Freeform sticker overlays placed on a floor plan (one side at a time).
 *
 * Each sticker is a blank / outline SVG glyph representing a common plan
 * feature — door, window, wall, toilet, sofa, bed, and so on. Users drop
 * stickers onto the plan and freely move, resize, and rotate them.
 *
 * Geometry is stored in 0..1 normalized coordinates relative to the plan,
 * so stickers scale with any render size.
 */
export const moveStickers = pgTable(
  "move_stickers",
  {
    id: id(),
    move_id: uuid("move_id")
      .notNull()
      .references(() => moves.id, { onDelete: "cascade" }),
    // "origin" = sticker on current home plan, "destination" = new home plan
    side: varchar("side", { length: 20 }).notNull(),
    // kind: door | window | wall | sink | toilet | bathtub | shower | bed |
    //       sofa | table | chair | stairs | fridge | stove | desk | plant |
    //       rug | label | door_double | arrow
    kind: varchar("kind", { length: 30 }).notNull(),
    // Bounding box in 0..1 normalized space.
    x: real("x").default(0.4).notNull(),
    y: real("y").default(0.4).notNull(),
    width: real("width").default(0.2).notNull(),
    height: real("height").default(0.1).notNull(),
    // Rotation in degrees, 0..360.
    rotation: real("rotation").default(0).notNull(),
    // Optional custom stroke color. Falls back to dark slate when empty.
    color: varchar("color", { length: 20 }),
    // Optional free-text label shown next to the glyph (useful for doors,
    // labelled walls, etc.).
    label: varchar("label", { length: 120 }),
    sort_order: integer("sort_order").default(0).notNull(),
    ...timestamps(),
  },
  (t) => [
    index("move_stickers_move_idx").on(t.move_id),
    index("move_stickers_side_idx").on(t.side),
  ]
);
