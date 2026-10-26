// ===== פונקציית שרת: קריאת תלוש אוטומטית =====
// @ts-nocheck
const AKEY = Deno.env.get('ANTHROPIC_API_KEY');
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const PROMPT = `זהו תלוש שכר ישראלי. חלץ את הערכים והחזר JSON בלבד (בלי טקסט נוסף) במבנה:
{"month":"YYYY-MM","employer":"שם המעסיק","gross":number,"net":number,"income_tax":number,"national_insurance":number,"health":number,"pension_emp":number|null,"pension_employer":number|null,"severance":number|null,"insured_salary":number|null,"hours":number|null,"workdays":number|null,"vacation_balance":number|null,"sick_balance":number|null,"hourly_rate":number|null,"credit_points":number|null,"pension_emp_pct":number|null,"pension_employer_pct":number|null,"severance_pct":number|null}
כללים: gross = סה"כ תשלומים; net = שכר נטו; income_tax = ניכוי מס הכנסה החודשי (0 אם אין; שלילי אם זיכוי); pension_emp = ניכוי פנסיה/קופת גמל של העובד; insured_salary = שכר מבוטח לפנסיה; vacation_balance ו-sick_balance = "יתרה חדשה" בימים בחשבון חופשה ומחלה. hourly_rate = תעריף/שכר לשעה (אם השכר חודשי החזר null); credit_points = מספר נקודות הזיכוי של העובד (למשל 2.25); pension_emp_pct, pension_employer_pct, severance_pct = אחוזי הפרשה לפנסיה של העובד, של המעסיק ולפיצויים (אם מופיעים באחוזים; אחרת null); employer = שם המעסיק כפי שמופיע בראש התלוש. אם ערך לא מופיע החזר null. מספרים בלי פסיקים ובלי סימן ₪.`;


// בחירת דגם: ANTHROPIC_MODEL אם הוגדר, אחרת הדגם הכי חדש מסוג sonnet שהחשבון רואה
let _model = Deno.env.get('ANTHROPIC_MODEL') || '';
async function pickModel(force) {
  if (_model && !force) return _model;
  const r = await fetch('https://api.anthropic.com/v1/models?limit=100', { headers: { 'x-api-key': AKEY, 'anthropic-version': '2023-06-01' } });
  const j = await r.json();
  const ids = (j.data || []).map(m => m.id);
  _model = ids.find(i => /sonnet/.test(i)) || ids.find(i => /haiku/.test(i)) || ids[0] || 'claude-sonnet-4-5';
  return _model;
}
async function callClaude(content) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const model = await pickModel(attempt > 0);
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST',
      headers: { 'x-api-key': AKEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: 1000, messages: [{ role: 'user', content }] }) });
    const j = await r.json();
    if (r.ok) return j.content.map(c => c.text || '').join('');
    if (attempt === 0 && (r.status === 404 || j.error?.type === 'not_found_error')) { _model = ''; continue; }
    throw new Error(j.error?.message || 'anthropic error');
  }
}


Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    // רק משתמש רשום (הקריאה עולה כסף): בודקים שהטוקן שייך למשתמש אמיתי ולא למפתח האנונימי
    const au = await fetch(`${Deno.env.get('SUPABASE_URL')}/auth/v1/user`, { headers: { apikey: Deno.env.get('SUPABASE_ANON_KEY'), Authorization: req.headers.get('authorization') || '' } });
    const user = au.ok ? await au.json() : null;
    if (!user || !user.id) return new Response(JSON.stringify({ error: 'נדרשת התחברות לחשבון' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
    const { base64, mediaType } = await req.json();
    if (!base64) throw new Error('missing file');
    const block = mediaType === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
      : { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } };
    const txt = await callClaude([block, { type: 'text', text: PROMPT }]);
    const data = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1));
    return new Response(JSON.stringify(data), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) { return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }); }
});
