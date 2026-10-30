# PHASE-004 — Một cửa ghi sổ: `eventStore.commit()`

> **Ký hiệu:** ☐ chưa làm · 🟡 có mã + test · ✅ có bằng chứng · ⛔ chờ chủ · ❌ huỷ.
> **Mức Kernel:** K2 (đổi đường ghi nội bộ, không đổi hợp đồng, không đổi kết quả sổ) → 2 người duyệt, 1 người hiểu nghiệp vụ ([RULE-KERNEL](../../rules/RULE-KERNEL.md)). Nếu W0 cho thấy phải đổi kết quả sổ thì lên K3 + ADR.

<!-- [2026-10-30] Mở thư mục phase theo chỉ đạo của chủ dự án (Johnny Chu – Chu Hoàng Anh). Kế hoạch dưới đây là đề xuất, chưa được chủ duyệt; chưa có dòng code nào của phase. -->

## 0. Vì sao có phase này

1. Câu không thương lượng số 3 ([AGENTS.md](../../../AGENTS.md)): mọi đầu vào tài chính đi một cửa. Hôm nay **4 dịch vụ trong Kernel** vẫn gọi thẳng `ledgerService.post / reverse` (nợ A-01, SC-KERNEL-3).
2. Sự việc nội bộ (kết chuyển, giá vốn) không mang `posted_version` như chứng từ nhận qua API: DG-EVENT-4 chỉ đạt 36,5%. Đó là lỗ hổng truy vết phiên bản (AP-5).
3. Đây là việc **chặn** nhiều phase sau:
   - PHASE-005 cần một chỗ để ghi `policy_version`;
   - PHASE-006 cần một chỗ để phát `bizcity.ledger.*`;
   - PHASE-009 cần một cửa cho công cụ ghi của AI;
   - PHASE-010: tách Kernel khi còn 4 đường ghi là mang nợ sang gói mới (PHASES "Thứ tự không được đảo" §1).
4. Ma trận tuân thủ: C-1 (67%) và C-7 (33%) đều có tín hiệu SC-KERNEL-3.

## 1. Hiện trạng đọc mã

Chi tiết từng dòng: [README §Hiện trạng](README.md). Tóm tắt:

| Dịch vụ | Gọi gì | Loại chứng từ | `posted_version` |
|---|---|---|---|
| `modules/vouchers/voucher.service.ts` | `post` (:190), `reverse` khi sửa (:295) | phiếu kế toán tay (`source_system = 'manual'`) | cần kiểm ở W0 |
| `modules/closing/closing.service.ts` | `reverse` (:242, 526, 722), `post` (:566, 749) | `closing`, kết chuyển lợi nhuận năm trước | thiếu (DG-EVENT-4) |
| `modules/assets/asset.service.ts` | `reverse` (:700), `post` (:752) | `depreciation`, phân bổ | có (:753) |
| `modules/inventory/costing.service.ts` | `reverse` (:503, 511), `overwriteCostPairs` (:584), `post` (:613) | `cogs` | thiếu (DG-EVENT-4) |

Cửa nạp `postDocumentIn` (`modules/documents/document.service.ts:244`) đã làm đủ chuỗi: nhận phiên bản → đảo bút toán của phiên bản cũ → định khoản → ghi → `posted_version` → `posting_log`. Bốn dịch vụ trên tự làm lại một phần chuỗi đó, mỗi nơi một kiểu.

## 2. Quyết định đề xuất D004-* (chờ chủ duyệt)

| # | Đề xuất | Lý do |
|---|---|---|
| D004-1 | Thêm **một** hàm Kernel `eventStore.commit(trx, auth, { docKey, version, docType, docNo, docDate, branchId, lines, accounts, reason })`. Hàm làm: ghi / nâng phiên bản sự việc, đảo bút toán hiệu lực của phiên bản cũ, ghi bút toán mới, đặt `posted_version`, ghi `posting_log`, ghi bằng chứng | gom chuỗi về một chỗ; `postDocumentIn` gọi lại nó ở bước ghi |
| D004-2 | Bốn dịch vụ gọi `eventStore.commit` thay cho `ledgerService`. **Không đổi kết quả sổ**: số dư từng tài khoản × kỳ × chi nhánh trước và sau phải trùng | K2, không cần ADR |
| D004-3 | Ngoại lệ `overwriteCostPairs` giữ nguyên trong danh sách đóng của RULE-LEDGER, gọi từ bên trong Kernel | ghi đè giá vốn là ngoại lệ có chủ, không phải đường ghi mới |
| D004-4 | Không migration, trừ khi W0 chỉ ra thiếu cột cho sự việc nội bộ; nếu cần thì tạo tệp mới số kế tiếp (R-DB-14..19) | migration đã phát hành là bất biến |
| D004-5 | Xong khi `DEBT_LEDGER_CALLERS` trong `kiem-chuan.sh` rỗng, SC-KERNEL-3 hết nợ (`--update-baseline`), DG-EVENT-4 = 100 | tín hiệu máy, không tự khai |

## 3. Câu hỏi Q004-* (cần chủ / kế toán trưởng chốt)

| # | Câu hỏi | Gợi ý |
|---|---|---|
| Q004-1 | Phiếu kế toán tay đi `postDocumentIn` đầy đủ (qua luật định khoản), hay `eventStore.commit` với dòng Nợ / Có do người lập? | `eventStore.commit`: định khoản của phiếu tay do kế toán quyết, không qua luật |
| Q004-2 | Kết chuyển lại / tính lại giá vốn tạo **phiên bản mới của cùng `docKey`**, hay `docKey` mới? | cùng `docKey`, `version + 1` (khớp STD-DOM-11; lịch sử phiên bản đọc được) |
| Q004-3 | 191 sự việc nội bộ cũ thiếu `posted_version`: điền bằng migration dữ liệu, hay để nguyên và chỉ áp cho sự việc mới? | điền bằng migration mới, có biên bản trước / sau (không đổi bút toán) |

## 4. Thứ tự đợt

| Đợt | Việc | Chặn bởi |
|---|---|---|
| W0 | Đo mốc số dư; phân loại DG-EVENT-2 (200) và DG-EVENT-4 (191) | — |
| W1 | `eventStore.commit()` + test riêng | D004-1 |
| W2 | Phiếu kế toán tay | Q004-1 |
| W3 | Khấu hao / phân bổ, kết chuyển | Q004-2 |
| W4 | Giá vốn (khó nhất: tính lại cả tháng, ghi đè cặp giá vốn) | W3 |
| W5 | Gỡ nợ, baseline, sửa RULE-LEDGER và CANON §5, dán khối bằng chứng | W4 |

## 5. Liên quan

RULE-LEDGER (ngoại lệ đóng danh sách) · RULE-KERNEL (K2) · STD-DOM-1, -2, -11 · AP-1, AP-5 · C-1, C-7 · audit A-01.
