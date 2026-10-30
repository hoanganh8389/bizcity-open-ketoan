-- SC-EVD-2: audit_logs chỉ có 2/13 cột bằng chứng, có trigger chuỗi băm nhưng thiếu trigger chỉ thêm.
CREATE TABLE audit_logs (id bigint PRIMARY KEY, tenant_id bigint NOT NULL, actor_kind text, hash text);
CREATE TRIGGER audit_logs_chain BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION audit_log_chain();
COMMENT ON TABLE audit_logs IS 'Nhật ký mẫu.';
COMMENT ON COLUMN audit_logs.id IS 'Mã.';
COMMENT ON COLUMN audit_logs.tenant_id IS 'Đơn vị.';
COMMENT ON COLUMN audit_logs.actor_kind IS 'Loại người gọi.';
COMMENT ON COLUMN audit_logs.hash IS 'Băm.';
