-- עמודה אחת לפרופיל האישי (סטטוס, ילדים, מעסיק, יתרות התחלתיות). מריצים פעם אחת.
alter table settings add column if not exists profile jsonb default '{}'::jsonb;
