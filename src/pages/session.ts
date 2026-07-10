import { env } from "cloudflare:workers";

import { createShooSession } from "../lib/server";

import type { APIRoute } from "astro";

export const POST: APIRoute = async ({ cookies, request }) => {
  try {
    const { idToken } = (await request.json()) as { idToken?: string };
    if (!idToken) return new Response(null, { status: 400 });

    const session = await createShooSession(idToken, env as Env);
    cookies.set("totp_session", session, {
      httpOnly: true,
      maxAge: 86_400,
      path: "/",
      sameSite: "lax",
      secure: true,
    });

    return new Response(null, { status: 204 });
  } catch {
    return new Response(null, { status: 401 });
  }
};
