import { useEffect, useState } from "react";

const attemptKey = "second_key_session_attempt";

export function LoginButton() {
  const [status, setStatus] = useState<"idle" | "syncing" | "error">("idle");

  useEffect(() => {
    const identity = window.Shoo?.getIdentity();
    if (!identity?.token) return;

    if (sessionStorage.getItem(attemptKey) === identity.token) {
      setStatus("error");

      return;
    }

    sessionStorage.setItem(attemptKey, identity.token);
    setStatus("syncing");
    fetch("/session", {
      body: JSON.stringify({ idToken: identity.token }),
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      method: "POST",
    })
      .then((response) => {
        if (!response.ok) throw new Error("Session creation failed");
        window.location.reload();
      })
      .catch(() => {
        document.documentElement.removeAttribute("data-session-sync");
        setStatus("error");
      });
  }, []);

  if (status === "syncing") {
    return null;
  }

  return (
    <>
      {status === "error" && (
        <p className="mt-5 border-l-2 border-red-400 bg-red-400/10 p-3 text-xs text-red-200">
          Shoo signed in, but the secure server session could not be created.
        </p>
      )}
      <button
        className="mt-8 w-full bg-acid px-5 py-4 font-bold text-ink transition hover:translate-x-1 hover:translate-y-1"
        onClick={() => {
          sessionStorage.removeItem(attemptKey);
          void window.Shoo?.startSignIn({ requestPii: true, returnTo: "/" });
        }}
        type="button"
      >
        Continue with Google →
      </button>
    </>
  );
}
