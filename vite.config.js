import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import obfuscatorPlugin from 'vite-plugin-javascript-obfuscator'

const isMobile = process.env.BUILD_TARGET === 'mobile'
const isProd = process.env.NODE_ENV === 'production'

export default defineConfig(({ command }) => ({
  server: { port: 5174, strictPort: true },
  plugins: [
    react(),
    isProd && obfuscatorPlugin({
      options: {
        compact: true,
        controlFlowFlattening: false,
        // stringArray disabled (July 2026): base64-encoding every string
        // inflated the bundle ~2x and added per-call decode overhead at
        // runtime — identifier mangling + compact still obscure the logic.
        // If ever re-enabled, reservedStrings below is what keeps dynamic
        // imports (code splitting) alive — do not drop it.
        stringArray: false,
        renameGlobals: false,
        selfDefending: false,
        // CRITICAL: never obfuscate import specifiers. String-encoding them
        // blinds Rollup's dynamic-import analysis — no lazy chunks get
        // emitted and browsers hit bare `import("jspdf")` at runtime
        // ("failed to resolve module specifier"). Reserve bare package names
        // and relative paths so code-splitting keeps working.
        reservedStrings: [
          '^jspdf$', '^jspdf-autotable$', '^exceljs$', '^xlsx$', '^jszip$',
          '^@capacitor/', '^@capacitor-mlkit/', '^@basecom-gmbh/', '^capacitor-rate-app$',
          '^\\./', '^\\.\\./',
        ],
      },
    }),
    isMobile && {
      name: 'mobile-html-fix',
      transformIndexHtml(html) {
        // Remove crossorigin — WKWebView silently blocks stylesheets with this attribute
        return html.replace(/ crossorigin/g, '')
      },
    },
  ].filter(Boolean),
  // Dev: base '/' for convenience. Prod: '/app/' so the SPA lives at labhive.app/app.
  // Mobile always uses '/' (file:// serving in WKWebView).
  base: isMobile ? '/' : (command === 'serve' ? '/' : '/app/'),
  build: {
    outDir: isMobile ? 'dist' : 'docs/app',
    sourcemap: false,
  },
}))
