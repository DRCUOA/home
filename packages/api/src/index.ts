import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";

import authRoutes from "./routes/auth.js";
import projectRoutes from "./routes/projects.js";
import propertyRoutes from "./routes/properties.js";
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

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: process.env.CORS_ORIGIN || "http://localhost:5173",
  credentials: true,
});
await app.register(cookie);
await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } });

await app.register(authRoutes);
await app.register(projectRoutes);
await app.register(propertyRoutes);
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

app.setErrorHandler((error: any, _req, reply) => {
  if (error.validation) {
    return reply.status(400).send({
      error: "Validation Error",
      message: error.message,
      statusCode: 400,
    });
  }

  if (error.name === "ZodError" || error.issues) {
    return reply.status(400).send({
      error: "Validation Error",
      message: error.message,
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
