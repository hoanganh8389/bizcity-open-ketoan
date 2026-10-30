-- [2026-10-30 11:27 AM Johnny Chu - Chu Hoàng Anh] PHASE-003 — bằng chứng chỉ thêm, chuỗi băm theo đơn vị, biên nhận (PHASES 2.6).
-- =============================================================================
-- 0036 Bằng chứng (bizcity_evidence@1 §5, PHASES 2.6): mở rộng audit_logs thành bảng bằng chứng chung — giữ tên, giữ dữ liệu cũ
--      (ADR-0002). Thêm: loại người gọi, kênh, module, chủ thể, mã yêu cầu, Idempotency-Key, băm input, kết quả, chạy thử,
--      CHUỖI BĂM theo từng đơn vị (chain_seq, prev_hash, hash) và lớp chỉ thêm (chặn UPDATE / DELETE / TRUNCATE, STD-EVD-2).
--
--   - Băm do trigger tính (audit_log_chain) nên MỌI đường ghi đều vào chuỗi, kể cả các chỗ còn gọi writeAudit() tay.
--   - chain_seq cấp dưới khoá theo đơn vị (pg_advisory_xact_lock): hai giao dịch song song có thể lấy id theo thứ tự này
--     nhưng nối chuỗi theo thứ tự kia — kiểm chuỗi đi theo chain_seq, không theo id. Khoá giữ tới hết giao dịch: giao dịch dài có
--     ghi bằng chứng sẽ xếp hàng các lần ghi bằng chứng khác của CÙNG đơn vị (chấp nhận ở v1; ghi bằng chứng ở cuối giao dịch).
--   - Dòng cũ (trước migration) không có chain_seq / hash; chuỗi bắt đầu từ dòng đầu tiên sau migration.
--   - Hệ quả của chỉ thêm: không xoá được đơn vị có nhật ký (FK ON DELETE CASCADE bị trigger chặn) — như sổ cái.
--   - Kiểm chuỗi: audit_log_hash(dòng) phải bằng hash; prev_hash = hash của chain_seq liền trước (EVIDENCE_CHAIN, DG-EVD-1).
-- =============================================================================

ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS actor_kind      text    NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS actor_via       text,
  ADD COLUMN IF NOT EXISTS on_behalf_of    text,
  ADD COLUMN IF NOT EXISTS module_id       text,
  ADD COLUMN IF NOT EXISTS module_version  text,
  ADD COLUMN IF NOT EXISTS subject         text,
  ADD COLUMN IF NOT EXISTS request_id      text,
  ADD COLUMN IF NOT EXISTS correlation_id  text,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS input_hash      text,
  ADD COLUMN IF NOT EXISTS result_ok       boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS result_code     text,
  ADD COLUMN IF NOT EXISTS dry_run         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS chain_seq       bigint,
  ADD COLUMN IF NOT EXISTS prev_hash       text,
  ADD COLUMN IF NOT EXISTS hash            text;

-- Dòng cũ: suy loại người gọi từ actor ("user:<id>", "apikey:<id>", còn lại là hệ thống). Làm TRƯỚC khi bật chỉ thêm.
UPDATE audit_logs SET actor_kind = CASE WHEN actor LIKE 'apikey:%' THEN 'apikey' WHEN actor LIKE 'user:%' THEN 'user' ELSE 'system' END
 WHERE chain_seq IS NULL;

ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_actor_kind_check;
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_actor_kind_check CHECK (actor_kind IN ('user', 'apikey', 'ai', 'system'));
CREATE UNIQUE INDEX IF NOT EXISTS audit_logs_chain ON audit_logs (tenant_id, chain_seq) WHERE chain_seq IS NOT NULL;
CREATE INDEX IF NOT EXISTS audit_logs_idempotency ON audit_logs (tenant_id, action, idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Băm một dòng bằng chứng: mọi trường (kể cả prev_hash, chain_seq) nối bằng ký tự 0x1f, SHA-256. jsonb::text là dạng chuẩn
-- (khoá đã sắp xếp) nên băm ổn định. Dùng chung cho trigger và cho kiểm chuỗi.
CREATE OR REPLACE FUNCTION audit_log_hash(r audit_logs) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT 'sha256:' || encode(sha256(convert_to(concat_ws(chr(31),
    r.id::text, r.tenant_id::text, coalesce(r.chain_seq::text, ''), coalesce(r.prev_hash, ''),
    to_char(r.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    r.actor, r.actor_kind, coalesce(r.actor_via, ''), coalesce(r.on_behalf_of, ''),
    r.action, coalesce(r.module_id, ''), coalesce(r.module_version, ''), r.object_type, coalesce(r.object_id, ''), coalesce(r.subject, ''),
    coalesce(r.request_id, ''), coalesce(r.correlation_id, ''), coalesce(r.idempotency_key, ''), coalesce(r.input_hash, ''),
    r.result_ok::text, coalesce(r.result_code, ''), r.dry_run::text,
    coalesce(r.before_data::text, ''), coalesce(r.after_data::text, '')), 'UTF8')), 'hex')
$$;

CREATE OR REPLACE FUNCTION audit_log_chain() RETURNS trigger AS $$
DECLARE
  v_seq  bigint;
  v_hash text;
BEGIN
  PERFORM pg_advisory_xact_lock(727002, NEW.tenant_id::integer);
  SELECT chain_seq, hash INTO v_seq, v_hash FROM audit_logs
   WHERE tenant_id = NEW.tenant_id AND chain_seq IS NOT NULL ORDER BY chain_seq DESC LIMIT 1;
  -- writeAudit() cũ không truyền actor_kind: suy từ actor.
  IF NEW.actor LIKE 'apikey:%' AND NEW.actor_kind = 'user' THEN NEW.actor_kind := 'apikey'; END IF;
  NEW.chain_seq := coalesce(v_seq, 0) + 1;
  NEW.prev_hash := v_hash;
  NEW.hash := audit_log_hash(NEW);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION forbid_audit_log_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Bằng chứng chỉ được thêm (STD-EVD-2): không sửa, xoá nhật ký thao tác.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_logs_chain ON audit_logs;
CREATE TRIGGER audit_logs_chain BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION audit_log_chain();
DROP TRIGGER IF EXISTS audit_logs_no_update ON audit_logs;
CREATE TRIGGER audit_logs_no_update BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION forbid_audit_log_mutation();
DROP TRIGGER IF EXISTS audit_logs_no_truncate ON audit_logs;
CREATE TRIGGER audit_logs_no_truncate BEFORE TRUNCATE ON audit_logs FOR EACH STATEMENT EXECUTE FUNCTION forbid_audit_log_mutation();

COMMENT ON COLUMN audit_logs.actor_kind IS 'Loại người gọi (bizcity_evidence@1): user, apikey, ai (qua Cell / MCP), system (tác vụ nền).';
COMMENT ON COLUMN audit_logs.actor_via IS 'Kênh khi người gọi là AI / tích hợp, vd cell:zalo-hub, mcp:claude.';
COMMENT ON COLUMN audit_logs.on_behalf_of IS 'Người dùng chủ của khoá / kênh khi AI thao tác thay (STD-EVD-6), vd user:5.';
COMMENT ON COLUMN audit_logs.module_id IS 'Module của action (phần đầu mã action), core cho Core.';
COMMENT ON COLUMN audit_logs.module_version IS 'Phiên bản module lúc ghi.';
COMMENT ON COLUMN audit_logs.subject IS 'Chủ thể: docRef / docKey của chứng từ bị tác động, vd payment_request:YC26-00001.';
COMMENT ON COLUMN audit_logs.request_id IS 'Mã yêu cầu HTTP (truy vết với log kỹ thuật).';
COMMENT ON COLUMN audit_logs.correlation_id IS 'Mã nối nhiều yêu cầu của cùng một việc (vd một hội thoại Cell).';
COMMENT ON COLUMN audit_logs.idempotency_key IS 'Idempotency-Key của lần gọi (bizcity_action@1 §8), để trả lại biên nhận khi gửi lặp.';
COMMENT ON COLUMN audit_logs.input_hash IS 'SHA-256 của input đã chuẩn hoá: kiểm được nội dung đã gửi mà không lưu lại dữ liệu nhạy cảm.';
COMMENT ON COLUMN audit_logs.result_ok IS 'Thao tác thành công (true) hay bị từ chối vì lỗi nghiệp vụ (false, kèm result_code) — STD-EVD-1.';
COMMENT ON COLUMN audit_logs.result_code IS 'Mã lỗi chuẩn khi result_ok = false (CONFLICT, PERIOD_LOCKED…).';
COMMENT ON COLUMN audit_logs.dry_run IS 'Bản ghi của lần chạy thử (dự phòng; v1 không ghi bằng chứng cho chạy thử).';
COMMENT ON COLUMN audit_logs.chain_seq IS 'Thứ tự trong chuỗi băm của đơn vị (1, 2, 3…), cấp dưới khoá theo đơn vị. NULL = dòng trước migration 0036.';
COMMENT ON COLUMN audit_logs.prev_hash IS 'hash của dòng chain_seq liền trước (NULL ở dòng đầu chuỗi).';
COMMENT ON COLUMN audit_logs.hash IS 'audit_log_hash(dòng) = sha256 mọi trường + prev_hash. Sửa / xoá một dòng giữa chuỗi là lộ.';
