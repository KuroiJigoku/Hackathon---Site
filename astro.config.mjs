import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

// Use the Node adapter so server-rendered API routes work in production
// `mode` is required by the adapter; 'standalone' is suitable for most Node hosts.
export default defineConfig({
  site: 'http://localhost:3000',
  output: 'server',
  adapter: node({ mode: 'standalone' }),
});
