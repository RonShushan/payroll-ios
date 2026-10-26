-- עמודות דמי נסיעות בטבלת ההגדרות. מריצים פעם אחת ב-SQL Editor של Supabase.
alter table settings add column if not exists travel_enabled boolean default false;
alter table settings add column if not exists travel_per_day numeric default 0;
alter table settings add column if not exists travel_taxable boolean default false;
notify pgrst, 'reload schema';
