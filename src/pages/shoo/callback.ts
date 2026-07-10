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
      body { min-height: 100vh; margin: 0; background: #090a09; }
    </style>
  </head>
  <body>
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
