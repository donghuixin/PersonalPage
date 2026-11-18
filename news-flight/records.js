// News Flight · talking to the records board (Supabase REST, no SDK needed).
import { SUPABASE_URL, SUPABASE_KEY } from './records-config.js';

const BASE = (SUPABASE_URL || '').replace(/\/+$/, '');
export const recordsEnabled = !!(BASE && SUPABASE_KEY);

function headers(extra) {
  const h = { apikey: SUPABASE_KEY, 'Content-Type': 'application/json', ...extra };
  if (SUPABASE_KEY.startsWith('eyJ')) h.Authorization = `Bearer ${SUPABASE_KEY}`;   // legacy anon JWT
  return h;
}

async function request(path, opts = {}) {
  if (!recordsEnabled) throw new Error('not-configured');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 9000);
  try {
    const res = await fetch(`${BASE}${path}`, { ...opts, headers: headers(opts.headers), signal: ctl.signal });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const err = new Error((body && (body.message || body.error)) || `HTTP ${res.status}`);
      err.server = true;
      throw err;
    }
    return { body, res };
  } finally { clearTimeout(timer); }
}

const rpc = (name, args = {}) => request(`/rest/v1/rpc/${name}`, { method: 'POST', body: JSON.stringify(args) }).then((r) => r.body);

export const records = {
  start: () => rpc('nf_start'),                                  // -> run id (uuid)
  complete: (run) => rpc('nf_complete', { run }),                // -> server-measured ms
  save: (run, player) => rpc('nf_save', { run, player }),        // -> { name, ms, rank }
  async top(limit = 20) {
    const { body, res } = await request(`/rest/v1/nf_records?select=name,ms&order=ms.asc,created_at.asc&limit=${limit}`,
      { headers: { Prefer: 'count=exact' } });
    const range = res.headers.get('content-range') || '';
    const total = parseInt(range.split('/')[1], 10);
    return { rows: body || [], total: Number.isFinite(total) ? total : (body || []).length };
  },
};

// The record that was there first: Huixin's own flight through these news items.
export const ORIGINAL_RECORD = { name: 'Huixin Dong', label: '6 years', ms: 6 * 365.25 * 24 * 3600 * 1000, original: true };

export function formatTime(ms) {
  if (ms == null || !isFinite(ms)) return '—';
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`;
  const h = Math.floor(m / 60);
  return `${h} h ${String(m % 60).padStart(2, '0')} min`;
}
