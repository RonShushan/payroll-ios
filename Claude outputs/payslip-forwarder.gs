// Google Apps Script: קולט תלוש שכר מהמייל ושולח לאפליקציה.
// כתובת השולח נלקחת מהגדרות האפליקציה (מייל המעסיק). אין צורך לערוך כאן כתובות.
const FUNCTION_URL = 'https://zwrvbbapdcqyeslbsrvg.supabase.co/functions/v1/super-api';
const ANON_KEY = 'הדבק-כאן-את-ה-ANON_KEY-הקיים-שלך';
const INGEST_SECRET = 'הדבק-כאן-את-הסוד-החדש';

function alertOnce(msg) {
  const p = PropertiesService.getScriptProperties(), last = Number(p.getProperty('lastAlert') || 0);
  if (Date.now() - last < 6 * 3600e3) return;
  MailApp.sendEmail(Session.getActiveUser().getEmail(), '⚠️ מחשבון שכר: קליטת תלוש נכשלה', msg);
  p.setProperty('lastAlert', String(Date.now()));
}

function call(body) {
  return UrlFetchApp.fetch(FUNCTION_URL, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + ANON_KEY, apikey: ANON_KEY },
    payload: JSON.stringify(Object.assign({ secret: INGEST_SECRET }, body)),
  });
}

function checkPayslips() {
  try {
    const cfg = call({ action: 'config' });
    if (cfg.getResponseCode() >= 400) throw new Error('config ' + cfg.getResponseCode() + ' ' + cfg.getContentText().slice(0, 200));
    const senders = JSON.parse(cfg.getContentText()).senders || [];
    if (!senders.length) return;                       // אף משתמש לא הגדיר מייל מעסיק
    const query = 'from:(' + senders.join(' OR ') + ') has:attachment (filename:pdf OR filename:jpg OR filename:png) newer_than:35d -label:payslip-done';
    const label = GmailApp.getUserLabelByName('payslip-done') || GmailApp.createLabel('payslip-done');
    for (const thread of GmailApp.search(query, 0, 10)) {
      let allOk = true;
      for (const msg of thread.getMessages()) {
        const from = msg.getFrom();
        for (const att of msg.getAttachments({ includeInlineImages: false })) {
          const type = att.getContentType();
          if (!/pdf|jpeg|png/.test(type) || att.getSize() < 10000) continue;
          const res = call({ mediaType: type, base64: Utilities.base64Encode(att.getBytes()), filename: att.getName(), from: from });
          Logger.log(att.getName() + ' -> ' + res.getResponseCode() + ' ' + res.getContentText().slice(0, 300));
          if (res.getResponseCode() >= 400) { allOk = false; alertOnce(att.getName() + ' -> ' + res.getResponseCode() + ' ' + res.getContentText().slice(0, 300)); }
        }
      }
      if (allOk) thread.addLabel(label);
    }
  } catch (e) { alertOnce('שגיאה בסקריפט: ' + e); throw e; }
}
