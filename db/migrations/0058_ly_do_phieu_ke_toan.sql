-- [2026-11-02 08:45 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 3.15 (ADR-0015 Q1, K2): lý do loại journal có cặp tài khoản Nợ / Có cho manual_journal
-- =============================================================================
-- 0058 Lý do phiếu kế toán của module (PHASE-011 3.15, đặc tả 50-DAC-TA-MANUAL-JOURNAL phương án A).
--      Module nộp docType manual_journal: mỗi dòng mang reasonCode + số tiền, KHÔNG mang số tài khoản. Lý do loại "journal"
--      do kế toán khai sẵn cặp tài khoản: dòng định khoản Nợ debit_account / Có credit_account. Module không chọn được cặp sai.
--      Loại khác (in / out / receipt / payment) giữ nguyên, hai cột mới để trống.
-- =============================================================================

ALTER TABLE posting_reasons ADD COLUMN debit_account text;
ALTER TABLE posting_reasons ADD COLUMN credit_account text;

ALTER TABLE posting_reasons DROP CONSTRAINT posting_reasons_kind_check;
ALTER TABLE posting_reasons ADD CONSTRAINT posting_reasons_kind_check CHECK (kind = ANY (ARRAY['out', 'in', 'receipt', 'payment', 'journal']));

-- Lý do journal: đủ hai tài khoản, khác nhau. Loại khác: không dùng hai cột này.
ALTER TABLE posting_reasons ADD CONSTRAINT posting_reasons_journal_accounts_check CHECK (
  CASE WHEN kind = 'journal'
    THEN debit_account IS NOT NULL AND credit_account IS NOT NULL AND debit_account <> credit_account
    ELSE debit_account IS NULL AND credit_account IS NULL
  END
);

COMMENT ON COLUMN posting_reasons.kind IS 'Loại lý do: out / in (kho), receipt / payment (tiền), journal (phiếu kế toán của module — manual_journal, 0058).';
COMMENT ON COLUMN posting_reasons.debit_account IS 'Lý do journal: tài khoản ghi Nợ của mỗi dòng manual_journal (0058). Loại khác: NULL.';
COMMENT ON COLUMN posting_reasons.credit_account IS 'Lý do journal: tài khoản ghi Có của mỗi dòng manual_journal (0058). Loại khác: NULL.';
