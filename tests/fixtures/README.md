# בדיקה מול תלוש אמיתי

שים כאן קובץ `payslip-YYYY-MM.json` ו-`npm test` יריץ אותו מול החישוב.
אל תכניס שם, מספר זהות או כתובת. אפשר להשאיר רק מספרים.

```json
{
  "slip": { "month": "2026-10", "gross": 0, "income_tax": 0, "national_insurance": 0, "health": 0,
            "pension_emp": 0, "pension_employer": 0, "insured_salary": 0, "net": 0 },
  "rates": [{ "from_date": "2026-01-01", "hourly_rate": 0 }],
  "shifts": [{ "start_at": "2026-10-05T06:00:00.000Z", "end_at": "2026-10-05T15:00:00.000Z" }],
  "leave": [{ "day": "2026-10-14", "kind": "vacation" }],
  "settings": { "credit_points": 2.25, "break_minutes": 0 },
  "prior": { "cumIncome": 0, "taxPaid": 0, "monthIndex": 0 }
}
```

`prior` הוא ההכנסה המצטברת והמס ששולם בחודשים הקודמים בשנה (`monthIndex` = כמה חודשים עברו).
פער בפנסיה עובד גדול מ-2 שקלים יכשיל את הבדיקה. שאר הפערים רק מודפסים.
