// Browser component harness: real renderer, inspector, runtime and Tailwind;
// database, Next routing and HA responses are isolated from these regressions.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

const app = await build({
  entryPoints: ["tests/custom-modules/fixture.tsx"], bundle: true, write: false,
  define: { "process.env.NODE_ENV": '"development"' },
  plugins: [{
    name: "next-pathname",
    setup(builder) {
      builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "navigation", namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
        contents: 'export const usePathname = () => "/editor/views/test-view";',
      }));
    },
  }],
});
const example = await build({
  stdin: {
    contents: 'import render from "./examples/modules/hello/hello-widget.js"; window.MagicFrame.registerWidget({type:"custom:hello",render});',
    resolveDir: process.cwd(),
  }, bundle: true, write: false,
});
const css = await postcss([tailwind()]).process(await readFile("src/app/globals.css", "utf8"), { from: "src/app/globals.css" });
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  if (url.pathname === "/app.js") {
    res.setHeader("Content-Type", "application/javascript");
    res.end(app.outputFiles[0].text);
  } else if (url.pathname === "/style.css") {
    res.setHeader("Content-Type", "text/css");
    res.end(css.css);
  } else if (url.pathname === "/api/modules/custom%3Ahello/bundle.js") {
    res.setHeader("Content-Type", "application/javascript");
    res.end(example.outputFiles[0].text);
  } else if (url.pathname === "/api/modules") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ modules: [{ type: "custom:hello", label: "Hello", iconEmoji: "👋", fields: [{ key: "name", label: "Name", type: "text" }] }] }));
  } else if (url.pathname === "/api/view-clients") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ displays: [{ clientId: "display", width: 1920, height: 1080, dpr: 1 }] }));
  } else if (url.pathname.startsWith("/api/")) {
    res.writeHead(404);
    res.end();
  } else {
    res.setHeader("Content-Type", "text/html");
    res.end('<!doctype html><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/app.js"></script>');
  }
});
server.listen(3177, "127.0.0.1");
