import { FastifyInstance } from "fastify";
import { eq, desc, and, gte, inArray } from "drizzle-orm";
import { authGuard } from "../middleware/auth.js";
import { db, schema } from "../db/index.js";
import { runAssistantSchema, CONTACT_ROLES } from "@hcc/shared";
import { runWorkflow } from "../agents/runner.js";
import { indexRecord } from "../agents/embeddings.js";
import { getLLM } from "../agents/llm.js";

const REINDEX_CONFIG: Array<{
  sourceType: string;
  table: any;
  fields: string[];
}> = [
  { sourceType: "project", table: schema.projects, fields: ["name", "type", "sale_strategy", "sell_milestone", "buy_milestone"] },
  { sourceType: "property", table: schema.properties, fields: ["address", "suburb", "city", "property_type", "listing_method", "listing_description", "watchlist_status", "bedrooms", "bathrooms", "price_asking"] },
  { sourceType: "note", table: schema.notes, fields: ["body", "tags"] },
  { sourceType: "task", table: schema.tasks, fields: ["title", "description", "priority", "status"] },
  { sourceType: "contact", table: schema.contacts, fields: ["name", "email", "phone", "organisation", "role_tags", "notes"] },
  { sourceType: "communication", table: schema.communicationLogs, fields: ["type", "subject", "body"] },
  { sourceType: "decision", table: schema.decisions, fields: ["title", "reasoning", "assumptions", "risks_accepted", "alternatives_considered"] },
  { sourceType: "research", table: schema.researchItems, fields: ["title", "notes", "category", "tags", "url"] },
  { sourceType: "offer", table: schema.offers, fields: ["direction", "price", "conditions_detail", "status", "notes"] },
  { sourceType: "financial_scenario", table: schema.financialScenarios, fields: ["name", "sale_price", "purchase_price", "net_cash_remaining"] },
];

export default async function assistantRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  app.get("/api/v1/assistant/runs", async (req) => {
    const rows = await db
      .select()
      .from(schema.agentRuns)
      .where(eq(schema.agentRuns.user_id, req.userId))
      .orderBy(desc(schema.agentRuns.created_at));

    return { data: rows, total: rows.length };
  });

  app.get("/api/v1/assistant/runs/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const [row] = await db
      .select()
      .from(schema.agentRuns)
      .where(eq(schema.agentRuns.id, id))
      .limit(1);
    if (!row) return reply.status(404).send({ error: "Not Found" });
    return { data: row };
  });

  app.post("/api/v1/assistant/run", { bodyLimit: 10 * 1024 * 1024 }, async (req, reply) => {
    const body = runAssistantSchema.parse(req.body);
    const imageBase64 = (req.body as any).image_base64 as string | undefined;

    const [run] = await db
      .insert(schema.agentRuns)
      .values({
        user_id: req.userId,
        workflow_type: body.workflow_type,
        input_summary: body.input,
        model: body.model,
        tools: body.tools,
        project_id: body.project_id,
        property_id: body.property_id,
        status: "running",
      })
      .returning();

    runWorkflow(
      run.id,
      body.workflow_type as any,
      body.input,
      req.userId,
      imageBase64,
      body.model,
      body.tools as any,
      body.context_messages
    ).catch((err) => app.log.error(err, "Agent workflow failed"));

    return reply.status(201).send({ data: run });
  });

  app.delete("/api/v1/assistant/runs/:id/cascade", async (req, reply) => {
    const { id } = req.params as { id: string };

    const [target] = await db
      .select()
      .from(schema.agentRuns)
      .where(
        and(eq(schema.agentRuns.id, id), eq(schema.agentRuns.user_id, req.userId))
      )
      .limit(1);
    if (!target) return reply.status(404).send({ error: "Not Found" });

    const toDelete = await db
      .select({ id: schema.agentRuns.id })
      .from(schema.agentRuns)
      .where(
        and(
          eq(schema.agentRuns.user_id, req.userId),
          gte(schema.agentRuns.created_at, target.created_at)
        )
      );

    const ids = toDelete.map((r) => r.id);
    if (ids.length > 0) {
      await db
        .delete(schema.agentRuns)
        .where(inArray(schema.agentRuns.id, ids));
    }

    return { deleted: ids.length, ids };
  });

  app.post("/api/v1/assistant/runs/:id/save", async (req, reply) => {
    const { id } = req.params as { id: string };

    const allRuns = await db
      .select()
      .from(schema.agentRuns)
      .where(eq(schema.agentRuns.user_id, req.userId))
      .orderBy(desc(schema.agentRuns.created_at));

    const target = allRuns.find((r) => r.id === id);
    if (!target) return reply.status(404).send({ error: "Not Found" });

    const ancestors = allRuns
      .filter(
        (r) =>
          new Date(r.created_at).getTime() <=
          new Date(target.created_at).getTime()
      )
      .sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );

    const lines: string[] = [];
    for (const run of ancestors) {
      const date = new Date(run.created_at).toLocaleDateString("en-NZ", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      lines.push(`### You — ${date}`);
      lines.push(run.input_summary);
      lines.push("");
      if (run.output_summary) {
        lines.push(`### Assistant`);
        try {
          const parsed = JSON.parse(run.output_summary);
          const answer =
            parsed.answer ??
            parsed.summary ??
            parsed.cleaned ??
            parsed.explanation ??
            run.output_summary;
          lines.push(answer);
        } catch {
          lines.push(run.output_summary);
        }
        lines.push("");
      }
      lines.push("---");
      lines.push("");
    }

    const llm = getLLM();
    const titleResponse = await llm.invoke([
      {
        role: "system",
        content:
          "Generate a short descriptive title (max 8 words) for this assistant conversation. Return ONLY the title text, nothing else.",
      },
      {
        role: "user",
        content: lines.join("\n").slice(0, 2000),
      },
    ]);
    const title = (titleResponse.content as string).replace(/^["']|["']$/g, "").trim();

    const markdown = `# ${title}\n\n${lines.join("\n")}`;

    const [note] = await db
      .insert(schema.notes)
      .values({
        user_id: req.userId,
        body: markdown,
        project_id: target.project_id,
        tags: ["assistant-export"],
      })
      .returning();

    return reply.status(201).send({ data: note, title });
  });

  app.post("/api/v1/assistant/runs/save-selected", async (req, reply) => {
    const { run_ids } = req.body as { run_ids: string[] };
    if (!Array.isArray(run_ids) || run_ids.length === 0) {
      return reply.status(400).send({ error: "run_ids required" });
    }

    const allRuns = await db
      .select()
      .from(schema.agentRuns)
      .where(eq(schema.agentRuns.user_id, req.userId))
      .orderBy(desc(schema.agentRuns.created_at));

    const idSet = new Set(run_ids);
    const selected = allRuns
      .filter((r) => idSet.has(r.id))
      .sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );

    if (selected.length === 0) {
      return reply.status(404).send({ error: "No matching runs found" });
    }

    const lines: string[] = [];
    for (const run of selected) {
      const date = new Date(run.created_at).toLocaleDateString("en-NZ", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      lines.push(`### You — ${date}`);
      lines.push(run.input_summary);
      lines.push("");
      if (run.output_summary) {
        lines.push(`### Assistant`);
        try {
          const parsed = JSON.parse(run.output_summary);
          const answer =
            parsed.answer ??
            parsed.summary ??
            parsed.cleaned ??
            parsed.explanation ??
            run.output_summary;
          lines.push(answer);
        } catch {
          lines.push(run.output_summary);
        }
        lines.push("");
      }
      lines.push("---");
      lines.push("");
    }

    const llm = getLLM();
    const titleResponse = await llm.invoke([
      {
        role: "system",
        content:
          "Generate a short descriptive title (max 8 words) for this assistant conversation excerpt. Return ONLY the title text, nothing else.",
      },
      {
        role: "user",
        content: lines.join("\n").slice(0, 2000),
      },
    ]);
    const title = (titleResponse.content as string).replace(/^["']|["']$/g, "").trim();

    const markdown = `# ${title}\n\n${lines.join("\n")}`;

    const projectId = selected.find((r) => r.project_id)?.project_id ?? null;

    const [note] = await db
      .insert(schema.notes)
      .values({
        user_id: req.userId,
        body: markdown,
        project_id: projectId,
        tags: ["assistant-export"],
      })
      .returning();

    return reply.status(201).send({ data: note, title });
  });

  app.post("/api/v1/assistant/extract-card", async (req, reply) => {
    const data = await req.file();
    if (!data) {
      return reply.status(400).send({ error: "No image provided" });
    }

    const chunks: Buffer[] = [];
    for await (const chunk of data.file) {
      chunks.push(chunk as Buffer);
    }
    const buffer = Buffer.concat(chunks);
    const base64 = buffer.toString("base64");
    const mimeType = data.mimetype || "image/jpeg";

    const roleList = CONTACT_ROLES.join(", ");
    const llm = getLLM();
    const response = await llm.invoke([
      {
        role: "system",
        content: `You extract contact information from business card images. Return ONLY valid JSON with these fields:
- name: string (full name)
- email: string or null
- phone: string or null
- organisation: string or null (company/agency name)
- role_tags: string[] (choose from: ${roleList})
- notes: string or null (any additional info like job title, address, website)

For role_tags, infer the most likely role from job title or company type. For example, "Real Estate Agent" → ["selling_agent"], "Solicitor" or "Lawyer" → ["solicitor"], "Mortgage Adviser" → ["mortgage_broker"]. If unclear, use ["other"].
If you cannot read parts of the card, extract what you can and leave unknowns as null.`,
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Extract the contact details from this business card image.",
          },
          {
            type: "image_url",
            image_url: { url: `data:${mimeType};base64,${base64}` },
          },
        ],
      },
    ]);

    try {
      let content = response.content as string;
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) content = jsonMatch[1];
      const parsed = JSON.parse(content.trim());
      return { data: parsed };
    } catch {
      return reply.status(422).send({
        error: "Could not extract card details",
        raw: response.content,
      });
    }
  });

  app.post("/api/v1/assistant/reindex", async (_req, reply) => {
    let indexed = 0;
    const errors: string[] = [];

    for (const config of REINDEX_CONFIG) {
      const rows = await db.select().from(config.table);
      for (const row of rows) {
        try {
          const fields: Record<string, any> = {};
          for (const f of config.fields) {
            if ((row as any)[f] != null) fields[f] = (row as any)[f];
          }
          await indexRecord(config.sourceType, (row as any).id, fields);
          indexed++;
        } catch (err: any) {
          errors.push(`${config.sourceType}/${(row as any).id}: ${err.message}`);
        }
      }
    }

    return reply.send({ indexed, errors });
  });
}
