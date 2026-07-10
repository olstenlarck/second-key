import { useEffect, useRef, useState, type SyntheticEvent } from "react";

import { actions } from "astro:actions";

import type { TotpItem } from "../lib/server";

type Draft = Omit<TotpItem, "id">;

const emptyDraft: Draft = {
  algorithm: "SHA256",
  digits: 6,
  issuer: "",
  label: "",
  period: 30,
  secret: "",
};

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

function TokenCard({
  hidden,
  item,
  onDelete,
  onEdit,
  onToast,
}: {
  hidden: boolean;
  item: TotpItem;
  onDelete: (item: TotpItem) => void;
  onEdit: (item: TotpItem) => void;
  onToast: () => void;
}) {
  const [code, setCode] = useState("".padStart(item.digits, "0"));
  const [seconds, setSeconds] = useState<number>(item.period);

  useEffect(() => {
    async function refresh() {
      setCode(await generateCode(item));
      setSeconds(item.period - (Math.floor(Date.now() / 1_000) % item.period));
    }

    void refresh();
    const timer = window.setInterval(refresh, 1_000);

    return () => window.clearInterval(timer);
  }, [item]);

  async function copy() {
    await navigator.clipboard.writeText(code);
    onToast();
  }

  const visible = hidden ? "•".repeat(item.digits) : code;
  const midpoint = item.digits / 2;

  return (
    <article className="group min-w-0 rounded-[1.45rem] border border-line bg-paper/[.035] p-5 transition hover:-translate-y-0.5 hover:border-paper/30 hover:bg-paper/[.055]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[10px] font-bold uppercase tracking-[.16em] text-paper/75">
            {item.issuer || "TOTP"}
          </p>
          <h2 className="mt-2 truncate text-sm font-bold text-paper">{item.label}</h2>
        </div>
        <div className="flex gap-1">
          <button
            className="grid size-9 place-items-center rounded-full border border-line text-paper/60 transition hover:border-acid hover:text-acid"
            onClick={() => onEdit(item)}
            title="Edit"
            type="button"
          >
            <span aria-hidden="true">✎</span>
          </button>
          <button
            className="grid size-9 place-items-center rounded-full border border-line text-paper/45 transition hover:border-red-400 hover:text-red-300"
            onClick={() => onDelete(item)}
            title="Delete"
            type="button"
          >
            ×
          </button>
        </div>
      </div>

      <button className="mt-9 block w-full text-left" onClick={copy} type="button">
        <span className="font-display text-[clamp(2rem,4vw,2.9rem)] tracking-[.035em] text-paper">
          {visible.slice(0, midpoint)}
          <i className="px-1 not-italic text-paper/25">·</i>
          {visible.slice(midpoint)}
        </span>
        <span className="mt-5 block h-1 overflow-hidden rounded-full bg-paper/10">
          <i
            className="block h-full rounded-full bg-acid"
            style={{ width: `${(seconds / item.period) * 100}%` }}
          />
        </span>
      </button>

      <div className="mt-4 flex justify-between text-[9px] font-bold uppercase tracking-widest text-paper/45">
        <span>
          {item.algorithm} · {item.digits} digits
        </span>
        <span>{seconds}s</span>
      </div>
      <button
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-full border border-line py-2.5 text-[10px] font-bold uppercase tracking-widest text-paper/65 transition hover:border-acid hover:bg-acid hover:text-ink"
        onClick={copy}
        type="button"
      >
        Copy code <span aria-hidden="true">⧉</span>
      </button>
    </article>
  );
}

export function Vault({ initialItems }: { initialItems: TotpItem[] }) {
  const [items, setItems] = useState(initialItems);
  const [hidden, setHidden] = useState(true);
  const [editing, setEditing] = useState<TotpItem>();
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  function open(item?: TotpItem) {
    setEditing(item);
    setDraft(item ? { ...item } : emptyDraft);
    setError("");
    dialog.current?.showModal();
  }

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const item = editing
        ? await actions.updateToken.orThrow({ ...draft, id: editing.id })
        : await actions.createToken.orThrow(draft);
      setItems((current) =>
        editing
          ? current.map((candidate) => (candidate.id === item.id ? item : candidate))
          : [...current, item],
      );
      dialog.current?.close();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save token");
    }
  }

  async function remove(item: TotpItem) {
    if (!window.confirm(`Delete ${item.label}?`)) return;
    await actions.deleteToken.orThrow({ id: item.id });
    setItems((current) => current.filter((candidate) => candidate.id !== item.id));
  }

  function showToast() {
    setToast(true);
    window.setTimeout(() => setToast(false), 1_300);
  }

  return (
    <>
      <div className="mb-10 flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.24em] text-acid">
            Your interval
          </p>
          <h1 className="mt-3 font-display text-5xl tracking-[-.075em] sm:text-6xl">
            Ready when you are.
          </h1>
        </div>
        <div className="flex gap-2">
          <button
            className="rounded-full border border-line px-5 py-3 text-xs font-bold text-paper/70 transition hover:border-acid hover:text-acid"
            onClick={() => setHidden((current) => !current)}
            type="button"
          >
            {hidden ? "Show codes" : "Hide codes"}
          </button>
          <button
            className="rounded-full bg-acid px-5 py-3 text-sm font-bold text-ink transition hover:-translate-y-0.5"
            onClick={() => open()}
            type="button"
          >
            Add token +
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items.length === 0 && (
          <div className="col-span-full rounded-[1.5rem] border border-dashed border-line py-24 text-center text-sm text-paper/50">
            Your next code lives here.
          </div>
        )}
        {items.map((item) => (
          <TokenCard
            hidden={hidden}
            item={item}
            key={item.id}
            onDelete={remove}
            onEdit={open}
            onToast={showToast}
          />
        ))}
      </div>

      <dialog
        className="fixed inset-0 m-auto w-[min(600px,calc(100%-24px))] max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-[1.75rem] border border-line bg-[#1a1917] p-0 text-paper shadow-2xl backdrop:bg-black/75"
        ref={dialog}
      >
        <form className="grid gap-5 p-6 sm:p-8" onSubmit={submit}>
          <div className="flex items-center justify-between border-b border-line pb-5">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[.2em] text-acid">
                Interval token
              </p>
              <b className="mt-2 block text-xl">{editing ? "Edit code" : "Add a code"}</b>
            </div>
            <button
              className="grid size-9 place-items-center rounded-full border border-line text-paper/60"
              onClick={() => dialog.current?.close()}
              type="button"
            >
              ×
            </button>
          </div>
          {(["label", "issuer", "secret"] as const).map((field) => (
            <label
              className="grid gap-2 text-[10px] font-bold uppercase tracking-widest text-paper/70"
              key={field}
            >
              {field}
              <input
                className="rounded-xl border border-line bg-black/20 p-3 text-sm normal-case text-paper"
                onChange={(event) => setDraft({ ...draft, [field]: event.target.value })}
                required={field !== "issuer"}
                value={draft[field]}
              />
            </label>
          ))}
          <div className="grid grid-cols-3 gap-3">
            <select
              className="rounded-xl border border-line bg-black/20 p-3"
              onChange={(event) =>
                setDraft({ ...draft, algorithm: event.target.value as Draft["algorithm"] })
              }
              value={draft.algorithm}
            >
              <option>SHA256</option>
              <option>SHA1</option>
              <option>SHA512</option>
            </select>
            <select
              className="rounded-xl border border-line bg-black/20 p-3"
              onChange={(event) =>
                setDraft({ ...draft, digits: Number(event.target.value) as Draft["digits"] })
              }
              value={draft.digits}
            >
              <option>6</option>
              <option>8</option>
            </select>
            <select
              className="rounded-xl border border-line bg-black/20 p-3"
              onChange={(event) =>
                setDraft({ ...draft, period: Number(event.target.value) as Draft["period"] })
              }
              value={draft.period}
            >
              <option>30</option>
              <option>60</option>
            </select>
          </div>
          <p className="min-h-4 text-xs text-red-300">{error}</p>
          <button className="rounded-full bg-acid p-4 font-bold text-ink transition hover:-translate-y-0.5">
            Save code
          </button>
        </form>
      </dialog>

      <div
        className={`pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-acid px-5 py-3 text-xs font-bold text-ink shadow-xl transition ${toast ? "opacity-100" : "translate-y-3 opacity-0"}`}
      >
        CODE COPIED
      </div>
    </>
  );
}
