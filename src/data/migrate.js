// שדרוג אורח לחשבון: מעלה את הנתונים המקומיים ל-Supabase בלי לדרוס כלום ובלי כפילויות
const chunk = (a, n = 200) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };
const must = r => { if (r.error) throw new Error(r.error.message || String(r.error)); return r.data; };
const ts = s => new Date(s).getTime();

export async function migrateGuestToCloud(sb, local, onStep = () => {}) {
  const u = must(await sb.auth.getUser()); const uid = u.user.id;
  const rep = { rates: 0, shifts: 0, leave: 0, payslips: 0, settings: false, skipped: 0 };

  onStep('שכר שעתי');
  const haveRates = new Set((must(await sb.from('rate_history').select('from_date')) || []).map(r => r.from_date));
  const rates = (local.rate_history || []).filter(r => !haveRates.has(r.from_date)).map(({ id, ...r }) => r);
  for (const c of chunk(rates)) must(await sb.from('rate_history').insert(c));
  rep.rates = rates.length; rep.skipped += (local.rate_history || []).length - rates.length;

  onStep('משמרות');
  const haveShifts = new Set((must(await sb.from('shifts').select('start_at')) || []).map(s => ts(s.start_at)));
  const shifts = (local.shifts || []).filter(s => !haveShifts.has(ts(s.start_at))).map(({ id, ...s }) => s);
  for (const c of chunk(shifts)) must(await sb.from('shifts').insert(c));
  rep.shifts = shifts.length; rep.skipped += (local.shifts || []).length - shifts.length;

  onStep('חופשות והיעדרויות');
  const haveLeave = new Set((must(await sb.from('leave_days').select('day')) || []).map(l => l.day));
  const leave = (local.leave_days || []).filter(l => !haveLeave.has(l.day)).map(({ id, ...l }) => l);
  for (const c of chunk(leave)) must(await sb.from('leave_days').insert(c));
  rep.leave = leave.length; rep.skipped += (local.leave_days || []).length - leave.length;

  onStep('תלושים');
  const havePs = new Set((must(await sb.from('payslips').select('month,employer_name')) || []).map(p => p.month + '|' + (p.employer_name ?? '')));
  const ps = (local.payslips || []).filter(p => !havePs.has(p.month + '|' + (p.employer_name ?? ''))).map(({ id, file_path, ...p }) => ({ ...p, user_id: uid }));
  for (const c of chunk(ps)) must(await sb.from('payslips').upsert(c, { onConflict: 'user_id,month,employer_name' }));
  rep.payslips = ps.length; rep.skipped += (local.payslips || []).length - ps.length;

  onStep('הגדרות');
  if (local.settings) {
    const ex = must(await sb.from('settings').select('user_id'));
    if (!ex || !ex.length) { must(await sb.from('settings').upsert({ ...local.settings, user_id: uid })); rep.settings = true; }
  }
  return rep;
}
