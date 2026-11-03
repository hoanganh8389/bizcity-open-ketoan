# RULE · Hai cổng kiểm chuẩn — Gate A (danh mục) và Gate B (nghiệp vụ) (R-GATE)
<!-- [2026-11-02 11:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — luật R-GATE theo ADR-0019: năm nguyên tắc của chủ dự án cho cả hai cổng; nháp / bể chờ; một thư viện phát hiện; không chặn im lặng -->

> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.
> **Cấp:** Tier 1 (R-GATE-2 là Tier 0 về trải nghiệm: không chặn im lặng) · **Trạng thái:** chấp nhận 2026-11-02 ([ADR-0019](../adr/ADR-0019-hai-cong-kiem-chuan-nhap-va-be-cho.md)); Gate B thi hành theo [R-INTAKE](RULE-INTAKE.md) (đã chấp nhận).
> Sơ đồ, trạng thái, bản mẫu: [PHASE-024 · 60](../phases/PHASE-024-ITEM-MASTER-PHAN-LOAI-HACH-TOAN/60-HAI-CONG-KIEM-CHUAN.md).

## Nguyên tắc một câu

**Không gì chạm sổ mà chưa qua cổng; không gì bị chặn mà không có tên, lý do và chỗ để sửa.**

## Hai cổng

| | **Gate A — Danh mục** | **Gate B — Nghiệp vụ (pre-posting)** |
|---|---|---|
| Canh | tạo / sửa / gộp / phân loại lại đối tượng, mặt hàng, tài khoản, lý do, nhóm hạch toán, chính sách | chứng từ từ POS / ERP / kho / plugin / người lập trước khi thành sự việc và ghi sổ |
| Không đạt → | **bản nháp** (`draft`) ở chính danh mục, hoặc **phiên bản nháp** chờ duyệt (hạng 3) | **bể chờ** `intake_inbox` (ADR-0014) |
| Mã | `ACC-*`, `PART-*`, `ITEM-*` / `MD-*` | `IN-*` |
| Có từ | khung Vì sao tài khoản / đối tượng (PHASE-023, 02/11); nháp: PHASE-024 W1 | thiết kế PHASE-021, đang làm |

## Luật

| Mã | Luật | Kiểm bằng |
|---|---|---|
| R-GATE-1 | **Hai cổng, không cửa phụ.** Mọi thao tác có thể ảnh hưởng kế toán đi Gate A hoặc Gate B trước khi kích hoạt / ghi sổ. Không route, script, plugin nào ghi danh mục hay sự việc mà bỏ qua cổng | SC-MOD-2, vai trò CSDL `mod_<key>_rw`, `ownDocument`; ca `CA-SEC-01` |
| R-GATE-2 | **Không chặn im lặng.** Mọi lần không đạt trả **mã + mức + vì sao + cách sửa + chỗ đang giữ** (bể / nháp, có id). Không trả lỗi chung chung, không bỏ qua, không tự sửa | SC-FIND-1 (mã chặn phải có `remedy`); test phản hồi từng cổng |
| R-GATE-3 | **Không vứt đầu vào, không mất bản khai.** Không đạt Gate B → bể chờ (R-INTAKE-1). Không đạt Gate A ở mức ✘ → lưu **nháp** để sửa tiếp; người dùng không phải gõ lại | test bể / nháp |
| R-GATE-4 | **Mức nào, hậu quả đó — không lan.** ✘ chặn = giữ lại (nháp / bể). ⚠ cảnh báo mềm = **qua cổng** khi có lý do (D023-6, R-INTAKE-6). ℹ / ▶ = không ảnh hưởng. Một ⚠ ở cổng này **không** được thành ✘ ở cổng kia | test `IN-ITEM-009` chỉ bắn với mặt hàng `draft`, không với `active` có ⚠ |
| R-GATE-5 | **Một thư viện phát hiện.** Mọi mã của hai cổng (và tự chẩn đoán) theo một khuôn `bizcity_findings@1`: `code`, `gate`, `level`, `title`, `why`, `fix` / `remedy`, `rule`, `learn`, `status` (nháp / đã duyệt). Mã ổn định; đổi nghĩa = mã mới. Có trang tra mã cho người, tệp máy đọc cho AI | SC-FIND-1, SC-CON-5 |
| R-GATE-6 | **Nháp và bể nối nhau.** Chứng từ tham chiếu danh mục `draft` → giữ ở bể với `IN-ITEM-009` / `IN-MD-*` kèm link nháp. Kích hoạt danh mục → mục bể đang chờ nó được kiểm lại tự động | test chuỗi kích hoạt → bể đóng / `resubmitted` |
| R-GATE-7 | **Có chủ, có tuổi, có giới hạn.** Bể và nháp có hạn giữ (R-INTAKE-12), số đo tuổi mục cũ nhất và số mục theo mã, cảnh báo khi quá ngưỡng, hiện trên Bàn đánh giá. Không báo cáo nào đọc từ bể / nháp | số đo `bizcity_intake_inbox_*`, `bizcity_catalog_drafts_*`; alert |
| R-GATE-8 | **Quy trình tường minh, thử được.** Mỗi cổng công bố bước của mình (Gate B: L1 khuôn → L2 số học → L3 danh mục → L4 nghiệp vụ → L5 định khoản thử → Commit Guard); mỗi phát hiện nói thuộc bước nào; cả hai cổng có `?dryRun=1`; kết quả mang `traceId` | `--dry-run` test; span theo bước |

## Thể hiện khi làm việc

| Ai | Thấy gì |
|---|---|
| Kế toán khai danh mục | khung Vì sao trong form; Ghi khi còn ✘ → "Lưu nháp" (chưa dùng được trên chứng từ, nêu thiếu gì); còn ⚠ → "Ghi (có n cảnh báo)" + lý do |
| Kế toán xử lý chứng từ | Trạm kiểm tra đầu vào: thẻ "Cần sửa" (bể) theo mã, nút sửa tại bể / mở nguồn / mở danh mục nháp liên quan |
| Dev plugin / AI của dev | phản hồi JSON cùng khuôn ở cả hai cổng, `inboxId` / `draftId` để tra lại; `dryRun`; công cụ MCP `core.findings.explain`, `core.intake.get`; trang tra mã |
| CEO / kế toán trưởng | Bàn đánh giá: số mục bể / nháp theo tuổi và mã, ai đang giữ |
