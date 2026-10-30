-- =============================================================================
-- 0037 mcp_confirm_tokens: xác nhận trước khi ghi qua MCP (bizcity_mcp@1 STD-MCP-4, bizcity-mcp-tool@1.0.0 §4; PHASES 2.12).
--      Gọi công cụ ghi không kèm confirm_token → Core chạy thử (dry-run) để xem trước, lưu một dòng ở đây, trả token. Người dùng
--      đồng ý → AI gọi lại cùng tham số + token. Token: một lần, 900 giây, gắn công cụ + người gọi + băm tham số.
--      Đổi tham số → MCP_CONFIRM_ARGS_CHANGED; token lạ / hết hạn / của người khác / đã dùng với khoá khác → MCP_CONFIRM_INVALID.
--      Ghi thật chạy qua runtime action với Idempotency-Key = mcp:<jti> nên hai lần gọi trùng chỉ ghi một lần.
-- =============================================================================

CREATE TABLE IF NOT EXISTS mcp_confirm_tokens (
  jti             text   PRIMARY KEY,
  tenant_id       bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tool            text   NOT NULL,
  actor           text   NOT NULL,
  args_hash       text   NOT NULL,
  expires_at      timestamptz NOT NULL,
  used_at         timestamptz,
  idempotency_key text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mcp_confirm_tokens_expires_idx ON mcp_confirm_tokens (expires_at);

COMMENT ON TABLE mcp_confirm_tokens IS 'Token xác nhận trước khi ghi qua MCP (bizcity_mcp@1 STD-MCP-4): một lần, 900 giây, gắn công cụ + người gọi + băm tham số.';
COMMENT ON COLUMN mcp_confirm_tokens.jti IS 'Mã token ngẫu nhiên (confirm_token trả cho AI).';
COMMENT ON COLUMN mcp_confirm_tokens.tool IS 'Tên công cụ MCP được xác nhận, vd quy.payment_request.create.';
COMMENT ON COLUMN mcp_confirm_tokens.actor IS 'Người / khoá đã nhận bản xem trước: chỉ chính người đó dùng được token.';
COMMENT ON COLUMN mcp_confirm_tokens.args_hash IS 'SHA-256 tham số lúc xem trước: gọi xác nhận với tham số khác → MCP_CONFIRM_ARGS_CHANGED.';
COMMENT ON COLUMN mcp_confirm_tokens.expires_at IS 'Hết hạn (900 giây sau khi cấp).';
COMMENT ON COLUMN mcp_confirm_tokens.used_at IS 'Lúc đã ghi thật bằng token này (NULL = chưa dùng).';
COMMENT ON COLUMN mcp_confirm_tokens.idempotency_key IS 'params._meta.idempotency_key của lần dùng: gửi lại cùng khoá → trả kết quả cũ (meta.replayed), khoá khác → MCP_CONFIRM_INVALID.';
