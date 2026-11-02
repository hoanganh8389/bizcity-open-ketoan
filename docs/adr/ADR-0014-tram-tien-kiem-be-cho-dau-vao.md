# ADR-0014 · Trạm tiền kiểm và bể chờ đầu vào: hướng dẫn trước, Kernel chặn sau
<!-- [2026-11-02 02:38 PM Johnny Chu - Chu Hoàng Anh] ADR-0014 — đề xuất: không vứt đầu vào bị từ chối; bể chờ intake_inbox + tiền kiểm 5 lớp + chấm điểm đầu vào; Kernel giữ nguyên luật chặn -->

<!-- [2026-11-02 03:34 PM Johnny Chu - Chu Hoàng Anh] ADR-0014 — chủ duyệt: Q1 cho sửa tại bể + dấu lệch nguồn, Q2 hạn giữ 90 / 7 ngày, Q3 bảng điểm theo người lập hiện cho mọi kế toán (để đào tạo), Q4 thành PHASE-021 -->
- Trạng thái: **Chấp nhận** — chủ dự án (Johnny Chu) duyệt 2026-11-02. Quyết định Q1–Q4 ở cuối phần Hệ quả; kế hoạch thi hành: [PHASE-021](../phases/PHASE-021-TRAM-TIEN-KIEM-DAU-VAO/README.md). Chủ dự án yêu cầu 2026-11-02: "cần cơ chế theo dõi được danh sách các chứng từ để chặn, kiểu một bể buffer… để người dùng chủ động xem và sửa lại cho phù hợp với tiêu chuẩn đầu vào thay vì chặn cứng… đứng góc độ kế toán trưởng, kiểm soát, audit… chấm điểm đầu vào… nhân viên thực tập cũng hiểu và chỉnh sửa".
- Ngày: 2026-11-02 · Người quyết: Johnny Chu – Chu Hoàng Anh · Mức Kernel: **K0** cho ADR này (chưa đổi mã). Thi hành bọc cửa nạp: **K1** (không đổi luật định khoản, không đổi sổ).
- Luật / hợp đồng liên quan: bốn câu không thương lượng, R-EVENT-1, R-EVENT-7, R-EVENT-9, R-EVENT-11, ADR-0011 D5 (chủ chứng từ), R-MD (SKU_RULE, ĐVT), R-TEN, [`bizcity_ledger_intake@1`](../contracts/BIZCITY-LEDGER-INTAKE-v1.md), [`bizcity_errors@1`](../contracts/BIZCITY-ERRORS-v1.md), luật định hướng [RULE-INTAKE](../rules/RULE-INTAKE.md).

## Bối cảnh

Luồng năm bước của open-ketoan: **01** thu thập và chuẩn hoá → **02** kiểm tra, hạch toán nghiệp vụ → **03** định khoản (AccountResolver) → **04** ghi sổ PostgreSQL (ACID) → **05** sổ sách, báo cáo, đối chiếu. Kernel giữ bước 03–04 và **phải** chặn cứng. Bước 01–02 hiện cũng chỉ có một phản ứng: chặn.

Hiện trạng đọc từ mã (2026-11-02):

| Tầng | Chứng từ gặp lỗi gì | Hệ thống làm gì | Người dùng thấy gì |
|---|---|---|---|
| **A. Chưa thành sự việc** | sai khuôn (zod), tổng lệch dòng, sai chủ chứng từ (`docKey` không đúng tiền tố), phiên bản lùi | trả `400 VALIDATION_ERROR` / `409 CONFLICT`, **không lưu gì** (R-EVENT-7) | một thông báo trên màn hình hoặc trong log của hệ thống nguồn; tải lại trang là mất |
| **B. Đã là sự việc, chưa ghi sổ được** | thiếu cấu hình định khoản, thiếu ánh xạ, kỳ khoá… | `accounting_events.status = 'error'` + `error_message`; hoặc `pending` chờ duyệt | danh sách ở **Định khoản tự động (ACC14)** |

Khoảng trống nằm ở tầng A:

- **Không có dấu vết.** Kế toán trưởng không biết hôm qua hệ thống bán hàng gửi bao nhiêu phiếu bị từ chối, vì sao, của ai.
- **Thông báo viết cho máy.** Lỗi là danh sách trường của zod (`lines.2.qty: Expected number`), người mới đọc không hiểu.
- **Dừng ở lỗi đầu.** Kiểm khuôn sai thì chưa kiểm danh mục, chưa thử định khoản. Người dùng sửa xong một lỗi lại gặp lỗi kế tiếp, nên học bằng thử–sai rất chậm.
- **Không đo được chất lượng đầu vào.** Không có điểm theo nguồn, theo người lập, theo loại chứng từ.

### Phản biện: "`accounting_events` chứa toàn bộ sự kiện đầu vào"

Đồng ý **tinh thần**: không đầu vào nào bị mất dấu, mọi thứ đi theo khuôn sự kiện. Nhưng **không** nên ghi đầu vào chưa đạt khuôn vào `accounting_events`:

1. **Không xoá, không sửa được.** Migration `0049` khoá `accounting_events`: không `DELETE`, không đổi `doc_key` / nguồn / người lập, phiên bản không lùi. Một lần gửi sai `docKey` sẽ nằm vĩnh viễn trong bảng sự thật.
2. **Chiếm khoá tự nhiên.** `(tenant_id, doc_key)` là duy nhất (R-EVENT-3). Một bản gửi rác mang `docKey` của nguồn khác sẽ chiếm chỗ của chứng từ thật.
3. **Thiếu trường nền.** Chứng từ sai khuôn có thể thiếu chi nhánh, ngày, loại chứng từ. Đó là những trường mà kỳ kế toán, RLS, báo cáo và diagnostics (DG-EVENT-*) dựa vào.
4. **Sự thật phải sạch.** `accounting_events` là nguồn sự thật để kiểm toán. Trộn "đã nhận" với "gửi hỏng" làm mọi đối chiếu phải lọc thêm.

Vì vậy: **`accounting_events` chứa mọi sự việc đã đạt khuôn**, kể cả sự việc chưa định khoản được (tầng B, như hôm nay). **Đầu vào chưa đạt khuôn vào bể chờ riêng** (tầng A). Hai tầng hiện chung trên **một màn**, nên người dùng không phải biết bảng nào.

## Quyết định

### D1 · Hai tầng, một màn

- **Tầng A, bể chờ** (`intake_inbox`, bảng mới thuộc cửa nạp, không phải sổ) giữ đầu vào chưa thành sự việc.
- **Tầng B** giữ sự việc `pending` / `error` trong `accounting_events`, như hiện nay.
- Màn **Trạm kiểm tra đầu vào** (thay và gộp ACC14) dùng một vòng đời chung:

```
Nhận ──► Tiền kiểm ──┬─► Chặn (bể chờ, tầng A) ──► sửa ở nguồn / sửa tại bể ──► nộp lại ──┐
                     │                                                                 │
                     └─► Đạt khuôn ──► Sự việc (tầng B) ──► Chờ định khoản / Lỗi định khoản ──► Đã ghi sổ
                                                                                         └─► Bỏ (có lý do)
```

### D2 · Không vứt đầu vào

- Mọi lần nộp **đã xác thực** mà không đạt cửa nạp đều được lưu **nguyên văn** cùng chẩn đoán vào bể chờ. Cửa nạp ở đây gồm API, app ngoài tiến trình, connector, MCP và nhập lô.
- Phản hồi giữ **mã HTTP cũ** (400 / 409 / 422), nên bên tích hợp cũ không gãy. Phản hồi thêm `meta.intake = { id, score, findings[], url }`.
- Không lưu: yêu cầu chưa xác thực (401), quá hạn mức (429), thân quá giới hạn kích thước. Trường hợp cuối chỉ lưu băm và kích thước. Lý do là chống rác và chống dùng bể làm kho chứa.
- Form nhập tay trên giao diện đã kiểm trực tiếp từng ô, nên không cần bể. Form vẫn dùng chung bộ chẩn đoán để thông báo giống nhau.

### D3 · Tiền kiểm đủ năm lớp, không dừng ở lỗi đầu

| Lớp | Kiểm gì | Ví dụ mã |
|---|---|---|
| **L1 Khuôn** | trường bắt buộc, kiểu, định dạng ngày, `docType` có thật | `IN-SHAPE-*` |
| **L2 Số học** | tổng dòng = tổng chứng từ tới xu, thuế = cơ sở × thuế suất trong sai số làm tròn, số lượng × đơn giá | `IN-SUM-*` |
| **L3 Danh mục** | mã hàng đúng `SKU_RULE`, ĐVT có trong bảng quy đổi, đối tượng có MST hợp lệ, chi nhánh / kho tồn tại | `IN-MD-*` |
| **L4 Nghiệp vụ** | kỳ đã khoá, ngày ngoài khoá dữ liệu, chủ chứng từ (ADR-0011 D5), số hoá đơn trùng, phiên bản lùi | `IN-BIZ-*` |
| **L5 Định khoản thử** | chạy **đúng** đường định khoản của Kernel trong giao dịch rồi huỷ (R-EVENT-11): lý do định khoản, tài khoản tra được, Nợ = Có | `IN-POST-*` |

Mỗi phát hiện là một bản ghi có cấu trúc. Nó không phải một câu lỗi:

```json
{
  "code": "IN-MD-003",
  "severity": "block",
  "layer": "L3",
  "path": "lines[2].unit",
  "got": "thùng",
  "expected": "ĐVT khai cho mã hàng SP-0012: Hộp, Lốc",
  "why": "Kho tính tồn theo ĐVT cơ sở; ĐVT lạ thì không quy đổi được số lượng, tồn kho và giá vốn sẽ sai.",
  "fix": "Ở hệ thống bán hàng: chọn ĐVT đã khai cho mặt hàng, hoặc nhờ kế toán thêm quy đổi Thùng → Hộp ở Danh mục ĐVT.",
  "ref": "R-MD (ĐVT)",
  "autofix": null
}
```

- `severity` có ba mức. `block` (chặn) phải sửa. `warn` (cảnh báo) được chấp nhận có lý do (D4). `hint` (gợi ý) chỉ để học.
- Lớp sau vẫn chạy khi lớp trước có lỗi, nếu đủ dữ liệu để chạy. L5 chỉ chạy khi L1–L4 không còn mức chặn.

### D4 · Hướng dẫn không nới luật

- "Không khoá cứng" nghĩa là người dùng **thấy đủ, hiểu vì sao, sửa được, thử lại được**. Nó **không** có nghĩa là bỏ qua luật.
- Mức chặn chỉ hết khi dữ liệu đúng. Không ai chấp nhận thay được, kể cả chủ đơn vị.
- Mức cảnh báo được **chấp nhận có lý do**: hệ thống ghi người, lúc, lý do, bằng chứng. Kế toán trưởng cấu hình mã cảnh báo nào được chấp nhận và vai trò nào được chấp nhận. Ví dụ "giá lệch bảng giá > 10%" thì kế toán viên chấp nhận được.
- Khi nộp, Kernel **kiểm lại toàn bộ**. Kết quả tiền kiểm không phải giấy thông hành, nên bốn câu không thương lượng giữ nguyên.

### D5 · Hai đường sửa, ưu tiên sửa ở nguồn

- **(a) Sửa ở nguồn.** Hệ thống nguồn gửi lại cùng `docKey`, đạt thì mục bể **tự đóng** (`fixed_at_source`), liên kết theo `docKey` hoặc theo dấu vân tay nội dung. Đây là đường đúng: chứng từ gốc và sổ khớp nhau.
- **(b) Sửa tại bể.** Người dùng sửa trên màn, bản sửa là **bản vá chồng lên nguyên văn**: nguyên văn không đổi, mỗi lần sửa là một bản có người, lúc, lý do. Nộp lại đi **đúng** cửa `postDocumentIn`. Sự việc sinh ra mang dấu "sửa tại bể, lệch nguồn". Kế toán trưởng thấy dấu này trên bảng điểm, và nguồn nhận sự kiện để tự sửa (D8).

### D6 · Chế độ thử để học theo kiểu A/B

- Nút **Kiểm thử** trên màn, hoặc tham số `?dryRun=1` ở cửa nạp, trả đủ năm lớp chẩn đoán và bút toán dựng thử. Chế độ này **không** tạo sự việc, không tạo bút toán.
- Lần thử được lưu ở bể với cờ `trial`, hạn giữ ngắn. Màn **so sánh lần trước / lần này** cho thấy lỗi nào đã hết, lỗi nào mới xuất hiện, điểm tăng hay giảm. Người dùng sửa một trường, thử lại, và thấy ngay tác động.

### D7 · Chấm điểm đầu vào cho kế toán trưởng

- **Điểm chứng từ 0–100.** Có mức chặn thì trần là 0. Mỗi cảnh báo trừ theo trọng số của mã, gợi ý không trừ. Trọng số nằm ở danh mục mã `IN-*`, không viết trong mã.
- **Bảng kiểm soát**, chia theo nguồn, theo người lập, theo loại chứng từ, theo tuần:
  - tỷ lệ đạt lần đầu (first-pass rate);
  - điểm trung bình;
  - số mục mở, tuổi mục mở lâu nhất;
  - mười mã lỗi lặp nhiều nhất;
  - số lần sửa tại bể (lệch nguồn).
- **Ngưỡng cảnh báo:** kế toán trưởng đặt, ví dụ tỷ lệ đạt lần đầu < 90% hoặc mục mở quá 3 ngày. Diagnostics thêm `DG-INTAKE-1` cho mục mở quá hạn.

### D8 · Học và vòng phản hồi

- Mỗi mã `IN-*` có **trang bài học** (`docs/huong-dan/loi-dau-vao/<mã>.md`), mở ngay trên màn. Trang gồm ví dụ sai, ví dụ đúng, vì sao kế toán cần điều này.
- Lỗi lặp sinh **gợi ý cấu hình** cho kế toán trưởng duyệt, ví dụ thêm quy đổi ĐVT hay ánh xạ mã hàng. Hệ thống **không** tự sửa danh mục.
- Sự kiện `bizcity.intake.rejected` và `bizcity.intake.resolved` đi qua outbox. Hệ thống nguồn và app ngoài tiến trình nhận qua webhook để tự sửa ở nguồn. Dữ liệu sự kiện chỉ có mã, không có nguyên văn.
- Trợ lý AI đọc chẩn đoán để giải thích bằng lời. AI chỉ đọc (`expose.ai: read`), không nộp thay.

### D9 · Vai trò

| Vai trò | Làm được |
|---|---|
| Người lập, kể cả thực tập sinh (`documents:write`) | xem, sửa tại bể, kiểm thử, nộp lại mục **của mình** |
| Kế toán viên | như trên với mọi mục của đơn vị; **xem bảng điểm theo người lập** (Q3) |
| Kế toán trưởng (`documents:edit-all`) | chấp nhận cảnh báo, bỏ mục (có lý do), cấu hình ngưỡng và mã được chấp nhận |
| Người xem | chỉ đọc danh sách mục; không xem bảng điểm theo người |

Bảng điểm theo người lập hiện cho **mọi kế toán của đơn vị** (người có `documents:write`), theo quyết định Q3: bảng điểm là công cụ **đào tạo**, để mọi người thấy cùng một luồng và học từ lỗi của nhau. Bảng chỉ hiện mã lỗi, điểm, số mục; không hiện nguyên văn chứng từ của người khác ngoài quyền đọc chứng từ sẵn có.

Quyền riêng `intake:review` chờ registry quyền theo module (PHASES 3.3). Trước đó dùng `documents:edit-all`.

### D10 · Dữ liệu

Bảng `intake_inbox` thuộc cửa nạp Kernel (`modules/documents`). Đây không phải sổ, không có trigger sổ. Có RLS và `COMMENT ON` đầy đủ.

- Cột: `id`, `tenant_id`, `received_at`, `channel` (api / app / connector / mcp / batch / trial), `source_system`, `actor`, `doc_key` (có thể trống), `doc_type`, `version`, `payload_raw` (jsonb, **không sửa**), `payload_hash`, `patches` (jsonb, chỉ thêm), `findings` (jsonb), `score`, `attempt_no`, `status`, `event_id` (khi đã thành sự việc), `resolved_by`, `resolved_at`, `resolution_note`.
- Giá trị `status`: `open` · `trial` · `fixed_at_source` · `resubmitted` · `accepted` · `dismissed`.
- Hạn giữ: mục đã đóng giữ 90 ngày, mục `trial` giữ 7 ngày, rồi xoá. Đây là bảng duy nhất trong luồng chứng từ được xoá theo hạn, vì nó không phải sự thật kế toán. Khoá cấu hình `bizcity.intake.retention_days` khai trong registry.
- `accounting_events`, `0049`, luật định khoản giữ nguyên.

### D11 · Hợp đồng

- Hợp đồng mới `bizcity_intake_findings@1` gồm danh mục mã `IN-*` (mã, lớp, mức mặc định, trọng số, câu giải thích, cách sửa, căn cứ). Mã ổn định: đổi nghĩa thì cấp mã mới.
- `bizcity_ledger_intake@1` tăng minor: thêm `meta.intake` vào phản hồi lỗi. Thêm `GET /api/v1/intake/:id` và `GET /api/v1/intake?status=&source=`.
- `bizcity_errors@1` giữ nguyên mã HTTP. `VALIDATION_ERROR` có `details.findings` cùng khuôn.

## Hệ quả

**Được:**

- Không đầu vào nào mất dấu. Kế toán trưởng nhìn thấy và chấm điểm được chất lượng từng nguồn, từng người.
- Người mới học bằng thử–sai có hướng dẫn, thấy hết lỗi trong một lần.
- Nguồn nhận được phản hồi có cấu trúc để tự sửa.
- Kernel không nới một luật nào.

**Mất / rủi ro:**

- **Dung lượng và rác.** Giảm bằng ba cách: chỉ lưu yêu cầu đã xác thực, giới hạn kích thước, hạn giữ. Lần gửi trùng nguyên văn chỉ tăng `attempt_no`, không thêm dòng.
- **Dữ liệu cá nhân trong nguyên văn** như tên, số điện thoại khách. Giữ RLS và hạn giữ. Nguyên văn không vào log, trace hay sự kiện.
- **Sửa tại bể làm lệch nguồn.** Giảm bằng dấu lệch nguồn, chỉ số trên bảng điểm, và sự kiện gửi về nguồn. Chủ dự án có thể tắt đường (b) (câu hỏi Q1).
- **Thêm một bộ chẩn đoán cạnh Kernel.** Giảm bằng cách dùng **chính** zod của `packages/contracts`, chính `assertTotals`, chính đường định khoản thử. Không viết bộ luật thứ hai, chỉ gom kết quả thay vì ném lỗi đầu tiên.

**Việc phải làm** (lộ trình 2.17–2.21, chi tiết ở [PHASE-021](../phases/PHASE-021-TRAM-TIEN-KIEM-DAU-VAO/00-MASTER-PLAN.md); mỗi PR có bộ kiểm riêng):

| PR | Nội dung | Mức |
|---|---|---|
| PR-I1 | Hợp đồng `bizcity_intake_findings@1` + danh mục mã `IN-*` lớp L1–L4; hàm tiền kiểm gom lỗi, dùng zod / `assertTotals` / tra danh mục có sẵn; test từng mã | K0 |
| PR-I2 | Migration `intake_inbox`; cửa nạp lưu khi từ chối, `meta.intake`, `GET /intake`; tự đóng khi nguồn gửi lại đúng | K1 |
| PR-I3 | Màn **Trạm kiểm tra đầu vào** gộp ACC14; sửa tại bể (bản vá), kiểm thử, so sánh lần, nộp lại | K0 |
| PR-I4 | Bảng điểm kế toán trưởng, `DG-INTAKE-1`, sự kiện `bizcity.intake.*`, trang bài học cho từng mã | K0 |
| PR-I5 | L5 định khoản thử trong tiền kiểm; gợi ý cấu hình từ lỗi lặp; AI đọc chẩn đoán | K1 |

**Quyết định của chủ dự án (2026-11-02):**

- **Q1 — Sửa tại bể: có**, kèm dấu lệch nguồn (D5b, R-INTAKE-8).
- **Q2 — Hạn giữ: 90 ngày** cho mục đã đóng, **7 ngày** cho mục thử.
- **Q3 — Bảng điểm theo người lập hiện cho mọi kế toán** của đơn vị, không chỉ kế toán trưởng: "để bảo đảm theo đúng luồng… một cách để training cho người dùng hiểu logic của hệ thống". Đề xuất ban đầu (chỉ kế toán trưởng) không theo. D9, R-INTAKE-10, R-INTAKE-12 sửa theo.
- **Q4 — Phase riêng:** [PHASE-021 · Trạm tiền kiểm đầu vào](../phases/PHASE-021-TRAM-TIEN-KIEM-DAU-VAO/README.md); việc lộ trình 2.17–2.21 (Phase 2 của Standard: Document).

## Phương án đã cân nhắc

- **Ghi đầu vào hỏng vào `accounting_events` với trạng thái `rejected`:** bị loại vì bốn lý do ở phần Phản biện. Một câu: bảng sự thật không được chứa thứ chưa là sự thật.
- **Chỉ làm thông báo lỗi dễ đọc hơn, không lưu:** bị loại. Thông báo tốt hơn giải quyết được việc hiểu, nhưng không giải quyết được việc kiểm soát, chấm điểm và lần vết.
- **Cho kế toán trưởng "bỏ qua luật" ở mức chặn:** bị loại, vì trái bốn câu không thương lượng. Kernel không có cửa sau.
- **Đặt bể ở từng phân hệ:** bị loại. Mỗi phân hệ một kiểu bể thì kế toán trưởng không có một chỗ nhìn chung. Bể thuộc cửa nạp, phân hệ chỉ góp mã `IN-*` của mình qua danh mục.
