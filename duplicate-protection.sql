-- Run once in Supabase SQL Editor for protection across tabs/devices.
-- Existing records are preserved; this does not delete or merge duplicates.
-- Identity = account owner + normalized name + normalized phone.
-- Different family members may share a phone number.
begin;
create or replace function public.gwe_prevent_duplicate_person()
returns trigger language plpgsql set search_path = public as $$
declare
  normalized_name text := lower(regexp_replace(btrim(new.name), '\s+', ' ', 'g'));
  normalized_phone text := regexp_replace(regexp_replace(coalesce(new.phone, ''), '[^0-9]', '', 'g'), '^00', '');
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text || ':' || normalized_name || ':' || normalized_phone, 0));
  if exists (
    select 1 from public.gwe_people p
    where p.user_id = new.user_id and p.id is distinct from new.id
      and lower(regexp_replace(btrim(p.name), '\s+', ' ', 'g')) = normalized_name
      and regexp_replace(regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g'), '^00', '') = normalized_phone
  ) then
    raise exception 'This person already exists. Update the existing record.' using errcode = '23505';
  end if;
  return new;
end;
$$;
drop trigger if exists gwe_people_duplicate_guard on public.gwe_people;
create trigger gwe_people_duplicate_guard
before insert or update of name, phone, user_id on public.gwe_people
for each row execute function public.gwe_prevent_duplicate_person();
commit;
