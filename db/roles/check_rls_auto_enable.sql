-- ═══════════════════════════════════════════════════════════════════════════
-- Fingerprint of the RLS auto-enable safety net (read-only)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Prints ONE line covering every security-relevant attribute of
-- public.rls_auto_enable() and the ensure_rls event trigger. Compare it with the
-- expected line in EXTRACT_rls_auto_enable.md.
--
--   psql "$DIRECT_URL" -X -t -A -F '|' -f db/roles/check_rls_auto_enable.sql
--
-- Readable as fitlog_migrate; the break-glass credential is not needed.
--
-- Two choices keep the line comparable across databases and sessions:
--   * the trigger's function is rendered schema-qualified from the catalog, so
--     the output does not depend on the session's search_path;
--   * tags are sorted in the C collation, so a trigger whose tags were declared
--     in a different order — but is wired identically — prints the same line.
--
-- No output = the function does not exist. Empty trigger fields = no trigger.

SELECT
  md5(p.prosrc)                                          AS src_md5,
  length(p.prosrc)                                       AS src_len,
  pg_get_userbyid(p.proowner)                            AS fn_owner,
  p.prosecdef                                            AS fn_security_definer,
  p.proconfig                                            AS fn_settings,
  t.evtevent                                             AS trg_event,
  tn.nspname || '.' || tp.proname || '()'                AS trg_function,
  (SELECT array_agg(x ORDER BY x COLLATE "C")
     FROM unnest(t.evttags) AS x)                        AS trg_tags,
  t.evtenabled                                           AS trg_enabled,
  pg_get_userbyid(t.evtowner)                            AS trg_owner
FROM pg_proc p
JOIN pg_namespace n        ON n.oid  = p.pronamespace
LEFT JOIN pg_event_trigger t ON t.evtname = 'ensure_rls'
LEFT JOIN pg_proc tp       ON tp.oid = t.evtfoid
LEFT JOIN pg_namespace tn  ON tn.oid = tp.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'rls_auto_enable';
