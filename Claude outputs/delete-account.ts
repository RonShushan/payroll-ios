// @ts-nocheck
// ===== כלי עזר משותפים לפונקציות שרת =====
const SB_URL = Deno.env.get('SUPABASE_URL');
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const SB_H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' };
async function q(path) { const r = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: SB_H }); if (!r.ok) throw new Error(path + ' ' + await r.text()); return r.json(); }
async function dbWrite(method, path, body, prefer) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { method, headers: { ...SB_H, Prefer: prefer || 'return=representation' }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!r.ok) throw new Error(method + ' ' + path + ' ' + await r.text());
  const t = await r.text(); return t ? JSON.parse(t) : null;
}
// מזהה משתמש מתוך טוקן המשתמש (לקריאות מהאפליקציה)
async function userFromReq(req) {
  const a = req.headers.get('authorization') || '';
  const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_KEY, Authorization: a } });
  if (!r.ok) return null; const u = await r.json(); return u && u.id ? u : null;
}
const money = n => '₪' + Number(n || 0).toLocaleString('he-IL', { maximumFractionDigits: 2 });
const num = n => Number(n || 0).toLocaleString('he-IL', { maximumFractionDigits: 2 });
const il = d => new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
const ilHM = d => new Date(d).toLocaleTimeString('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' });
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ===== פונקציית שרת: מחיקת חשבון (המשתמש מוחק את עצמו מתוך האפליקציה) =====
// @ts-nocheck
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
  try {
    const u = await userFromReq(req); if (!u) return J({ error: 'not signed in' }, 401);
    const b = await req.json().catch(() => ({}));
    if (b.confirm !== 'DELETE') return J({ error: 'missing confirmation' }, 400);
    const uid = u.id;
    // 1. קבצי התלושים באחסון (תיקייה לפי מזהה משתמש)
    try {
      const l = await fetch(`${SB_URL}/storage/v1/object/list/payslips`, { method: 'POST', headers: SB_H, body: JSON.stringify({ prefix: uid, limit: 1000 }) });
      const items = l.ok ? await l.json() : [];
      const names = (items || []).map(i => `${uid}/${i.name}`);
      if (names.length) await fetch(`${SB_URL}/storage/v1/object/payslips`, { method: 'DELETE', headers: SB_H, body: JSON.stringify({ prefixes: names }) });
    } catch (e) { console.warn('storage cleanup', e); }
    // 2. נתונים בטבלאות (גם אם אין cascade)
    for (const t of ['shifts', 'leave_days', 'payslips', 'rate_history', 'settings']) {
      try { await fetch(`${SB_URL}/rest/v1/${t}?user_id=eq.${uid}`, { method: 'DELETE', headers: SB_H }); } catch (e) { console.warn(t, e); }
    }
    // 3. המשתמש עצמו (מוחק גם טבלאות אחרות עם cascade, למשל מכשירים רשומים להתראות)
    const d = await fetch(`${SB_URL}/auth/v1/admin/users/${uid}`, { method: 'DELETE', headers: SB_H });
    if (!d.ok) return J({ error: 'delete failed', detail: await d.text() }, 500);
    return J({ deleted: true });
  } catch (e) { return J({ error: String(e) }, 500); }
});
