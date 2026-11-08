-- [2026-11-07 11:55 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — W2a (S031-20 / S031-21, chữ chốt PHASE-031 · 00 §8, ADR-0031): policy_check trên sự việc; khung nhìn chỉ đọc policy_application
-- =============================================================================
-- 0080 Kiểm tham chiếu chính sách ở cửa nạp (bizcity_ledger_intake@1 §3.1).
--   policyRefs do nguồn gửi nằm sẵn trong payload (accounting_events / accounting_event_versions) — KHÔNG thêm cột tham chiếu.
--   Thêm policy_check: kết quả kiểm lúc nhận (mã IN-POL-*, từng tham chiếu đạt hay không). NULL = không có policyRefs.
--   bizcity_read.policy_application: mỗi dòng một tham chiếu của bản hiện hành + kết quả; chỉ đọc (security_invoker, như 0076).
--   (Nhánh hàng việc 'policy_review' KHÔNG ở đây: cần action "Đánh dấu đã xem" để việc đóng được, làm ở đợt sau — sự việc chờ duyệt vì strict đã hiện ở nhánh accounting_event của 0076.)
-- =============================================================================

ALTER TABLE accounting_events ADD COLUMN policy_check jsonb;
ALTER TABLE accounting_event_versions ADD COLUMN policy_check jsonb;
COMMENT ON COLUMN accounting_events.policy_check IS 'Kết quả kiểm tham chiếu chính sách lúc nhận bản hiện hành: { checkedAt, mode, findings[], refs[{ key, version, policyId, ok, codes }] }. NULL = chứng từ không gửi policyRefs (PHASE-031 W2a).';
COMMENT ON COLUMN accounting_event_versions.policy_check IS 'Kết quả kiểm tham chiếu chính sách của phiên bản này lúc nhận (cất cùng payload khi có phiên bản mới).';

-- ── Khung nhìn: một dòng một tham chiếu chính sách của bản hiện hành ─────────────────────────────────────────────────────
CREATE OR REPLACE VIEW bizcity_read.policy_application WITH (security_invoker = true) AS
SELECT e.tenant_id,
       r.ref->>'key'                               AS policy_key,
       (r.ref->>'version')::integer                AS version,
       r.ref->>'policyId'                          AS policy_id,
       e.id                                        AS event_id,
       e.doc_key,
       e.version                                   AS doc_version,
       e.doc_type,
       e.doc_date,
       e.branch_id,
       e.source_system,
       e.status,
       COALESCE(c.codes, ARRAY[]::text[])          AS codes,
       (c.codes IS NULL OR cardinality(c.codes) = 0) AS ok
FROM accounting_events e
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(e.payload->'policyRefs', '[]'::jsonb)) AS r(ref)
LEFT JOIN LATERAL (
  SELECT ARRAY(SELECT jsonb_array_elements_text(x->'codes')) AS codes
  FROM jsonb_array_elements(COALESCE(e.policy_check->'refs', '[]'::jsonb)) AS x
  WHERE x->>'key' = r.ref->>'key' AND (x->>'version')::integer = (r.ref->>'version')::integer
  LIMIT 1
) c ON true;

COMMENT ON VIEW bizcity_read.policy_application IS 'Chính sách đã áp trên từng chứng từ (PHASE-031): một dòng một tham chiếu policyRefs của bản hiện hành, kèm mã IN-POL-* của lần kiểm lúc nhận. Chỉ đọc.';
COMMENT ON COLUMN bizcity_read.policy_application.policy_key IS 'Mã chính sách (policy_registry.policy_key).';
COMMENT ON COLUMN bizcity_read.policy_application.version IS 'Bản chính sách nguồn đã dùng.';
COMMENT ON COLUMN bizcity_read.policy_application.policy_id IS 'Định danh ổn định nếu nguồn gửi.';
COMMENT ON COLUMN bizcity_read.policy_application.event_id IS 'Sự việc kế toán (accounting_events.id).';
COMMENT ON COLUMN bizcity_read.policy_application.codes IS 'Mã IN-POL-* của lần kiểm lúc nhận; rỗng = đạt.';
COMMENT ON COLUMN bizcity_read.policy_application.ok IS 'true khi tham chiếu đạt cả ba phép kiểm.';

CREATE TRIGGER bizcity_read_only INSTEAD OF INSERT OR UPDATE OR DELETE ON bizcity_read.policy_application
  FOR EACH ROW EXECUTE FUNCTION bizcity_read.reject_write();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ketoan_app') THEN
    GRANT SELECT ON bizcity_read.policy_application TO ketoan_app;
  END IF;
END $$;
