import { z } from "zod";

const numOpt = z.number().optional();

export const createFinancialScenarioSchema = z.object({
  name: z.string().min(1).max(200),
  project_id: z.string().uuid(),
  property_id: z.string().uuid().optional(),

  sale_price: numOpt,
  commission_rate: numOpt,
  commission_amount: numOpt,
  marketing_cost: numOpt,
  legal_fees_sell: numOpt,
  repairs_cost: numOpt,
  mortgage_balance: numOpt,
  mortgage_break_fee: numOpt,
  moving_cost: numOpt,

  savings: numOpt,
  kiwisaver: numOpt,
  other_funds: numOpt,
  borrowing_capacity: numOpt,

  purchase_price: numOpt,
  deposit: numOpt,
  loan_amount: numOpt,
  interest_rate: numOpt,
  loan_term_years: numOpt,
  repayment_monthly: numOpt,
  legal_fees_buy: numOpt,
  transaction_costs: numOpt,
  contingency: numOpt,
});

export const updateFinancialScenarioSchema =
  createFinancialScenarioSchema.partial();

export type CreateFinancialScenarioInput = z.infer<
  typeof createFinancialScenarioSchema
>;
export type UpdateFinancialScenarioInput = z.infer<
  typeof updateFinancialScenarioSchema
>;
