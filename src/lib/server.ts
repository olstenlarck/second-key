const ORIGIN = "https://totp.wgw.lol",
  SHOO = "https://shoo.dev",
  te = new TextEncoder(),
  td = new TextDecoder();
const b64 = (b: Uint8Array) =>
  btoa(String.fromCharCode(...b))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const unb64 = (s: string) =>
  Uint8Array.from(
    atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)),
    (c) => c.charCodeAt(0),
  );
const cookie = (r: Request, n: string) =>
  Object.fromEntries(
    (r.headers.get("cookie") || "")
      .split(/; */)
      .filter(Boolean)
      .map((x) => {
        const i = x.indexOf("=");
        return [x.slice(0, i), x.slice(i + 1)];
      }),
  )[n];
async function key(env: Env, type: "aes" | "hmac") {
  return crypto.subtle.importKey(
    "raw",
    unb64(env.MASTER_KEY),
    type === "aes" ? "AES-GCM" : { name: "HMAC", hash: "SHA-256" },
    false,
    type === "aes" ? ["encrypt", "decrypt"] : ["sign"],
  );
}
async function seal(v: string, e: Env) {
  const iv = crypto.getRandomValues(new Uint8Array(12)),
    out = new Uint8Array(
      await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(e, "aes"), te.encode(v)),
    );
  return b64(iv) + "." + b64(out);
}
async function open(v: string, e: Env) {
  const [a, b] = v.split(".");
  return td.decode(
    await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(a) }, await key(e, "aes"), unb64(b)),
  );
}
async function session(sub: string, name: string, e: Env) {
  const p = b64(
      te.encode(JSON.stringify({ sub, name: name || "Signed-in user", exp: Date.now() + 864e5 })),
    ),
    s = new Uint8Array(await crypto.subtle.sign("HMAC", await key(e, "hmac"), te.encode(p)));
  return p + "." + b64(s);
}
async function user(r: Request, e: Env) {
  try {
    const [p, s] = cookie(r, "totp_session").split("."),
      ok = await crypto.subtle.verify("HMAC", await key(e, "hmac"), unb64(s), te.encode(p)),
      d = JSON.parse(td.decode(unb64(p)));
    return ok && d.exp > Date.now() ? d : null;
  } catch {
    return null;
  }
}
let cache: any;
async function verify(token: string) {
  const p = token.split("."),
    h = JSON.parse(td.decode(unb64(p[0]))),
    d = JSON.parse(td.decode(unb64(p[1])));
  if (
    p.length !== 3 ||
    h.alg !== "ES256" ||
    d.iss !== SHOO ||
    d.aud !== `origin:${ORIGIN}` ||
    d.exp * 1000 < Date.now()
  )
    throw 0;
  if (!cache || cache.exp < Date.now()) {
    cache = {
      ...((await (await fetch(SHOO + "/.well-known/jwks.json")).json()) as any),
      exp: Date.now() + 36e5,
    };
  }
  const jwk = cache.keys.find((x: any) => x.kid === h.kid),
    k = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, [
      "verify",
    ]);
  if (
    !(await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      k,
      unb64(p[2]),
      te.encode(p[0] + "." + p[1]),
    ))
  )
    throw 0;
  return d;
}
const norm = (x: any) => ({
  id: x.id || crypto.randomUUID(),
  label: String(x.label || "").slice(0, 80),
  issuer: String(x.issuer || "").slice(0, 80),
  secret: String(x.secret || "")
    .replace(/[\s=-]/g, "")
    .toUpperCase(),
  algorithm: ["SHA1", "SHA256", "SHA512"].includes(x.algorithm) ? x.algorithm : "SHA1",
  digits: [6, 8].includes(+x.digits) ? +x.digits : 6,
  period: [30, 60].includes(+x.period) ? +x.period : 30,
});
async function rows(sub: string, e: Env) {
  const a: any[] = (await e.TOTP_KV.get("u:" + sub, "json")) || [];
  return Promise.all(a.map(async (x) => ({ ...x, secret: await open(x.secret, e) })));
}
async function save(sub: string, a: any[], e: Env) {
  await e.TOTP_KV.put(
    "u:" + sub,
    JSON.stringify(
      await Promise.all(a.map(async (x) => ({ ...x, secret: await seal(x.secret, e) }))),
    ),
  );
}
export async function api(r: Request, e: Env, path: string) {
  const j = (x: any, s = 200, h = {}) =>
    new Response(JSON.stringify(x), {
      status: s,
      headers: { "content-type": "application/json", "cache-control": "no-store", ...h },
    });
  if (path === "session" && r.method === "POST")
    try {
      const d = await verify(((await r.json()) as any).idToken),
        s = await session(d.pairwise_sub, d.name, e);
      return j({ ok: true }, 200, {
        "set-cookie": `totp_session=${s}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`,
      });
    } catch {
      return j({ error: "Sign-in could not be verified" }, 401);
    }
  if (path === "logout" && r.method === "POST")
    return j({ ok: true }, 200, {
      "set-cookie": "totp_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax",
    });
  const u = await user(r, e);
  if (!u) return j({ error: "Authentication required" }, 401);
  if (path === "items" && r.method === "GET")
    return j({ items: await rows(u.sub, e), name: u.name });
  if (path === "items" && r.method === "POST") {
    const x = norm(await r.json());
    if (!x.label || !/^[A-Z2-7]{16,256}$/.test(x.secret)) return j({ error: "Invalid token" }, 400);
    const a = await rows(u.sub, e);
    a.push(x);
    await save(u.sub, a, e);
    return j({ item: x }, 201);
  }
  if (path.startsWith("items/") && r.method === "DELETE") {
    await save(
      u.sub,
      (await rows(u.sub, e)).filter((x) => x.id !== path.slice(6)),
      e,
    );
    return j({ ok: true });
  }
  return j({ error: "Not found" }, 404);
}
