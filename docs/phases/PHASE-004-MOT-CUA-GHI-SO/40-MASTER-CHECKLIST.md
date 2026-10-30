# PHASE-004 · 40 — Master checklist

> Nguồn trạng thái **việc con** duy nhất của phase. "Xong" của việc lộ trình do bảng điểm tính, không do bảng này. Nhiều phiên: chỉ sửa đúng dòng theo ID; Log chỉ nối thêm.
> Ký hiệu: ☐ chưa làm · 🟡 có mã + test, chưa đủ tín hiệu · ✅ đủ tín hiệu / có bằng chứng · ⛔ chờ chủ hoặc người ngoài nhóm · ❌ huỷ.

<!-- [2026-10-30] Mở thư mục phase theo chỉ đạo của chủ dự án (Johnny Chu – Chu Hoàng Anh): "rà soát lại kiến trúc và checklist đã làm đến đâu … chia phase cụ thể theo từng folder phase". Trạng thái chụp từ bảng điểm cùng ngày (CSDL ketoan_test, đủ migration). -->

| ID | Việc | Lộ trình / G | Code | Trạng thái |
|---|---|---|---|---|
| S004-1 | W0 · Đo mốc: số dư mọi tài khoản × kỳ × chi nhánh trên `ketoan_test` (công cụ `tools/so-du-moc.mjs`) | 2.1 | chưa | ☐ |
| S004-2 | W0 · Phân loại DG-EVENT-2 (200) và DG-EVENT-4 (191): dữ liệu test hay lỗi thật | 2.1 | chưa | ☐ |
| S004-3 | W1 · `eventStore.commit()` trong Kernel + test (phiên bản, đảo, `posted_version`, `posting_log`, bằng chứng) | 2.1 | chưa | ☐ |
| S004-4 | W2 · Phiếu kế toán tay (`vouchers`) đi `eventStore.commit` | 2.1 | chưa | ☐ |
| S004-5 | W3 · Khấu hao, phân bổ (`assets`) | 2.1 | chưa | ☐ |
| S004-6 | W3 · Kết chuyển (`closing`, cả kết chuyển lợi nhuận năm trước) | 2.1 | chưa | ☐ |
| S004-7 | W4 · Giá vốn (`costing`), giữ ngoại lệ `overwriteCostPairs` | 2.1 | chưa | ☐ |
| S004-8 | W5 · `DEBT_LEDGER_CALLERS` rỗng, SC-KERNEL-3 hết nợ, `--update-baseline`; sửa RULE-LEDGER, CANON §5 | 2.1 | chưa | ☐ |

## Ca bằng chứng

| ID | Ca | Mong đợi | Trạng thái |
|---|---|---|---|
| T004-1 | So số dư trước / sau (S004-1) | trùng khớp từng tài khoản × kỳ × chi nhánh | ☐ |
| T004-2 | Lane diagnostics trên `ketoan_test` tạo lại | DG-EVENT-4 = 100; DG-LEDGER-1..4 đạt | ☐ |
| T004-3 | `bash scripts/kiem-chuan.sh` + `selfcheck --strict` | SC-KERNEL-3 0 nợ, ĐẠT | ☐ |
| T004-4 | `npm test` đầy đủ | xanh, `assertLedgerInvariants` sau mọi tệp | ☐ |

## Log

| Thời điểm thật | Phiên | Việc |
|---|---|---|
| 2026-10-30 | Claude Code | Mở thư mục phase; trạng thái chụp từ bảng điểm (CSDL `ketoan_test`). |
