import { FastifyInstance } from "fastify";
import { eq, and, inArray } from "drizzle-orm";
import { z } from "zod";
import { authGuard } from "../middleware/auth.js";
import { db, schema } from "../db/index.js";
import {
  createFinancialScenarioSchema,
  updateFinancialScenarioSchema,
} from "@hcc/shared";
import { createCrudService } from "../services/crud.js";

const service = createCrudService({
  table: schema.financialScenarios,
  userIdColumn: schema.financialScenarios.user_id,
});

function computeFields(data: Record<string, any>) {
  const n = (v: any) => (typeof v === "number" ? v : 0);

  const estimated_equity =
    n(data.sale_price) -
    n(data.mortgage_balance) -
    n(data.commission_amount) -
    n(data.marketing_cost) -
    n(data.legal_fees_sell) -
    n(data.repairs_cost) -
    n(data.mortgage_break_fee);

  const total_available_budget =
    estimated_equity +
    n(data.savings) +
    n(data.kiwisaver) +
    n(data.other_funds) +
    n(data.borrowing_capacity);

  const net_cash_remaining =
    total_available_budget -
    n(data.purchase_price) -
    n(data.legal_fees_buy) -
    n(data.transaction_costs) -
    n(data.contingency) -
    n(data.moving_cost);

  const is_shortfall = net_cash_remaining < 0;

  return { estimated_equity, total_available_budget, net_cash_remaining, is_shortfall };
}

export default async function financialScenarioRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  app.get("/api/v1/financial-scenarios", async (req) => {
    return service.list(req.userId, req.query as any);
  });

  app.get("/api/v1/financial-scenarios/compare", async (req, reply) => {
    const { ids } = req.query as { ids?: string };
    if (!ids) {
      return reply
        .status(400)
        .send({ error: "Bad Request", message: "ids query parameter required" });
    }

    const idList = ids.split(",").map((s) => s.trim()).filter(Boolean);
    const parsed = z.array(z.string().uuid()).safeParse(idList);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Bad Request", message: "Invalid UUID in ids" });
    }

    const rows = await db
      .select()
      .from(schema.financialScenarios)
      .where(
        and(
          eq(schema.financialScenarios.user_id, req.userId),
          inArray(schema.financialScenarios.id, parsed.data)
        )
      );

    return { data: rows, total: rows.length };
  });

  app.get("/api/v1/financial-scenarios/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = await service.getById(id, req.userId);
    if (!row) return reply.status(404).send({ error: "Not Found" });
    return { data: row };
  });

  app.post("/api/v1/financial-scenarios", async (req, reply) => {
    const body = createFinancialScenarioSchema.parse(req.body);
    const computed = computeFields(body);
    const row = await service.create({ ...body, ...computed }, req.userId);
    return reply.status(201).send({ data: row });
  });

  app.patch("/api/v1/financial-scenarios/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = updateFinancialScenarioSchema.parse(req.body);

    const existing = await service.getById(id, req.userId);
    if (!existing) return reply.status(404).send({ error: "Not Found" });

    const merged = { ...existing, ...body };
    const computed = computeFields(merged);
    const row = await service.update(id, { ...body, ...computed }, req.userId);
    return { data: row };
  });

  app.delete("/api/v1/financial-scenarios/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = await service.remove(id, req.userId);
    if (!row) return reply.status(404).send({ error: "Not Found" });
    return { data: row };
  });
}
