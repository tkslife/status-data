import { build, transform } from "esbuild";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
import { cp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { basename, resolve, dirname } from "node:path";
import { createHash } from "node:crypto";

// Publish only the explicit site assets, not other repository files.
const root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
const output = resolve(root, "dist");
if (dirname(output) !== resolve(root)) throw new Error("Output must stay inside this repository");
await rm(output, { recursive: true, force: true });
await mkdir("dist/assets", { recursive: true });
const bundle = await build({
  entryPoints: ["site/main.tsx"],
  bundle: true,
  minify: true,
  outdir: "dist/assets",
  entryNames: "[name]-[hash]",
  metafile: true,
  define: { "process.env.NODE_ENV": '"production"' },
  target: ["es2020"],
});
const result = await postcss([tailwindcss({
  content: ["./site/**/*.tsx"],
  theme: { extend: {
    colors: {
      background: "hsl(var(--background))",
      foreground: "hsl(var(--foreground))",
      muted: "hsl(var(--muted))",
      border: "hsl(var(--border))",
    },
    borderRadius: {
      lg: "var(--radius)",
      md: "calc(var(--radius) - 2px)",
      sm: "calc(var(--radius) - 4px)",
    },
  } },
})]).process(await readFile("site/style.css", "utf8"), { from: "site/style.css" });
const entry = Object.entries(bundle.metafile.outputs).find(([, value]) => value.entryPoint === "site/main.tsx");
if (!entry || !entry[1].cssBundle) throw new Error("Missing page assets");
const css = await transform(result.css + await readFile(entry[1].cssBundle, "utf8"), { loader: "css", minify: true });
const stylesheet = `site-${createHash("sha256").update(css.code).digest("hex").slice(0, 12)}.css`;
await writeFile(`dist/assets/${stylesheet}`, css.code);
await rm(entry[1].cssBundle);
await cp("site/assets", "dist/assets", { recursive: true });
await cp("node_modules/geist/dist/fonts/geist-sans/Geist-Variable.woff2", "dist/assets/Geist-Variable.woff2");
const html = (await readFile("site/index.html", "utf8"))
  .replace("/assets/site.css", `/assets/${stylesheet}`)
  .replace("/assets/main.js", `/assets/${basename(entry[0])}`);
await writeFile("dist/index.html", html);
await cp("node_modules/geist/LICENSE.TXT", "dist/assets/Geist-LICENSE.txt");
await cp("status.json", "dist/status.json");
await writeFile("dist/robots.txt", "User-agent: *\nDisallow: /\n");
