import { ActionError, defineAction } from "astro:actions";
import { z } from "astro/zod";
import { env } from "cloudflare:workers";

import { createItem, deleteItem, getUser, updateItem } from "../lib/server";

const tokenInput = z.object({
  label: z.string().min(1).max(80),
  issuer: z.string().max(80),
  secret: z.string().min(16).max(256),
  algorithm: z.enum(["SHA1", "SHA256", "SHA512"]),
  digits: z.union([z.literal(6), z.literal(8)]),
  period: z.union([z.literal(30), z.literal(60)]),
});

async function requireUser(request: Request) {
  const user = await getUser(request, env as Env);
  if (!user) {
    throw new ActionError({
      code: "UNAUTHORIZED",
      message: "Authentication required",
    });
  }

  return user;
}

export const server = {
  logout: defineAction({
    handler: async (_, context) => {
      context.cookies.delete("shoo_identity", { path: "/" });
      context.cookies.delete("totp_session", { path: "/" });

      return { ok: true };
    },
  }),

  createToken: defineAction({
    input: tokenInput,
    handler: async (input, context) => {
      const user = await requireUser(context.request);

      return createItem(user.sub, input, env as Env);
    },
  }),

  updateToken: defineAction({
    input: tokenInput.extend({ id: z.uuid() }),
    handler: async ({ id, ...input }, context) => {
      const user = await requireUser(context.request);

      return updateItem(user.sub, id, input, env as Env);
    },
  }),

  deleteToken: defineAction({
    input: z.object({ id: z.uuid() }),
    handler: async ({ id }, context) => {
      const user = await requireUser(context.request);
      await deleteItem(user.sub, id, env as Env);

      return { ok: true };
    },
  }),
};
