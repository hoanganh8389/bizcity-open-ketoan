# PHASE-035 — Thiết lập nhanh: cài mới là có công ty mẫu, báo cáo lên số ngay
<!-- [2026-11-10 11:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-035 — W0: đề bài chủ dự án 2026-11-10 — cài mới / image mới trên CSDL trống tự nạp dữ liệu mẫu đủ các phân hệ; hộp thoại thiết lập nhanh vài bước khi thấy đơn vị trắng; chống mất dữ liệu (quay về gốc, nâng cấp, sao lưu) -->

> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.
> **Việc lộ trình:** — (mở rộng `bizcity_preset@1`, PHASE-030 S030-53 bộ giả lập `db/seeds`)
> **Phân hệ:** he-thong <!-- [2026-11-11 04:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-035 — B1: dòng Phân hệ (R-FLOW-10) cho HT11 -->
> **Checklist công bố:** —
> **Trạng thái:** 🟡 **W0 đề xuất 2026-11-10** — chờ chủ dự án duyệt D035-1..12, trả Q035-1..6; chưa giữ chỗ code.
> **Tệp:** [00 — Kế hoạch & thiết kế](00-MASTER-PLAN.md) · [40 — Checklist](40-MASTER-CHECKLIST.md) · [Bản mẫu hộp thoại](mockups/thiet-lap-nhanh.html)

## Đề bài (chủ dự án, 2026-11-10)

1. **Dữ liệu mẫu là để cài mới.** Cài mới hoặc dựng image mới trên CSDL **chưa có dữ liệu** thì tự nạp bộ mẫu gần đủ. Bộ mẫu gồm cấu hình, hệ thống tài khoản, tài khoản ngầm định, danh mục, đối tượng, và nghiệp vụ mẫu: mua hàng, nhập kho, thu chi, công nợ, bán hàng… Mục tiêu là báo cáo quản trị và báo cáo thuế mẫu lên được số, để người dùng dễ tiếp cận (*smallwin*). Dữ liệu mẫu và thư viện đặt theo mục tiêu này.
2. **Thấy đơn vị trắng thì mở hộp thoại thiết lập nhanh.** Hộp thoại chỉ vài bước, giúp kế toán tự nạp toàn bộ cấu hình và dữ liệu mẫu để thấy các báo cáo mẫu cần dùng.
3. **Chống mất dữ liệu.** Nút *Quay về dữ liệu gốc* dễ làm mất dữ liệu của khách. Nâng cấp image phải cảnh báo việc mất dữ liệu và có phương án sao lưu. Hướng dẫn sao lưu SQL đang chưa rõ.

## Trả lời ngắn

| Câu hỏi | Trả lời | Ở đâu |
|---|---|---|
| Hôm nay cài mới có gì? | Đơn vị `demo` có hệ thống tài khoản, gói định khoản nền, chi nhánh `CN01`, **không có chứng từ nào**. Màn Tổng quan toàn "—". Preset `thuong-mai-ban-le` (3 chứng từ) chỉ chạy tay bằng `cai-preset.mjs`. Danh mục trong `db/seeds` chỉ vào đơn vị khi bấm Quay về gốc (TI08) | [00 §1](00-MASTER-PLAN.md) |
| Dữ liệu mẫu nằm ở đâu? | Trong một **đơn vị mẫu riêng** ("Công ty mẫu"), không trộn vào đơn vị thật. Lý do: sổ chỉ thêm, chứng từ mẫu một khi đã ghi thì không xoá được; huỷ bằng bút toán đảo vẫn để lại vết trên sổ thật và tờ khai thuế | D035-2, Q035-1 |
| Cài mới thì sao? | Job `db-migrate` tạo đơn vị mẫu và nạp gói mẫu **khi CSDL trống** (biến `BIZCITY_SAMPLE`, mặc định bật ở `cai-nhanh.sh`). Đơn vị đã có chứng từ thì không bao giờ nạp | D035-3, D035-4 |
| Hộp thoại thiết lập nhanh làm gì? | Bốn bước: **Bắt đầu** (xem công ty mẫu / thiết lập công ty của mình) → **Công ty** (tên, MST, năm tài chính, ngành) → **Nạp gì** (gói cấu hình, danh mục, nghiệp vụ mẫu; xem trước số dòng và báo cáo sẽ lên số) → **Đang nạp / Xong** (tiến độ từng bước, bấm mở từng báo cáo) | [00 §4](00-MASTER-PLAN.md), [bản mẫu](mockups/thiet-lap-nhanh.html) |
| Nghiệp vụ mẫu đi đường nào? | Qua **cửa nạp** (`POST /api/v1/documents` → luật định khoản → sổ), giống chứng từ thật; thu chi lẻ, số dư đầu kỳ, tài sản qua API Core sẵn có. Không ghi thẳng bảng sổ, không viết số tài khoản (STD-PRE-3, STD-PRE-7) | D035-6 |
| Báo cáo nào phải lên số? | 18 báo cáo đích: B01, B02, B03, cân đối phát sinh, sổ cái, công nợ, tuổi nợ, nhập xuất tồn, sổ quỹ, bán hàng, lãi gộp, tờ khai GTGT, bảng kê mua vào / bán ra, tài sản – khấu hao… Mỗi báo cáo có ca kiểm "khác rỗng và khớp sổ" | [00 §5](00-MASTER-PLAN.md) |
| Quay về dữ liệu gốc có còn nguy hiểm? | Bắt **xem trước** (thêm / sửa / đổi mã / xoá / khoá bao nhiêu), **tự sao lưu** các bảng danh mục trước khi ghi, **chặn** khi tệp gốc là bộ giả lập mà đơn vị đã có chứng từ thật | D035-9 |
| Nâng cấp image và sao lưu? | `cap-nhat.sh` kiểm bản sao lưu đọc lại được trước khi nâng cấp, in rõ cái gì có thể mất và cách lùi; tài liệu vận hành sao lưu – khôi phục (khôi phục thử vào CSDL tạm trước khi ghi đè) | D035-10, D035-11 |
| Làm theo thứ tự nào? | **Bước thắng nhỏ**, mỗi bước một PR: B1 phát hiện đơn vị trắng + biểu ngữ → B2 nạp preset từ máy chủ → B3 hộp thoại → B4 gói mẫu đủ phân hệ → B5 tự nạp khi cài mới → B6 chống mất dữ liệu → B7 nghiệm thu 18 báo cáo | [00 §7](00-MASTER-PLAN.md) |
