# ADR-0019 · Hai cổng kiểm chuẩn: Gate A (danh mục → bản nháp) và Gate B (nghiệp vụ → bể chờ), một thư viện phát hiện, không chặn im lặng
<!-- [2026-11-02 11:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — ADR-0019: thống nhất Conformance Gate A (Master Data, trạng thái nháp) và Gate B (pre-posting, bể chờ ADR-0014) dưới năm nguyên tắc của chủ dự án; phản biện và giới hạn -->

- Trạng thái: **Chấp nhận** — chủ dự án 2026-11-02: *"đồng ý đề xuất của bro, code nhé"*. <!-- [2026-11-02 11:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — ADR-0019 chấp nhận -->
- Nguồn: trả lời chủ dự án 2026-11-02: *"rule của chúng ta có cơ chế: (1) trước khi vào event-driven, nếu conformance gate không đạt thì để trong pool buffer, thông báo lỗi cụ thể để người dùng sửa từ source; (2) Item master validator cũng vậy, cảnh báo, cho lưu nháp nhưng chưa ghi nhận… Cả 2 gate cần đạt: thư viện mã lỗi; không chặn silent; vào draft hoặc buffer; mockup UI UX dễ chịu cho dev dùng cùng AI; quy trình tường minh. Phản biện và thấy nên ghi vào rule, kiến trúc không?"*
- Ngày: 2026-11-02 · Người quyết: Johnny Chu – Chu Hoàng Anh · Mức Kernel: K0 (luật + kiến trúc); thi hành: Gate B theo PHASE-021 (đã chấp nhận, ADR-0014); Gate A theo PHASE-024 W1–W2 (K1 — thêm trạng thái `draft` cho danh mục).
- Luật mới: [R-GATE](../rules/RULE-GATE.md). Liên quan: [ADR-0014](ADR-0014-tram-tien-kiem-be-cho-dau-vao.md) / [R-INTAKE](../rules/RULE-INTAKE.md) (Gate B — đã có), [ADR-0017](ADR-0017-dinh-danh-hang-hoa-bat-bien.md), [ADR-0018](ADR-0018-danh-muc-co-phien-ban-toan-framework.md) (hạng thay đổi), [PHASE-023 · 20](../phases/PHASE-023-THE-TAI-KHOAN/20-VALIDATOR-MEM.md) (khung Vì sao), `bizcity_remedy@1`.

## Phản biện

**Đúng và nên ghi thành luật — nhưng một nửa đã là luật.** Gate B "pool buffer" chính là **bể chờ `intake_inbox`** của ADR-0014 (R-INTAKE-1 không vứt đầu vào, R-INTAKE-5 phát hiện có cấu trúc, R-INTAKE-8 ưu tiên sửa ở nguồn, R-INTAKE-11 mã ổn định có bài học) — chủ đã duyệt, PHASE-021 đang làm. Không dựng bể thứ hai. Phần **mới thật sự** là: (a) Gate A có **bản nháp** cho danh mục, (b) **một luật chung** cho cả hai cổng, (c) **một thư viện mã** thay vì bốn danh mục rời.

Năm chỗ cần sửa ý tưởng cho khỏi thành hại:

1. **"Cho lưu nháp" không được áp cho mọi cảnh báo mềm.** Nếu mọi mặt hàng có ⚠ đều thành nháp, POS gửi chứng từ có mã đó sẽ bị chặn ở Gate B (mặt hàng chưa kích hoạt) — một cảnh báo *mềm* biến thành *chặn* ở chỗ khác, đúng điều R-GATE-2 cấm. Cách đúng — **ba trạng thái theo mức**:
   - còn **✘ chặn** (dữ liệu chưa đúng) → **`draft`**: lưu được để sửa tiếp, **không** dùng được trên chứng từ;
   - chỉ còn **⚠** → **`active`** sau khi ghi lý do (D023-6, đã có mã) — dùng được ngay;
   - thay đổi **hạng 3** (đổi bản chất, ADR-0018) → **phiên bản nháp** của phân loại, chờ kế toán trưởng duyệt; phiên bản đang hiệu lực vẫn chạy.
2. **Bản nháp và bể chờ phải nối nhau, không đứng riêng.** Chứng từ tham chiếu mặt hàng còn nháp → Gate B giữ ở bể với `IN-ITEM-009` *"mặt hàng X còn nháp: thiếu …"* và nút mở thẻ nháp. Kích hoạt mặt hàng xong → các mục bể đang chờ nó được **kiểm lại tự động** (sự kiện `bizcity.masterdata.item.activated`). Người dùng thấy một chuỗi, không phải hai hàng đợi.
3. **Bể và nháp không được thành bãi rác.** Phải có chủ, tuổi và giới hạn: hạn giữ (R-INTAKE-12: 90 ngày mục đóng, 7 ngày lần thử), số đo tuổi mục cũ nhất, cảnh báo khi bể / nháp quá N mục hoặc quá X ngày, hiện trên Bàn đánh giá. Không báo cáo nào đọc từ bể / nháp (R-INTAKE-2).
4. **Ảnh "Gate B 8 bước" cần chỉnh hai bước** cho khớp Kernel: *Costing* trước commit chỉ là **kiểm điều kiện kho** (đủ tồn, kho thuộc chi nhánh, mặt hàng có theo dõi tồn) — giá vốn tính sau commit và ghi đè dòng chờ (ADR-0017 chuỗi chuẩn); *Ledger invariants* là trigger CSDL ở bước commit, tiền kiểm chỉ **định khoản thử** để báo sớm. Bước 8 *Commit Guard* là ý hay và **chưa có**: lưu băm phiên bản chính sách + danh mục lúc tiền kiểm, commit thấy khác thì chạy lại L3–L5 thay vì ghi theo kết quả cũ.
5. **"Thư viện mã lỗi" phải là một, không phải năm.** Hôm nay có `bizcity_errors@1` (HTTP), `bizcity_intake_findings@1` (`IN-*`), `bizcity_catalog_hint@1` (`ACC-HINT-*`…), mã tự chẩn đoán (`DG-*`, `INVENTORY_NEGATIVE`…), `bizcity_remedy@1`. Gộp **khuôn** về một hợp đồng `bizcity_findings@1` (mã, cổng, mức, tiêu đề, vì sao, cách sửa, luật gốc, học thêm, trạng thái duyệt) với **tiền tố theo cổng**; giữ mã cũ (R-INTAKE-11: đổi nghĩa = mã mới). Một trang tra mã cho người, một tệp máy đọc cho AI.

## Quyết định

1. **Hai cổng, một luật** — R-GATE-1…8 ([RULE-GATE](../rules/RULE-GATE.md)): mọi thao tác có thể ảnh hưởng kế toán đi qua **Gate A** (danh mục / cấu hình) hoặc **Gate B** (nghiệp vụ) trước khi được kích hoạt hay ghi sổ.
2. **Gate B = Trạm tiền kiểm + bể chờ của ADR-0014** (không đổi). Thêm: bước *Commit Guard* (băm cấu hình), `IN-ITEM-009`, kiểm lại tự động khi danh mục được kích hoạt.
3. **Gate A = khung Vì sao + trạng thái danh mục** `draft → active → retired`: ✘ còn lại → `draft` (không dùng được trên chứng từ); chỉ ⚠ → `active` có lý do; hạng 3 → phiên bản nháp chờ duyệt. Áp trước cho mặt hàng và đối tượng (hạng A của ADR-0018), sau cho chi nhánh / kho.
4. **Một thư viện phát hiện** `bizcity_findings@1`: khuôn chung + danh mục mã theo cổng (`IN-*`, `MD-*` / `ACC-HINT-*` / `PART-HINT-*`, `DG-*`); check SC-FIND-1 (mã duy nhất, đủ trường, `rule` có thật, mã chặn có `remedy`); trang `docs/huong-dan/ma-loi/` sinh từ tệp.
5. **Trải nghiệm cho dev dùng cùng AI**: mọi phản hồi của hai cổng là JSON cùng khuôn (mã, cổng, bước, `why`, `fix`, `learnMore`, `traceId`, link bể / nháp); `?dryRun=1` ở cả hai cổng; công cụ MCP đọc `core.findings.explain(code)` và `core.intake.get(inboxId)` để AI của dev đọc đúng nguồn, không đoán.

## Hệ quả

- Người dùng không gặp lỗi im lặng ở đâu: mọi thứ không qua được đều **ở một chỗ có tên** (bể chờ hoặc danh mục nháp) kèm mã, lý do, cách sửa.
- Cảnh báo mềm giữ đúng nghĩa mềm — không lan thành chặn ở cổng khác.
- Chi phí: trạng thái `draft` cho `items` / `partners` (K1), sự kiện kích hoạt + kiểm lại bể, hợp đồng findings gộp khuôn, một check. Gate B đã có kế hoạch (PHASE-021).

## Phương án đã cân nhắc

| Phương án | Vì sao không chọn |
|---|---|
| Mọi cảnh báo của danh mục → nháp | Cảnh báo mềm thành chặn ở Gate B; người dùng tắt cảnh báo bằng cách khai cho "đẹp" |
| Bể chờ riêng cho danh mục | Hai hàng đợi, hai màn, người dùng không thấy chuỗi; nháp ở chính danh mục rõ hơn |
| Giữ năm danh mục mã riêng | Dev / AI phải biết năm chỗ tra; khuôn lệch nhau; trùng mã không ai bắt |
| Chặn im lặng ở cổng (trả 400 chung chung) | Trái R-INTAKE-5 và nguyên tắc 2 của chủ dự án |
