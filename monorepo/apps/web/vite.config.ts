import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  resolve: {
  },
  plugins: [react(), {
    name: 'ignore-install-hook-map',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url && req.url.includes('installHook.js.map')) {
          res.statusCode = 404;
          res.end(); // 这样浏览器拿到的是 404，而不是 HTML，就不会报解析错误了
          return;
        }
        next();
      });
    },
  },],
  server: {
    https: {
      key: "../../certs/dev.key",
      cert: "../../certs/dev.pem",
    },
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
});


