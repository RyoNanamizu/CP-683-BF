import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const _filename = fileURLToPath(import.meta.url);
const _dirname = path.dirname(_filename);

// https://vite.dev/config/
export default defineConfig({
  resolve: {
  },
  plugins: [react(), {
    name: 'ignore-install-hook-map',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url && req.url.includes('installHook.js.map')) {
          res.statusCode = 404; // the browser will recieve 404 instead of a HTML, which will prevent it report a parsing error
          res.end(); 
          return;
        }
        next();
      });
    },
  },],
  server: {
    https: {
      key: fs.readFileSync(path.resolve(_dirname,"../../certs/dev.key")),
      cert: fs.readFileSync(path.resolve(_dirname,"../../certs/dev.pem")),
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

