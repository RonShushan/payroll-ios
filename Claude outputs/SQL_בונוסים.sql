alter table payslips add column if not exists recovery numeric(10,2);
alter table payslips add column if not exists bonuses jsonb;
alter table payslips add column if not exists vacation_pay numeric(10,2);
