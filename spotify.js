import { open } from './vault.js';

const sessions = new Map(); // token overlay -> { access, expires, cache, inflight }

async function tokenRequest(cid, secret, params) {
  const r = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${cid}:${secret}`).toString('base64'),
    },
    body: new URLSearchParams(params),
  });
  if (!r.ok) throw new Error('Spotify: ' + (await r.text()));
  return r.json();
}

export const authorizeUrl = (cid, redirect, state) =>
  'https://accounts.spotify.com/authorize?' +
  new URLSearchParams({
    client_id: cid,
    response_type: 'code',
    redirect_uri: redirect,
    scope: 'user-read-currently-playing user-read-playback-state',
    state,
  });

export async function exchange(cid, secret, code, redirect) {
  const d = await tokenRequest(cid, secret, { grant_type: 'authorization_code', code, redirect_uri: redirect });
  return d.refresh_token;
}

async function fetchNow(s, creds) {
  if (!s.access || Date.now() > s.expires - 30000) {
    const d = await tokenRequest(creds.cid, creds.secret, { grant_type: 'refresh_token', refresh_token: s.refresh });
    s.access = d.access_token;
    s.expires = Date.now() + d.expires_in * 1000;
    if (d.refresh_token) s.refresh = d.refresh_token;
  }
  const r = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
    headers: { Authorization: 'Bearer ' + s.access },
  });
  if (r.status === 429) {
    s.cache.at = Date.now() + (Number(r.headers.get('retry-after')) || 5) * 1000;
    return;
  }
  let data = { idle: true };
  if (r.status === 200) {
    const j = await r.json();
    if (j.item && j.currently_playing_type === 'track') {
      data = {
        id: j.item.id,
        title: j.item.name,
        artist: j.item.artists.map((a) => a.name).join(', '),
        album: j.item.album.name,
        cover: j.item.album.images?.[1]?.url || j.item.album.images?.[0]?.url,
        durationMs: j.item.duration_ms,
        progressMs: j.progress_ms,
        isPlaying: j.is_playing,
      };
    }
  }
  s.cache = { at: Date.now(), data };
}

// Tiap pengguna punya cache sendiri. Banyak overlay dengan token sama hanya memicu satu request ke Spotify.
export async function nowPlaying(token) {
  const creds = open(token);
  if (!creds || creds.k !== 'overlay') return { error: 'invalid_token' };

  let s = sessions.get(token);
  if (!s) {
    if (sessions.size > 2000) sessions.delete(sessions.keys().next().value);
    s = { refresh: creds.refresh, cache: { at: 0, data: { idle: true } } };
    sessions.set(token, s);
  }
  try {
    if (Date.now() >= s.cache.at + 1500) {
      s.inflight ||= fetchNow(s, creds).finally(() => { s.inflight = null; });
      await s.inflight;
    }
  } catch (e) {
    return { error: 'auth_failed', message: e.message };
  }
  return { ...s.cache.data, ageMs: Math.max(0, Date.now() - s.cache.at) };
}
