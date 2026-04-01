import { FastifyRequest, FastifyReply } from "fastify";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";

export type RequiredPlan = "pro" | "lifetime";

const PLAN_RANK: Record<string, number> = { free: 0, pro: 1, lifetime: 2 };

export function requirePlan(minimumPlan: RequiredPlan) {
  return async function planGuard(req: FastifyRequest, reply: FastifyReply) {
    const [user] = await db
      .select({ plan: schema.users.plan })
      .from(schema.users)
      .where(eq(schema.users.id, req.userId))
      .limit(1);

    const userRank = PLAN_RANK[user?.plan ?? "free"] ?? 0;
    const requiredRank = PLAN_RANK[minimumPlan] ?? 1;

    if (userRank < requiredRank) {
      reply.status(403).send({
        error: "Upgrade Required",
        message: `This feature requires the ${minimumPlan} plan or above.`,
        required_plan: minimumPlan,
        current_plan: user?.plan ?? "free",
      });
    }
  };
}
