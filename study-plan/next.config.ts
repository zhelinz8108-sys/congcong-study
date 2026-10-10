import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/math/grade6-bank/**": [
      "./content/grade6-bank/manifest.json",
      "./content/grade6-bank/questions.public.json",
      "./content/grade6-bank/public/**/*",
      "./content/grade6-bank/sealed/**/*",
    ],
    "/subjects/*/math/problem-bank*": ["./content/grade6-bank/manifest.json"],
    "/subjects/*/math/problem-bank/**": ["./content/grade6-bank/manifest.json"],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "media.githubusercontent.com",
        pathname: "/media/zhelinz8108-sys/congcong-study/**",
      },
    ],
  },
  outputFileTracingExcludes: {
    "/*": [
      "./content/grade6-bank/answers.private.json",
      "./content/grade6-bank/import-audit.private.json",
      "./content/grade6-bank/private/**/*",
    ],
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
