// Points the build's one Cloudflare import at the shim above.
const SHIM = new URL('./workers-env.mjs', import.meta.url).href;
export async function resolve(specifier, context, next) {
  if (specifier === 'cloudflare:workers') return {url: SHIM, shortCircuit: true, format: 'module'};
  return next(specifier, context);
}
