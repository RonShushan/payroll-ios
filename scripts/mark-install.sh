#!/bin/bash
# מסמן את זמן ההתקנה האחרון (חתימת Apple החינמית פוקעת 7 ימים אחריו). נקרא אוטומטית מ-npm run ios.
date +%s > "$HOME/.payroll-install-date"
