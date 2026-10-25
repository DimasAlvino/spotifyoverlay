import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { handle } from './core.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
app.set('trust proxy', 1);
app.use(express.json({ limit: '4kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.all(['/api/*', '/callback'], async (req, res) => {
  const hasBody = !['GET', 'HEAD'].includes(req.method);
  const r = await handle(new Request(`${req.protocol}://${req.get('host')}${req.originalUrl}`, {
    method: req.method,
    headers: { 'content-type': 'application/json' },
    body: hasBody ? JSON.stringify(req.body ?? {}) : undefined,
  }));
  res.status(r.status);
  r.headers.forEach((v, k) => res.setHeader(k, v));
  res.send(Buffer.from(await r.arrayBuffer()));
});

app.listen(PORT, () => console.log(`Dashboard: http://127.0.0.1:${PORT}`));
