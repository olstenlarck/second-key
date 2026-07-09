import type { TotpItem } from "../lib/server";

export {};

declare global {
  interface Window {
    Shoo?: {
      clearIdentity(): void;
      getIdentity(): { token?: string };
      startSignIn(options: object): void;
    };
  }
}

const select = <ElementType = HTMLElement>(
  selector: string,
  root: Document | HTMLElement = document,
) => root.querySelector(selector) as ElementType | null;

const cards = [...document.querySelectorAll<HTMLElement>("[data-token-card]")];
let codesHidden = true;
let editingItem: TotpItem | undefined;
let toastTimer = 0;

async function request(url: string, options: RequestInit = {}): Promise<void> {
  const headers = new Headers(options.headers);
  headers.set("content-type", "application/json");
  const response = await fetch(url, { ...options, headers });
  const result = (await response.json()) as { error?: string };
  if (!response.ok) throw new Error(result.error ?? "Request failed");
}

function parseItem(card: HTMLElement): TotpItem {
  return JSON.parse(card.dataset.item!) as TotpItem;
}

function decodeBase32(secret: string): Uint8Array {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  const bytes: number[] = [];

  for (const character of secret.replace(/[^A-Z2-7]/gi, "").toUpperCase()) {
    bits += alphabet.indexOf(character).toString(2).padStart(5, "0");
  }

  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }

  return new Uint8Array(bytes);
}

async function generateCode(item: TotpItem): Promise<string> {
  const counter = Math.floor(Date.now() / 1_000 / item.period);
  const message = new Uint8Array(8);
  new DataView(message.buffer).setBigUint64(0, BigInt(counter));
  const key = await crypto.subtle.importKey(
    "raw",
    decodeBase32(item.secret).buffer as ArrayBuffer,
    { name: "HMAC", hash: `SHA-${item.algorithm.slice(3)}` },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, message));
  const offset = digest.at(-1)! & 15;
  const value =
    (((digest[offset] & 127) << 24) |
      ((digest[offset + 1] & 255) << 16) |
      ((digest[offset + 2] & 255) << 8) |
      (digest[offset + 3] & 255)) %
    10 ** item.digits;

  return String(value).padStart(item.digits, "0");
}

async function refreshCard(card: HTMLElement): Promise<void> {
  const item = parseItem(card);
  const code = await generateCode(item);
  const midpoint = item.digits / 2;
  const seconds = item.period - (Math.floor(Date.now() / 1_000) % item.period);
  const visibleCode = codesHidden ? "•".repeat(item.digits) : code;

  card.dataset.code = code;
  select("[data-code-left]", card)!.textContent = visibleCode.slice(0, midpoint);
  select("[data-code-right]", card)!.textContent = visibleCode.slice(midpoint);
  select("[data-seconds]", card)!.textContent = `${seconds}s`;
  select<HTMLElement>("[data-progress]", card)!.style.width = `${(seconds / item.period) * 100}%`;
}

async function refreshCards(): Promise<void> {
  await Promise.all(cards.map(refreshCard));
}

function showToast(): void {
  const toast = select("#toast")!;
  toast.classList.remove("opacity-0", "translate-y-3");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.add("opacity-0", "translate-y-3"), 1_300);
}

async function copyCard(card: HTMLElement): Promise<void> {
  await navigator.clipboard.writeText(card.dataset.code!);
  showToast();
}

function input(id: string): HTMLInputElement {
  return select<HTMLInputElement>(`#${id}`)!;
}

function choice(id: string): HTMLSelectElement {
  return select<HTMLSelectElement>(`#${id}`)!;
}

function openEditor(item?: TotpItem): void {
  editingItem = item;
  select("#modal-title")!.textContent = item ? "Edit authenticator" : "Add authenticator";
  input("label").value = item?.label ?? "";
  input("issuer").value = item?.issuer ?? "";
  input("secret").value = item?.secret ?? "";
  choice("algorithm").value = item?.algorithm ?? "SHA256";
  choice("digits").value = String(item?.digits ?? 6);
  choice("period").value = String(item?.period ?? 30);
  select<HTMLDialogElement>("#modal")!.showModal();
}

async function finishShooCallback(): Promise<void> {
  if (document.body.dataset.authenticated === "true") return;

  const identity = window.Shoo?.getIdentity();
  if (!identity?.token) return;

  try {
    await request("/api/session", {
      method: "POST",
      body: JSON.stringify({ idToken: identity.token }),
    });
    window.location.replace("/");
  } catch (error) {
    const message = select("#auth-error")!;
    message.textContent = (error as Error).message;
    message.classList.remove("hidden");
  }
}

select("#login")?.addEventListener("click", () => {
  window.Shoo?.startSignIn({ requestPii: true, returnTo: "/shoo" });
});

select("#logout")?.addEventListener("click", async () => {
  await request("/api/logout", { method: "POST" });
  window.Shoo?.clearIdentity();
  window.location.reload();
});

select("#privacy")?.addEventListener("click", async (event) => {
  codesHidden = !codesHidden;
  (event.currentTarget as HTMLElement).textContent = codesHidden ? "Show codes" : "Hide codes";
  await refreshCards();
});

select("#add")?.addEventListener("click", () => openEditor());
select("#close")?.addEventListener("click", () => select<HTMLDialogElement>("#modal")?.close());

for (const card of cards) {
  card.querySelectorAll("[data-copy]").forEach((button) => {
    button.addEventListener("click", () => copyCard(card));
  });

  select("[data-edit]", card)?.addEventListener("click", () => openEditor(parseItem(card)));
  select("[data-delete]", card)?.addEventListener("click", async () => {
    const item = parseItem(card);
    if (!window.confirm(`Delete ${item.label}?`)) return;

    await request(`/api/items/${item.id}`, { method: "DELETE" });
    window.location.reload();
  });
}

select<HTMLFormElement>("#form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const body = {
    label: input("label").value,
    issuer: input("issuer").value,
    secret: input("secret").value,
    algorithm: choice("algorithm").value,
    digits: Number(choice("digits").value),
    period: Number(choice("period").value),
  };

  try {
    await request(editingItem ? `/api/items/${editingItem.id}` : "/api/items", {
      method: editingItem ? "PATCH" : "POST",
      body: JSON.stringify(body),
    });
    window.location.reload();
  } catch (error) {
    select("#error")!.textContent = (error as Error).message;
  }
});

await refreshCards();
window.setInterval(refreshCards, 1_000);
window.addEventListener("load", finishShooCallback);
