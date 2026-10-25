import { seal, open } from './vault.js';
import { authorizeUrl, exchange, nowPlaying } from './spotify.js';
import { getLyrics } from './lyrics.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const json = (obj, status = 200, cache = 'no-store') =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': cache } });
const page = (html, status = 200) =>
  new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });

export async function handle(req) {
  try {
    const url = new URL(req.url);
    const p = url.pathname;
    const q = url.searchParams;
    const origin = process.env.PUBLIC_URL ? process.env.PUBLIC_URL.replace(/\/$/, '') : url.origin;
    const redirect = origin + '/callback';

    // 1) Dashboard kirim Client ID/Secret -> dibungkus ke "state" terenkripsi -> arahkan ke Spotify
    if (p === '/api/connect' && req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      const cid = String(body.clientId || '').trim();
      const secret = String(body.clientSecret || '').trim();
      if (!/^[a-zA-Z0-9]{16,64}$/.test(cid) || !/^[a-zA-Z0-9]{16,64}$/.test(secret))
        return json({ error: 'Client ID atau Client Secret tidak valid.' }, 400);
      const state = seal({ k: 'state', cid, secret, exp: Date.now() + 10 * 60 * 1000 });
      return json({ url: authorizeUrl(cid, redirect, state) });
    }

    // 2) Spotify kembali membawa code -> tukar jadi refresh token -> token overlay
    if (p === '/callback') {
      const st = open(q.get('state'));
      if (q.get('error') || !st || st.k !== 'state' || st.exp < Date.now())
        return page('Login dibatalkan atau kedaluwarsa. <a href="/">Coba lagi</a>', 400);
      try {
        const refresh = await exchange(st.cid, st.secret, q.get('code'), redirect);
        const token = seal({ k: 'overlay', cid: st.cid, secret: st.secret, refresh });
        return new Response(null, { status: 302, headers: { Location: '/#t=' + token } });
      } catch (e) {
        return page(`Gagal: ${esc(e.message)}<br>Redirect URI yang dipakai: ${esc(redirect)}<br><a href="/">Kembali</a>`, 500);
      }
    }

    if (p === '/api/now-playing') return json(await nowPlaying(q.get('t') || ''));

    if (p === '/api/lyrics') {
      const title = q.get('title'), artist = q.get('artist');
      if (!title || !artist) return json({ lines: [] }, 400);
      const res = await getLyrics({
        id: q.get('id'), title, artist, album: q.get('album') || '',
        duration: Math.round(Number(q.get('duration') || 0) / 1000),
      });
      return json(res, 200, res.lines.length ? 'public, max-age=86400' : 'public, max-age=3600');
    }

    if (p === '/api/cover') {
      const u = new URL(q.get('url'));
      if (!u.hostname.endsWith('.scdn.co')) return new Response(null, { status: 400 });
      const r = await fetch(u);
      return new Response(await r.arrayBuffer(), {
        headers: { 'Content-Type': r.headers.get('content-type') || 'image/jpeg', 'Cache-Control': 'public, max-age=86400' },
      });
    }

    return json({ error: 'not_found' }, 404);
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
