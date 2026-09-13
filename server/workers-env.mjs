// Stands in for Cloudflare's `cloudflare:workers` module. The built app reads
// env.DB and env.BUCKET inside functions, never at import time, so filling this
// object in before the first request is enough.
export const env = {};
