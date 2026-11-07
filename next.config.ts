import type { NextConfig } from 'next';
const config: NextConfig = {
  poweredByHeader: false, devIndicators: false,
  distDir: process.env.SLIDELATCH_DIST_DIR || '.next',
  // Shared NodeNext runtime sources keep .js import specifiers; resolve their TypeScript sources in the browser.
  webpack: (config) => {
    config.resolve.extensionAlias = { ...config.resolve.extensionAlias, '.js': ['.ts', '.tsx', '.js'] };
    return config;
  },
  ...(process.env.CLOUDFLARE_BUILD === '1' ? { output: 'export' } : {}),
};
export default config;
