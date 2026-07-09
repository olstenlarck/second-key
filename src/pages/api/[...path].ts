import type { APIRoute } from "astro";
import { api } from "../../lib/server";
export const ALL: APIRoute = ({ request, locals, params }) =>
  api(request, (locals as any).runtime.env, params.path || "");
