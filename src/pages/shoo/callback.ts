import type { APIRoute } from "astro";

export const GET: APIRoute = () => {
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
    </style>
  </head>
  <body>
    <main>
      <i></i>
      <strong>Completing Google sign-in…</strong>
      <p>Shoo is securely finishing the callback.</p>
    </main>
    <script src="https://shoo.dev/shoo.js"></script>
  </body>
</html>`;

  return new Response(html, {
    headers: {
      "cache-control": "no-store",
      "content-type": "text/html; charset=utf-8",
    },
  });
};
