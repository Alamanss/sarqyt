-- ZeroWaste ATU — схема базы (Трек 1, раздел 7 ТЗ)
-- Запускается целиком; повторный запуск безопасен.

create extension if not exists pgcrypto;

-- ---------- Таблицы ----------
create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name_ru text not null,
  name_kk text not null,
  type text not null check (type in ('department','canteen','coffee','hotel','lab','other')),
  building text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text,
  role text not null default 'responsible' check (role in ('responsible','reviewer','admin','management')),
  org_id uuid references organizations(id),
  telegram_chat_id bigint,
  created_at timestamptz not null default now()
);

create table if not exists disposal_methods (
  id uuid primary key default gen_random_uuid(),
  name_ru text not null unique,
  name_kk text not null,
  is_recycling boolean not null default false
);

create table if not exists waste_types (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id),          -- null = общий справочник
  name_ru text not null,
  name_kk text,
  unit text not null default 'kg' check (unit in ('kg','l')),
  default_disposal_id uuid references disposal_methods(id),
  recyclable boolean not null default false,
  co2_factor numeric not null default 0,              -- кг CO2-экв. на 1 кг (л)
  active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create unique index if not exists waste_types_org_name on waste_types (coalesce(org_id::text,'-'), lower(name_ru));

create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  period_start date not null,
  period_end date not null,
  status text not null default 'draft' check (status in ('draft','submitted','in_review','accepted','returned')),
  submitted_at timestamptz,
  reviewer_id uuid references auth.users(id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (org_id, period_start)
);

create table if not exists entries (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references reports(id) on delete cascade,
  org_id uuid not null references organizations(id),
  entry_date date not null default current_date,
  waste_type_id uuid not null references waste_types(id) on delete restrict,
  quantity numeric not null check (quantity > 0 and quantity <= 5000),
  disposal_id uuid references disposal_methods(id),
  responsible_id uuid references auth.users(id),
  photo_url text,
  source text not null default 'web' check (source in ('web','telegram','scale','import','ocr','voice','photo')),
  note text,
  created_at timestamptz not null default now(),
  check (entry_date <= current_date + 1)
);
create index if not exists entries_report on entries(report_id);
create index if not exists entries_org_date on entries(org_id, entry_date);

create table if not exists status_history (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references reports(id) on delete cascade,
  from_status text,
  to_status text not null,
  user_id uuid references auth.users(id),
  comment text,
  created_at timestamptz not null default now()
);
create index if not exists history_report on status_history(report_id, created_at);

-- ---------- Вспомогательные функции ----------
create or replace function my_role() returns text
language sql stable security definer set search_path = public as
$$ select role from profiles where id = auth.uid() $$;

create or replace function my_org() returns uuid
language sql stable security definer set search_path = public as
$$ select org_id from profiles where id = auth.uid() $$;

-- Профиль создаётся автоматически; роль из метаданных НЕ берём (иначе можно выдать себе админа)
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''), new.email)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function handle_new_user();

-- Запись принадлежит организации отчёта и ответственному; правка только в черновике/возврате
create or replace function entries_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare r reports;
begin
  select * into r from reports where id = coalesce(new.report_id, old.report_id);
  if r.status not in ('draft','returned') and coalesce(current_setting('app.bypass', true),'') <> '1' then
    raise exception 'REPORT_LOCKED';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  new.org_id := r.org_id;
  if new.entry_date < r.period_start or new.entry_date > r.period_end then
    raise exception 'DATE_OUT_OF_PERIOD';
  end if;
  if tg_op = 'INSERT' and new.responsible_id is null then new.responsible_id := auth.uid(); end if;
  if new.disposal_id is null then
    select default_disposal_id into new.disposal_id from waste_types where id = new.waste_type_id;
  end if;
  return new;
end $$;

drop trigger if exists entries_guard_trg on entries;
create trigger entries_guard_trg before insert or update or delete on entries
for each row execute function entries_guard();

-- Найти или создать отчёт за месяц для своей организации
create or replace function get_or_create_report(p_org uuid, p_month date) returns reports
language plpgsql security definer set search_path = public as $$
declare r reports; s date := date_trunc('month', p_month)::date;
begin
  if my_role() = 'responsible' and my_org() is distinct from p_org then raise exception 'FORBIDDEN'; end if;
  if my_role() not in ('responsible','admin') then raise exception 'FORBIDDEN'; end if;
  select * into r from reports where org_id = p_org and period_start = s;
  if not found then
    insert into reports (org_id, period_start, period_end)
    values (p_org, s, (s + interval '1 month - 1 day')::date) returning * into r;
    insert into status_history (report_id, from_status, to_status, user_id, comment)
    values (r.id, null, 'draft', auth.uid(), null);
  end if;
  return r;
end $$;

-- Отправить на проверку
create or replace function submit_report(p_report uuid) returns reports
language plpgsql security definer set search_path = public as $$
declare r reports; n int;
begin
  select * into r from reports where id = p_report for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (my_role() = 'responsible' and my_org() = r.org_id) and my_role() <> 'admin' then raise exception 'FORBIDDEN'; end if;
  if r.status not in ('draft','returned') then raise exception 'BAD_STATUS'; end if;
  select count(*) into n from entries where report_id = r.id;
  if n = 0 then raise exception 'EMPTY_REPORT'; end if;
  update reports set status = 'submitted', submitted_at = now(), decided_at = null where id = r.id returning * into r;
  insert into status_history (report_id, from_status, to_status, user_id) values (r.id, 'draft', 'submitted', auth.uid());
  return r;
end $$;

-- Проверяющий открыл отчёт
create or replace function start_review(p_report uuid) returns reports
language plpgsql security definer set search_path = public as $$
declare r reports;
begin
  if my_role() not in ('reviewer','admin') then raise exception 'FORBIDDEN'; end if;
  select * into r from reports where id = p_report for update;
  if r.status <> 'submitted' then return r; end if;
  update reports set status = 'in_review', reviewer_id = auth.uid() where id = r.id returning * into r;
  insert into status_history (report_id, from_status, to_status, user_id) values (r.id, 'submitted', 'in_review', auth.uid());
  return r;
end $$;

-- Принять / вернуть (возврат — только с комментарием)
create or replace function decide_report(p_report uuid, p_accept boolean, p_comment text default null) returns reports
language plpgsql security definer set search_path = public as $$
declare r reports; old_status text; new_status text;
begin
  if my_role() not in ('reviewer','admin') then raise exception 'FORBIDDEN'; end if;
  select * into r from reports where id = p_report for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if r.status not in ('submitted','in_review') then raise exception 'BAD_STATUS'; end if;
  if not p_accept and coalesce(trim(p_comment),'') = '' then raise exception 'COMMENT_REQUIRED'; end if;
  old_status := r.status;
  new_status := case when p_accept then 'accepted' else 'returned' end;
  update reports set status = new_status, reviewer_id = auth.uid(), decided_at = now() where id = r.id returning * into r;
  insert into status_history (report_id, from_status, to_status, user_id, comment)
  values (r.id, old_status, new_status, auth.uid(), nullif(trim(p_comment),''));
  return r;
end $$;

-- ---------- RLS ----------
alter table organizations enable row level security;
alter table profiles enable row level security;
alter table disposal_methods enable row level security;
alter table waste_types enable row level security;
alter table reports enable row level security;
alter table entries enable row level security;
alter table status_history enable row level security;

do $$ declare p record; begin
  for p in select policyname, tablename from pg_policies where schemaname = 'public'
    and tablename in ('organizations','profiles','disposal_methods','waste_types','reports','entries','status_history')
  loop execute format('drop policy %I on %I', p.policyname, p.tablename); end loop;
end $$;

-- Организации: читать могут все (в т.ч. страница QR до входа), менять — администратор
create policy org_read on organizations for select using (true);
create policy org_write on organizations for all to authenticated
  using (my_role() = 'admin') with check (my_role() = 'admin');

-- Профили
create policy prof_read on profiles for select to authenticated using (true);
create policy prof_admin on profiles for update to authenticated
  using (my_role() = 'admin') with check (my_role() = 'admin');

-- Справочник способов утилизации
create policy disp_read on disposal_methods for select to authenticated using (true);
create policy disp_write on disposal_methods for all to authenticated
  using (my_role() = 'admin') with check (my_role() = 'admin');

-- Виды отходов: ответственный добавляет в свою организацию, проверяющий/админ — любые; удалять нельзя
create policy wt_read on waste_types for select to authenticated using (true);
create policy wt_insert on waste_types for insert to authenticated
  with check (my_role() in ('reviewer','admin') or (my_role() = 'responsible' and org_id = my_org()));
create policy wt_update on waste_types for update to authenticated
  using (my_role() in ('reviewer','admin')) with check (my_role() in ('reviewer','admin'));

-- Отчёты: ответственный видит только свою организацию; переходы статусов — только через функции
create policy rep_read on reports for select to authenticated
  using (my_role() in ('reviewer','admin','management') or org_id = my_org());

-- Записи
create policy ent_read on entries for select to authenticated
  using (my_role() in ('reviewer','admin','management') or org_id = my_org());
create policy ent_insert on entries for insert to authenticated
  with check (my_role() = 'responsible' and exists (select 1 from reports r where r.id = report_id and r.org_id = my_org()));
create policy ent_update on entries for update to authenticated
  using (my_role() = 'responsible' and org_id = my_org())
  with check (my_role() = 'responsible' and org_id = my_org());
create policy ent_delete on entries for delete to authenticated
  using (my_role() = 'responsible' and org_id = my_org());

-- История
create policy hist_read on status_history for select to authenticated
  using (exists (select 1 from reports r where r.id = report_id
    and (my_role() in ('reviewer','admin','management') or r.org_id = my_org())));

-- ---------- Справочники по образцам АТУ ----------
insert into disposal_methods (name_ru, name_kk, is_recycling) values
  ('Вывоз ТБО', 'ҚТҚ шығару', false),
  ('Вывоз ТБО (мусорный бак)', 'ҚТҚ шығару (қоқыс жәшігі)', false),
  ('Переработка', 'Қайта өңдеу', true),
  ('Компостирование', 'Компосттау', true),
  ('Передача на корм животным', 'Мал азығына беру', true),
  ('Сдача на утилизацию (масло)', 'Кәдеге жаратуға тапсыру (май)', true)
on conflict (name_ru) do nothing;

insert into organizations (slug, name_ru, name_kk, type, building) values
  ('tpp',     'Кафедра ТПП', 'ТӨТ кафедрасы', 'department', 'Учебный корпус'),
  ('thipp',   'Кафедра ТХиПП', 'НжТӨТ кафедрасы', 'department', 'Учебный корпус'),
  ('atu-inn', 'Учебно-гостиничный комплекс ATU INN', 'ATU INN оқу-қонақүй кешені', 'hotel', 'ATU INN'),
  ('canella', 'Кофейня АТУ (ИП «Canella»)', 'АТУ кофеханасы («Canella» ЖК)', 'coffee', 'Корпус 1'),
  ('iskander','Столовый комплекс корп. 1, 2 (ИП «Искандер»)', '1, 2 корпус асханасы («Искандер» ЖК)', 'canteen', 'Корпус 1, 2')
on conflict (slug) do nothing;

-- Виды отходов (recyclable и co2_factor — рабочие допущения, источник указан в README)
with d as (select name_ru, id from disposal_methods),
src(slug, name_ru, name_kk, unit, disposal, recyclable, co2) as (values
  ('tpp','Упаковочные отходы','Қаптама қалдықтары','kg','Вывоз ТБО', true, 1.04),
  ('tpp','Мясные кости','Ет сүйектері','kg','Вывоз ТБО', false, 0.63),
  ('tpp','Рыбные кости','Балық сүйектері','kg','Вывоз ТБО', false, 0.63),
  ('thipp','Яичная скорлупа','Жұмыртқа қабығы','kg','Вывоз ТБО', true, 0.63),
  ('thipp','Сахароза','Сахароза','kg','Вывоз ТБО', false, 0.63),
  ('thipp','ПЭТ-бутылка 1,0 л (растительное масло)','ПЭТ-бөтелке 1,0 л (өсімдік майы)','kg','Вывоз ТБО', true, 0.01),
  ('thipp','Стеклобутылка','Шыны бөтелке','kg','Вывоз ТБО', true, 0.01),
  ('thipp','Отходы образцов хлебобулочных изделий','Нан-тоқаш өнімдері үлгілерінің қалдықтары','kg','Вывоз ТБО', true, 0.63),
  ('thipp','Отходы образцов кондитерских изделий','Кондитер өнімдері үлгілерінің қалдықтары','kg','Вывоз ТБО', false, 0.63),
  ('thipp','Отходы фруктов и овощей','Жеміс-көкөніс қалдықтары','kg','Вывоз ТБО', true, 0.63),
  ('thipp','Алюминиевые банки','Алюминий банкалар','kg','Вывоз ТБО', true, 0.01),
  ('atu-inn','Очистки овощей','Көкөніс қабықтары','kg','Вывоз ТБО (мусорный бак)', true, 0.63),
  ('atu-inn','Обрезки мясопродуктов','Ет өнімдерінің кесінділері','kg','Вывоз ТБО (мусорный бак)', false, 0.63),
  ('atu-inn','Пищевые отходы из зала','Залдан шыққан тамақ қалдықтары','kg','Вывоз ТБО (мусорный бак)', true, 0.63),
  ('atu-inn','Остатки нереализованной продукции','Сатылмаған өнім қалдықтары','kg','Вывоз ТБО (мусорный бак)', true, 0.63),
  ('atu-inn','Отработанное масло','Пайдаланылған май','l','Вывоз ТБО', true, 0.63),
  ('atu-inn','Картонная тара','Картон ыдыс','kg','Вывоз ТБО', true, 1.04),
  ('canella','Кофейный жмых','Кофе сығындысы','kg','Вывоз ТБО (мусорный бак)', true, 0.63),
  ('canella','Картонная тара','Картон ыдыс','kg','Вывоз ТБО', true, 1.04),
  ('canella','Остатки еды','Тамақ қалдықтары','kg','Вывоз ТБО (мусорный бак)', true, 0.63),
  ('iskander','Очистки овощей','Көкөніс қабықтары','kg','Вывоз ТБО (мусорный бак)', true, 0.63),
  ('iskander','Обрезки мясопродуктов','Ет өнімдерінің кесінділері','kg','Вывоз ТБО (мусорный бак)', false, 0.63),
  ('iskander','Пищевые отходы из зала','Залдан шыққан тамақ қалдықтары','kg','Вывоз ТБО (мусорный бак)', true, 0.63),
  ('iskander','Остатки нереализованной продукции','Сатылмаған өнім қалдықтары','kg','Вывоз ТБО (мусорный бак)', true, 0.63),
  ('iskander','Отработанное масло','Пайдаланылған май','l','Вывоз ТБО', true, 0.63),
  ('iskander','Картонная тара','Картон ыдыс','kg','Вывоз ТБО', true, 1.04)
)
insert into waste_types (org_id, name_ru, name_kk, unit, default_disposal_id, recyclable, co2_factor)
select o.id, s.name_ru, s.name_kk, s.unit, d.id, s.recyclable, s.co2
from src s join organizations o on o.slug = s.slug join d on d.name_ru = s.disposal
on conflict do nothing;
