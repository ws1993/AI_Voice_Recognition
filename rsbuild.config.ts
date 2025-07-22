import { defineConfig } from '@rsbuild/core';
import { pluginVue } from '@rsbuild/plugin-vue';

export default defineConfig({
  plugins: [pluginVue()],
  server: {
    port: 3000,
    host: '0.0.0.0', // 兼容移动端，允许局域网访问
  },
  output: {
    distPath: {
      root: 'dist',
    },
  },
});
