import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import remarkGfm from 'remark-gfm';
import remarkGithubAlerts from 'remark-github-alerts';
import { remarkMermaid } from './src/utils/remark-mermaid.mjs';

// https://astro.build/config
export default defineConfig({
  site: 'https://hmarui66.github.io',
  integrations: [mdx()],
  markdown: {
    remarkPlugins: [remarkGfm, remarkGithubAlerts, remarkMermaid],
    shikiConfig: {
      theme: 'github-dark',
      wrap: true
    }
  }
});
