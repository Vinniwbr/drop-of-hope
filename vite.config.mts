import { defineConfig } from 'vite';
import { createHtmlPlugin } from 'vite-plugin-html';

export default defineConfig({
  base: './',
  build: {
    assetsInlineLimit: 0,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'phaser',
              test: /node_modules\/(phaser|phaser-jsx)\//,
            },
            {
              name: 'firebase',
              test: /node_modules\/(@firebase|firebase)\//,
            },
          ],
        },
      },
    },
  },
  plugins: [createHtmlPlugin()],
});
