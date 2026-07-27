import { access, copyFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { rolldown } from "rolldown";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const hostingSource = resolve(root, ".openai", "hosting.json");
const hostingTarget = resolve(root, "dist", ".openai", "hosting.json");
const workerTarget = resolve(root, "dist", "server", "index.js");
const handlerTarget = resolve(root, "dist", "server", "vinext-rsc-handler.js");
const ssrTarget = resolve(root, "dist", "server", "ssr", "index.js");
const bundledSsrTarget = resolve(root, "dist", "server", "ssr", "index.bundled.js");

await access(workerTarget);
await access(ssrTarget);

const originalSsrCode = await readFile(ssrTarget, "utf8");
const reactDomRequirePattern = /[A-Za-z_$][\w$]*\(`react-dom`\)/g;
if (!reactDomRequirePattern.test(originalSsrCode)) {
  throw new Error("Expected React DOM runtime require was not found in vinext SSR output.");
}
await writeFile(
  ssrTarget,
  [
    'import * as __sitesReactDom from "react-dom";',
    originalSsrCode.replace(reactDomRequirePattern, "__sitesReactDom"),
  ].join("\n"),
  "utf8",
);

const ssrBundle = await rolldown({
  input: ssrTarget,
  platform: "neutral",
  transform: {
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
    },
  },
  external: (id) => id.startsWith("node:") || id === "cloudflare:workers",
  resolve: {
    mainFields: ["module", "main"],
    conditionNames: ["worker", "browser", "module", "import", "default"],
  },
});
await ssrBundle.write({
  file: bundledSsrTarget,
  format: "esm",
  codeSplitting: false,
  minify: true,
});
await ssrBundle.close();
const bundledSsrCode = await readFile(bundledSsrTarget, "utf8");
await writeFile(
  bundledSsrTarget,
  bundledSsrCode.replaceAll(
    "import.meta.url",
    '"/worker/dist/server/ssr/index.js"',
  ),
  "utf8",
);
await rm(ssrTarget);
await rename(bundledSsrTarget, ssrTarget);

await rm(handlerTarget, { force: true });
await rename(workerTarget, handlerTarget);
await writeFile(
  workerTarget,
  [
    'import handler from "./vinext-rsc-handler.js";',
    'export * from "./vinext-rsc-handler.js";',
    "export default {",
    "  fetch(request, _env, context) {",
    "    return handler(request, context);",
    "  },",
    "};",
    "",
  ].join("\n"),
  "utf8",
);
await mkdir(dirname(hostingTarget), { recursive: true });
await copyFile(hostingSource, hostingTarget);

console.log("Bundled Worker runtime, prepared Sites entrypoint, and copied hosting metadata.");
