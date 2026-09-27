import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
