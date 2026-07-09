/// <reference types="astro/client" />
type Runtime = import("@astrojs/cloudflare").Runtime<Env>;
declare namespace App {
  interface Locals extends Runtime {}
}
interface Env {
  TOTP_KV: KVNamespace;
  MASTER_KEY: string;
}
