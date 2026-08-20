import type { NextConfig } from "next";

// Get R2 public URL from environment variables
const r2PublicUrl =
  process.env.NEXT_PUBLIC_R2_PUBLIC_URL || process.env.R2_PUBLIC_URL;
const r2Hostname = r2PublicUrl ? new URL(r2PublicUrl).hostname : null;

const nextConfig: NextConfig = {
  // output:"standalone",
  // Served from its own host so its auth cookie stays isolated from the
  // tenure landing page dev server on localhost:3000.
  // allowedDevOrigins: ["tenure.localhost"],
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      // R2 hostname from environment variable (if set)
      ...(r2Hostname
        ? [
            {
              protocol: "https" as const,
              hostname: r2Hostname,
              pathname: "/**",
            },
          ]
        : []),
      // Cloudflare R2 - Allow all R2.dev domains
      {
        protocol: "https",
        hostname: "*.r2.dev",
        pathname: "/**",
      },
    ],
  },
  transpilePackages: ["@radix-ui/react-label", "@radix-ui/react-primitive"],

  async rewrites() {
    return [
      {
        source: "/ingest/static/:path*",
        destination: "https://us-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ingest/:path*",
        destination: "https://us.i.posthog.com/:path*",
      },
    ];
  },

  // This is required to support PostHog trailing slash API requests
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
