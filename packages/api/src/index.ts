import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

import authRoutes from "./routes/auth.js";
import projectRoutes from "./routes/projects.js";
import propertyRoutes from "./routes/properties.js";
import propertyCustomTypeRoutes from "./routes/property-custom-types.js";
import contactRoutes from "./routes/contacts.js";
import communicationRoutes from "./routes/communications.js";
import noteRoutes from "./routes/notes.js";
import taskRoutes from "./routes/tasks.js";
import checklistRoutes from "./routes/checklists.js";
import financialScenarioRoutes from "./routes/financial-scenarios.js";
import offerRoutes from "./routes/offers.js";
import decisionRoutes from "./routes/decisions.js";
import researchRoutes from "./routes/research.js";
import sellAgentRoutes from "./routes/sell-agents.js";
import propertyEvaluationRoutes from "./routes/property-evaluations.js";
import propertyCriteriaRoutes from "./routes/property-criteria.js";
import fileRoutes from "./routes/files.js";
import searchRoutes from "./routes/search.js";
import assistantRoutes from "./routes/assistant.js";
import auditLogRoutes from "./routes/audit-logs.js";
import billingRoutes from "./routes/billing.js";
import mapRoutes from "./routes/map.js";
import movingRoutes from "./routes/moving.js";
import calendarRoutes from "./routes/calendar.js";

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: process.env.CORS_ORIGIN || "http://localhost:5173",
  credentials: true,
});
await app.register(cookie);
await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } });

app.get("/healthz", async () => ({ status: "ok" }));

await app.register(authRoutes);
await app.register(projectRoutes);
await app.register(propertyRoutes);
await app.register(propertyCustomTypeRoutes);
await app.register(contactRoutes);
await app.register(communicationRoutes);
await app.register(noteRoutes);
await app.register(taskRoutes);
await app.register(checklistRoutes);
await app.register(financialScenarioRoutes);
await app.register(offerRoutes);
await app.register(decisionRoutes);
await app.register(researchRoutes);
await app.register(sellAgentRoutes);
await app.register(propertyEvaluationRoutes);
await app.register(propertyCriteriaRoutes);
await app.register(fileRoutes);
await app.register(searchRoutes);
await app.register(assistantRoutes);
await app.register(auditLogRoutes);
await app.register(billingRoutes);
await app.register(mapRoutes);
await app.register(movingRoutes);
await app.register(calendarRoutes);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webDistDir =
  process.env.WEB_DIST_DIR || path.resolve(__dirname, "../../web/dist");

if (existsSync(webDistDir)) {
  await app.register(fastifyStatic, {
    root: webDistDir,
    prefix: "/",
    wildcard: false,
  });

  app.setNotFoundHandler((req, reply) => {
    if (req.method !== "GET" || req.url.startsWith("/api/")) {
      return reply.status(404).send({ error: "Not Found" });
    }
    return reply.type("text/html").sendFile("index.html");
  });
} else {
  app.log.warn(
    `Web dist not found at ${webDistDir} — API will run without serving the SPA.`,
  );
}

app.setErrorHandler((error: any, _req, reply) => {
  if (error.validation) {
    return reply.status(400).send({
      error: "Validation Error",
      message: error.message,
      statusCode: 400,
    });
  }

  if (error.name === "ZodError" || Array.isArray(error.issues)) {
    const issues = (error.issues ?? []).map((i: any) => ({
      path: Array.isArray(i.path) ? i.path.join(".") : String(i.path ?? ""),
      message: i.message,
      code: i.code,
    }));
    const summary = issues.length
      ? issues.map((i: any) => `${i.path || "(root)"}: ${i.message}`).join("; ")
      : "Validation failed";
    return reply.status(400).send({
      error: "Validation Error",
      message: summary,
      issues,
      statusCode: 400,
    });
  }

  app.log.error(error);
  reply.status(error.statusCode || 500).send({
    error: "Internal Server Error",
    message:
      process.env.NODE_ENV === "production"
        ? "Something went wrong"
        : error.message,
    statusCode: error.statusCode || 500,
  });
});

const port = parseInt(process.env.PORT || "3001", 10);
await app.listen({ port, host: "0.0.0.0" });
console.log(`API running on http://localhost:${port}`);
