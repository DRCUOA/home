import type { ChecklistType } from "./enums.js";

/**
 * Default checklist items automatically seeded when a new SELL project
 * is created (and also available as a one-click "Load defaults" action
 * for existing sell projects).
 *
 * The list is ordered by `sort_order`; items are grouped by
 * `checklist_type` so they render into the correct tab/section on the
 * sell page (pre-sale / documents / staging).
 */
export interface DefaultChecklistItem {
  label: string;
  checklist_type: ChecklistType;
  sort_order: number;
}

export const DEFAULT_SELL_CHECKLIST_ITEMS: readonly DefaultChecklistItem[] = [
  // --- Pre-sale: admin, strategy, engagement, budgets ---
  { label: "Agent selected", checklist_type: "pre_sale", sort_order: 10 },
  { label: "Sale method chosen", checklist_type: "pre_sale", sort_order: 20 },
  { label: "Asking price or reserve strategy set", checklist_type: "pre_sale", sort_order: 30 },
  { label: "Lawyer/conveyancer engaged", checklist_type: "pre_sale", sort_order: 40 },
  { label: "Insurance confirmed", checklist_type: "pre_sale", sort_order: 50 },
  { label: "Mortgage/discharge requirements confirmed", checklist_type: "pre_sale", sort_order: 60 },
  { label: "Tenancy status confirmed (if tenanted)", checklist_type: "pre_sale", sort_order: 70 },
  { label: "Pre-sale budget set", checklist_type: "pre_sale", sort_order: 80 },
  { label: "Marketing budget approved", checklist_type: "pre_sale", sort_order: 90 },
  { label: "Photography booked", checklist_type: "pre_sale", sort_order: 100 },
  { label: "Floor plan/site plan arranged", checklist_type: "pre_sale", sort_order: 110 },
  { label: "Auction/listing documents signed", checklist_type: "pre_sale", sort_order: 120 },

  // --- Sell documents: title, legal, compliance, disclosures ---
  { label: "Record of title checked", checklist_type: "sell_documents", sort_order: 10 },
  { label: "LIM ordered/reviewed", checklist_type: "sell_documents", sort_order: 20 },
  { label: "Rates checked and up to date", checklist_type: "sell_documents", sort_order: 30 },
  { label: "Building consent/CCC documents gathered", checklist_type: "sell_documents", sort_order: 40 },
  { label: "Code compliance issues checked", checklist_type: "sell_documents", sort_order: 50 },
  { label: "Unconsented work identified/resolved", checklist_type: "sell_documents", sort_order: 60 },
  { label: "Property disclosures prepared", checklist_type: "sell_documents", sort_order: 70 },
  { label: "Body corporate documents gathered (if applicable)", checklist_type: "sell_documents", sort_order: 80 },
  { label: "Chattels list confirmed", checklist_type: "sell_documents", sort_order: 90 },

  // --- Staging: physical prep, presentation, open-home readiness ---
  { label: "Repairs completed", checklist_type: "staging", sort_order: 10 },
  { label: "Maintenance items completed", checklist_type: "staging", sort_order: 20 },
  { label: "Interior touch-ups completed", checklist_type: "staging", sort_order: 30 },
  { label: "Exterior clean completed", checklist_type: "staging", sort_order: 40 },
  { label: "Deep clean completed", checklist_type: "staging", sort_order: 50 },
  { label: "Decluttering completed", checklist_type: "staging", sort_order: 60 },
  { label: "Staging completed", checklist_type: "staging", sort_order: 70 },
  { label: "Smoke alarms checked", checklist_type: "staging", sort_order: 80 },
  { label: "Keys/access devices organised", checklist_type: "staging", sort_order: 90 },
  { label: "Open-home presentation ready", checklist_type: "staging", sort_order: 100 },
];
