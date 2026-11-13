-- [2026-11-11 Nguyễn Văn Thủy] 0107 Tờ khai 01/GTGT theo mẫu chuẩn: thông tin đầu / cuối tờ khai và lựa chọn khi lập (đóng góp)
-- info: { activity: ngành nghề [01a], appendices: phụ lục đã chọn (BKBR, BKMV, PL204), group4: lấy lên HHDV mua vào nhóm 4,
--         excluded: id hoá đơn bán ra chọn là "không tính thuế" (lên [32a], không lên bảng kê 01-1), signer, signDate, agentStaff, agentCert }
ALTER TABLE public.vat_returns ADD COLUMN IF NOT EXISTS info jsonb NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN public.vat_returns.info IS 'Thông tin tờ khai: activity, appendices, group4, excluded (id hoá đơn bán ra không tính thuế), signer, signDate, agentStaff, agentCert.';
