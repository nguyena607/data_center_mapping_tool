import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? 'data_center_mapping_tool'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  base: command === 'build' ? `/${repoName}/` : '/',
  plugins: [svelte()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
}))
