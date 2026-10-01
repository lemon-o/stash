import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import viteCompression from "vite-plugin-compression";

const sourcemap = process.env.VITE_APP_SOURCEMAPS === "true";

// https://vitejs.dev/config/
export default defineConfig(() => {
  const plugins = [
    react({
      babel: {
        compact: true,
      },
    }),
    tsconfigPaths(),
    viteCompression({
      algorithm: "gzip",
      deleteOriginFile: true,
      threshold: 0,
      filter: /\.(js|json|css|svg|md)$/i,
    }),
  ];

  return {
    base: "",
    build: {
      outDir: "build",
      sourcemap: sourcemap,
      reportCompressedSize: false,
    },
    optimizeDeps: {
      entries: "src/index.tsx",
    },
    server: {
      host: true,
      port: 3000,
      cors: false,
      proxy: {
        "^/(graphql|api|login|logout|customlocales|css|javascript|image|scene|performer|studio|gallery|tag|group|blobs)": {
          target: "http://localhost:9999",
          changeOrigin: true,
          secure: false,
          ws: true,
        },
      },
    },
    publicDir: "public",
    assetsInclude: ["**/*.md"],
    plugins,
  };
});
