select tests.expect_count($$ select 1 from public.analysis_runs
  where job_id = '9d000000-0000-4000-8000-000000000001' and run_number = 1
    and status = 'completed' and result_status = 'ok' $$, 1,
  'legacy published report becomes completed run 1');
select tests.expect_count($$ select 1 from public.analysis_runs
  where job_id = '9d000000-0000-4000-8000-000000000001' and run_number = 2
    and status = 'queued' $$, 1,
  'in-flight legacy reanalysis becomes separate run 2');
select tests.expect_true((select active_run_id from public.sessions
  where id = '5d000000-0000-4000-8000-000000000001') =
  (select run_id from public.analysis_results
  where job_id = '9d000000-0000-4000-8000-000000000001'),
  'legacy report remains active while reanalysis is queued');
select tests.expect_count($$ select 1 from public.analysis_jobs
  where id = '9d000000-0000-4000-8000-000000000002' and status = 'failed'
    and error_code = 'missing_result' $$, 1,
  'completed job without a report is marked failed');
select tests.expect_count($$ select 1 from public.analysis_runs
  where job_id = '9d000000-0000-4000-8000-000000000002' and status = 'failed' $$, 1,
  'completed job without a report gets no published run');
