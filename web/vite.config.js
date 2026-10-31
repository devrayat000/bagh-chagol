import { defineConfig } from "vite";

const kaplayCongrats = () => {
    return {
        name: "vite-plugin-kaplay-hello",
        buildEnd() {
            const line =
                "---------------------------------------------------------";
            const msg = `🦖 Awesome pal! Send your game to us:\n\n💎 Discord: https://discord.com/invite/aQ6RuQm3TF \n💖 Donate to KAPLAY: https://opencollective.com/kaplay\n\ (you can disable this msg on vite.config)`;

            process.stdout.write(`\n${line}\n${msg}\n${line}\n`);
        },
    };
};

// Where the game is published, e.g. SITE_URL=https://you.github.io/bagh-chagol/ bun run build
// Social networks only accept absolute image URLs, and canonical links, robots.txt and
// sitemap.xml need it too. Without it the build still works, with relative URLs.
const SITE_URL = process.env.SITE_URL ? process.env.SITE_URL.replace(/\/?$/, "/") : "";

const seo = () => ({
    name: "bagh-seo",
    transformIndexHtml(html) {
        html = html.replaceAll("%SITE%", SITE_URL || "./");
        if (!SITE_URL) return html;
        const tags = `<link rel="canonical" href="${SITE_URL}" />\n    <meta property="og:url" content="${SITE_URL}" />\n`;
        return html.replace("</head>", `    ${tags}  </head>`);
    },
    generateBundle() {
        const robots = "User-agent: *\nAllow: /\n" + (SITE_URL ? `\nSitemap: ${SITE_URL}sitemap.xml\n` : "");
        this.emitFile({ type: "asset", fileName: "robots.txt", source: robots });
        if (SITE_URL) {
            const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${SITE_URL}</loc><lastmod>${new Date().toISOString().slice(0, 10)}</lastmod></url>\n</urlset>\n`;
            this.emitFile({ type: "asset", fileName: "sitemap.xml", source: sitemap });
        } else {
            this.warn("SITE_URL is not set: social previews need an absolute image URL. Build with SITE_URL=https://.../");
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
            output: {
                // Vite 8 (Rolldown) only accepts the function form
                manualChunks: (id) => (id.includes("node_modules/kaplay") ? "kaplay" : undefined),
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