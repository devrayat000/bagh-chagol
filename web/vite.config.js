import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const kaplayCongrats = () => {
  return {
    name: "vite-plugin-kaplay-hello",
    buildEnd() {
      const line = "---------------------------------------------------------";
      const msg = `🦖 Awesome pal! Send your game to us:\n\n💎 Discord: https://discord.com/invite/aQ6RuQm3TF \n💖 Donate to KAPLAY: https://opencollective.com/kaplay\n\ (you can disable this msg on vite.config)`;

      process.stdout.write(`\n${line}\n${msg}\n${line}\n`);
    },
  };
};

// Where the game is published, e.g. SITE_URL=https://you.github.io/bagh-chagol/ bun run build
// Social networks only accept absolute image URLs, and canonical links, robots.txt and
// sitemap.xml need it too. Without it the build still works, with relative URLs.
const SITE_URL = process.env.SITE_URL
  ? process.env.SITE_URL.replace(/\/?$/, "/")
  : "";

// The site's pages: each game has its own address, title and share image (see src/site.ts).
const PAGES = { main: "index.html", bagh: "bagh-chagol/index.html", fourrow: "four-in-a-row/index.html" };
const pagePath = (file) => file.replace(/index\.html$/, ""); // "four-in-a-row/index.html" -> "four-in-a-row/"

const seo = () => ({
  name: "bagh-seo",
  transformIndexHtml(html, ctx) {
    const path = pagePath(ctx.path.replace(/^\//, ""));
    const depth = path.split("/").length - 1;
    // Without SITE_URL, fall back to relative URLs from this page to the site root.
    html = html.replaceAll("%SITE%", SITE_URL || "../".repeat(depth) || "./");
    if (!SITE_URL) return html;
    const url = SITE_URL + path;
    const tags = `<link rel="canonical" href="${url}" />\n    <meta property="og:url" content="${url}" />\n`;
    return html.replace("</head>", `    ${tags}  </head>`);
  },
  generateBundle() {
    const robots =
      "User-agent: *\nAllow: /\n" +
      (SITE_URL ? `\nSitemap: ${SITE_URL}sitemap.xml\n` : "");
    this.emitFile({ type: "asset", fileName: "robots.txt", source: robots });
    if (SITE_URL) {
      const today = new Date().toISOString().slice(0, 10);
      const urls = Object.values(PAGES)
        .map((file) => `  <url><loc>${SITE_URL}${pagePath(file)}</loc><lastmod>${today}</lastmod></url>`)
        .join("\n");
      const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
      this.emitFile({
        type: "asset",
        fileName: "sitemap.xml",
        source: sitemap,
      });
    } else {
      this.warn(
        "SITE_URL is not set: social previews need an absolute image URL. Build with SITE_URL=https://.../",
      );
    }
  },
});

export default defineConfig({
  // index.html out file will start with a relative path for script
  base: "./",
  server: {
    port: 3001,
  },
  build: {
    // disable this for low bundle sizes
    sourcemap: true,
    rollupOptions: {
      input: Object.fromEntries(Object.entries(PAGES).map(([name, file]) => [name, fileURLToPath(new URL(file, import.meta.url))])),
      output: {
        // Vite 8 (Rolldown) only accepts the function form
        manualChunks: (id) =>
          id.includes("node_modules/kaplay") ||
          id.includes("node_modules/@kaplayjs")
            ? "kaplay"
            : undefined,
      },
    },
  },
  // keep onnxruntime-web's .wasm next to the code that loads it
  optimizeDeps: { exclude: ["onnxruntime-web"] },
  plugins: [
    seo(),
    // Disable messages removing this line
    kaplayCongrats(),
  ],
});
