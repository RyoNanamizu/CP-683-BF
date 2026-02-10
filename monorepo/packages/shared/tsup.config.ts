import { defineConfig } from "tsup";
import pkg from "./package.json";

const deps = [
    ...Object.keys(pkg.dependencies ?? {}),
];

export default defineConfig({
    entry: ["src/index.ts"],
    format: ["esm"],
    outDir: "dist",
    platform: "node",
    target: "node20",
    sourcemap: true,
    clean: true,

    external: deps
});
