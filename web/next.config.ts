import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // web/ is a separate deployable within the emarketscope repo, but the
  // repo root also has its own package-lock.json (for pipeline/) —
  // without this, Turbopack infers the wrong workspace root and warns on
  // every build.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
