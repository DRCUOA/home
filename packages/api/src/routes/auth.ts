import { FastifyInstance } from "fastify";
import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { registerSchema, loginSchema } from "@hcc/shared";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../middleware/auth.js";

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

export default async function authRoutes(app: FastifyInstance) {
  app.post("/api/v1/auth/register", async (req, reply) => {
    const body = registerSchema.parse(req.body);
    const existing = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, body.email))
      .limit(1);

    if (existing.length > 0) {
      return reply
        .status(409)
        .send({ error: "Conflict", message: "Email already registered" });
    }

    const passwordHash = await bcrypt.hash(body.password, 12);
    const [user] = await db
      .insert(schema.users)
      .values({ email: body.email, password_hash: passwordHash, name: body.name })
      .returning({ id: schema.users.id, email: schema.users.email, name: schema.users.name, plan: schema.users.plan });

    const accessToken = signAccessToken(user.id, user.email);
    const refreshToken = signRefreshToken(user.id, user.email);

    reply
      .setCookie("access_token", accessToken, { ...COOKIE_OPTS, maxAge: 900 })
      .setCookie("refresh_token", refreshToken, {
        ...COOKIE_OPTS,
        maxAge: 604800,
      })
      .status(201)
      .send({
        data: { user, accessToken, refreshToken },
      });
  });

  app.post("/api/v1/auth/login", async (req, reply) => {
    const body = loginSchema.parse(req.body);
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, body.email))
      .limit(1);

    if (!user || !(await bcrypt.compare(body.password, user.password_hash))) {
      return reply
        .status(401)
        .send({ error: "Unauthorized", message: "Invalid credentials" });
    }

    const accessToken = signAccessToken(user.id, user.email);
    const refreshToken = signRefreshToken(user.id, user.email);

    reply
      .setCookie("access_token", accessToken, { ...COOKIE_OPTS, maxAge: 900 })
      .setCookie("refresh_token", refreshToken, {
        ...COOKIE_OPTS,
        maxAge: 604800,
      })
      .send({
        data: {
          user: { id: user.id, email: user.email, name: user.name, plan: user.plan },
          accessToken,
          refreshToken,
        },
      });
  });

  app.post("/api/v1/auth/refresh", async (req, reply) => {
    const token =
      req.cookies?.refresh_token ||
      (req.body as { refreshToken?: string })?.refreshToken;

    if (!token) {
      return reply
        .status(401)
        .send({ error: "Unauthorized", message: "No refresh token" });
    }

    try {
      const payload = verifyRefreshToken(token);
      const accessToken = signAccessToken(payload.userId, payload.email);
      const refreshToken = signRefreshToken(payload.userId, payload.email);

      reply
        .setCookie("access_token", accessToken, {
          ...COOKIE_OPTS,
          maxAge: 900,
        })
        .setCookie("refresh_token", refreshToken, {
          ...COOKIE_OPTS,
          maxAge: 604800,
        })
        .send({ data: { accessToken, refreshToken } });
    } catch {
      reply
        .status(401)
        .send({ error: "Unauthorized", message: "Invalid refresh token" });
    }
  });

  app.post("/api/v1/auth/logout", async (_req, reply) => {
    reply
      .clearCookie("access_token", COOKIE_OPTS)
      .clearCookie("refresh_token", COOKIE_OPTS)
      .send({ data: { success: true } });
  });

  app.get("/api/v1/auth/me", {
    preHandler: (await import("../middleware/auth.js")).authGuard,
    handler: async (req, reply) => {
      const [user] = await db
        .select({
          id: schema.users.id,
          email: schema.users.email,
          name: schema.users.name,
          plan: schema.users.plan,
        })
        .from(schema.users)
        .where(eq(schema.users.id, req.userId))
        .limit(1);

      if (!user) {
        return reply
          .status(404)
          .send({ error: "Not Found", message: "User not found" });
      }

      reply.send({ data: user });
    },
  });
}
