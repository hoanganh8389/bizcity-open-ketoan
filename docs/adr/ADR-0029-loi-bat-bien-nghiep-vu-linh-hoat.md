# ADR-0029 · Lõi bất biến, nghiệp vụ linh hoạt: Policy Flexibility · Document Finality · Ledger Immutability
<!-- [2026-11-06 03:51 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — ADR-0029: tôn chỉ cấp CANON "Linh hoạt trước khi ghi sổ, chặt chẽ tại thời điểm ghi sổ, bất biến với lịch sử đã xác lập"; ba chủ sở hữu Document / Authorization / Kernel; duyệt ≠ ghi sổ; hai lần đóng băng; cổng nhận sự việc; cầu nối Workflow ↔ PHASE-028 -->

- Trạng thái: **Chấp nhận về nguyên tắc** (chủ dự án yêu cầu đưa vào luật tối thượng, 2026-11-06). Thiết kế thi hành (§ Việc phải làm) là **đề xuất**, mỗi phần chốt bằng PR tài liệu của phase sở hữu trước khi code (R-FLOW).
- Nguồn: chủ dự án 2026-11-06 — *"Open Kế Toán: Lõi bất biến, nghiệp vụ linh hoạt … Linh hoạt trước khi ghi sổ. Chặt chẽ tại thời điểm ghi sổ. Bất biến đối với lịch sử đã xác lập … Document Contract sở hữu trạng thái và lịch sử chứng từ. Authorization Contract sở hữu quyền thực hiện hành động. Accounting Kernel sở hữu quyền quyết định và thực hiện ghi sổ."*
- Ngày: 2026-11-06 · Người quyết: Johnny Chu – Chu Hoàng Anh · Mức Kernel: K0 (tôn chỉ, luật); thi hành K1–K2 theo bảng việc ở cuối.
- Luật / hợp đồng liên quan: CANON §0.9 (mới), [R-WF](../rules/RULE-WORKFLOW.md) (sửa R-WF-3, R-WF-4; thêm R-WF-10..16), [`bizcity_document@1`](../contracts/BIZCITY-DOCUMENT-v1.md), [`bizcity_authorization@1`](../contracts/BIZCITY-AUTHORIZATION-v1.md) ([ADR-0027](ADR-0027-core-authorization-plugin-role-editor.md)), [`bizcity_ledger_intake@1`](../contracts/BIZCITY-LEDGER-INTAKE-v1.md), ECP-03 / ECP-05 / ECP-06 / ECP-09 / ECP-13 ([ADR-0028](ADR-0028-enterprise-continuity-nen-mong-doanh-nghiep.md)), LEAN-4.
- Bản kiến trúc và hướng dẫn dev: [architecture/LOI-BAT-BIEN-NGHIEP-VU-LINH-HOAT.md](../architecture/LOI-BAT-BIEN-NGHIEP-VU-LINH-HOAT.md). Rà hiện trạng: [PHASE-030 · 19](../phases/PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/19-RA-SOAT-DUYET-VA-GHI-SO.md).

## Bối cảnh

Mâu thuẫn lớn nhất khi dựng ERP: doanh nghiệp đổi chính sách liên tục (giá, chiết khấu, hạn mức, ngưỡng duyệt theo nhà cung cấp, khách, chi nhánh, chương trình, thời gian), nhưng sổ sách phải đúng và giữ được lịch sử. Bốn câu không thương lượng (CANON §1) và ADR-0021 / ADR-0028 đã khoá **phía sau** sổ: sổ chỉ thêm, sửa = đảo + ghi, mọi bút toán về chứng từ nguồn. Chưa có nguyên tắc nào nói về **phía trước** sổ, nơi sinh ra phần lớn sai sót và bút toán đảo thừa.

Rà mã 2026-11-06 ([PHASE-030 · 19](../phases/PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/19-RA-SOAT-DUYET-VA-GHI-SO.md)):

- **R-WF-3 viết "chỉ chuyển sang approved mới nộp sự việc"**, nên module hiểu *duyệt = ghi sổ*. Mua hàng gắn cứng điều này: `approveIn` → `postPurchase` → `postDocumentIn(…, { post: true, force: true })` (`apps/api/src/phan-he/mua-hang/posting.ts:87`). Trong khi đó đề nghị thanh toán ghi sổ lúc **chi**, không lúc duyệt.
- **Sửa phiếu đã duyệt phải bỏ duyệt.** Bỏ duyệt gọi `documentService.cancelIn` cho từng sự việc (`service.ts:226`), tức đảo **toàn bộ** bút toán. Duyệt lại ghi mới toàn bộ, dù Kernel biết giữ bút toán không đổi theo băm nội dung (`posting.service.ts:168-183`). Sửa một dòng ghi chú là hai lần đảo cộng một lần ghi; phiếu chi kèm theo đổi số mới.
- **Cổng Kernel không kiểm phía chứng từ.** Nó không biết chứng từ nguồn đã duyệt chưa, có phải đúng bản đã duyệt không. Cùng số phiên bản mà khác nội dung thì bị **bỏ qua im lặng** (`document.service.ts:397-399`).
- **Workflow và phân quyền chưa nối.** `core/workflow.ts` chỉ hỏi `auth.permissions.has(p)`; engine PHASE-028 (`authorize`, `explain`) đã merge nhưng không ai gọi. Không tài liệu PHASE-028 nào nhắc chứng từ / workflow, không tài liệu chứng từ nào nhắc PHASE-028.

## Quyết định

| Mã | Quyết định |
|---|---|
| **D-FIN-1** | **Tôn chỉ cấp CANON (§0.9): Lõi bất biến, nghiệp vụ linh hoạt.** *Linh hoạt trước khi ghi sổ. Chặt chẽ tại thời điểm ghi sổ. Bất biến đối với lịch sử đã xác lập.* Ba vế tương ứng ba nguyên tắc: **Policy Flexibility** · **Document Finality** · **Ledger Immutability**. Bốn câu không thương lượng (CANON §1) giữ nguyên; tôn chỉ này phủ giai đoạn trước sổ. |
| **D-FIN-2** | **Bốn tầng, mỗi tầng một tính chất.** (1) **Chính sách nghiệp vụ**: linh hoạt, nhiều phiên bản, theo đối tượng / chi nhánh / chương trình / thời gian, có phạm vi và ngày hiệu lực. (2) **Chứng từ và Workflow**: có vòng đời (tạo, sửa, kiểm, trình, duyệt, từ chối, hoàn tất), mỗi lần đổi nội dung là một phiên bản. (3) **Accounting Intake & Conformance**: cửa duy nhất biến nghiệp vụ đã xác lập thành sự việc kế toán chuẩn, có chứng từ nguồn và phiên bản. (4) **Accounting Kernel & Ledger**: ghi sổ kép, bảo toàn, kiểm chuẩn, không sửa / xoá lịch sử. |
| **D-FIN-3** | **Ba chủ sở hữu, không ai làm thay ai.** **Document Contract** (`bizcity_document@1`, Platform) sở hữu *trạng thái, phiên bản, chữ ký, liên kết, lịch sử* chứng từ. **Authorization Contract** (`bizcity_authorization@1`, PHASE-028) sở hữu *quyền thực hiện một hành động trên một chứng từ cụ thể*. **Accounting Kernel** sở hữu *quyết định nhận sự việc, định khoản và ghi sổ*. Module chỉ khai báo (workflow YAML, quyền trong manifest, chính sách, hàm kiểm, cách dựng sự việc); không tự viết logic duyệt, không tự quyết ghi sổ. |
| **D-FIN-4** | **Duyệt ≠ ghi sổ.** Mỗi loại chứng từ khai **điểm ghi nhận kế toán** của nó: chuyển trạng thái nào mang `ledger: true` (đã có ở `ledger[].on` của hợp đồng chứng từ). Có thể là duyệt (phiếu nhập mua), chi (đề nghị thanh toán), xác nhận tự động (POS), nhận hàng (chuyển kho), không bao giờ (báo giá, đơn đặt, yêu cầu mua). R-WF-3 sửa theo đó. |
| **D-FIN-5** | **Thay đổi trước ghi sổ là phiên bản chứng từ, không phát sinh bút toán đảo.** Thay đổi ảnh hưởng nghiệp vụ đã ghi sổ đi qua **điều chỉnh** (bản điều chỉnh, hai con trỏ *bản đang sửa / bản trên sổ*, [PHASE-030 · 16 §4](../phases/PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/16-CHUAN-CHUNG-TU-DUNG-CHUNG.md)) hoặc **đảo** có đủ lịch sử; Kernel chỉ đảo phần bút toán thực sự đổi. "Bỏ duyệt để sửa" không còn là đường sửa chứng từ đã ghi sổ. |
| **D-FIN-6** | **Hai lần đóng băng.** **Approval Freeze**: quyết định duyệt gắn với *một phiên bản và băm nội dung*; nội dung đổi sau duyệt → phiên bản mới, quyết định duyệt và chữ ký cũ không còn hiệu lực cho bản mới, phải duyệt lại theo chính sách. **Accounting Freeze**: phiên bản nộp sổ phải là phiên bản đã qua Approval Freeze (hoặc tự xác nhận theo thẩm quyền); sau khi ghi sổ, nội dung chỉ đổi qua điều chỉnh (D-FIN-5). Dùng năng lực sẵn có: `document_versions` (băm), `document_signatures` (gắn phiên bản), `accounting_event_versions`, `posting_log`. |
| **D-FIN-7** | **Cổng nhận sự việc chặt.** Kernel chỉ nhận một phiên bản khi: (a) chứng từ nguồn đang ở chuyển có `ledger: true` của loại đó; (b) băm phiên bản nộp khớp băm phiên bản đã đóng băng duyệt; (c) chính sách định khoản / hồ sơ kế toán có phiên bản tại ngày chứng từ (đã có); (d) kỳ mở (đã có). **Cùng phiên bản khác nội dung → từ chối có mã**, không bỏ qua im lặng; ghi đè bằng `force` phải lưu bản cũ. Thiếu điều kiện → sự việc vào bể chờ có mã (R-INTAKE), không mất. |
| **D-FIN-8** | **Cùng một chuẩn Workflow, không ép cùng một quy trình.** POS giao dịch lớn được **tự xác nhận** (actor `system:<luồng>`) khi quyền và chính sách cho phép, vẫn có bằng chứng và phiên bản; đề nghị thanh toán giá trị lớn hai cấp duyệt. *Số cấp và ngưỡng* là **chính sách có phiên bản** (Configuration & Policy, PHASE-029 E2 + PHASE-030 §5). *Ai được làm cấp đó trên chứng từ này* là **quyết định phân quyền** (PHASE-028). |
| **D-FIN-9** | **Cầu nối Document Workflow ↔ PHASE-028 là việc bắt buộc, chia chủ rõ.** Mỗi chuyển trạng thái gọi `authorize({ principal, permission, purpose, resource })`, trong đó `resource` là đầu phiếu nạp từ máy chủ (loại, chi nhánh, kho, tổ chức, người lập, ngày, trạng thái, số tiền, phiên bản), `purpose = 'approve'` cho chuyển duyệt, `'operate'` cho chuyển khác. Quyết định (mã lý do, `decisionId`, giải thích) ghi vào bằng chứng của chuyển. PHASE-028 cung cấp `authorize()` trên tài nguyên chứng từ thực và điều kiện SoD; Document Contract (PHASE-029 E4 / PHASE-030 DOC-030-*) dùng nó trong `transition()`; Kernel không gọi authz cho việc ghi sổ (quyền ghi sổ là quyền của chuyển có `ledger: true`). |
| **D-FIN-10** | **Bằng chứng bằng ca chạy, không bằng tài liệu** (D028-9). Bộ golden phải chứng minh: không vượt quyền, không bỏ qua duyệt, không đứt lịch sử, duyệt / sửa nhiều lần trước ghi sổ không sinh bút toán đảo, sửa sau ghi sổ chỉ đảo phần đổi. Kiểm chuẩn tuyến nguồn → sổ dùng lại bảng sẵn có (`document_versions`, `document_links`, `accounting_event_versions`, `posting_log`), không thêm kho dữ liệu (D028-13). |

## Hệ quả

**Được:**
- Doanh nghiệp đổi chính sách và sửa chứng từ thoải mái trước sổ mà không làm bẩn sổ.
- Số bút toán đảo chỉ còn là đảo thật: nghiệp vụ đã ghi bị điều chỉnh.
- Dev cộng đồng chỉ khai YAML + quyền + chính sách; nền tự giữ thẩm quyền, trạng thái, lịch sử.
- Kiểm toán đi được từ quyết định duyệt (ai, quyền nào, phiên bản nào) tới bút toán.

**Mất / chi phí:**
- Mua hàng phải đổi đường sửa phiếu đã duyệt: bỏ "bỏ duyệt để sửa", thay bằng bản điều chỉnh.
- Cổng Kernel thêm điều kiện, nên luồng kết nối / POS phải gửi kèm phiên bản và băm nguồn.
- Cầu nối authz phải đợi PHASE-028 W1 / W2 có kho vai trò.
- Một số câu chữ "duyệt = ghi sổ" trong tài liệu và giao diện phải sửa.

**Việc phải làm** (chủ sở hữu ghi trong ngoặc; chi tiết, mã việc và golden ở [PHASE-030 · 19](../phases/PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/19-RA-SOAT-DUYET-VA-GHI-SO.md)):

| Ưu tiên | Việc | Chủ |
|---|---|---|
| P0 | Sửa R-WF-3 / R-WF-4; khai điểm ghi nhận từng loại chứng từ | tài liệu này + R-WF |
| P0 | Rà luồng có `approve → ledger`, trước hết `purchase-document.workflow.yaml`: bỏ đảo / ghi lại khi chỉ sửa nội dung chưa ghi nhận | mua hàng (khi chuyển sang `modules/mua-hang`, ADR-0024) |
| P0 | Cổng Kernel theo D-FIN-7 (cùng phiên bản khác băm → từ chối; `force` lưu bản cũ; kiểm điểm ghi nhận + băm đã duyệt) | Kernel (PHASE-029 / nhóm Lõi, K2) |
| P1 | Approval Freeze / Accounting Freeze bằng SDK sẵn có | Document Contract |
| P1 | Golden: duyệt, từ chối, sửa trước / sau ghi sổ, đổi chính sách, chạy lại, đồng thời, phân quyền K1 / K2, thu hồi quyền, SoD, chữ ký theo phiên bản | Conformance (PHASE-030 S030-25) |
| P1 | Kiểm chuẩn tuyến nguồn → sổ trên bảng sẵn có | C6 Continuity |
| P1 | Cầu nối `transition()` → `authorize()` | PHASE-028 + Document Contract |
