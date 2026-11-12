-- Миграция 2: справочники Оргкомитета (виды отходов, способы утилизации, CO₂ по DEFRA 2024) + хранилище фото
-- Источник: «Справочники для Трека 1: отходы, утилизация, CO₂» (UK DEFRA/BEIS GHG conversion factors 2024, Waste disposal)

alter table disposal_methods add column if not exists code text;
alter table disposal_methods add column if not exists co2_factor numeric;   -- кг CO2-экв/т; null = зависит от вида отхода (ТБО)
alter table disposal_methods add column if not exists hierarchy int;        -- 1 — лучше

alter table waste_types add column if not exists category text;
alter table waste_types add column if not exists recyclability text not null default 'yes';   -- yes / partial / no
alter table waste_types add column if not exists recommended_disposal_id uuid references disposal_methods(id);
alter table waste_types add column if not exists co2_landfill numeric not null default 700.21;     -- кг CO2-экв/т при вывозе ТБО
alter table waste_types add column if not exists co2_recommended numeric not null default 8.88;    -- кг CO2-экв/т при рекомендуемом способе

-- Способы утилизации по справочнику
update disposal_methods set code='TBO', hierarchy=5, co2_factor=null where name_ru in ('Вывоз ТБО','Вывоз ТБО (мусорный бак)');
update disposal_methods set code='RECYCLE', hierarchy=3, co2_factor=6.41, is_recycling=true, name_ru='Сдача вторсырья на переработку', name_kk='Қайталама шикізатты өңдеуге тапсыру' where name_ru in ('Переработка','Сдача вторсырья на переработку');
update disposal_methods set code='COMPOST', hierarchy=4, co2_factor=8.88, is_recycling=true where name_ru='Компостирование';
update disposal_methods set code='FEED', hierarchy=2, co2_factor=0, is_recycling=true where name_ru='Передача на корм животным';
update disposal_methods set code='OIL', hierarchy=3, co2_factor=6.41, is_recycling=true, name_ru='Сдача отработанного масла спецорганизации', name_kk='Пайдаланылған майды арнайы ұйымға тапсыру' where name_ru in ('Сдача на утилизацию (масло)','Сдача отработанного масла спецорганизации');
insert into disposal_methods (name_ru, name_kk, is_recycling, code, co2_factor, hierarchy) values
  ('Передача нереализованной продукции (фудшеринг)', 'Сатылмаған өнімді беру (фудшеринг)', true, 'DONATE', 0, 1),
  ('Анаэробное сбраживание (биогаз)', 'Анаэробты ашыту (биогаз)', true, 'AD', 8.88, 4)
on conflict (name_ru) do nothing;

-- Виды отходов по справочнику
with ref(name_ru, category, recyclability, code, landfill, rec) as (values
  ('Пищевые отходы из зала','organic','yes','COMPOST',700.21,8.88),
  ('Остатки нереализованной продукции','organic','yes','DONATE',700.21,8.88),
  ('Остатки еды','organic','yes','COMPOST',700.21,8.88),
  ('Очистки овощей','organic','yes','COMPOST',700.21,8.88),
  ('Отходы фруктов и овощей','organic','yes','COMPOST',700.21,8.88),
  ('Обрезки мясопродуктов','organic','partial','AD',700.21,8.88),
  ('Мясные кости','organic','partial','AD',700.21,8.88),
  ('Рыбные кости','organic','partial','AD',700.21,8.88),
  ('Яичная скорлупа','organic','yes','COMPOST',700.21,8.88),
  ('Кофейный жмых','organic','yes','COMPOST',700.21,8.88),
  ('Отходы образцов хлебобулочных изделий','organic','yes','COMPOST',700.21,8.88),
  ('Отходы образцов кондитерских изделий','organic','yes','COMPOST',700.21,8.88),
  ('Сахароза','organic','yes','AD',700.21,8.88),
  ('Отработанное масло','special','yes','OIL',700.21,6.41),
  ('Картонная тара','recyclable','yes','RECYCLE',1164.39,6.41),
  ('ПЭТ-бутылка 1,0 л (растительное масло)','recyclable','partial','RECYCLE',8.88,6.41),
  ('Стеклобутылка','recyclable','yes','RECYCLE',8.88,6.41),
  ('Алюминиевые банки','recyclable','yes','RECYCLE',8.88,6.41),
  ('Упаковочные отходы','mixed','partial','RECYCLE',1164.39,6.41)
)
update waste_types w set
  category = ref.category, recyclability = ref.recyclability, recyclable = true,
  co2_landfill = ref.landfill, co2_recommended = ref.rec, co2_factor = ref.landfill / 1000,
  recommended_disposal_id = (select id from disposal_methods d where d.code = ref.code limit 1)
from ref where w.name_ru = ref.name_ru;

-- Демо: часть потоков уже идёт рекомендуемым способом (картон кофейни и масло столовой с сентября)
select set_config('app.bypass', '1', false);
update entries e set disposal_id = (select id from disposal_methods where code = 'RECYCLE' limit 1)
  where e.entry_date >= '2026-09-01' and e.waste_type_id in (select w.id from waste_types w join organizations o on o.id = w.org_id where o.slug = 'canella' and w.name_ru = 'Картонная тара');
update entries e set disposal_id = (select id from disposal_methods where code = 'OIL' limit 1)
  where e.entry_date >= '2026-09-01' and e.waste_type_id in (select w.id from waste_types w join organizations o on o.id = w.org_id where o.slug in ('iskander','atu-inn') and w.name_ru = 'Отработанное масло');
update entries e set disposal_id = (select id from disposal_methods where code = 'COMPOST' limit 1)
  where e.entry_date >= '2026-10-01' and e.waste_type_id in (select w.id from waste_types w join organizations o on o.id = w.org_id where o.slug = 'canella' and w.name_ru = 'Кофейный жмых');
select set_config('app.bypass', '', false);

-- Хранилище фото
insert into storage.buckets (id, name, public) values ('photos', 'photos', true) on conflict (id) do nothing;
drop policy if exists photos_read on storage.objects;
drop policy if exists photos_insert on storage.objects;
create policy photos_read on storage.objects for select using (bucket_id = 'photos');
create policy photos_insert on storage.objects for insert to authenticated with check (bucket_id = 'photos');
