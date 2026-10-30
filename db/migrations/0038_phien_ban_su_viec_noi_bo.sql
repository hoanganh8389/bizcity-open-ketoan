-- =============================================================================
-- 0038 Điền posted_version cho sự việc nội bộ cũ (PHASE-004, PHASES 2.1, Q004-3).
--      Trước PHASE-004 kết chuyển (closing) và giá vốn (cogs) ghi sổ thẳng qua ledgerService, không đặt posted_version
--      (DG-EVENT-4 / INTERNAL_EVENT_VERSION). Từ 0038 mọi sự việc Kernel tự lập đi eventStore.markPosted(); dữ liệu cũ
--      được điền ở đây.
--      Chỉ điền khi sự việc đang posted VÀ có bút toán hiệu lực (không phải bút toán đảo) của đúng phiên bản hiện tại:
--      khi đó phiên bản trong sổ chính là `version`. Không đụng ledger_*; không đổi số liệu.
-- =============================================================================

UPDATE accounting_events a
   SET posted_version = a.version
 WHERE a.status = 'posted'
   AND a.doc_type IN ('closing', 'cogs', 'depreciation')
   AND a.posted_version IS NULL
   AND EXISTS (SELECT 1 FROM ledger_entries e
                WHERE e.event_id = a.id AND e.status = 'posted' AND NOT e.is_reversal AND e.event_version = a.version);

COMMENT ON COLUMN accounting_events.posted_version IS 'Phiên bản nội dung đang nằm trong sổ; NULL = chưa định khoản. status pending + posted_version < version: có phiên bản mới chờ định khoản lại. Đặt bởi postDocumentIn() (chứng từ nhận qua cửa nạp) hoặc eventStore.markPosted() (sự việc Kernel tự lập: phiếu tay, kết chuyển, khấu hao, giá vốn — từ 0038).';
