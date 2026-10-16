import type { NextConfig } from "next";

// Baseline security headers. The full Content Security Policy is added with the hardening milestone, once the
// PayU, Turnstile and storage origins are final.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  turbopack: { root: process.cwd() },
  outputFileTracingRoot: process.cwd(),
  // Company logos (up to 2 MB) are posted to a server action with the company form.
  experimental: { serverActions: { bodySizeLimit: "2200kb" } },
  // PDFs: headless Chromium runs inside the API functions. Load these with Node's require, and ship the
  // compressed Chromium binary that @sparticuz/chromium unpacks at run time.
  serverExternalPackages: ["puppeteer-core", "@sparticuz/chromium"],
  outputFileTracingIncludes: { "/api/**": ["./node_modules/@sparticuz/chromium/bin/**"] },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Sign-in links carry one-time tokens: never leak them in the Referer header.
      { source: "/auth/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
    ];
  },
};

export default nextConfig;
