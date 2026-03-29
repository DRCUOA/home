import { FastifyRequest, FastifyReply } from "fastify";
import jwt from "jsonwebtoken";

export interface JwtPayload {
  userId: string;
  email: string;
}

declare module "fastify" {
  interface FastifyRequest {
    userId: string;
  }
}

export async function authGuard(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const token =
    request.cookies?.access_token ||
    request.headers.authorization?.replace("Bearer ", "");

  if (!token) {
    reply.status(401).send({ error: "Unauthorized", message: "No token" });
    return;
  }

  try {
    const payload = jwt.verify(
      token,
      process.env.JWT_SECRET!
    ) as JwtPayload;
    request.userId = payload.userId;
  } catch {
    reply.status(401).send({ error: "Unauthorized", message: "Invalid token" });
  }
}

export function signAccessToken(userId: string, email: string): string {
  return jwt.sign({ userId, email }, process.env.JWT_SECRET!, {
    expiresIn: "15m",
  });
}

export function signRefreshToken(userId: string, email: string): string {
  return jwt.sign({ userId, email }, process.env.JWT_REFRESH_SECRET!, {
    expiresIn: "7d",
  });
}

export function verifyRefreshToken(token: string): JwtPayload {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET!) as JwtPayload;
}
