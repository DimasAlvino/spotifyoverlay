// Enkripsi AES-256-GCM: kredensial pengguna dikemas ke dalam token di URL overlay,
// jadi server tidak perlu database dan tidak menyimpan apa pun.
import crypto from 'crypto';
import fs from 'fs';
import { fileURLToPath } from 'url';

function loadSecret() {
  if (process.env.APP_SECRET) return process.env.APP_SECRET;
  if (process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT)
    throw new Error('APP_SECRET belum diisi di Environment variables hosting.');
  const file = fileURLToPath(new URL('./.app-secret', import.meta.url));
  try { return fs.readFileSync(file, 'utf8'); } catch {}
  const s = crypto.randomBytes(32).toString('hex');
  try { fs.writeFileSync(file, s); }
  catch { console.warn('APP_SECRET belum diset: link overlay akan tidak berlaku setelah server restart.'); }
  return s;
}

let key;
const getKey = () => (key ||= crypto.createHash('sha256').update(loadSecret()).digest());

export function seal(obj) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64url');
}

export function open(token) {
  const key = getKey();
  try {
    const b = Buffer.from(String(token), 'base64url');
    const d = crypto.createDecipheriv('aes-256-gcm', key, b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8'));
  } catch { return null; }
}
