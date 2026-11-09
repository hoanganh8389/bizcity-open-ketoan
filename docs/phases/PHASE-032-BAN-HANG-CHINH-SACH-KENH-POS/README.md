# PHASE-032 — Bán hàng: chính sách bán hàng (CTKM) có phiên bản và kênh POS ghi sổ qua cửa nạp
<!-- [2026-11-09 10:38 AM Johnny Chu - Chu Hoàng Anh] PHASE-032 — chỉ đạo: giao Võ Hoàng (nhóm POS TGS) mở phase phần UI / UX, luồng, xử lý chi tiết của chính sách bán hàng trên nền PHASE-031; quy trình pull → phân tích → phase → bản mẫu duyệt → checklist → code trên nhánh PR (chưa duyệt nội dung) -->
<!-- [2026-11-09 09:30 PM Võ Hoàng] PHASE-032 — mở phase (W0 tài liệu + bản mẫu, chưa code): phần UI / UX, luồng, xử lý chi tiết của chính sách bán hàng trên nền PHASE-031; chờ chủ dự án duyệt (đóng góp) -->

> **Trạng thái:** 🟡 W0 đề xuất 2026-11-09 (tài liệu + bản mẫu) — **chờ chủ dự án duyệt bản mẫu và D032-\***, trả Q032-\*. **Code:** chưa.
> **Mức Kernel:** K0 — không sửa Kernel. Phần cần Core / Platform đi bằng **đề xuất bậc 4** (P032-\*), chủ dự án / nhóm Lõi làm hoặc giao.
> **Mục tiêu:** Lấp phần *Bán hàng* của PHASE-031 (S030-16 cho `modules/ban-hang`, S031-15, S031-16): người dùng **soạn, thử, phát hành, ngừng** chương trình khuyến mại bán hàng trên giao diện; POS (React, WordPress multisite TGS) **tải bản đã phát hành → tính → gửi đơn kèm `policyRefs`** qua cửa nạp; kế toán truy vết được *bút toán → chứng từ POS → CTKM@bản*.
> **Việc lộ trình:** S030-16 (`modules/ban-hang`), S031-15, S031-16
> **Checklist công bố:** —
> **Phụ thuộc:** PHASE-031 W1–W4 (đã vào `main`), W2b (đang làm, chủ dự án); S031-14 (kế toán trưởng chốt `reasonCode`); ADR-0024 (`modules/<key>/`).
> **Nguồn yêu cầu:** chủ dự án 09/11: *"anh mới tạo về nền phía dưới, rule, contract cái Registry Policy thôi, phần UI UX, flow, xử lý chi tiết cụ thể em làm nhé"*; quy trình *"pull về, phân tích tài liệu, tạo phase của em, về UI UX em yêu cầu tạo mockup trước, em duyệt ok, nó build checklist, code phase đó"*.
> **Người làm:** Võ Hoàng (nhóm POS TGS).

| Tệp | Nội dung |
|---|---|
| [00-MASTER-PLAN](00-MASTER-PLAN.md) | Vì sao, hiện trạng đọc mã, nguyên tắc, quyết định đề xuất D032-\*, câu hỏi Q032-\*, các đợt, đề xuất Core P032-\* |
| [10-THIET-KE](10-THIET-KE.md) | Luồng: soạn → thử → phát hành → ngừng; POS tải → tính → gửi; hoàn / đổi; ngoại tuyến; ánh xạ CTKM TGS → Rule Contract; quy tắc màn hình |
| [40-MASTER-CHECKLIST](40-MASTER-CHECKLIST.md) | Việc S032-\*, ca bằng chứng T032-\*, nhật ký |
| [mockups/ban-hang-chinh-sach.html](mockups/ban-hang-chinh-sach.html) | Bản mẫu 4 màn: Chương trình KM · Soạn & phát hành · Một chương trình (bản, so sánh, chứng từ) · Kênh POS |

## Trả lời ngắn

| Câu hỏi | Trả lời |
|---|---|
| Phase này làm gì mà PHASE-031 chưa làm? | Màn **soạn / phát hành / ngừng** CTKM (W4b của 031 chỉ xem), các Rule Contract bán hàng còn thiếu (`sale.promo.discount@1`, `sale.price_list@1`), luồng POS thật (S031-16) và việc chuyển CTKM đang chạy ở plugin `tgs_selling_policy` sang Registry |
| Có sửa Kernel / Platform không? | Không. Thiếu gì ở Core thì ghi đề xuất P032-\* (bậc 4, AGENTS.md "Cộng đồng mở rộng thế nào"), không vá trong PR của phase |
| Có chồng việc W2b đang làm không? | Không đụng `apps/api/src/modules/system/rule-contracts/**`, `policy.routes.ts`, `core/policies.ts` khi dòng W2b còn giữ chỗ. Rule Contract mới viết sau khi có điểm đăng ký (P032-1) |
| Màn đặt ở đâu? | `modules/ban-hang/web` (route `/app/ban-hang/chinh-sach`). Màn *Hệ thống → Chính sách* (HT15) của 031 giữ vai xem chung mọi miền; màn của phase này là nơi **sở hữu** chính sách bán |
| POS gửi gì? | Chứng từ `sale` / `sale_return` của `bizcity_ledger_intake@1` 1.6.0 kèm `policyRefs` + `lines[].policyRef` — không khuôn mới |
| Lưu là hiệu lực ngay? | Có, như `core.policy.publish` hiện nay (một bước). Bản nháp chỉ để soạn dở, không phải bước duyệt (D032-4) |

## Xong khi

- Người có quyền soạn, thử, phát hành, sửa (ra bản mới), ngừng CTKM loại *mua X tặng Y* và *giảm giá* trên màn, không gọi API tay.
- POS React và plugin TGS lấy chính sách từ Core, tính khớp 100 % ca chuẩn, gửi đơn kèm `policyRefs`; lệch hiện ở hàng việc *Chờ kế toán xem*.
- CTKM loại 1 / 2 / 5 / 10 đang chạy ở plugin đã chuyển sang Registry, chạy song song 1 tuần lệch 0 đơn; plugin thôi giữ luật riêng (đóng S031-16).
