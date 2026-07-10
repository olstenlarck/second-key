const ORIGIN = "https://totp.wgw.lol";
const SHOO = "https://shoo.dev";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export type TotpItem = {
  id: string;
  label: string;
  issuer: string;
  secret: string;
  algorithm: "SHA1" | "SHA256" | "SHA512";
  digits: 6 | 8;
  period: 30 | 60;
};

export type SessionUser = {
  sub: string;
  name: string;
  exp: number;
};

type TokenMetadata = {
  sealed: string;
};

let jwks: { exp: number; keys: Array<JsonWebKey & { kid?: string }> } | undefined;

function encodeBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);

  const decoded = atob(padded);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }

  return bytes;
}

function readCookie(request: Request, name: string): string | undefined {
  const cookies = Object.fromEntries(
    (request.headers.get("cookie") ?? "")
      .split(/; */)
      .filter(Boolean)
      .map((entry) => {
        const separator = entry.indexOf("=");

        return [entry.slice(0, separator), entry.slice(separator + 1)];
      }),
  );

  return cookies[name];
}

async function cryptoKey(env: Env, type: "aes" | "hmac"): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    decodeBase64(env.MASTER_KEY),
    type === "aes" ? "AES-GCM" : { name: "HMAC", hash: "SHA-256" },
    false,
    type === "aes" ? ["encrypt", "decrypt"] : ["sign"],
  );
}

async function seal(value: unknown, env: Env): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      await cryptoKey(env, "aes"),
      encoder.encode(JSON.stringify(value)),
    ),
  );

  return `${encodeBase64(iv)}.${encodeBase64(ciphertext)}`;
}

async function unseal<T>(value: string, env: Env): Promise<T> {
  const [iv, ciphertext] = value.split(".");
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: decodeBase64(iv) },
    await cryptoKey(env, "aes"),
    decodeBase64(ciphertext),
  );

  const decoded = decoder.decode(plaintext);

  try {
    return JSON.parse(decoded) as T;
  } catch {
    return decoded as T;
  }
}

export async function getUser(request: Request, env: Env): Promise<SessionUser | null> {
  try {
    const [payload, signature] = readCookie(request, "totp_session")!.split(".");
    const valid = await crypto.subtle.verify(
      "HMAC",
      await cryptoKey(env, "hmac"),
      decodeBase64(signature),
      encoder.encode(payload),
    );
    const user = JSON.parse(decoder.decode(decodeBase64(payload))) as SessionUser;

    return valid && user.exp > Date.now() ? user : null;
  } catch {
    return null;
  }
}

async function createSession(sub: string, name: string, env: Env): Promise<string> {
  const payload = encodeBase64(
    encoder.encode(
      JSON.stringify({
        sub,
        name: name || "Signed-in user",
        exp: Date.now() + 86_400_000,
      }),
    ),
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", await cryptoKey(env, "hmac"), encoder.encode(payload)),
  );

  return `${payload}.${encodeBase64(signature)}`;
}

async function verifyShooToken(token: string): Promise<Record<string, string | number>> {
  const parts = token.split(".");
  const header = JSON.parse(decoder.decode(decodeBase64(parts[0])));
  const payload = JSON.parse(decoder.decode(decodeBase64(parts[1])));

  if (
    parts.length !== 3 ||
    header.alg !== "ES256" ||
    payload.iss !== SHOO ||
    payload.aud !== `origin:${ORIGIN}` ||
    payload.exp * 1000 < Date.now()
  ) {
    throw new Error("Invalid identity token");
  }

  if (!jwks || jwks.exp < Date.now()) {
    const response = await fetch(`${SHOO}/.well-known/jwks.json`);
    const keys = (await response.json()) as { keys: Array<JsonWebKey & { kid?: string }> };
    jwks = { ...keys, exp: Date.now() + 3_600_000 };
  }

  const keyData = jwks.keys.find((key) => key.kid === header.kid);
  if (!keyData) throw new Error("Unknown identity key");

  const key = await crypto.subtle.importKey(
    "jwk",
    keyData,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    decodeBase64(parts[2]),
    encoder.encode(`${parts[0]}.${parts[1]}`),
  );

  if (!valid) throw new Error("Invalid identity signature");

  return payload;
}

export async function createShooSession(idToken: string, env: Env): Promise<string> {
  const identity = await verifyShooToken(idToken);

  return createSession(String(identity.pairwise_sub), String(identity.name || ""), env);
}

function normalize(input: Partial<TotpItem>): TotpItem {
  return {
    id: input.id || crypto.randomUUID(),
    label: String(input.label || "").slice(0, 80),
    issuer: String(input.issuer || "").slice(0, 80),
    secret: String(input.secret || "")
      .replace(/[\s=-]/g, "")
      .toUpperCase(),
    algorithm: ["SHA1", "SHA256", "SHA512"].includes(String(input.algorithm))
      ? input.algorithm!
      : "SHA256",
    digits: [6, 8].includes(Number(input.digits)) ? input.digits! : 6,
    period: [30, 60].includes(Number(input.period)) ? input.period! : 30,
  };
}

function validItem(item: TotpItem): boolean {
  return Boolean(item.label) && /^[A-Z2-7]{16,256}$/.test(item.secret);
}

function tokenPrefix(sub: string): string {
  return `u:${sub}:`;
}

function slugify(label: string): string {
  return (
    label
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 56) || "token"
  );
}

function tokenKey(sub: string, item: TotpItem): string {
  return `${tokenPrefix(sub)}${slugify(item.label)}-${item.id.slice(0, 8)}`;
}

async function listStoredItems(
  sub: string,
  env: Env,
): Promise<Array<{ key: string; item: TotpItem }>> {
  const records: Array<{ key: string; item: TotpItem }> = [];
  let cursor: string | undefined;

  do {
    const page = await env.TOTP_KV.list<TokenMetadata>({
      prefix: tokenPrefix(sub),
      cursor,
      limit: 1_000,
    });

    for (const key of page.keys) {
      if (key.metadata?.sealed) {
        records.push({
          key: key.name,
          item: await unseal<TotpItem>(key.metadata.sealed, env),
        });
      }
    }

    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  return records;
}

async function putItem(sub: string, item: TotpItem, env: Env): Promise<void> {
  await env.TOTP_KV.put(tokenKey(sub, item), "", {
    metadata: { sealed: await seal(item, env) } satisfies TokenMetadata,
  });
}

async function migrateLegacyItems(sub: string, env: Env): Promise<void> {
  const legacyKey = `u:${sub}`;
  const legacyItems = await env.TOTP_KV.get<Array<TotpItem & { secret: string }>>(
    legacyKey,
    "json",
  );
  if (!legacyItems?.length) return;

  for (const legacyItem of legacyItems) {
    const item = normalize({
      ...legacyItem,
      secret: await unseal<string>(legacyItem.secret, env),
    });
    await putItem(sub, item, env);
  }

  await env.TOTP_KV.delete(legacyKey);
}

export async function getItems(sub: string, env: Env): Promise<TotpItem[]> {
  let records = await listStoredItems(sub, env);
  if (records.length === 0) {
    await migrateLegacyItems(sub, env);
    records = await listStoredItems(sub, env);
  }

  return records
    .map(({ item }) => item)
    .sort((left, right) => left.label.localeCompare(right.label));
}

export async function createItem(
  sub: string,
  input: Partial<TotpItem>,
  env: Env,
): Promise<TotpItem> {
  const item = normalize(input);
  if (!validItem(item)) throw new Error("Invalid token");

  await putItem(sub, item, env);

  return item;
}

export async function updateItem(
  sub: string,
  id: string,
  input: Partial<TotpItem>,
  env: Env,
): Promise<TotpItem> {
  const records = await listStoredItems(sub, env);
  const current = records.find(({ item }) => item.id === id);
  if (!current) throw new Error("Token not found");

  const item = normalize({ ...current.item, ...input, id });
  if (!validItem(item)) throw new Error("Invalid token");

  await putItem(sub, item, env);
  if (current.key !== tokenKey(sub, item)) await env.TOTP_KV.delete(current.key);

  return item;
}

export async function deleteItem(sub: string, id: string, env: Env): Promise<void> {
  const records = await listStoredItems(sub, env);
  const current = records.find(({ item }) => item.id === id);
  if (!current) throw new Error("Token not found");

  await env.TOTP_KV.delete(current.key);
}
