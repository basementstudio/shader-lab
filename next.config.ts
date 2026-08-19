import withBundleAnalyzer from "@next/bundle-analyzer"
import { withSentryConfig } from "@sentry/nextjs"
import type { NextConfig } from "next"

const shaderLabRuntimeEntry = "./packages/shader-lab-react/dist/src/index.js"

const nextConfig: NextConfig = {
  reactStrictMode: true,
  reactCompiler: true,
  typedRoutes: true,
  turbopack: {
    resolveAlias: {
      "@basementstudio/shader-lab": shaderLabRuntimeEntry,
    },
    rules: {
      "*.svg": {
        loaders: [
          {
            loader: "@svgr/webpack",
            options: {
              memo: true,
              dimensions: false,
              svgoConfig: {
                multipass: true,
                plugins: [
                  "removeDimensions",
                  "removeOffCanvasPaths",
                  "reusePaths",
                  "removeElementsByAttr",
                  "removeStyleElement",
                  "removeScriptElement",
                  "prefixIds",
                  "cleanupIds",
                  {
                    name: "cleanupNumericValues",
                    params: {
                      floatPrecision: 1,
                    },
                  },
                  {
                    name: "convertPathData",
                    params: {
                      floatPrecision: 1,
                    },
                  },
                  {
                    name: "convertTransform",
                    params: {
                      floatPrecision: 1,
                    },
                  },
                  {
                    name: "cleanupListOfValues",
                    params: {
                      floatPrecision: 1,
                    },
                  },
                ],
              },
            },
          },
        ],
        as: "*.js",
      },
    },
  },
  cacheComponents: true,
  experimental: {
    browserDebugInfoInTerminal: true,
    optimizePackageImports: [
      "@react-three/drei",
      "@react-three/fiber",
      "gsap",
      "three",
      "postprocessing",
      "lenis",
      "zustand",
    ],
  },
  images: {
    dangerouslyAllowSVG: true,
    remotePatterns: [],
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30 days
    qualities: [90],
    formats: ["image/avif", "image/webp"],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        {
          key: "X-Content-Type-Options",
          value: "nosniff",
        },
        {
          key: "Content-Security-Policy",
          value: "frame-ancestors 'self';",
        },
        {
          key: "X-Frame-Options",
          value: "SAMEORIGIN",
        },
        {
          key: "X-XSS-Protection",
          value: "1; mode=block",
        },
        {
          key: "X-DNS-Prefetch-Control",
          value: "on",
        },
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
        {
          key: "Permissions-Policy",
          value: "camera=(self), microphone=(), geolocation=()",
        },
      ],
    },
  ],
  redirects: async () => [],
  rewrites: async () => [],
  webpack: (config) => {
    config.resolve ??= {}
    config.resolve.alias ??= {}
    config.resolve.alias["@basementstudio/shader-lab"] = shaderLabRuntimeEntry
    return config
  },
}

const bundleAnalyzerPlugin = withBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
})

const NextApp = () => {
  const plugins = [bundleAnalyzerPlugin]
  return plugins.reduce((config, plugin) => plugin(config), nextConfig)
}

export default withSentryConfig(NextApp, {
  org: "basement-studio",
  project: "shader-lab",
  // Source maps upload only when SENTRY_AUTH_TOKEN is present in the build env.
  widenClientFileUpload: true,
  tunnelRoute: "/monitoring",
  silent: !process.env.CI,
})
