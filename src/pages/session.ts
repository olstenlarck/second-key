import { verifyShooIdentity } from "../lib/server";

import type { APIRoute } from "astro";

export const POST: APIRoute = async ({ request }) => {
  try {
    const { idToken } = (await request.json()) as { idToken?: string };
    if (!idToken) return new Response(null, { status: 400 });

    const identity = await verifyShooIdentity(idToken);
    const maxAge = Math.max(1, Math.floor((identity.exp - Date.now()) / 1_000));

    return new Response(JSON.stringify({ ok: true }), {
      headers: {
        "cache-control": "no-store",
        "content-type": "application/json",
        "set-cookie": `shoo_session=${idToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`,
      },
      status: 200,
    });
  } catch {
    return new Response(null, { status: 401 });
  }
};
