import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { developmentSourceQualityMiddleware } from '../server/developmentSourceQuality.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = express();
app.disable('x-powered-by');
// Preserve the existing opt-in development-only agent relay used by fictional tests.
// The relay independently enforces access, safe JSON and strict feature flags.
if (process.env.SOURCE_QUALITY_DEV_ENABLED === 'true' || process.env.COUNCIL_DEV_ENABLED === 'true') {
  app.use(developmentSourceQualityMiddleware());
}
app.use(express.static(path.join(root, 'dist'), { index: false }));
app.get('*', (_req, res) => res.sendFile(path.join(root, 'dist/index.html')));
const port = Number(process.env.PORT || 3000);
app.listen(port, '127.0.0.1', () => console.log('Local static preview on 127.0.0.1:' + port));
