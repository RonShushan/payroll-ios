#!/bin/bash
# גיבוי יומי: אם היו שינויים בפרויקט, יוצר commit ודוחף ל-GitHub. מופעל אוטומטית כל ערב דרך launchd.
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
cd "$(dirname "$0")/.." || exit 1
LOG="$HOME/Library/Logs/payroll-backup.log"
now() { date '+%Y-%m-%d %H:%M'; }
if [ -z "$(git status --porcelain)" ]; then echo "$(now) אין שינויים, לא נוצר גיבוי" >> "$LOG"; exit 0; fi
if git add . && git commit -q -m "גיבוי יומי $(date +%F)" && git push -q >> "$LOG" 2>&1; then
  echo "$(now) גיבוי נדחף" >> "$LOG"
else
  echo "$(now) הגיבוי נכשל (בדוק git status והתחברות gh)" >> "$LOG"; exit 1
fi
