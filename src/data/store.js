// שכבת נתונים: מצב אורח (IndexedDB מקומי) או חשבון (Supabase). אותו ממשק לשניהם.
import { D, saveLocal } from './local.js';
import { isLocal } from './mode.js';
import { getClient as client } from './supabase.js';
import { DEFAULT_SETTINGS } from '../lib/payroll.js';

const must = r => { if (r.error) throw new Error(r.error.message); return r.data; };
export { must };

const idn = () => D.seq++;

export const store = {
  async settings() {
    if (isLocal()) return { ...DEFAULT_SETTINGS, ...(D.settings || {}) };
    const c = await client(); const r = must(await c.from('settings').select('*').maybeSingle());
    return { ...DEFAULT_SETTINGS, ...(r || {}), extras: r?.extras || [], extra_deductions: r?.extra_deductions || [] };
  },
  async saveSettings(s) {
    if (isLocal()) { D.settings = s; saveLocal(); return; }
    const c = await client(); const { data: u } = await c.auth.getUser();
    let row = { ...s, user_id: u.user.id };
    for (let i = 0; i < 8; i++) {                       // עמודה שעוד לא קיימת בבסיס הנתונים: מדלגים עליה במקום לקרוס
      const { error } = await c.from('settings').upsert(row);
      if (!error) return;
      const m = /Could not find the '([^']+)' column/.exec(error.message || '');
      if (!m || !(m[1] in row)) throw error;
      delete row[m[1]]; console.warn('settings: חסרה עמודה', m[1]);
    }
  },
  async rates() {
    if (isLocal()) return D.rate_history;
    const c = await client(); return must(await c.from('rate_history').select('*').order('from_date'));
  },
  async addRate(r) {
    if (isLocal()) { D.rate_history.push({ id: idn(), ...r }); saveLocal(); return; }
    const c = await client(); must(await c.from('rate_history').insert(r));
  },
  async delRate(id) {
    if (isLocal()) { D.rate_history = D.rate_history.filter(x => x.id !== id); saveLocal(); return; }
    const c = await client(); must(await c.from('rate_history').delete().eq('id', id));
  },
  async shifts(fromISO, toISO) {
    if (isLocal()) return D.shifts.filter(s => s.start_at >= fromISO && s.start_at < toISO).sort((a, b) => a.start_at.localeCompare(b.start_at));
    const c = await client(); return must(await c.from('shifts').select('*').gte('start_at', fromISO).lt('start_at', toISO).order('start_at'));
  },
  async activeShift() {
    if (isLocal()) return D.shifts.find(s => !s.end_at) || null;
    const c = await client(); return must(await c.from('shifts').select('*').is('end_at', null).order('start_at', { ascending: false }).limit(1).maybeSingle());
  },
  async startShift(startISO) {
    if (isLocal()) { const s = { id: idn(), start_at: startISO, end_at: null, break_minutes: null }; D.shifts.push(s); saveLocal(); return s; }
    const c = await client(); return must(await c.from('shifts').insert({ start_at: startISO }).select().single());
  },
  async saveShift(s) {
    if (isLocal()) {
      if (s.id) { const i = D.shifts.findIndex(x => x.id === s.id); D.shifts[i] = { ...D.shifts[i], ...s }; }
      else D.shifts.push({ id: idn(), ...s });
      saveLocal(); return;
    }
    const c = await client();
    if (s.id) { const { id, ...rest } = s; must(await c.from('shifts').update(rest).eq('id', id)); }   // אי אפשר לעדכן עמודת id
    else must(await c.from('shifts').insert(s));
  },
  async addShifts(list) {
    if (isLocal()) { for (const x of list) D.shifts.push({ id: idn(), ...x }); saveLocal(); return; }
    const c = await client(); must(await c.from('shifts').insert(list.map(({ id, ...r }) => r)));
  },
  async addLeaveMany(list) {
    if (isLocal()) { for (const x of list) D.leave_days.push({ id: idn(), ...x }); saveLocal(); return; }
    const c = await client(); must(await c.from('leave_days').insert(list.map(({ id, ...r }) => r)));
  },
  async delShift(id) {
    if (isLocal()) { D.shifts = D.shifts.filter(x => x.id !== id); saveLocal(); return; }
    const c = await client(); must(await c.from('shifts').delete().eq('id', id));
  },
  async leave(fromYmd, toYmd) {
    if (isLocal()) return D.leave_days.filter(l => l.day >= fromYmd && l.day < toYmd);
    const c = await client(); return must(await c.from('leave_days').select('*').gte('day', fromYmd).lt('day', toYmd).order('day'));
  },
  async addLeave(day, kind) {
    if (isLocal()) { D.leave_days.push({ id: idn(), day, kind }); saveLocal(); return; }
    const c = await client(); must(await c.from('leave_days').insert({ day, kind }));
  },
  async delLeave(id) {
    if (isLocal()) { D.leave_days = D.leave_days.filter(x => x.id !== id); saveLocal(); return; }
    const c = await client(); must(await c.from('leave_days').delete().eq('id', id));
  },
  async payslips() {
    if (isLocal()) return [...D.payslips].sort((a, b) => a.month.localeCompare(b.month));
    const c = await client(); return must(await c.from('payslips').select('*').order('month'));
  },
  async savePayslip(p) {
    if (isLocal()) {
      const i = D.payslips.findIndex(x => x.month === p.month && x.employer_name === p.employer_name);
      if (i >= 0) D.payslips[i] = { ...D.payslips[i], ...p }; else D.payslips.push({ id: idn(), ...p });
      saveLocal(); return;
    }
    const c = await client(); must(await c.from('payslips').upsert(p, { onConflict: 'user_id,month,employer_name' }));
  },
  async savePayslips(list) {
    if (isLocal()) { for (const p of list) await this.savePayslip(p); return; }
    const c = await client();
    const { data: u } = await c.auth.getUser();
    must(await c.from('payslips').upsert(list.map(p => ({ ...p, user_id: u.user.id })), { onConflict: 'user_id,month,employer_name' }));
  },
  async delPayslip(id) {
    if (isLocal()) { D.payslips = D.payslips.filter(x => x.id !== id); saveLocal(); return; }
    const c = await client(); must(await c.from('payslips').delete().eq('id', id));
  },
  async readPayslipFile(base64, mediaType) {          // קריאה אוטומטית דרך פונקציית שרת
    if (isLocal()) throw new Error('קריאה אוטומטית זמינה רק אחרי הרשמה לחשבון');
    const c = await client();
    const { data, error } = await c.functions.invoke('read-payslip', { body: { base64, mediaType } });
    if (error) { let d = ''; try { const t = await error.context.text(); try { d = JSON.parse(t).error || t; } catch { d = t; } } catch {} throw new Error(d || error.message); }
    return data;
  },
  async uploadSlipFile(file, name) {
    if (isLocal()) throw new Error('העלאת קבצים זמינה רק אחרי הרשמה לחשבון');
    const c = await client(); const { data: u } = await c.auth.getUser();
    const path = `${u.user.id}/${name}`;
    must(await c.storage.from('payslips').upload(path, file, { upsert: true, contentType: file.type || 'application/pdf' }));
    return path;
  },
  async setSlipFile(id, path) {
    if (isLocal()) return;
    const c = await client(); must(await c.from('payslips').update({ file_path: path }).eq('id', id));
  },
  async slipFileUrl(path) {
    const c = await client(); const r = must(await c.storage.from('payslips').createSignedUrl(path, 600)); return r.signedUrl;
  },
  async savePushSub(sub) {
    if (isLocal()) throw new Error('התראות זמינות רק אחרי הרשמה לחשבון');
    const c = await client(); const { data: u } = await c.auth.getUser();
    must(await c.from('push_subs').upsert({ user_id: u.user.id, endpoint: sub.endpoint, sub }, { onConflict: 'endpoint' }));
  },
  async callFn(name, body) {
    if (isLocal()) throw new Error('זמין רק אחרי הרשמה לחשבון');
    const c = await client(); const { data, error } = await c.functions.invoke(name, { body });
    if (error) throw new Error(error.message); return data;
  },
  async exportAll() {
    const [settings, rates, payslips] = await Promise.all([this.settings(), this.rates(), this.payslips()]);
    const shifts = await this.shifts('2000-01-01', '2100-01-01');
    const leave = await this.leave('2000-01-01', '2100-01-01');
    return { settings, rates, shifts, leave, payslips };
  },
};
