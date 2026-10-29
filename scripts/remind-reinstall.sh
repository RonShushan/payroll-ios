#!/bin/bash
# רץ כל יום ב-18:00 דרך launchd. מתריע מ-5 ימים אחרי ההתקנה האחרונה, עד שמריצים שוב npm run ios.
F="$HOME/.payroll-install-date"
[ -f "$F" ] || exit 0
days=$(( ( $(date +%s) - $(cat "$F") ) / 86400 ))
if [ "$days" -ge 5 ]; then
  left=$(( 7 - days )); [ "$left" -lt 0 ] && left=0
  osascript -e "display notification \"חתימת האפליקציה פוקעת בעוד ${left} ימים. חבר את האייפון והרץ: cd ~/payroll-ios && npm run ios\" with title \"מחשבון שכר: התקנה מחדש\" sound name \"Glass\""
fi
