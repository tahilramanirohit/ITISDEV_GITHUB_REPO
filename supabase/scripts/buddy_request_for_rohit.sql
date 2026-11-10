-- Demo: another player sends Rohit a buddy request, so Rohit can accept it live
-- (Players -> My partners -> "Wants to be your buddy" -> Accept).
-- Works for any two players: change the two names (or emails) below.
--
-- Paste the whole file into Supabase Dashboard -> SQL Editor -> New query -> Run.
-- Needs pickleproapp_upgrade_12.sql. Safe to run more than once: if the request is
-- already waiting it changes nothing. If the two are already buddies it changes
-- nothing either and says so (pick another player, or remove the buddy in the app first).

do $$
declare
  to_email   text := '';        -- e.g. 'rohit@example.com'; leave '' to use the name
  to_name    text := 'Rohit';   -- who accepts
  from_email text := '';
  from_name  text := 'Kirk';    -- who asks; not someone already Rohit's buddy

  rohit uuid;
  asker uuid;
  matches int;
  link public.buddies;
begin
  select count(*), min(p.id::text)::uuid into matches, rohit
  from public.profiles p join auth.users u on u.id = p.id
  where case when to_email <> '' then lower(u.email) = lower(to_email) else p.display_name ilike to_name || '%' end;
  if matches <> 1 then
    raise exception 'Found % players for "%". Set to_email at the top of this script.', matches, coalesce(nullif(to_email, ''), to_name);
  end if;
  select count(*), min(p.id::text)::uuid into matches, asker
  from public.profiles p join auth.users u on u.id = p.id
  where case when from_email <> '' then lower(u.email) = lower(from_email) else p.display_name ilike from_name || '%' end;
  if matches <> 1 then
    raise exception 'Found % players for "%". Set from_email at the top of this script.', matches, coalesce(nullif(from_email, ''), from_name);
  end if;
  if rohit = asker then
    raise exception 'Both names matched the same account.';
  end if;

  select * into link from public.buddies b where b.status in ('pending', 'active')
    and ((b.requester_id = asker and b.addressee_id = rohit) or (b.requester_id = rohit and b.addressee_id = asker));
  if found and link.status = 'active' then
    raise notice '% and % are already buddies; nothing changed. Pick another player to send the request.', from_name, to_name;
    return;
  elsif found and link.requester_id = asker then
    raise notice 'The request from % is already waiting for %.', from_name, to_name;
    return;
  elsif found then
    -- Rohit had asked them: replace it with a request the other way, so Rohit is the one who accepts.
    update public.buddies set status = 'cancelled', responded_at = now() where id = link.id;
  end if;

  -- Rohit can only accept if he has confirmed 18+ (Players asks once); the request waits until then.
  insert into public.buddies (requester_id, addressee_id) values (asker, rohit);
  raise notice 'Done: % sent % a buddy request. Sign in as % -> Players -> My partners -> Accept.', from_name, to_name, to_name;
end $$;
