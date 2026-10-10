import { defineConfig } from 'vite'

/* Build config for the lazily-loaded racing game.
 *
 * This bundle is NOT referenced by any <script> tag on the site. The page is
 * 12k lines of vanilla JS served as static files by a Cloudflare Worker, and a
 * student who never opens the racing game must not download three.js, cannon,
 * or any asset. racing/index.js import()s the entry below, and only after the
 * racingV2 flag is on AND the game is actually opened.
 *
 * Two consequences shape everything here:
 *
 *   1. The entry filename must be STABLE, not content-hashed. A vanilla
 *      caller cannot read Vite's manifest.json to discover a hashed name
 *      without first downloading the manifest — which would defeat the point.
 *      So the entry is pinned to racing-v2.js and only the downstream chunks
 *      are hashed. Those are discovered by the browser from the entry's own
 *      import statements, so they can be hashed freely and cached hard.
 *
 *   2. The entry must not mount anything on import. It exports mount()/unmount()
 *      and the loader decides when React boots, so a prefetch or a speculative
 *      import can never take over the page.
 */
export default defineConfig({
  // Served from /racing-v2/ because wrangler.toml's build step copies
  // racing-v2/dist to public/racing-v2. Asset URLs inside the bundle resolve
  // against this, so getting it wrong breaks chunk loading at runtime only.
  base: '/racing-v2/',

  esbuild: {
    // The site is ad-supported and student-facing; keep stack traces readable
    // in production error reports without shipping full sourcemaps.
    legalComments: 'none',
  },

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    sourcemap: false,

    // 0 = never inline an asset as a base64 data URI. Inlining would smuggle
    // bytes into a JS chunk where the compliance gate cannot see them as
    // assets, and this project must be able to prove no third-party geometry
    // or audio reached the build. Keep every asset a discrete, auditable file.
    assetsInlineLimit: 0,

    rollupOptions: {
      input: 'src/main.tsx',

      // REQUIRED, and the reason is not obvious. Without this, Vite builds
      // this entry in "app" mode: it assumes the entry is a side-effect
      // script whose exports nobody reads, so Rollup tree-shakes mount() and
      // unmount() away -- and with them App, R3F, cannon and three. The build
      // still exits 0 and emits a 36-byte entry with no export statement, so
      // the failure only shows up at runtime as "exports no mount()".
      // 'strict' tells Rollup the entry's exported signature is load-bearing.
      preserveEntrySignatures: 'strict',

      output: {
        format: 'es',
        entryFileNames: 'racing-v2.js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',

        // Split the heavy, rarely-changing renderer and physics away from game
        // code. Game code churns; three.js at a pinned 0.139 does not, so a
        // returning student re-downloads only the small chunk.
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three'
          if (id.includes('node_modules/@react-three') || id.includes('node_modules/cannon')) return 'physics'
          if (id.includes('node_modules/react')) return 'react'
          return undefined
        },
      },
    },
  },
})
