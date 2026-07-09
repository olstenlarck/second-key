import { env } from "cloudflare:workers";

import { api } from "../../lib/server";

import type { APIRoute } from "astro";

export const ALL: APIRoute = ({ request, params }) => api(request, env as Env, params.path || "");
