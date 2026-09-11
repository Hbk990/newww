-- ============================================================
-- Snapshot sync — intentionally does nothing
-- ============================================================

-- 0017 is hand-written, so drizzle-kit wrote no snapshot for it and would
-- re-emit its changes on the next `generate`. Same arrangement as 0016: the
-- SQL is empty and meta/0018_snapshot.json is the payload.
--
-- And the same warning. Asked to generate option_values, drizzle-kit omits the
-- composite (option_type_id, kind) foreign key that keeps the denormalised
-- kind honest, and the ON DELETE RESTRICT that stops a device model being
-- deleted out from under a variant. Read what it produces before applying it.

select 1 where false;
