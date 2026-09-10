import type { NextConfig } from "next";

const config: NextConfig = {
  // Product photos come from object storage; hosts get added when that is wired up.
  images: { remotePatterns: [] },
  typedRoutes: true,
};

export default config;
