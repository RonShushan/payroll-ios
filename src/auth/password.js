// דרישות סיסמה: לפחות 8 תווים, לפחות אות אחת ולפחות ספרה אחת. (השרת ב-Supabase מגדיר מינימום משלו.)
export const PW_RULES = [
  ['len', 'לפחות 8 תווים', p => p.length >= 8],
  ['letter', 'לפחות אות אחת', p => /\p{L}/u.test(p)],
  ['digit', 'לפחות ספרה אחת', p => /\d/.test(p)],
];
export const passwordIssues = p => PW_RULES.filter(([, , f]) => !f(p || '')).map(([, t]) => t);
export const passwordOk = p => passwordIssues(p).length === 0;
// רשימת הדרישות עם סימון בזמן אמת. withMatch מוסיף שורת "הסיסמאות זהות" לשדה האימות:
// ריקה/באמצע הקלדה = אפור, זהות = ירוק, לא זהות (אחרי שהאימות הגיע לאורך הסיסמה או ביציאה מהשדה) = אדום עם ✕
export const pwRulesHtml = (withMatch = false) => `<ul class="pw-rules" id="pw-rules" aria-live="polite">${PW_RULES.map(([k, t]) => `<li data-k="${k}"><span class="pw-dot" aria-hidden="true"></span><span class="pw-txt">${t}</span></li>`).join('')}${withMatch ? '<li data-k="match"><span class="pw-dot" aria-hidden="true"></span><span class="pw-txt">הסיסמאות זהות</span></li>' : ''}</ul>`;
export function bindPwRules(input, confirm, onMatch) {
  let was = false, left = false;
  const li = k => document.querySelector(`#pw-rules [data-k="${k}"]`);
  const upd = () => {
    const v = input.value; PW_RULES.forEach(([k, , f]) => li(k)?.classList.toggle('ok', f(v)));
    const m = li('match'); if (!confirm || !m) return;
    const c = confirm.value, same = !!v && v === c;
    const bad = !same && !!c && (c.length >= v.length || left);
    m.classList.toggle('ok', same); m.classList.toggle('bad', bad);
    m.querySelector('.pw-txt').textContent = bad ? 'הסיסמאות לא זהות' : 'הסיסמאות זהות';
    if (same && !was) onMatch?.(); was = same;
  };
  input.addEventListener('input', upd); confirm?.addEventListener('input', () => { left = false; upd(); });
  confirm?.addEventListener('blur', () => { left = true; upd(); });
  upd();
}
