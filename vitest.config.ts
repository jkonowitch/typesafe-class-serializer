import { defineConfig } from 'vitest/config';
import { vitePluginTypescriptTranspile } from 'vite-plugin-typescript-transpile';

export default defineConfig({
  plugins: [vitePluginTypescriptTranspile({})]
});
