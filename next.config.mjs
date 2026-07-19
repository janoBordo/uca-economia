// Content-Security-Policy (6.4/6.6): el navegador solo ejecuta scripts propios
// y de los orígenes listados. 'unsafe-inline' en script-src es necesario hoy
// por los scripts inline de Next.js y el anti-flash del tema (mejorable con
// nonces más adelante). unpkg.com = worker de pdf.js (Lectura).
// challenges.cloudflare.com = Turnstile (CAPTCHA del signup, fase siguiente).
const csp = [
  "default-src 'self'",
  // googletagmanager = gtag.js de Google Analytics 4 (v10.6)
  "script-src 'self' 'unsafe-inline' https://unpkg.com https://challenges.cloudflare.com https://www.googletagmanager.com",
  // Inter ahora es self-hosteada vía next/font (layout.tsx) — los orígenes de
  // Google Fonts salieron de la CSP (menos superficie, misma tipografía).
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co https://*.google-analytics.com https://www.googletagmanager.com",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://unpkg.com https://challenges.cloudflare.com https://*.google-analytics.com https://www.googletagmanager.com",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "frame-src https://challenges.cloudflare.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

// Headers de seguridad (6.6). CORS: no se emite ningún Access-Control-Allow-*
// a propósito — la API queda solo same-origin (el default del navegador).
const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Explícito aunque sea el default: sin source maps en producción (6.2)
  productionBrowserSourceMaps: false,
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      // Assets de marca: cambian casi nunca — cache largo en el navegador para
      // no re-pedirlos en cada visita (menos edge requests contra la cuota).
      {
        source: "/logos/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }],
      },
      {
        source: "/icon.svg",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }],
      },
    ];
  },
  webpack: (config) => {
    // pdfjs-dist necesita esto para no romper el build
    config.resolve.alias["canvas"] = false;
    return config;
  },
};
export default nextConfig;
