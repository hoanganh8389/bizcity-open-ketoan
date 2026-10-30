# PHASE-004 — Một cửa ghi sổ: `eventStore.commit()` cho phiếu tay, kết chuyển, khấu hao, giá vốn

> **Trạng thái:** ✅ code xong 2026-10-30 (W0–W5); sổ trước / sau trùng khớp (T004-1). Mở đường cho PHASE-005, 006, 009, 010
> **Giai đoạn:** Phase 2 của [PHASES](../../standard/PHASES.md) · **Code:** có · **Tiến độ tín hiệu (2026-10-30):** 0%
> **Mục tiêu:** Mọi bút toán đi một cửa trong Kernel: bốn dịch vụ nội bộ đang gọi thẳng `ledgerService` chuyển sang `eventStore.commit()`; sự việc nội bộ có phiên bản như chứng từ nhận qua API.
> **Việc lộ trình:** 2.1
> **Checklist công bố:** —
> **Tuân thủ / nguyên tắc:** C-1, C-7 · AP-1, AP-5
> **Phụ thuộc phase:** 003 (xong)

<!-- [2026-10-30] Mở thư mục phase theo chỉ đạo của chủ dự án (Johnny Chu – Chu Hoàng Anh): "rà soát lại kiến trúc và checklist đã làm đến đâu … chia phase cụ thể theo từng folder phase". Trạng thái chụp từ bảng điểm cùng ngày (CSDL ketoan_test, đủ migration). -->

| Tài liệu | Một câu |
|---|---|
| [00-MASTER-PLAN](00-MASTER-PLAN.md) | vì sao · sự thật đọc mã · quyết định đề xuất D004-* · câu hỏi Q004-* · đợt W0–W5 |
| [40-MASTER-CHECKLIST](40-MASTER-CHECKLIST.md) | nguồn trạng thái việc con duy nhất của phase + ca bằng chứng + log |
| [70-REFLECT-003](70-REFLECT-003.md) | phản tư PHASE-003 + sổ nợ chuyển sang |
| [evidence/](evidence/README.md) · [tools/](tools/README.md) | theo khuôn phase |

## Hiện trạng đọc mã

| # | Sự thật | Ở đâu |
|---|---|---|
| F1 | Bốn dịch vụ gọi thẳng `ledgerService` ngoài cửa nạp | `modules/vouchers/voucher.service.ts:190, 295` · `modules/closing/closing.service.ts:242, 526, 566, 722, 749` · `modules/assets/asset.service.ts:700, 752` · `modules/inventory/costing.service.ts:503, 511, 584, 613` |
| F2 | Nợ SC-KERNEL-3 (A-01) đúng 4 dòng; `kiem-chuan.sh` miễn trừ qua `DEBT_LEDGER_CALLERS` | `tests/conformance/baseline.json`, `scripts/kiem-chuan.sh:17` |
| F3 | Cửa nạp hiện có làm đủ: phiên bản, đảo bản cũ, `posted_version`, `posting_log` | `modules/documents/document.service.ts:244` (`postDocumentIn`) |
| F4 | Sự việc nội bộ (`closing`, `cogs`, `depreciation`) thiếu `posted_version`: DG-EVENT-4 36,5% (191 dòng); khấu hao có đặt, kết chuyển và giá vốn chưa | `modules/ledger/ledger.diagnostics.ts:17`, `modules/assets/asset.service.ts:753` |
| F5 | Giá vốn dùng `overwriteCostPairs` (ngoại lệ ghi đè giá vốn của RULE-LEDGER); phải giữ đúng ngoại lệ đóng danh sách | `modules/inventory/costing.service.ts:584`, `docs/rules/RULE-LEDGER.md` |
| F6 | DG-EVENT-2: 200 sự việc posted chưa thấy bút toán hiệu lực của đúng phiên bản trên `ketoan_test`; chưa phân loại (dữ liệu test hay lỗi thật) | lane diagnostics |

## Xong khi

Phase xong khi mọi việc lộ trình ở trên **done** trên bảng điểm (`node tests/conformance/selfcheck.mjs`, tín hiệu ở [roadmap.json](../../standard/roadmap.json)) và mọi mã checklist công bố chuyển **có** trong [Bản công bố §6](../../CONG-BO-KIEN-TRUC.md). Trạng thái hôm nay: 2.1 ☐.
