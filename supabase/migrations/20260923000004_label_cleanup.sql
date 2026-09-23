-- 326 variations carried a word the importer could not place: "45°", "floor", "twist", "high".
-- Some of those words are real attributes, and while they sit in variant_label they cannot be
-- filtered, cannot be required by an item, and read as noise in a name. This promotes the ones
-- that map cleanly, drops the ones that repeat something the variation already states, and leaves
-- the genuinely named techniques alone — "spiderman", "clock", "maltese" are names, not attributes.

-- Two values the catalog was missing, both common enough to be worth having.
insert into public.variation_values (dimension_id, value, names, sort_order) values
  ('position', 'floor',      '{"en":"On the floor","es":"En el suelo"}', 9),
  ('style',    'full-range', '{"en":"Full range","es":"Rango completo"}', 25),
  ('style',    'donkey',     '{"en":"Donkey","es":"Donkey"}', 26)
on conflict do nothing;

-- Words that are attributes: state them as attributes.
do $$
declare m record;
begin
  for m in select * from (values
      ('45°',      'bench_angle', 'incline'),
      ('floor',    'position',    'floor'),
      ('high',     'style',       'high'),
      ('low',      'style',       'low'),
      ('front',    'style',       'front'),
      ('twist',    'style',       'twisting'),
      ('rotation', 'style',       'twisting'),
      ('russian',  'style',       'twisting'),
      ('full',     'style',       'full-range'),
      ('donkey',   'style',       'donkey')
    ) as t(label, dimension_id, value)
  loop
    insert into public.variant_attributes (variant_id, dimension_id, value)
    select v.id, m.dimension_id, m.value
    from public.exercise_variants v
    where v.variant_label = m.label
    on conflict do nothing;

    update public.exercise_variants set variant_label = null where variant_label = m.label;
  end loop;
end $$;

-- One variation needed the wheel it was named after.
insert into public.variant_equipment (variant_id, equipment_id)
select v.id, 'ab-wheel' from public.exercise_variants v
where v.variant_label = 'wheel'
on conflict do nothing;
update public.exercise_variants set variant_label = null where variant_label = 'wheel';

-- Words that only repeat what the variation already says, as kit or as an attribute.
update public.exercise_variants v set variant_label = null
where v.variant_label is not null
  and (exists (select 1 from public.variant_equipment ve join public.equipment e on e.id = ve.equipment_id
               where ve.variant_id = v.id
                 and (lower(e.names->>'en') like '%' || v.variant_label || '%'
                      or e.id like '%' || replace(v.variant_label, ' ', '-') || '%'))
    or exists (select 1 from public.variant_attributes va join public.variation_values vv
                 on vv.dimension_id = va.dimension_id and vv.value = va.value
               where va.variant_id = v.id
                 and (va.value = replace(v.variant_label, ' ', '-') or lower(vv.names->>'en') = v.variant_label))
    or (v.variant_label = 'suspended'
        and exists (select 1 from public.variant_equipment ve
                    where ve.variant_id = v.id and ve.equipment_id = 'suspension-trainer')));

select public.rebuild_variant_names();
