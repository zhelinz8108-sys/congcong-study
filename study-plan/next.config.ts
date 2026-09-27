import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingExcludes: {
    "/api/upload": [
      "./public/**/*",
      "./.chrome-*-profile/**/*",
      "./.tmp-*/**/*",
      "./downloads/**/*",
      "./tmp/**/*",
    ],
    "/api/files/*": [
      "./public/**/*",
      "./.chrome-*-profile/**/*",
      "./.tmp-*/**/*",
      "./downloads/**/*",
      "./tmp/**/*",
    ],
  },
};

export default nextConfig;
