import { fileURLToPath } from 'node:url';

export default {
  poweredByHeader: false,
  async redirects() {
    // Keep older sandbox return links working; Next.js forwards their query parameters.
    return [
      { source: '/success', destination: '/status', permanent: false },
      { source: '/failure', destination: '/status', permanent: false },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          // no-referrer makes native form POSTs send Origin: null, breaking CSRF checks.
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
        ],
      },
    ];
  },
  turbopack: {
    root: fileURLToPath(new URL('../..', import.meta.url)),
  },
};
