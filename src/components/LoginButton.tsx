import { useEffect, useState } from "react";

export function LoginButton() {
  const [status, setStatus] = useState<"idle" | "syncing" | "error">("idle");

  useEffect(() => {
    const identity = window.Shoo?.getIdentity();
    if (!identity?.token) return;

    if (document.cookie.includes("shoo_identity=")) {
      setStatus("error");

      return;
    }

    setStatus("syncing");
    document.cookie = `shoo_identity=${encodeURIComponent(identity.token)}; Path=/; Secure; SameSite=Lax; Max-Age=3600`;
    window.location.reload();
  }, []);

  if (status === "syncing") {
    return <p className="mt-8 text-sm text-white/50">Opening your vault…</p>;
  }

  return (
    <>
      {status === "error" && (
        <p className="mt-5 border-l-2 border-red-400 bg-red-400/10 p-3 text-xs text-red-200">
          Shoo signed in, but the server session could not be created.
        </p>
      )}
      <button
        className="mt-8 w-full bg-acid px-5 py-4 font-bold text-ink transition hover:translate-x-1 hover:translate-y-1"
        onClick={() => window.Shoo?.startSignIn({ requestPii: true, returnTo: "/" })}
        type="button"
      >
        Continue with Google →
      </button>
    </>
  );
}
