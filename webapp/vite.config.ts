import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:9000',
          changeOrigin: true,
        },
        '/vm': {
          target: 'http://127.0.0.1:9000',
          changeOrigin: true,
        },
        '/ws': {
          target: 'ws://127.0.0.1:9000',
          ws: true,
          configure: (proxy, _options) => {
            proxy.on('error', (err: any, _req, _res) => {
              if (err.code !== 'ECONNRESET' && err.code !== 'EPIPE') {
                console.error('[vite proxy]', err);
              }
            });
            proxy.on('proxyReqWs', (proxyReq, req, socket) => {
              socket.on('error', (err: any) => {
                if (err.code === 'EPIPE' || err.code === 'ECONNRESET') {
                  socket.destroy(); // Properly handle without crashing
                }
              });
            });
          },
        },
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
