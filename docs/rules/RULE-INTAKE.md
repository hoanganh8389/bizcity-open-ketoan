# RULE · Trạm tiền kiểm và bể chờ đầu vào (R-INTAKE)
<!-- [2026-11-02 02:38 PM Johnny Chu - Chu Hoàng Anh] ADR-0014 — luật định hướng: hướng dẫn trước, Kernel chặn sau; không vứt đầu vào, tiền kiểm đủ lớp, chấm điểm đầu vào -->
<!-- [2026-11-02 03:34 PM Johnny Chu - Chu Hoàng Anh] ADR-0014 — chủ duyệt: trạng thái Chấp nhận (chưa có mã); bảng điểm theo người lập cho mọi kế toán (Q3); kiểm bằng theo PHASE-021 -->

> **Cấp:** Tier 1 · **Trạng thái:** **Chấp nhận, chưa có mã** ([ADR-0014](../adr/ADR-0014-tram-tien-kiem-be-cho-dau-vao.md), chủ duyệt 2026-11-02). Luật có hiệu lực theo từng PR-I1…I5 của [PHASE-021](../phases/PHASE-021-TRAM-TIEN-KIEM-DAU-VAO/README.md). · **Phiên bản:** 0.1 · 2026-11-02 · **Chỉ mục:** [../00-CANON.md](../00-CANON.md)
> **Quan hệ:** đứng **trước** [R-EVENT](RULE-EVENT.md). R-EVENT giữ cửa nạp (chặn cứng); R-INTAKE giữ trải nghiệm trước cửa (hướng dẫn, phân tích, cảnh báo).

## Nguyên tắc một câu

**Kernel chặn, trạm tiền kiểm dạy.** Mọi chứng từ không qua được cửa nạp đều được giữ lại, giải thích bằng lời của kế toán, chấm điểm, và chỉ cách sửa. Nhưng không có đường nào vào sổ ngoài cửa nạp, và không có luật Kernel nào được nới.

## Luật

| Mã | Luật | Kiểm bằng |
|---|---|---|
| **R-INTAKE-1** | **Không vứt đầu vào.** Mọi lần nộp đã xác thực mà không đạt cửa nạp (khuôn, số học, danh mục, nghiệp vụ, chủ chứng từ) được lưu **nguyên văn** cùng chẩn đoán ở bể chờ `intake_inbox`. Không lưu: chưa xác thực, quá hạn mức, quá kích thước (chỉ lưu băm) | PHASE-021 PR-I2 (test cửa nạp từ chối → có mục bể) |
| **R-INTAKE-2** | **Bể chờ không phải sổ.** Mục bể không tạo bút toán, không phát sự kiện sổ, không thành sự việc nếu không đi qua `postDocumentIn`. Đầu vào chưa đạt khuôn **không** ghi vào `accounting_events` | PHASE-021 PR-I2 (grep: không `insertInto('accounting_events')` ngoài cửa nạp, R-EVENT-2) |
| **R-INTAKE-3** | **Tiền kiểm đủ lớp, không dừng ở lỗi đầu.** Chạy L1 khuôn → L2 số học → L3 danh mục → L4 nghiệp vụ → L5 định khoản thử, gom **mọi** phát hiện; lớp sau chạy khi đủ dữ liệu. L5 chỉ chạy khi không còn mức chặn | PHASE-021 PR-I1, PR-I5 |
| **R-INTAKE-4** | **Một bộ luật.** Tiền kiểm dùng chính zod của `packages/contracts`, chính `assertTotals`, chính tra danh mục và đường định khoản (chạy rồi huỷ, R-EVENT-11). Không viết bộ luật thứ hai; tiền kiểm chỉ khác cửa nạp ở chỗ **gom** thay vì ném lỗi đầu | PHASE-021 PR-I1 (test: mỗi mã `IN-*` chặn ⇔ cửa nạp từ chối cùng dữ liệu) |
| **R-INTAKE-5** | **Phát hiện có cấu trúc, viết cho người mới.** Mỗi phát hiện có `code` (`IN-*`), `severity` (`block` / `warn` / `hint`), `layer`, `path`, `got`, `expected`, `why` (vì sao kế toán cần), `fix` (sửa ở nguồn thế nào), `ref` (luật / căn cứ). Không đưa thông điệp thô của thư viện (zod, PostgreSQL) cho người dùng | PHASE-021 PR-I1 (test danh mục: mã nào cũng đủ trường) |
| **R-INTAKE-6** | **Hướng dẫn không nới luật.** Mức `block` chỉ hết khi dữ liệu đúng, không ai chấp nhận thay. Mức `warn` được chấp nhận có lý do, ghi người / lúc / lý do vào bằng chứng, chỉ vai trò được kế toán trưởng cho phép. Khi nộp, Kernel kiểm lại toàn bộ; kết quả tiền kiểm không phải giấy thông hành | PHASE-021 PR-I2, PR-I3 |
| **R-INTAKE-7** | **Nguyên văn bất biến.** `payload_raw` không sửa. Sửa tại bể = bản vá chỉ thêm (người, lúc, lý do); nộp lại dùng nguyên văn + các bản vá | PHASE-021 PR-I3 |
| **R-INTAKE-8** | **Ưu tiên sửa ở nguồn.** Nguồn gửi lại cùng `docKey` đạt → mục bể tự đóng. Sự việc sinh từ sửa tại bể mang dấu **lệch nguồn**, hiện trên bảng điểm và báo về nguồn (`bizcity.intake.resolved`) | PHASE-021 PR-I2, PR-I4 |
| **R-INTAKE-9** | **Thử không để lại dấu sổ.** Chế độ kiểm thử (`?dryRun=1`, nút Kiểm thử) không tạo sự việc, bút toán, sự kiện sổ; lần thử ở bể mang cờ `trial`, hạn giữ ngắn | PHASE-021 PR-I3 |
| **R-INTAKE-10** | **Đo chất lượng đầu vào.** Mỗi mục có điểm 0–100 (chặn = 0; cảnh báo trừ theo trọng số trong danh mục mã). Bảng điểm (mọi kế toán của đơn vị xem — công cụ đào tạo, ADR-0014 Q3): tỷ lệ đạt lần đầu, điểm theo nguồn / người lập / loại chứng từ, mục mở quá hạn, top mã lỗi, số lần sửa tại bể. Mục mở quá ngưỡng → `DG-INTAKE-1` | PHASE-021 PR-I4 |
| **R-INTAKE-11** | **Mã `IN-*` ổn định và có bài học.** Đổi nghĩa = cấp mã mới. Mỗi mã có trang `docs/huong-dan/loi-dau-vao/<mã>.md` (ví dụ sai, ví dụ đúng, vì sao). Phân hệ góp mã của mình qua danh mục, không tự đặt bể riêng | PHASE-021 PR-I1, PR-I4 (check: mã trong danh mục ⇔ có trang) |
| **R-INTAKE-12** | **Nguyên văn là dữ liệu nhạy cảm.** Bể có RLS theo đơn vị; nguyên văn không vào log, trace, sự kiện, webhook (chỉ mã và số); hết hạn giữ thì xoá (mục đóng 90 ngày, mục thử 7 ngày). Bảng điểm theo người lập hiện mã lỗi, điểm, số mục cho mọi kế toán; không hiện nguyên văn chứng từ của người khác ngoài quyền đọc chứng từ sẵn có | PHASE-021 PR-I2 |
| **R-INTAKE-13** | **Không tự sửa danh mục.** Lỗi lặp sinh **gợi ý** cấu hình (quy đổi ĐVT, ánh xạ mã hàng, lý do định khoản) để kế toán trưởng duyệt; trợ lý AI chỉ đọc chẩn đoán để giải thích, không nộp thay | PHASE-021 PR-I5 |

## Vòng đời một mục

| Trạng thái | Nghĩa | Ai đưa sang |
|---|---|---|
| `open` | bị từ chối ở cửa nạp, chờ sửa | hệ thống |
| `trial` | lần kiểm thử, không nộp | người lập |
| `resubmitted` | sửa tại bể rồi nộp lại, đã thành sự việc (`event_id`) | người lập / kế toán |
| `fixed_at_source` | nguồn gửi lại cùng `docKey` và đạt | hệ thống |
| `accepted` | chỉ còn cảnh báo, đã chấp nhận có lý do và nộp | vai trò được phép |
| `dismissed` | bỏ (gửi nhầm, trùng, nguồn huỷ) — có lý do | kế toán trưởng |

Sự việc đã nhận nhưng chưa ghi sổ (`accounting_events` `pending` / `error`) vẫn theo [R-EVENT](RULE-EVENT.md) và hiện trên cùng màn Trạm kiểm tra đầu vào.
