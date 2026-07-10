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
    <article className="group min-w-0 border border-line bg-[#10120f] p-5 hover:border-white/30">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[10px] uppercase tracking-[.18em] text-white/35">
            {item.issuer || "TOTP"}
          </p>
          <h2 className="mt-2 truncate font-bold">{item.label}</h2>
        </div>
        <div className="flex gap-1">
          <button
            className="grid size-9 place-items-center border border-line text-white/45 hover:border-acid hover:text-acid"
            onClick={() => onEdit(item)}
            title="Edit"
            type="button"
          >
            ✎
          </button>
          <button
            className="grid size-9 place-items-center border border-line text-white/35 hover:border-red-400 hover:text-red-300"
            onClick={() => onDelete(item)}
            title="Delete"
            type="button"
          >
            ×
          </button>
        </div>
      </div>

      <button className="mt-8 block w-full text-left" onClick={copy} type="button">
        <span className="font-display text-[clamp(1.8rem,4vw,2.7rem)] tracking-[.06em]">
          {visible.slice(0, midpoint)}
          <i className="px-1 not-italic text-white/15">·</i>
          {visible.slice(midpoint)}
        </span>
        <span className="mt-4 block h-0.5 bg-white/10">
          <i
            className="block h-full bg-acid"
            style={{ width: `${(seconds / item.period) * 100}%` }}
          />
        </span>
      </button>

      <div className="mt-3 flex justify-between text-[9px] uppercase tracking-widest text-white/25">
        <span>
          {item.algorithm} · {item.digits} digits
        </span>
        <span>{seconds}s</span>
      </div>
      <button
        className="mt-4 w-full border border-line py-2 text-[10px] uppercase tracking-widest text-white/50 hover:border-acid hover:text-acid"
        onClick={copy}
        type="button"
      >
        Copy code ⧉
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
      <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="text-[10px] uppercase tracking-[.22em] text-acid">Authenticator vault</p>
          <h1 className="mt-2 font-display text-5xl tracking-[-.06em]">Your codes</h1>
        </div>
        <div className="flex gap-2">
          <button
            className="border border-line px-4 py-3 text-xs hover:border-acid"
            onClick={() => setHidden((current) => !current)}
            type="button"
          >
            {hidden ? "Show codes" : "Hide codes"}
          </button>
          <button
            className="bg-acid px-5 py-3 font-bold text-ink"
            onClick={() => open()}
            type="button"
          >
            Add token +
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.length === 0 && (
          <div className="col-span-full border border-line py-24 text-center text-sm text-white/35">
            No codes yet.
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
        className="w-[min(560px,calc(100%-24px))] border border-line bg-[#11130f] p-0 text-paper backdrop:bg-black/80"
        ref={dialog}
      >
        <form className="grid gap-4 p-6" onSubmit={submit}>
          <div className="flex items-center justify-between border-b border-line pb-4">
            <b>{editing ? "Edit authenticator" : "Add authenticator"}</b>
            <button className="text-white/50" onClick={() => dialog.current?.close()} type="button">
              ×
            </button>
          </div>
          {(["label", "issuer", "secret"] as const).map((field) => (
            <label
              className="grid gap-2 text-[10px] uppercase tracking-widest text-white/45"
              key={field}
            >
              {field}
              <input
                className="border border-line bg-ink p-3 text-sm normal-case text-paper"
                onChange={(event) => setDraft({ ...draft, [field]: event.target.value })}
                required={field !== "issuer"}
                value={draft[field]}
              />
            </label>
          ))}
          <div className="grid grid-cols-3 gap-3">
            <select
              className="border border-line bg-ink p-3"
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
              className="border border-line bg-ink p-3"
              onChange={(event) =>
                setDraft({ ...draft, digits: Number(event.target.value) as Draft["digits"] })
              }
              value={draft.digits}
            >
              <option>6</option>
              <option>8</option>
            </select>
            <select
              className="border border-line bg-ink p-3"
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
          <button className="bg-acid p-4 font-bold text-ink">Encrypt & save</button>
        </form>
      </dialog>

      <div
        className={`pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 bg-acid px-4 py-3 text-xs font-bold text-ink transition ${toast ? "opacity-100" : "translate-y-3 opacity-0"}`}
      >
        CODE COPIED
      </div>
    </>
  );
}
