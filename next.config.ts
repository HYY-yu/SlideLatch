import type { NextConfig } from 'next';
const config: NextConfig = {
  poweredByHeader: false, devIndicators: false,
  ...(process.env.CLOUDFLARE_BUILD === '1' ? { output: 'export' } : {}),
};
export default config;
