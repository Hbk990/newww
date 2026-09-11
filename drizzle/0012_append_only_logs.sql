-- ============================================================
-- Append-only history
-- ============================================================

-- An audit trail an administrator can edit proves nothing. Enforced in the
-- database rather than the application, because "enforced in the application"
-- means anyone with a connection string is exempt — and the people most worth
-- auditing are exactly the ones with database access.
--
-- This blocks the table owner too, which is the point. A superuser can drop the
-- trigger to prune genuinely ancient rows, and that act is itself visible in
-- the Postgres logs.
--
-- ROW-level, not statement-level, and this matters. A statement-level trigger
-- fires even when the statement matches no rows, so a cascading delete from a
-- variant with no history would raise — meaning no variant could ever be
-- deleted, which breaks the bulk variant generator outright. Row-level fires
-- only for rows actually being changed.
--
-- The cascading foreign keys into these tables are dropped in the same
-- migration set for the same reason: history has to outlive the row it
-- describes, and a cascade into an append-only table can never succeed.
create or replace function trg_append_only()
returns trigger language plpgsql as $$
begin
  raise exception '% is append-only; % is not permitted', tg_table_name, tg_op
    using errcode = 'insufficient_privilege',
          hint = 'History is written once. Add a correcting entry instead.';
end $$;
--> statement-breakpoint

create trigger audit_log_append_only
before update or delete on audit_log
for each row execute function trg_append_only();
--> statement-breakpoint

-- The same guarantee for the two history tables that already existed. Stock and
-- price movements answer the same kinds of question, and a ledger that can be
-- edited cannot reconcile against anything.
create trigger inventory_ledger_append_only
before update or delete on inventory_ledger
for each row execute function trg_append_only();
--> statement-breakpoint

create trigger price_history_append_only
before update or delete on price_history
for each row execute function trg_append_only();
