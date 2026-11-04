import { build } from "esbuild";
await build({
  entryPoints: ["src/desktop/main.ts"],
  outfile: "dist/desktop/main.cjs",
  bundle: true,
  define: { "import.meta.url": "undefined" },
  platform: "node",
  format: "cjs",
  packages: "external",
  sourcemap: true,
});
await build({
  entryPoints: ["src/desktop/preload.ts"],
  outfile: "dist/desktop/preload.cjs",
  bundle: true,
  define: { "import.meta.url": "undefined" },
  platform: "node",
  format: "cjs",
  packages: "external",
});
await build({
  entryPoints: ["src/server/cli.ts"],
  outfile: "dist/cli.cjs",
  bundle: true,
  define: { "import.meta.url": "undefined" },
  platform: "node",
  format: "cjs",
  packages: "external",
});
await build({
  entryPoints: ["src/server/serve.ts"],
  outfile: "dist/server.cjs",
  bundle: true,
  define: { "import.meta.url": "undefined" },
  platform: "node",
  format: "cjs",
  packages: "external",
});
