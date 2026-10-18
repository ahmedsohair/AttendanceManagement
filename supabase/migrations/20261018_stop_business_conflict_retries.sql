-- Business conflicts are not transient serialization failures. PostgREST 14
-- can retry SQLSTATE 40001 indefinitely. Preserve definitions and grants while
-- changing only the known business-conflict marker in these five routines.
do $migration$
declare
  v_signature text;
  v_oid regprocedure;
  v_definition text;
  v_old constant text := 'errcode = ''40001''';
  v_new constant text := 'errcode = ''PT409''';
  v_markers integer;
begin
  foreach v_signature in array array[
    'public.replace_room_assignments_atomic(uuid,jsonb,jsonb)',
    'public.activate_invigilator_access_code(uuid,text)',
    'public.cancel_pending_invigilator_access_code(uuid,text)',
    'public.record_invigilator_access_code_emailed(uuid,text)',
    'public.complete_email_delivery_attempt(uuid,text,text,text,text,text,integer)'
  ] loop
    v_oid := to_regprocedure(v_signature);
    if v_oid is null then
      raise exception 'Required conflict routine is missing: %', v_signature;
    end if;
    v_definition := pg_get_functiondef(v_oid);
    v_markers := (length(v_definition) - length(replace(v_definition, v_old, ''))) / length(v_old)
      + (length(v_definition) - length(replace(v_definition, v_new, ''))) / length(v_new);
    if v_markers <> 1 then
      raise exception 'Unexpected business-conflict definition for %. Review before applying.', v_signature;
    end if;
    if strpos(v_definition, v_old) > 0 then
      execute replace(v_definition, v_old, v_new);
    end if;
  end loop;
end;
$migration$;
