import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.STUDY_PLAN_BUILD_DIR || ".next",
  experimental: process.env.STUDY_PLAN_LOW_MEMORY_BUILD === "1" ? {
    cpus: 1,
    webpackBuildWorker: true,
    webpackMemoryOptimizations: true,
    parallelServerCompiles: false,
    parallelServerBuildTraces: false,
  } : undefined,
  outputFileTracingIncludes: {
    "/api/chinese/six/**": ["./content/chinese-six/sealed/**/*"],
    "/subjects/*/chinese/six/**": ["./content/chinese-six/sealed/bank.encrypted.json"],
    "/api/math/grade6-bank/**": [
      "./content/grade6-bank/manifest.json",
      "./content/grade6-bank/questions.public.json",
      "./content/grade6-bank/questions.native.public.json",
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
    "/api/english/six/**": ["./content/english-six/assets/**/*", "./content/english-six/ocr-work/**/*"],
    "/*": [
      "./content/chinese-six/*.private.json",
      "./content/chinese-six/pages/**/*",
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
