# PHASE-004 · 40 — Master checklist

> Nguồn trạng thái **việc con** duy nhất của phase. "Xong" của việc lộ trình do bảng điểm tính, không do bảng này. Nhiều phiên: chỉ sửa đúng dòng theo ID; Log chỉ nối thêm.
> Ký hiệu: ☐ chưa làm · 🟡 có mã + test, chưa đủ tín hiệu · ✅ đủ tín hiệu / có bằng chứng · ⛔ chờ chủ hoặc người ngoài nhóm · ❌ huỷ.

<!-- [2026-10-30] Mở thư mục phase theo chỉ đạo của chủ dự án (Johnny Chu – Chu Hoàng Anh): "rà soát lại kiến trúc và checklist đã làm đến đâu … chia phase cụ thể theo từng folder phase". Trạng thái chụp từ bảng điểm cùng ngày (CSDL ketoan_test, đủ migration). -->
<!-- [2026-10-30] Chủ: "ok, code nhé" ⇒ code W0–W5. -->

| ID | Việc | Lộ trình / G | Code | Trạng thái |
|---|---|---|---|---|
| S004-1 | W0 · Công cụ chụp sổ `tools/so-du-moc.mjs` (gom theo loại chứng từ × ngày × tài khoản × đảo; sự việc theo loại × trạng thái) | 2.1 | có | ✅ dùng cho T004-1 |
| S004-2 | W0 · Phân loại DG-EVENT-2 và DG-EVENT-4 | 2.1 | có | ✅ DG-EVENT-2: 543 dòng đều là phiếu chuyển kho / điều chỉnh kho **tổng tiền 0**, chưa từng có bút toán (giá trị ghi ở phiếu giá vốn tháng) → không phải lỗi; diagnostic `EVENT_HAS_ENTRY` / DG-EVENT-2 bỏ qua nhóm này. DG-EVENT-4: 104 kết chuyển + 87 giá vốn chỉ thiếu `posted_version`, bút toán hiệu lực đúng phiên bản → điền bằng `0038` |
| S004-3 | W1 · `eventStore` (`apps/api/src/modules/documents/event-store.ts`): `lock`, `reverseActive`, `saveVersion`, `post`, `markPosted`, `cancel`, `overwriteCostPairs` | 2.1 | có | ✅ `test/event-store.test.ts` 3/3 (lần đầu, ghi lại, huỷ) |
| S004-4 | W2 · Phiếu kế toán tay + số dư đầu kỳ (`vouchers`) | 2.1 | có | ✅ |
| S004-5 | W3 · Khấu hao, phân bổ (`assets`) | 2.1 | có | ✅ |
| S004-6 | W3 · Kết chuyển tháng, kết chuyển lợi nhuận năm trước, huỷ chứng từ khoá cũ (`closing`) | 2.1 | có | ✅ nay có `posted_version` + `posting_log` |
| S004-7 | W4 · Giá vốn (`costing`); ngoại lệ ghi đè giá vốn đi `eventStore.overwriteCostPairs` | 2.1 | có | ✅ nay có `posted_version` + `posting_log` |
| S004-8 | W5 · `kiem-chuan.sh` bỏ danh sách miễn trừ, chặn mọi `ledgerService.*` ngoài `ledger/posting/documents`; SC-KERNEL-3 từ ratchet thành **block**; baseline 210 → 206 | 2.1 | có | ✅ |
| S004-9 | W5 · Migration `0038`: điền `posted_version` cho sự việc nội bộ cũ (Q004-3) | 2.1 | có | ✅ trên `ketoan_test`: 191 → 0 |
| S004-10 | W5 · Diagnostic: `EVENT_HAS_ENTRY` / DG-EVENT-2 bỏ phiếu kho tổng tiền 0; `INTERNAL_EVENT_VERSION` từ info thành **warn** (lệch = có đường ghi vòng qua cửa) | 2.1 | có | ✅ app + lane cùng sửa |
| S004-11 | W5 · Tài liệu: RULE-LEDGER R-LEDGER-4, AGENTS, CONTRIBUTING, PHASES 2.1, CONG-BO C-1 / C-7, COMPLIANCE, DIAGNOSTICS, RULE-EVENT, RULE-MODULE-BOUNDARY, 01-CORE-MODULES, REUSE-MAP, TARGET-LAYOUT, architecture, CHANGELOG | 2.1 | — | ✅ |

## Ca bằng chứng

| ID | Ca | Mong đợi | Trạng thái |
|---|---|---|---|
| T004-1 | Cùng 11 tệp test (phiếu tay, kết chuyển, giá vốn, khấu hao) chạy trên code cũ → CSDL `ketoan_moc_cu`, code mới → `ketoan_moc_moi`; so bằng `so-du-moc.mjs --diff` | trùng khớp | ✅ [evidence/T004-1-2026-10-30.md](evidence/T004-1-2026-10-30.md): **TRÙNG 194 ô sổ cái, 17 ô sự việc**; 117/117 test xanh cả hai bên |
| T004-2 | Lane diagnostics trên `ketoan_test` | DG-EVENT-4 = 100; DG-LEDGER-1..4 đạt | ✅ DG-EVENT-4 100 (355 dòng), DG-EVENT-2 100 (6.470), DG-LEDGER-1..4 100 (11.563 bút toán); điểm diagnostics 93,6 → 96,2 |
| T004-3 | `bash scripts/kiem-chuan.sh` + `selfcheck --strict` | SC-KERNEL-3 đạt (block), ĐẠT | ✅ ĐẠT cả hai; `--self-test` ĐẠT; ma trận tuân thủ 59% → 66% (C-1 đạt, C-7 33% → 67%) |
| T004-4 | `npm test` đầy đủ | xanh, `assertLedgerInvariants` sau mọi tệp | ✅ 89/89 tệp, 712/712 test (lần 2; lần 1 một worker tinypool tự thoát trên Windows, 711/712 chạy, 0 sai) |

## Log

| Thời điểm thật | Phiên | Việc |
|---|---|---|
| 2026-10-30 | Claude Code | Mở thư mục phase; trạng thái chụp từ bảng điểm (CSDL `ketoan_test`). |
| 2026-10-30 | Claude Code | Chủ "ok, code nhé" ⇒ D004-1…5 duyệt, Q004 theo gợi ý. W0–W5 có mã: `eventStore` + 4 dịch vụ chuyển sang; 0 lời gọi `ledgerService` ngoài `ledger/posting/documents`; typecheck sạch; T004-1 TRÙNG. Khác dự kiến: D004-1 thành chuỗi hàm thay vì một `commit()` (lý do ở 00 §đầu). Hành vi mới có chủ đích: kết chuyển và giá vốn nay ghi `posted_version` + `posting_log`; huỷ chứng từ khoá cũ / hết số cũng ghi `posting_log` "cancel". |
| 2026-10-30 | Claude Code | W5 xong: migration `0038` (191 → 0 trên `ketoan_test`), diagnostic phiếu kho tổng tiền 0, SC-KERNEL-3 block, baseline 210 → 206, tài liệu. T004-1…4 ✅. Lộ trình 2.1 done; Phase 2: 9/16. |
