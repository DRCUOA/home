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
] as const;
export type AgentWorkflowType = (typeof AGENT_WORKFLOW_TYPES)[number];

export const OPENAI_MODELS = [
  "gpt-5-nano",
  "gpt-5-mini",
  "gpt-5.4",
  "gpt-4.1-nano",
  "gpt-4.1-mini",
  "gpt-4.1",
  "o4-mini",
] as const;
export type OpenAIModel = (typeof OPENAI_MODELS)[number];

export const OPENAI_MODEL_LABELS: Record<OpenAIModel, string> = {
  "gpt-5-nano": "GPT-5 Nano",
  "gpt-5-mini": "GPT-5 Mini",
  "gpt-5.4": "GPT-5.4",
  "gpt-4.1-nano": "GPT-4.1 Nano",
  "gpt-4.1-mini": "GPT-4.1 Mini",
  "gpt-4.1": "GPT-4.1",
  "o4-mini": "o4 Mini (reasoning)",
};

export const ASSISTANT_TOOLS = [
  "web_search",
] as const;
export type AssistantTool = (typeof ASSISTANT_TOOLS)[number];

export const ASSISTANT_TOOL_LABELS: Record<AssistantTool, string> = {
  web_search: "Web search",
};
