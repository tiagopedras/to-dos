import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import fs from 'node:fs'

/* The board is 28 classic <script src> tags in source order, and that ordering
 * is load-bearing: index.html says so, and so does core/CLAUDE.md. A module
 * would be deferred past every one of them, so the bundle this config writes is
 * an IIFE that hangs one global, `BoardUI`, and is loaded with an ordinary
 * <script src> like everything else. Nothing about the existing page changes.
 *
 * Output goes to kanban/dist/, which the server already serves as a static path
 * under the repo root — so there is no route to add and no server restart in
 * the loop while this is being worked on.
 */
/* Tenon's built CSS, out of node_modules and into the same folder the bundle
 * goes to. The page links it from there, which means one route rather than two:
 * server.py serves kanban/dist/ already, and so does the Vercel deployment,
 * where node_modules does not exist and a server route could not have reached
 * it. It is a build output like board-ui.js beside it, not a copy kept in the
 * repo — the package is still the only place the file comes from, and the
 * version is stamped into its first line. */
function tenonCss() {
  const dir = path.resolve(__dirname, 'node_modules/@tiagopedras/tenon/dist')
  /* tenon.css is the tokens, tenon-react.css is the components. Both are
   * page-level stylesheets rather than something the bundle carries, because
   * half the board is still HTML strings from kanban/js/09-columns.js and
   * that half draws .tenon-card and .tenon-column too. A lib build would put
   * the component CSS inside board-ui.js where the string half cannot reach
   * it, which is the whole reason these are copied out instead. */
  const files = ['tenon.css', 'tenon-react.css']
  return {
    name: 'tenon-css',
    closeBundle() {
      for (const f of files) {
        const from = path.join(dir, f)
        if (!fs.existsSync(from)) {
          console.warn(`@tiagopedras/tenon is not installed, so the board will have no ${f === 'tenon.css' ? 'colours' : 'cards'}. Run npm install.`)
          continue
        }
        fs.copyFileSync(from, path.resolve(__dirname, 'kanban/dist', f))
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), tenonCss()],
  /* Not optional, and not something the app-style build would have needed.
     Vite substitutes process.env.NODE_ENV for an application build but leaves
     it alone in lib mode, so without this the bundle carries React's
     *development* build and ten live references to `process` — which does not
     exist in a browser, so the board would throw on load rather than degrade.
     Checked by kanban/ui/test_primitives.mjs, which greps the built file. */
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    outDir: path.resolve(__dirname, 'kanban/dist'),
    emptyOutDir: true,
    /* A predictable filename rather than a hashed one. The page references it
       by a literal src, and a hash would mean index.html changing on every
       build — which is exactly the kind of churn that makes a diff unreadable.
       Cache-busting is the board's own '?t=' + Date.now() convention. */
    lib: {
      entry: path.resolve(__dirname, 'kanban/ui/index.ts'),
      name: 'BoardUI',
      formats: ['iife'],
      fileName: () => 'board-ui.js',
    },
    /* React is bundled in rather than left external. The alternative is two
       more <script> tags in a fixed order before this one, which is one more
       ordering rule for a page that already depends on 28 of them. */
    sourcemap: true,
  },
})
