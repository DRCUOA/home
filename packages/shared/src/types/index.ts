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
