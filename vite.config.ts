import { readFileSync } from "node:fs";
import vinext from "vinext";
import { defineConfig } from "vite";
import hostingConfig from "./.openai/hosting.json";
import { readExecutionProfile } from "./scripts/execution-profile.mjs";
import { sites } from "./build/sites-vite-plugin";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

const { d1, r2 } = hostingConfig;

// cloudflare.json names the real database, bucket and Worker for `npm run deploy`.
// Leave its d1.id empty and the build keeps the placeholder, which is all local
// development needs — Miniflare invents a database either way.
type DeployTarget = { workerName?: string; d1?: { name?: string; id?: string }; r2?: { bucket?: string } };
let deployTarget: DeployTarget = {};
try {
  deployTarget = JSON.parse(readFileSync(new URL("./cloudflare.json", import.meta.url), "utf8"));
} catch {
  // Not configured yet; local development does not need it.
}
const databaseId = deployTarget.d1?.id?.trim() || SITE_CREATOR_PLACEHOLDER_DATABASE_ID;
const databaseName = deployTarget.d1?.name?.trim() || "site-creator-d1";
const bucketName = deployTarget.r2?.bucket?.trim() || "site-creator-r2";
const workerName = deployTarget.workerName?.trim();

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";
const managedLinux = readExecutionProfile() === "managed-linux";

const localBindingConfig = {
  main: "vinext/server/fetch-handler",
  compatibility_flags: ["nodejs_compat"],
  ...(workerName ? { name: workerName } : {}),
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: databaseName,
          database_id: databaseId,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: bucketName,
        },
      ]
    : [],
};

export default defineConfig(async () => {
  // Use Miniflare's local Request.cf placeholder unless fetching is requested.
  process.env.CLOUDFLARE_CF_FETCH_ENABLED ??= "false";
  process.env.WRANGLER_SEND_METRICS ??= "false";

  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.WRANGLER_REGISTRY_PATH ??= ".wrangler/dev-registry";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: {
      ...(managedLinux ? { host: "0.0.0.0", allowedHosts: ["terminal.local"] } : {}),
      ...(isCodexSeatbeltSandbox ? { watch: { useFsEvents: false, usePolling: true } } : {}),
    },
    plugins: [
      vinext(),
      sites({ mockAuth: !managedLinux }),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        inspectorPort: false,
        config: localBindingConfig,
      }),
    ],
  };
});
