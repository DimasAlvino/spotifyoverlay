// Provider lirik. Mau tambah sumber lain (Musixmatch, dll)? Tambahkan fungsi baru ke PROVIDERS.
const UA = { 'User-Agent': 'spotify-overlay/1.0' };
const memo = new Map();

function parseLrc(lrc) {
  const out = [];
  for (const line of lrc.split('\n')) {
    const m = line.match(/^\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)$/);
    if (m) out.push({ t: Math.round((+m[1] * 60 + +m[2]) * 1000), text: m[3].trim() });
  }
  return out.sort((a, b) => a.t - b.t);
}

async function lrclib({ title, artist, album, duration }) {
  const get = new URLSearchParams({ track_name: title, artist_name: artist, album_name: album, duration });
  let r = await fetch('https://lrclib.net/api/get?' + get, { headers: UA });
  let j = r.ok ? await r.json() : null;
  if (!j?.syncedLyrics) {
    r = await fetch('https://lrclib.net/api/search?' + new URLSearchParams({ track_name: title, artist_name: artist }), { headers: UA });
    const list = r.ok ? await r.json() : [];
    j = list.find((x) => x.syncedLyrics && Math.abs(x.duration - duration) < 4) || list.find((x) => x.syncedLyrics) || j;
  }
  return j?.syncedLyrics ? parseLrc(j.syncedLyrics) : null;
}

const PROVIDERS = [lrclib];

export async function getLyrics(track) {
  const key = track.id || `${track.artist}-${track.title}`;
  if (memo.has(key)) return memo.get(key);
  let lines = null;
  for (const p of PROVIDERS) {
    try { lines = await p(track); } catch { /* coba provider berikutnya */ }
    if (lines?.length) break;
  }
  const result = { lines: lines || [] };
  memo.set(key, result);
  if (memo.size > 500) memo.delete(memo.keys().next().value);
  return result;
}
