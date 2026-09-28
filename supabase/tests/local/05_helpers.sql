-- Assertion helpers for the local SQL tests.
create schema tests;
grant usage on schema tests to anon, authenticated, service_role;

-- Run as the role/claims currently in effect; fail unless the statement errors.
create function tests.expect_error(p_sql text, p_label text) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    raise notice 'PASS (rejected) %: %', p_label, sqlerrm;
    return;
  end;
  raise exception 'FAIL %: statement succeeded but should have been rejected', p_label;
end $$;

create function tests.expect_rows(p_sql text, p_expected bigint, p_label text) returns void
language plpgsql as $$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  if n <> p_expected then
    raise exception 'FAIL %: expected % row(s), got %', p_label, p_expected, n;
  end if;
  raise notice 'PASS %', p_label;
end $$;

create function tests.expect_count(p_sql text, p_expected bigint, p_label text) returns void
language plpgsql as $$
declare n bigint;
begin
  execute format('select count(*) from (%s) q', p_sql) into n;
  if n <> p_expected then
    raise exception 'FAIL %: expected count %, got %', p_label, p_expected, n;
  end if;
  raise notice 'PASS %', p_label;
end $$;

create function tests.expect_true(p_cond boolean, p_label text) returns void
language plpgsql as $$
begin
  if p_cond is not true then
    raise exception 'FAIL %', p_label;
  end if;
  raise notice 'PASS %', p_label;
end $$;

grant execute on all functions in schema tests to anon, authenticated, service_role;
