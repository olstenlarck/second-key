import { actions } from "astro:actions";

import type { APIRoute } from "astro";

export const ALL: APIRoute = (context) => {
  const result = context.getActionResult(actions.signIn);
  if (result?.data) return context.redirect("/");

  const error = result?.error?.message ?? "";
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width">
    <meta name="theme-color" content="#090a09">
    <title>Completing sign-in · Second Key</title>
    <style>
      :root { color-scheme: dark; font-family: ui-monospace, monospace; background: #090a09; color: #f2f1ea; }
      body { min-height: 100vh; display: grid; place-items: center; margin: 0; }
      main { width: min(28rem, calc(100% - 3rem)); border: 1px solid #2b2e29; padding: 2rem; }
      i { display: block; width: 2.5rem; height: .25rem; margin-bottom: 1.5rem; background: #c9ff4d; }
      p { color: #94978f; line-height: 1.6; }
      [data-error] { color: #fca5a5; }
    </style>
    <script src="https://shoo.dev/shoo.js" data-shoo-auto-callback="false"></script>
  </head>
  <body>
    <main>
      <i></i>
      <strong>Completing Google sign-in…</strong>
      <p data-status>Securely exchanging the callback.</p>
      <p data-error>${error}</p>
      <form method="POST" action="${actions.signIn}" hidden>
        <input name="idToken">
      </form>
    </main>
    <script>
      (async () => {
        const status = document.querySelector("[data-status]");
        const error = document.querySelector("[data-error]");
        try {
          const token = await window.Shoo.finishSignIn({
            clearCallbackParams: false,
            redirectAfter: false
          });
          if (!token || !token.id_token) throw new Error("Shoo returned no identity token.");
          const form = document.querySelector("form");
          form.elements.idToken.value = token.id_token;
          form.submit();
        } catch (cause) {
          status.textContent = "Sign-in could not be completed.";
          error.textContent = cause instanceof Error ? cause.message : String(cause);
        }
      })();
    </script>
  </body>
</html>`;

  return new Response(html, {
    headers: {
      "cache-control": "no-store",
      "content-type": "text/html; charset=utf-8",
    },
  });
};
