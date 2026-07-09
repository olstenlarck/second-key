type TotpItem = {
  id: string;
  label: string;
  issuer: string;
  secret: string;
  algorithm: "SHA1" | "SHA256" | "SHA512";
  digits: 6 | 8;
  period: 30 | 60;
};

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

const element = <T = HTMLElement>(selector: string) =>
  document.querySelector(selector) as unknown as T;
let items: TotpItem[] = [];
let codesHidden = true;
let editingId: string | null = null;
let toastTimer = 0;

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("content-type", "application/json");
  const response = await fetch(url, {
    ...options,
    headers,
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "Request failed");

  return data;
}

function decodeBase32(secret: string): Uint8Array {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  const bytes: number[] = [];
  for (const character of secret.replace(/[^A-Z2-7]/gi, "").toUpperCase())
    bits += alphabet.indexOf(character).toString(2).padStart(5, "0");
  for (let index = 0; index + 8 <= bits.length; index += 8)
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));

  return new Uint8Array(bytes);
}

async function generateCode(item: TotpItem): Promise<string> {
  const counter = Math.floor(Date.now() / 1000 / item.period);
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

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!,
  );
}

async function render(): Promise<void> {
  const list = element("#list");
  if (items.length === 0) {
    list.innerHTML =
      '<div class="col-span-full border border-line py-24 text-center text-sm text-white/35">No codes yet.</div>';
    return;
  }
  list.innerHTML = (
    await Promise.all(
      items.map(async (item) => {
        const code = await generateCode(item);
        const secondsLeft = item.period - (Math.floor(Date.now() / 1000) % item.period);
        const shown = codesHidden ? "•".repeat(item.digits) : code;
        const split = item.digits / 2;

        return `<article data-code="${code}" class="group min-w-0 border border-line bg-[#10120f] p-5 hover:border-white/30"><div class="flex items-start justify-between gap-3"><div class="min-w-0"><p class="truncate text-[10px] uppercase tracking-[.18em] text-white/35">${escapeHtml(item.issuer || "TOTP")}</p><h2 class="mt-2 truncate font-bold">${escapeHtml(item.label)}</h2></div><div class="flex gap-1"><button data-edit="${item.id}" title="Edit" class="grid size-9 place-items-center border border-line text-white/45 hover:border-acid hover:text-acid">✎</button><button data-delete="${item.id}" title="Delete" class="grid size-9 place-items-center border border-line text-white/35 hover:border-red-400 hover:text-red-300">×</button></div></div><button data-copy="${code}" class="mt-8 block w-full text-left"><span class="font-display text-[clamp(1.8rem,4vw,2.7rem)] tracking-[.06em]">${shown.slice(0, split)}<i class="px-1 not-italic text-white/15">·</i>${shown.slice(split)}</span><span class="mt-4 block h-0.5 bg-white/10"><i class="block h-full bg-acid" style="width:${(secondsLeft / item.period) * 100}%"></i></span></button><div class="mt-3 flex justify-between text-[9px] uppercase tracking-widest text-white/25"><span>${item.algorithm} · ${item.digits} digits</span><span>${secondsLeft}s</span></div><button data-copy="${code}" title="Copy" class="mt-4 w-full border border-line py-2 text-[10px] uppercase tracking-widest text-white/50 hover:border-acid hover:text-acid">Copy code ⧉</button></article>`;
      }),
    )
  ).join("");
}

async function copyCode(code: string): Promise<void> {
  await navigator.clipboard.writeText(code);
  const toast = element("#toast");
  toast.classList.remove("opacity-0", "translate-y-3");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.add("opacity-0", "translate-y-3"), 1300);
}

function openEditor(item?: TotpItem): void {
  editingId = item?.id ?? null;
  element("#modal-title").textContent = item ? "Edit authenticator" : "Add authenticator";
  element<HTMLInputElement>("#label").value = item?.label ?? "";
  element<HTMLInputElement>("#issuer").value = item?.issuer ?? "";
  element<HTMLInputElement>("#secret").value = item?.secret ?? "";
  element<HTMLSelectElement>("#algorithm").value = item?.algorithm ?? "SHA256";
  element<HTMLSelectElement>("#digits").value = String(item?.digits ?? 6);
  element<HTMLSelectElement>("#period").value = String(item?.period ?? 30);
  element<HTMLDialogElement>("#modal").showModal();
}

async function boot(): Promise<void> {
  try {
    const data = await request<{ items: TotpItem[]; name: string }>("/api/items");
    items = data.items;
    element("#gate").classList.add("hidden");
    element("#app").classList.remove("hidden");
    element("#identity").classList.add("flex");
    element("#identity").classList.remove("hidden");
    element("#logout").classList.remove("hidden");
    element("#name").textContent = data.name;
    element("#avatar").textContent = data.name
      .split(" ")
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase();
    await render();
    window.setInterval(render, 1000);

    return;
  } catch {}
  const identity = window.Shoo?.getIdentity();
  if (!identity?.token) return;
  try {
    await request("/api/session", {
      method: "POST",
      body: JSON.stringify({ idToken: identity.token }),
    });
    window.location.replace("/");
  } catch (error) {
    element("#auth-error").textContent = (error as Error).message;
    element("#auth-error").classList.remove("hidden");
  }
}

element("#login").onclick = () => window.Shoo?.startSignIn({ requestPii: true, returnTo: "/" });
element("#logout").onclick = async () => {
  await request("/api/logout", { method: "POST" });
  window.Shoo?.clearIdentity();
  window.location.reload();
};
element("#privacy").onclick = async () => {
  codesHidden = !codesHidden;
  element("#privacy").textContent = codesHidden ? "Show codes" : "Hide codes";
  await render();
};
element("#add").onclick = () => openEditor();
element("#close").onclick = () => element<HTMLDialogElement>("#modal").close();
element("#list").onclick = async (event) => {
  const target = event.target as HTMLElement;
  const copy = target.closest<HTMLElement>("[data-copy]");
  if (copy) {
    await copyCode(copy.dataset.copy!);
    return;
  }
  const edit = target.closest<HTMLElement>("[data-edit]");
  if (edit) {
    openEditor(items.find((item) => item.id === edit.dataset.edit));
    return;
  }
  const remove = target.closest<HTMLElement>("[data-delete]");
  if (remove && window.confirm("Delete this token?")) {
    await request(`/api/items/${remove.dataset.delete}`, { method: "DELETE" });
    items = items.filter((item) => item.id !== remove.dataset.delete);
    await render();
  }
};
element<HTMLFormElement>("#form").onsubmit = async (event) => {
  event.preventDefault();
  const body = {
    label: element<HTMLInputElement>("#label").value,
    issuer: element<HTMLInputElement>("#issuer").value,
    secret: element<HTMLInputElement>("#secret").value,
    algorithm: element<HTMLSelectElement>("#algorithm").value,
    digits: Number(element<HTMLSelectElement>("#digits").value),
    period: Number(element<HTMLSelectElement>("#period").value),
  };
  try {
    const url = editingId ? `/api/items/${editingId}` : "/api/items";
    const data = await request<{ item: TotpItem }>(url, {
      method: editingId ? "PATCH" : "POST",
      body: JSON.stringify(body),
    });
    items = editingId
      ? items.map((item) => (item.id === editingId ? data.item : item))
      : [...items, data.item];
    element<HTMLDialogElement>("#modal").close();
    await render();
  } catch (error) {
    element("#error").textContent = (error as Error).message;
  }
};

window.addEventListener("load", boot);
