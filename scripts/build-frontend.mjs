import fs from 'node:fs/promises';
import path from 'node:path';
import { build as esbuild } from 'esbuild';
import postcss from 'postcss';
import tailwindcss from '@tailwindcss/postcss';

const root = process.cwd();
const out = path.join(root, 'dist');
const assetDir = path.join(out, 'assets');
await fs.rm(out, { recursive: true, force: true });
await fs.mkdir(assetDir, { recursive: true });
await fs.cp(path.join(root, 'public'), out, { recursive: true });

const originalCss = await fs.readFile(path.join(root, 'src/index.css'), 'utf8');
const css = await postcss([tailwindcss()]).process(originalCss, {
  from: path.join(root, 'src/index.css'),
  to: path.join(assetDir, 'styles.css'),
  map: false,
});
await fs.writeFile(path.join(assetDir, 'styles.css'), css.css);

// CSS is compiled by PostCSS above: esbuild must not interpret Tailwind @import.
await esbuild({
  absWorkingDir: root,
  entryPoints: ['src/main.tsx'],
  outfile: 'dist/assets/main.js',
  bundle: true,
  splitting: false,
  format: 'esm',
  platform: 'browser',
  target: ['es2022'],
  jsx: 'automatic',
  loader: { '.css': 'empty', '.svg': 'file', '.png': 'file', '.jpg': 'file', '.woff2': 'file' },
  assetNames: '[name]-[hash]',
  define: {
    'import.meta.env.DEV': 'false',
    'import.meta.env.PROD': 'true',
    'import.meta.env.MODE': JSON.stringify('production'),
    'import.meta.env.VITE_QA_MODE': JSON.stringify(process.env.VITE_QA_MODE ?? ''),
  },
  minify: process.env.NODE_ENV === 'production',
  logLevel: 'info',
});
const html = await fs.readFile(path.join(root, 'index.html'), 'utf8');
if (!html.includes('/src/main.tsx')) throw new Error('Unexpected HTML entrypoint; abort build.');
await fs.writeFile(path.join(out, 'index.html'), html.replace(
  '<script type="module" src="/src/main.tsx"></script>',
  '<link rel="stylesheet" href="/assets/styles.css" />\n    <script type="module" src="/assets/main.js"></script>',
));
console.log('Vite-free build complete. QA-only mode:', process.env.VITE_QA_MODE === 'true');
