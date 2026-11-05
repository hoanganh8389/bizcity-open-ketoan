# CANON — Chỉ mục luật BizCity Ledger Framework
<!-- [2026-11-03 08:05 PM Johnny Chu - Chu Hoàng Anh] SC-DOC-4 — sửa tham chiếu đường dẫn lỗi thời sau khi tách Kernel / Platform (mã đã dời; gói đích chưa tách ghi rõ "chưa tách") -->
<!-- [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn. -->
<!-- [2026-10-29 10:39 PM Johnny Chu - Chu Hoàng Anh] PHASE-001 — chuẩn MCP, gói định khoản theo ngành, kết nối Cell. -->
<!-- [2026-10-29 10:52 PM Johnny Chu - Chu Hoàng Anh] PHASE-001 — luật phát hành, thay đổi Kernel, bảo mật, tự chẩn đoán. -->
<!-- [2026-10-29 11:31 PM Johnny Chu - Chu Hoàng Anh] PHASE-001 — lộ trình máy đọc bám Phase, ma trận mảng × Phase. -->
<!-- [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk. -->
<!-- [2026-10-30 10:29 AM Johnny Chu - Chu Hoàng Anh] PHASE-003 — tự chẩn đoán L1 / L3, diagnostic_runs, khoá kỳ chặn khi sổ lỗi (PHASES 2.10). -->
<!-- [2026-10-30 12:10 PM Johnny Chu - Chu Hoàng Anh] ADR-0007 — chuẩn hoá mã lỗi, quan sát, bộ giám sát, cài nhanh, kiến trúc, đóng góp. -->
<!-- [2026-10-30 12:50 PM Johnny Chu - Chu Hoàng Anh] CONG-BO — bản công bố kiến trúc: 4 lớp hợp đồng, luật hạ tầng, checklist nhận việc. -->
<!-- [2026-10-30 01:11 PM Johnny Chu - Chu Hoàng Anh] CONG-BO — tuyên bố tối thượng, 7 nguyên tắc AP, ba lớp kiểm soát, ma trận tuân thủ, kiểm nâng cấp migration. -->
<!-- [2026-10-30 01:37 PM Johnny Chu - Chu Hoàng Anh] AUDIT — đánh giá kiến trúc 2026-10-30, mục lục phase. -->
<!-- [2026-10-31 04:04 PM Johnny Chu - Chu Hoàng Anh] R-REV — thêm R-REV: rà soát việc của người đóng góp (phân vai, PR, biên bản, dữ liệu kế toán, mã hàng). -->
<!-- [2026-11-01 04:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — §5: core/errors.ts, core/http.ts nay ở packages/platform -->

> **Tệp này:** một trang liệt kê **mọi** luật và hợp đồng đang chi phối lõi. Không lặp nội dung luật — chỉ mã, cấp, nơi kiểm.
> **Dùng khi:** sửa lõi → tra bảng §4 để biết phải sửa tài liệu / hợp đồng nào **trong cùng PR**.
> **Phiên bản:** 1.1 · 2026-10-29 · **Người giữ:** nhóm Lõi (CODEOWNERS `/docs/00-CANON.md`)
> **Hai lớp chuẩn:** luật `R-*` dưới đây giữ **Kernel** (sổ cái). Luật `STD-*` của [Bizcity Framework Standard v1](standard/README.md) giữ **module** (7 hợp đồng, bộ kiểm cài đặt). Module tuân `STD-*`; nhờ SDK nó tự tuân `R-*`.

<!-- [2026-11-03 01:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — ADR-0020 tôn chỉ Core -->
## 0. Tôn chỉ ([ADR-0020](adr/ADR-0020-ton-chi-core-nguoi-dung-quyet-dinh-mot-ngon-ngu-ma.md))

**Người dùng là người quyết định và thao tác.** Core không tự sửa dữ liệu thay họ, cũng không âm thầm chặn. Việc của Core là làm cho vấn đề **nhìn thấy được và chỉ đúng chỗ sửa**, bằng các công cụ:

| Công cụ | Trả lời câu hỏi |
|---|---|
| Gate A (khung Vì sao, nháp) | Khai báo danh mục này thiếu / sai gì |
| Gate B (trạm tiền kiểm, bể chờ) | Chứng từ này vì sao chưa vào sổ |
| Check / tự chẩn đoán / kiểm chuẩn | Sổ đang lệch ở đâu |
| Sổ tay module nghiệp vụ, trang bài học | Vì sao phải làm vậy, làm thế nào |
| Debug / trace | Lỗi xảy ra ở bước nào |

Mọi công cụ trên phải nói **cùng một ngôn ngữ**, và ngôn ngữ đó là **thư viện mã** (`bizcity_findings@1`). Một vấn đề có một mã. Mã đó mang vì sao, cách sửa, chỗ sửa (màn / bước) và **căn cứ** ([danh mục văn bản](can-cu/01-danh-muc-van-ban.md)). Thông báo, dải nhắc, lỗi API, trang bài học đều sinh ra từ mã, không ai viết câu chữ riêng.

Hệ quả bắt buộc: mặc định cho phép, nhắc khi sai (R-GATE-9); mọi lời Core nói ra bắt đầu từ thư viện mã (R-GATE-10); mỗi mã có căn cứ (R-GATE-11); Core không mã hoá quy trình theo chức danh — ai làm gì là việc của phân quyền.

<!-- [2026-11-03 06:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-025 — ADR-0021 Accounting Continuity -->
### 0.1 Ba trụ cột (đề xuất — [ADR-0021](adr/ADR-0021-accounting-continuity-lien-tuc-ke-toan.md))

| Trụ cột | Bảo đảm | Luật |
|---|---|---|
| I · Sổ cái bất biến | sổ chỉ thêm; sửa = đảo + ghi mới; Nợ = Có | R-LEDGER, §1 |
| II · Định danh bất biến, mã có phiên bản | `item_id` không đổi; mã hàng, hệ thống tài khoản, chính sách có phiên bản + ngày hiệu lực — đổi thông tư không làm lại dữ liệu | R-ITEM, ADR-0017 / 0018 / 0009 |
| III · Liên tục kế toán (Accounting Continuity) | mọi con số đi ngược được về nghiệp vụ gốc qua mua → kho → bán → giá vốn → lãi lỗ; lineage giá vốn là sổ thứ hai; kiểm chuẩn vòng đời (Gate C); khoá kỳ đòi chuỗi lành | R-CONT |

<!-- [2026-11-04 02:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-026 — ADR-0022: nền móng + bảng tám trụ cột; mức đạt hiện ở HT10 -->
### 0.2 Nền móng và bảng trụ cột (đề xuất — [ADR-0022](adr/ADR-0022-quan-tri-du-lieu-goc-nen-mong.md))

**Nền móng (tầng 0): Quản trị dữ liệu gốc** — thiết lập một lần hệ thống định danh và nguyên tắc đúng (Identity Continuity · Organizational & Accounting Consistency · Versioning theo phiên bản + ngày hiệu lực) để hàng triệu mã, hàng trăm cửa hàng, nhiều pháp nhân và mọi module dùng chung một dòng dữ liệu kế toán. Ba trụ cột I–III đứng trên nền đó; Accounting Continuity & Lineage là **cam kết** mọi trụ cột phải bảo vệ.

| Trụ cột | Bảo đảm | Luật |
|---|---|---|
| IV · Một cửa nạp, các cổng kiểm chuẩn, một ngôn ngữ mã | mọi đầu vào đi một cửa; Gate A / B / C; thông báo từ thư viện mã có căn cứ; mặc định cho phép, nhắc khi sai | R-EVENT, R-GATE, ADR-0019 / 0020 |
| V · Chính sách và chế độ kế toán có phiên bản | đổi thông tư, luật định khoản, phương pháp tính giá = phiên bản từ ngày hiệu lực | ADR-0009, R-POST |
| VI · Bằng chứng và quan sát được | nhật ký chuỗi băm; tự chẩn đoán; Lịch sử · Tác động · tiến độ hiện trên màn | STD-EVD, R-DIAG |
| VII · Cô lập đơn vị và phân quyền | RLS theo đơn vị; phân quyền theo quyền, không theo chức danh; nhóm đơn vị không lẫn số | R-SEC, ADR-0020 |
| VIII · Mở rộng bằng module, kiểm chuẩn tự động | SDK / manifest / năng lực; bộ kiểm chuẩn; Golden Tests là cổng phát hành | R-MOD, R-QG |

Mức đạt từng tiêu chí: `docs/standard/tru-cot.json` → màn **HT10 Trụ cột & mức đạt** và thẻ **Trụ cột** ở trang chủ mỗi phân hệ; đi theo bằng chứng, không tích tay (R-CONT-7).

<!-- [2026-11-05 09:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-029 — ADR-0028 Enterprise Continuity: §0.3 ECP-01..13, §0.4 bốn nhóm nền móng, §0.5 mô hình nhất quán, §0.6 sáu thao tác vòng đời -->
### 0.3 Mười ba nguyên tắc bất biến Enterprise Continuity (chấp nhận về nguyên tắc — [ADR-0028](adr/ADR-0028-enterprise-continuity-nen-mong-doanh-nghiep.md), luật [R-ECP](rules/RULE-ENTERPRISE-CONTINUITY.md))

Tầng nguyên tắc cao nhất của Core, đứng trên Accounting Continuity (ADR-0021) và Quản trị dữ liệu gốc (ADR-0022), **tham chiếu** chứ không thay; nằm cạnh AP-1..AP-7 ([CONG-BO-KIEN-TRUC](CONG-BO-KIEN-TRUC.md) §1).

| Mã | Nguyên tắc bất biến |
|---|---|
| ECP-01 | Mã nghiệp vụ thay đổi được, nhưng định danh chuẩn không được tái sử dụng hoặc thay đổi tuỳ tiện |
| ECP-02 | Mọi tác vụ nghiệp vụ có tenant, actor, nguồn và correlation context hợp lệ |
| ECP-03 | Thay đổi ảnh hưởng lịch sử có ngày hiệu lực và phiên bản; dữ liệu đã chốt không bị âm thầm viết lại |
| ECP-04 | Quan hệ xuyên module tham chiếu định danh chuẩn hoặc một ánh xạ có kiểm chứng |
| ECP-05 | Mọi bút toán truy ngược được về sự việc kế toán và chứng từ nguồn tương ứng, kể cả phiên bản |
| ECP-06 | Quyền được kiểm tại thời điểm hành động; lịch sử quyết định phân quyền lưu đủ để kiểm toán |
| ECP-07 | Module không sửa trực tiếp dữ liệu kế toán hoặc danh mục do Core / module khác sở hữu |
| ECP-08 | Domain Event thông báo sự thật đã commit; không dùng event chưa commit làm căn cứ xác nhận nghiệp vụ |
| ECP-09 | Chứng từ sửa, huỷ, thay thế, hoàn trả duy trì quan hệ với chứng từ gốc và xử lý tác động liên quan |
| ECP-10 | Lỗi dữ liệu không âm thầm bỏ qua: có biên nhận, trạng thái chờ và đường khắc phục |
| ECP-11 | Bất biến xuyên module có phép đối chiếu và Gate Check, không chỉ validation từng API |
| ECP-12 | KPI, báo cáo, chỉ tiêu quản trị khai báo nguồn, định nghĩa, phạm vi, phiên bản và cách xử lý dữ liệu điều chỉnh |
| **ECP-13** | **No Destructive Change to Referenced Business History** — thực thể, chứng từ, chính sách, quan hệ, định danh đã dùng trong nghiệp vụ giữ được lịch sử và truy vết; không xoá hay thay đổi làm mất sự thật nghiệp vụ đã xác lập; huỷ, ngừng dùng, gộp, tách, điều chỉnh đi qua quy trình có kiểm chuẩn, phiên bản, quyền và bằng chứng. Bảo vệ đồng thời bằng **SQL constraints / triggers, SDK, Authorization và Conformance Gate** — không chỉ ẩn nút Xoá trên giao diện |

### 0.4 Bốn nhóm nền móng, mười bảy trụ cột ([standard/NEN-MONG-DOANH-NGHIEP.md](standard/NEN-MONG-DOANH-NGHIEP.md))

| Nhóm | Trụ cột |
|---|---|
| A · Nền móng thống nhất của doanh nghiệp | 01 Canonical Identity · 02 Master Data Governance · 03 Enterprise Organization · 04 Identity & Authorization · 05 Configuration & Policy Registry |
| B · Nền móng xử lý nghiệp vụ và giao dịch | 06 Document SDK & Lifecycle · 07 Workflow & Approval · 08 Command & Event Contracts · 09 Accounting Kernel · 10 Inventory & Cost Continuity |
| C · Nền móng bảo đảm dữ liệu luôn đúng | 11 Cross-Module Lineage · 12 Validation & Conformance · 13 Reconciliation & Period Integrity · 14 Semantic Metrics & KPI |
| D · Nền móng để cộng đồng mở rộng | 15 Integration & External Identity · 16 Module SDK & Metadata Registry · 17 Audit, Security & Operations |

Nền móng 0 và tám trụ cột I–VIII ở §0.1–§0.2 **ánh xạ** vào 17 trụ cột này (bảng ở trang nền móng §4), không bị bỏ. Mức đạt chỉ là "đạt" khi trỏ tới tín hiệu chạy được (check, chẩn đoán, test có tên) — tài liệu hay tên migration không phải bằng chứng (R-ECP-SCORE).

### 0.5 Mô hình nhất quán (R-ECP-CONS)

| Tầng | Gồm | Cơ chế |
|---|---|---|
| **Strong** — trong một giao dịch PostgreSQL | Nợ = Có, sổ chỉ thêm, kiểm quyền, không ghi vào kỳ khoá, số chứng từ, phiên bản sự việc, outbox | trigger / ràng buộc CSDL + kiểm trong dịch vụ; không dời sang tầng dưới |
| **Eventual** — sau commit | CRM, POS, HRM, báo cáo, thông báo, webhook, hệ ngoài | outbox, retry có giãn, idempotency, bể lỗi (`dead`), phát lại |
| **Reconciliation** | projection, hệ ngoài chưa đồng bộ thành công | chẩn đoán đối chiếu có mã, cách sửa, mức chặn khoá kỳ |

### 0.6 Sáu thao tác vòng đời (R-ECP-LC, [standard/DU-LIEU-GOC.md](standard/DU-LIEU-GOC.md))

`CREATE` định danh bất biến · `UPDATE` thuộc tính được phép + lịch sử / phiên bản khi cần · `ARCHIVE` ngừng dùng, giữ tham chiếu cũ · `MERGE` ánh xạ cũ → mới, không viết lại chứng từ lịch sử · `REVERSE` đảo tác động kế toán, giữ bút toán gốc · `DELETE` chỉ khi an toàn, không tham chiếu, không tác động lịch sử. **Mã là phương thức nhận diện, định danh là khoá liên kết bền vững**: hợp đồng ra ngoài vẫn nhận mã, Core phân giải theo nguồn và thời điểm rồi lưu định danh.

<!-- [2026-11-05 10:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-029 — §0.7 sáu năng lực lõi, §0.8 bảy nguyên tắc tinh gọn (ADR-0028 D028-11..13) -->
### 0.7 Sáu năng lực lõi ([ADR-0028](adr/ADR-0028-enterprise-continuity-nen-mong-doanh-nghiep.md) D028-11; bản đồ `docs/standard/nen-mong.json`)

| Lõi | Trách nhiệm không thể thiếu | Dev nhận sẵn, không tự xây lại |
|---|---|---|
| C1 · Identity & Master Data | ID bất biến, mã có phiên bản, cây tổ chức, quan hệ giữa đối tượng | bộ ID, đổi / gộp mã không mất lịch sử |
| C2 · Authorization & Context | tenant, user, role, scope, quyền theo tổ chức và ngữ cảnh | quản trị user, role, tenant, cửa hàng |
| C3 · Settings & Policies | cấu hình có phiên bản, phạm vi, ngày hiệu lực | đọc cấu hình theo phạm vi và ngày; chính sách định khoản có phiên bản |
| C4 · Documents & Workflow | chứng từ, trạng thái, phiên bản, phê duyệt, quan hệ nguồn | workflow chứng từ, nhật ký phê duyệt |
| C5 · Events & Accounting | giao dịch, outbox, idempotency, một cửa ghi sổ | phát sự kiện, thử lại, chống trùng; định khoản và ghi sổ |
| C6 · Continuity & Conformance | kiểm chuẩn quan hệ xuyên module, truy vết, đối chiếu, kiểm soát lịch sử | truy vết và đối chiếu giữa các module |

Sáu năng lực là thư viện, hợp đồng, capability trong Platform / Kernel — **không** phải sáu dịch vụ hay sáu CSDL. C6 là quy tắc + kiểm chứng trên dữ liệu sẵn có, không phải engine lưu trùng dữ liệu.

### 0.8 Small Core, Strong Contracts — bảy nguyên tắc tinh gọn (D028-12)

LEAN-1 **Reuse before Build** · LEAN-2 **Contract First** (bắt buộc chuẩn giao tiếp, không bắt buộc cách triển khai) · LEAN-3 **No Duplicate Truth** (mỗi loại dữ liệu một chủ) · LEAN-4 **Immutable Where It Matters** (bất biến chỉ cho lịch sử đã xác lập) · LEAN-5 **Progressive Complexity** (một cửa hàng và 500 cửa hàng cùng chuẩn, khác cấu hình) · LEAN-6 **Modular Monolith First** (PostgreSQL + outbox; tách khi đo được) · LEAN-7 **Conformance as Code**.

## 1. Bốn câu không thương lượng

1. **Không chứng từ thì không có bút toán.** Mọi dòng sổ cái trỏ về một `accounting_events` (R-EVENT-1).
2. **Sổ cái chỉ thêm.** Sửa, huỷ = bút toán đảo (ghi số âm) + bút toán mới. Không `UPDATE`, `DELETE`, `TRUNCATE` (R-LEDGER-1).
3. **Mọi đầu vào đi một cửa:** event → version → luật định khoản → sổ cái. Phân hệ, plugin, nhập tay đều vậy (R-EVENT-2).
4. **Kế toán là chủ danh mục và cấu hình.** Nguồn gửi **mã**, không gửi tài khoản Nợ / Có (R-MD-1, R-POST-2).

## 2. Cấp độ luật

| Cấp | Nghĩa | Vi phạm thì |
|---|---|---|
| **Tier 0 — Bất biến** | Giữ tính đúng của sổ sách. Có kiểm tự động (trigger CSDL hoặc test) | Chặn merge, chặn phát hành. Không có ngoại lệ |
| **Tier 1 — Bắt buộc** | Giữ ranh giới, hợp đồng, khả năng mở rộng | Chặn merge. Ngoại lệ phải có ADR được nhóm Lõi duyệt |
| **Tier 2 — Quy ước** | Đặt tên, cách viết, tài liệu | Người duyệt nhắc sửa; không chặn |

## 3. Danh mục luật

| Mã | Tệp | Cấp | Một câu | Kiểm bằng |
|---|---|---|---|---|
| R-LEDGER | [rules/RULE-LEDGER.md](rules/RULE-LEDGER.md) | 0 | Sổ cái chỉ thêm, cân Nợ = Có, đảo một lần, một cửa ghi | Trigger CSDL, `db-rules.test.ts`, `ledger-flow.test.ts` |
| R-EVENT | [rules/RULE-EVENT.md](rules/RULE-EVENT.md) | 0 | Mọi đầu vào thành event có `docKey` + `version`; idempotent | `ledger-flow.test.ts`, `auto-push.test.ts`, grep CI |
| R-INTAKE | [rules/RULE-INTAKE.md](rules/RULE-INTAKE.md) | 1 | **Chấp nhận, chưa có mã** (ADR-0014, PHASE-021): Kernel chặn, trạm tiền kiểm dạy — không vứt đầu vào bị từ chối, gom mọi lỗi, giải thích cho người mới, chấm điểm đầu vào; không nới luật Kernel <!-- [2026-11-02 02:38 PM Johnny Chu - Chu Hoàng Anh] ADR-0014 — thêm R-INTAKE vào chỉ mục --> | PHASE-021 PR-I1…I5 |
| R-POST | [rules/RULE-POSTING.md](rules/RULE-POSTING.md) | 0 | Luật định khoản thuần, không viết cứng tài khoản, xem trước = ghi thật | `posting-modes.test.ts`, test từng luật |
| R-MD | [rules/RULE-MASTER-DATA.md](rules/RULE-MASTER-DATA.md) | 1 | Danh mục chuẩn do kế toán giữ; ngoài gửi mã, Core phân giải ra định danh rồi lưu định danh <!-- [2026-11-05 09:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-029 — R-MD: mã ≠ định danh (ADR-0028 D028-4) -->; không xoá cái đã dùng | `catalog-delete.test.ts`, `default-data.test.ts` |
| R-ECP <!-- [2026-11-05 09:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-029 — ADR-0028 --> | [rules/RULE-ENTERPRISE-CONTINUITY.md](rules/RULE-ENTERPRISE-CONTINUITY.md) | 0 (ECP-04, -05, -07, -13, R-ECP-CONS-1), 1 (còn lại) | **Chấp nhận về nguyên tắc 2026-11-05** ([ADR-0028](adr/ADR-0028-enterprise-continuity-nen-mong-doanh-nghiep.md)): mười ba nguyên tắc ECP; sáu thao tác vòng đời; mô hình nhất quán Strong / Eventual / Reconciliation; bảng điểm theo bằng chứng | từng ECP dẫn check / chẩn đoán / test ở RULE §1; việc còn thiếu ở PHASE-029 S029-9..28 |
| R-MATRIX | [rules/RULE-SETTINGS-MATRIX.md](rules/RULE-SETTINGS-MATRIX.md) | 1 | Mọi cấu hình khai trong registry, có phạm vi, thứ tự ưu tiên, nhật ký | Registry + test (đợt 2) |
| R-BOUND | [rules/RULE-MODULE-BOUNDARY.md](rules/RULE-MODULE-BOUNDARY.md) | 1 | Phân hệ không import nhau, không ghi bảng lõi | `phan-he-ranh-gioi.test.ts` |
| R-API | [rules/RULE-API.md](rules/RULE-API.md) | 1 | Một khuôn phản hồi, mã lỗi ổn định, zod ở cửa vào, `/api/v1` | `api-examples.test.ts`, OpenAPI |
| R-DB | [rules/RULE-DATABASE.md](rules/RULE-DATABASE.md) | 1 | Migration chỉ thêm, số không trùng, COMMENT tiếng Việt, tiền `numeric(18,2)` | `db-rules.test.ts`, kiểm số migration (CI) |
| R-TEN | [rules/RULE-TENANT-SECURITY.md](rules/RULE-TENANT-SECURITY.md) | 0 | Mọi truy vấn lọc `tenant_id`; mọi route khai quyền; mọi thao tác ghi có nhật ký | `access.test.ts`, `edit-permission.test.ts` |
| R-WF | [rules/RULE-WORKFLOW.md](rules/RULE-WORKFLOW.md) | 1 | Luồng nghiệp vụ là máy trạng thái khai báo; chỉ trạng thái "đã duyệt" mới sinh event | Test luồng của phân hệ |
| R-QG | [rules/RULE-QUALITY-GATE.md](rules/RULE-QUALITY-GATE.md) | 1 | Typecheck + test PostgreSQL thật + bằng chứng chạy trước khi merge | `.github/workflows/ci.yml` |
| R-KER | [rules/RULE-KERNEL.md](rules/RULE-KERNEL.md) | 0 | Sửa Kernel theo bốn mức K0–K3; lớp bảo vệ CSDL chỉ thêm chặt; không đổi bút toán đã ghi; tất định | DG-DB-2, test luật định khoản, mẫu PR |
| R-SEC | [rules/RULE-SECURITY.md](rules/RULE-SECURITY.md) | 0 | Không bí mật trong git; SQL có tham số; API không chạy superuser; AI chỉ ra nháp; chuỗi cung ứng; báo lỗ hổng | SC-SEC-1..4, DG-SEC-1 |
| R-REL | [rules/RULE-RELEASE.md](rules/RULE-RELEASE.md) | 1 | Cổng phát hành, CHANGELOG, migration chỉ tiến, kênh stable / LTS, vá bảo mật | SC-REL-1..2, [ops/RELEASE.md](ops/RELEASE.md) |
| R-DIAG | [rules/RULE-SELF-DIAGNOSTICS.md](rules/RULE-SELF-DIAGNOSTICS.md) | 1 | Năm tầng L0–L4, chỉ đọc, lịch chạy, chặn khoá kỳ khi sổ lỗi, cảnh báo không lộ số liệu | lane diagnostics `tests/conformance` |
| R-CACHE | [rules/RULE-INFRASTRUCTURE.md](rules/RULE-INFRASTRUCTURE.md) §1 | 0 | Không cache dữ liệu sổ; đọc nhất quán sau khi ghi; đệm danh mục có huỷ theo phiên bản cấu hình | review; `test/mcp.test.ts` |
| R-OUTBOX | [rules/RULE-INFRASTRUCTURE.md](rules/RULE-INFRASTRUCTURE.md) §2 | 0 | Sự kiện ghi cùng giao dịch với sổ; gửi sau commit, ít nhất một lần; consumer idempotent; NATS là adapter | SC-EVT-1 |
| R-SIG | [rules/RULE-SIGNATURE.md](rules/RULE-SIGNATURE.md) | 0 | Tệp framework mang chữ ký kiến trúc Johnny Chu – Chu Hoàng Anh; mỗi lần sửa có chức năng thêm dấu theo phase; không xoá dấu cũ, không ghi tên agent | SC-SIG-1, SC-SIG-2 |
| R-BAK | [rules/RULE-INFRASTRUCTURE.md](rules/RULE-INFRASTRUCTURE.md) §3 | 0 | Sao lưu hằng ngày, PITR, kiểm khôi phục hằng tuần trước khi tin bản sao lưu | `scripts/kiem-khoi-phuc.sh` |
| R-REV | [rules/RULE-REVIEW.md](rules/RULE-REVIEW.md) | 0 | Người đóng góp làm phân hệ / giao diện qua PR; Nhóm Lõi rà soát mỗi lần nhận việc: kiến trúc, lỗi, rủi ro, dữ liệu kế toán, mã hàng; biên bản ở `docs/audits/REVIEW-*` | `scripts/ra-soat-dong-gop.mjs` |
| R-VNC | [rules/RULE-VN-CONFORMANCE.md](rules/RULE-VN-CONFORMANCE.md) | 1 (R-VNC-3, -7: 0) | Bộ kiểm chuẩn pháp lý VN: kho nguồn pháp lý có trạng thái rà, rulepack / ca có phiên bản, cổng phê duyệt fail-closed, báo cáo 6 trạng thái, không tự nhận chứng nhận nhà nước | SC-VNC-1, SC-VNC-2; runner lane runtime (PHASE-020) |
| R-ITEM | [rules/RULE-ITEM.md](rules/RULE-ITEM.md) | 0 (R-ITEM-0), 1 (R-ITEM-1..9) | **Chấp nhận về nguyên tắc, chưa có mã** ([ADR-0017](adr/ADR-0017-dinh-danh-hang-hoa-bat-bien.md), PHASE-024): định danh hàng hoá bất biến, mã có phiên bản, sổ đã ghi không đổi theo danh mục; tài khoản từ chính sách, không từ tiền tố mã; dữ liệu ngoài qua validation <!-- [2026-11-02 09:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — luật R-ITEM --> | trigger, DG-ITEM-1..5, SC-ITEM-1..3 (sẽ có) |
| R-CONT <!-- [2026-11-03 06:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-025 — ADR-0021 Accounting Continuity --> | [rules/RULE-CONTINUITY.md](rules/RULE-CONTINUITY.md) | 0 (R-CONT-0), 1 (R-CONT-1..9) | **Đề xuất 2026-11-03** ([ADR-0021](adr/ADR-0021-accounting-continuity-lien-tuc-ke-toan.md), PHASE-025): không đứt chuỗi; lineage giá vốn chỉ thêm; phương pháp tính giá là chính sách có phiên bản; trả / huỷ hoàn đúng giá vốn gốc; sổ chi tiết = sổ cái; khoá kỳ đòi Gate C sạch; kết quả do engine tính |
| R-GATE | [rules/RULE-GATE.md](rules/RULE-GATE.md) | 1 | **Chấp nhận 2026-11-02** ([ADR-0019](adr/ADR-0019-hai-cong-kiem-chuan-nhap-va-be-cho.md)): hai cổng — Gate A danh mục (nháp), Gate B nghiệp vụ (bể chờ, R-INTAKE); không chặn im lặng; một thư viện mã; mức nào hậu quả đó, không lan <!-- [2026-11-02 11:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — luật R-GATE --> | SC-FIND-1 (sẽ có), test bể / nháp |
| R-FLOW | [rules/RULE-FLOW.md](rules/RULE-FLOW.md) | 1 | **Chủ dự án đồng ý 2026-11-03:** nhận việc theo thứ tự giữ chỗ vào `main` → chốt thiết kế dùng chung bằng tài liệu → code. Một phạm vi một người ([CLAIMS](phases/CLAIMS.md)); nhánh ngắn; gộp `main` và bộ kiểm xanh trước khi đẩy <!-- [2026-11-03 09:55 PM Johnny Chu - Chu Hoàng Anh] FLOW — luật R-FLOW --> **`main` là nguồn sự thật duy nhất của tài liệu** (R-FLOW-7, 2026-11-03). | SC-FLOW-1; `scripts/nhan-viec.mjs kiem`; Bước 0 AGENTS.md |

## 4. Hợp đồng (contracts)

| Mã hợp đồng | Tệp | Trạng thái | Mã nguồn thực thi |
|---|---|---|---|
| `bizcity_standard@1` | [standard/README.md](standard/README.md) · [bizcity-standard.json](standard/bizcity-standard.json) | **Đề xuất** (1.0.0-draft) | gói 7 hợp đồng dưới đây + bảng năng lực |
| `bizcity_module@1` | [contracts/BIZCITY-MODULE-v1.md](contracts/BIZCITY-MODULE-v1.md) | **Đề xuất** (Standard 1/7) | `apps/api/src/phan-he/types.ts`, `packages/contracts/src/module.ts`, `core/addins.ts` |
| `bizcity_data@1` | [contracts/BIZCITY-DATA-v1.md](contracts/BIZCITY-DATA-v1.md) | **Đề xuất** (Standard 2/7) | `packages/platform/src/db/client.ts`, `packages/platform/src/db/migrate.ts` |
| `bizcity_document@1` | [contracts/BIZCITY-DOCUMENT-v1.md](contracts/BIZCITY-DOCUMENT-v1.md) | **Đề xuất** (Standard 3/7; gồm luồng duyệt, thay `bizcity_workflow@1`) | `modules/{signatures,reference-documents}`, `payment_requests` |
| `bizcity_action@1` | [contracts/BIZCITY-ACTION-v1.md](contracts/BIZCITY-ACTION-v1.md) | **Đề xuất** (Standard 4/7) | `core/{http,errors,auth}.ts` |
| `bizcity_event@1` | [contracts/BIZCITY-EVENT-v1.md](contracts/BIZCITY-EVENT-v1.md) | **Đề xuất** (Standard 5/7) — sự kiện miền | chưa có (`catalog-notify.ts`) |
| `bizcity_evidence@1` | [contracts/BIZCITY-EVIDENCE-v1.md](contracts/BIZCITY-EVIDENCE-v1.md) | **Đề xuất** (Standard 6/7) | `core/audit.ts`, `audit_logs` |
| `bizcity_extension@1` | [contracts/BIZCITY-EXTENSION-v1.md](contracts/BIZCITY-EXTENSION-v1.md) | **Đề xuất** (Standard 7/7) | `apps/web/src/phan-he/*`, `core/addins.ts` |
| `bizcity_ledger_intake@1` | [contracts/BIZCITY-LEDGER-INTAKE-v1.md](contracts/BIZCITY-LEDGER-INTAKE-v1.md) | Ổn định (Kernel; trước 2026-10-29 tên `bizcity_event@1`) | `packages/contracts/src/documents.ts` |
| `bizcity_intake_findings@1` <!-- [2026-11-02 07:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — W1 --> | [contracts/BIZCITY-INTAKE-FINDINGS-v1.md](contracts/BIZCITY-INTAKE-FINDINGS-v1.md) | Đề xuất 0.1 (Kernel, cửa nạp — ADR-0014) | `packages/contracts/src/intake-findings.ts` |
| `bizcity_api@1` | [contracts/BIZCITY-API-v1.md](contracts/BIZCITY-API-v1.md) | Ổn định | `packages/contracts/src/api.ts`, `apps/api/src/core/http.ts`, `core/errors.ts` |
| `bizcity_posting_rule@1` | [contracts/BIZCITY-POSTING-RULE-v1.md](contracts/BIZCITY-POSTING-RULE-v1.md) | Ổn định (nội bộ lõi) | `modules/posting/*`, `modules/ledger/ledger.types.ts` |
| `bizcity_master_data@1` | [contracts/BIZCITY-MASTER-DATA-v1.md](contracts/BIZCITY-MASTER-DATA-v1.md) | Ổn định (1.1.0: mã ≠ định danh, tương thích — ADR-0028) <!-- [2026-11-05 09:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-029 — master_data 1.1.0 --> | `modules/{accounts,branches,partners,products,tax-codes,posting-config}` |
| `bizcity_connector@1` | [contracts/BIZCITY-CONNECTOR-v1.md](contracts/BIZCITY-CONNECTOR-v1.md) | Ổn định | `modules/connections`, `packages/contracts/src/connections.ts` |
| `bizcity_settings@1` | [contracts/BIZCITY-SETTINGS-MATRIX-v1.md](contracts/BIZCITY-SETTINGS-MATRIX-v1.md) | **Đề xuất** | `core/posting-modes.ts`, `core/date-rules.ts` (rải rác) |
| `bizcity_posting_template@1` | [contracts/BIZCITY-POSTING-TEMPLATE-v1.md](contracts/BIZCITY-POSTING-TEMPLATE-v1.md) | **Đề xuất** — gói định khoản theo ngành, marketplace ([standard/TEMPLATE-MARKETPLACE.md](standard/TEMPLATE-MARKETPLACE.md)) | `posting_reasons`, `account-resolver.ts`; kiểm SC-TPL-1 |
| `bizcity_mcp@1` | [contracts/BIZCITY-MCP-v1.md](contracts/BIZCITY-MCP-v1.md) | **Đề xuất** — công cụ MCP cho Cell / chatbot; hồ sơ của chuẩn MCP hệ sinh thái ([standard/CELL-CONNECT.md](standard/CELL-CONNECT.md)) | `modules/system/mcp.routes.ts` (PHASES 2.11–2.12) |
| `bizcity_domain@1` | [contracts/BIZCITY-DOMAIN-v1.md](contracts/BIZCITY-DOMAIN-v1.md) | Chấp nhận — bất biến kế toán (Domain Contract, lớp 1/4 của [CONG-BO-KIEN-TRUC](CONG-BO-KIEN-TRUC.md)); đổi = K3 + ADR | trigger; DG-LEDGER-*, DG-EVENT-*; `assertLedgerInvariants` |
| `bizcity_compliance@1` | [contracts/BIZCITY-COMPLIANCE-v1.md](contracts/BIZCITY-COMPLIANCE-v1.md) | Chấp nhận — ma trận tuân thủ bắt buộc STD-CMP-1..9, ma trận pháp lý; trạng thái tính tự động trên bảng điểm | [standard/compliance-matrix.json](standard/compliance-matrix.json); kiểm SC-CMP-1 |
| `bizcity_remedy@1` <!-- [2026-11-02 07:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-022 — thêm hợp đồng phương án khắc phục. --> | [contracts/BIZCITY-REMEDY-v1.md](contracts/BIZCITY-REMEDY-v1.md) | **Đề xuất** — mọi kiểm warn / error khai phương án khắc phục có cấu trúc (bước, màn, vai, kiểm lại); sổ màn SCREENS | `packages/contracts/src/remedy.ts`; check SC-FIX-1 |
| `bizcity_item_master@1` <!-- [2026-11-03 10:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — B2a --> | [contracts/BIZCITY-ITEM-MASTER-v1.md](contracts/BIZCITY-ITEM-MASTER-v1.md) | **Đề xuất** — định danh mặt hàng bất biến (ULID), mã có phiên bản + ngày hiệu lực, phân loại theo ngày, Item Resolver; bất biến ở CSDL (ADR-0017, R-ITEM-0) | `packages/contracts/src/item-master.ts`; `packages/kernel/src/modules/masterdata/` |
| `bizcity_lineage@1` <!-- [2026-11-03 09:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-025 — W1 --> | [contracts/BIZCITY-LINEAGE-v1.md](contracts/BIZCITY-LINEAGE-v1.md) | **Đề xuất** — truy vết vòng đời mặt hàng, chỉ đọc: sự kiện kho (kế toán / vận hành), bút toán mang mã hàng, giá vốn từng tháng, giải thích giá vốn (ADR-0021, R-CONT) | `packages/contracts/src/lineage.ts`; `packages/kernel/src/modules/lineage/` |
| `bizcity_findings@1` <!-- [2026-11-02 11:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — thư viện phát hiện hai cổng (ADR-0019) --> | [contracts/BIZCITY-FINDINGS-v1.md](contracts/BIZCITY-FINDINGS-v1.md) | **Đề xuất** — một thư viện mã cho hai cổng kiểm chuẩn: mức, bước, vì sao, cách sửa, luật gốc; `core.findings.explain` cho người / dev / AI | `packages/contracts/src/findings.ts`; check SC-FIND-1 |
| `bizcity_errors@1` | [contracts/BIZCITY-ERRORS-v1.md](contracts/BIZCITY-ERRORS-v1.md) | Chấp nhận — danh mục mã lỗi, thông báo, gợi ý (R-ERR) | `packages/contracts/src/errors.ts`; kiểm SC-ERR-1 |
| `bizcity_preset@1` | [contracts/BIZCITY-PRESET-v1.md](contracts/BIZCITY-PRESET-v1.md) | Chấp nhận — gói cài nhanh theo ngành, dữ liệu mẫu hư cấu | `presets/`, `scripts/cai-preset.mjs`; kiểm SC-PRESET-1 |
| ~~`bizcity_workflow@1`~~ | [workflows/README.md](workflows/README.md) | Gộp vào `bizcity_document@1` §5 (năng lực `documents.workflow`) | — |

Trạng thái: **Ổn định** = đã có code, đổi phá vỡ phải ra `@2`. **Đề xuất** = chuẩn đích, code đang chuyển dần (xem [framework/05-LO-TRINH.md](framework/05-LO-TRINH.md)).

## 5. Đổi code X → phải sửa tài liệu Y trong cùng PR

| Khi sửa | Phải cập nhật |
|---|---|
| `packages/contracts/src/documents.ts` (khuôn chứng từ) | `contracts/BIZCITY-LEDGER-INTAKE-v1.md`, `docs/api/<loại>.md`, JSON mẫu `docs/api/vi-du/`, CHANGELOG hợp đồng |
| `packages/contracts/src/api.ts`, `core/errors.ts`, `core/http.ts` (nay `packages/platform/src/core/`) | `contracts/BIZCITY-API-v1.md` |
| `modules/posting/**`, `account-resolver.ts` | `contracts/BIZCITY-POSTING-RULE-v1.md`, `nghiep-vu/06-tinh-huong-ghi-so.md` |
| `modules/ledger/**`, trigger sổ cái | `rules/RULE-LEDGER.md`; người duyệt thứ hai bắt buộc |
| `modules/documents/document.service.ts` (cửa nhận) | `rules/RULE-EVENT.md` |
| `core/auth.ts` (quyền, vai trò, phạm vi khoá) | `rules/RULE-TENANT-SECURITY.md` §3 |
| Thêm khoá vào `tenants.settings` hoặc bảng cấu hình | `contracts/bizcity-settings.registry.json` + `rules/RULE-SETTINGS-MATRIX.md` |
| `modules/**` (thêm phân hệ — chỗ đặt chuẩn, [ADR-0024](adr/ADR-0024-phan-he-nam-o-modules-phan-he-dong-bang.md)); `apps/api/src/phan-he/**` (phân hệ cũ, đóng băng; bớt khi chuyển) | `framework/01-CORE-MODULES.md` §3, `standard/CHUYEN-PHAN-HE-SANG-MODULES.md`, `.github/CODEOWNERS` |
| `db/migrations/*` | `db/README.md` nếu đổi quy trình; `schema-catalog.ts` (test bắt buộc) |
| `docker/`, `docker-compose.yml`, `scripts/` | `ops/DEPLOY.md`, `ops/CLI.md` |
| `.github/workflows/*` | `ops/CI-CD.md` |
| Thêm / đổi năng lực Platform hoặc Kernel mà module dùng | `standard/bizcity-standard.json`, hợp đồng Standard tương ứng, `standard/VERSIONING.md` §7 |
| Thêm điểm mở rộng (slot, hook, action công khai của Core) | `contracts/BIZCITY-EXTENSION-v1.md` §3–§5 |
| Thêm kiểm vào bộ cài đặt | `standard/CONFORMANCE.md` + một check ở `tests/conformance/` kèm ca tự kiểm trong `fixtures/expect.json` (ADR-0006) |
| Thêm luật `R-*` / `STD-*` mới | cột "Kiểm bằng" trỏ tới test hoặc check `SC-*` / `DG-*`; bảng điểm đo độ phủ |
| Lý do, nhóm hạch toán, tài khoản ngầm định mặc định (`db/seeds/ly-do.jsonl`…) | gói định khoản tương ứng theo `contracts/BIZCITY-POSTING-TEMPLATE-v1.md` |
| Route / action được AI dùng (`expose.mcp`), công cụ `ketoan.*` | `contracts/BIZCITY-MCP-v1.md` §5 (danh mục công cụ); đổi phá vỡ = công cụ mới |
| `adapters/cell`, kết nối Hub / Cell | `standard/CELL-CONNECT.md`, `standard/CHANNEL-GATEWAY-PORT.md` |
| Bất kỳ tệp Kernel (RULE-KERNEL §1) | ghi mức K0–K3 trong PR; K2+ thêm mục "Thay đổi định khoản" trong `CHANGELOG.md` |
| Thay đổi người dùng thấy được | `CHANGELOG.md` mục `[Chưa phát hành]` (R-REL-2) |
| Thêm / đổi yêu cầu tuân thủ, tín hiệu thực thi | [contracts/BIZCITY-COMPLIANCE-v1.md](contracts/BIZCITY-COMPLIANCE-v1.md) §2 + [standard/compliance-matrix.json](standard/compliance-matrix.json) cùng PR (SC-CMP-1) |
| Thêm cách thực thi cho nguyên tắc AP-* | `bizcity-standard.json#principles[].enforcedBy` (SC-CMP-2; nợ đã hết → `--update-baseline`) |
| Sửa có chức năng bất kỳ tệp framework (mã, migration chưa phát hành, hạ tầng, tài liệu kiến trúc / luật / hợp đồng / phase) | thêm dấu R-SIG tại chỗ đổi ([rules/RULE-SIGNATURE.md](rules/RULE-SIGNATURE.md)) |
| Thêm / chuyển việc lộ trình hoặc mã checklist G | thư mục phase sở hữu nó ở [phases/](phases/README.md): dòng `> **Việc lộ trình:**` / `> **Checklist công bố:**` của README phase (SC-PHASE-1) |
| Thêm migration | tệp mới số kế tiếp; chạy `scripts/kiem-nang-cap.sh` khi đổi bảng có dữ liệu; khoá checksum khi phát hành (`--update-lock`, R-DB-15) |
| Thêm / đổi mã lỗi, thông báo, gợi ý | `packages/contracts/src/errors.ts` (ERROR_CATALOG) + [contracts/BIZCITY-ERRORS-v1.md](contracts/BIZCITY-ERRORS-v1.md) §3 + `bizcity-standard.json#errorCodes` (SC-ERR-1, SC-CON-6) |
| Thêm số đo, trường log, cảnh báo, dashboard | [ops/OBSERVABILITY.md](ops/OBSERVABILITY.md) §2–§4 + `infrastructure/monitoring/` (`prometheus/alerts.yml`, `grafana/dashboards/`) |
| Thêm / sửa preset cài nhanh | `presets/<id>/` + [contracts/BIZCITY-PRESET-v1.md](contracts/BIZCITY-PRESET-v1.md) §4 (SC-PRESET-1, `test/preset.test.ts`) |
| Đổi luồng / lớp / thành phần kiến trúc | sơ đồ [architecture/README.md](architecture/README.md); quyết định khó đảo ngược → ADR |
| Thêm kiểm toàn vẹn / bản cài | `ops/DIAGNOSTICS.md` §2 + check `DG-*` trong `tests/conformance/diagnostics/` trước (R-DIAG-9); đưa vào app: `modules/ledger/ledger.diagnostics.ts` (Kernel) hoặc `modules/system/diagnostics.ts` (Platform), cùng mã (SC-DIAG-1) |
| Thêm / sửa / xong một việc của lộ trình | `standard/PHASES.md` + `standard/roadmap.json` cùng PR (SC-RMP-1); việc tay xong ghi `doneAt` + `by` |
| Sửa xong một nợ đã biết | `node tests/conformance/selfcheck.mjs --update-baseline` trong cùng PR (CI chạy `--strict`) |
| Tách / chuyển thư mục giữa Kernel, Platform, module | `standard/REUSE-MAP.md`, `standard/TARGET-LAYOUT.md`, bảng lớp `tests/conformance/lib/layers.mjs` rồi `node scripts/gan-nhan-lop.mjs --write` (R-BOUND-10) |
| Thêm tệp `apps/api/src/**` | nhãn dòng đầu `// @bizcity-layer`: `node scripts/gan-nhan-lop.mjs --write`; thư mục mới → thêm dòng bảng lớp (SC-LAYER-1) |
| Thêm loại dữ liệu gốc (Core hoặc module), đổi cách xoá / ngừng dùng / gộp một danh mục <!-- [2026-11-05 09:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-029 — §5 dòng R-ECP --> | [standard/DU-LIEU-GOC.md](standard/DU-LIEU-GOC.md) §3 (đủ sáu thao tác); nguyên tắc ECP bị đụng ở [rules/RULE-ENTERPRISE-CONTINUITY.md](rules/RULE-ENTERPRISE-CONTINUITY.md) §1 |
| Đổi mức đạt một trụ cột / tiêu chí | [standard/NEN-MONG-DOANH-NGHIEP.md](standard/NEN-MONG-DOANH-NGHIEP.md) hoặc `standard/tru-cot.json`, kèm tín hiệu chạy được (R-ECP-SCORE) |
| Gỡ được cạnh import ngược chiều lớp | `--update-baseline`; mốc đồ thị mới `node scripts/do-thi-phu-thuoc.mjs` khi xong một Phase (SC-LAYER-2) |

## 6. Nhật ký thay đổi CANON

<!-- [2026-11-05 09:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-029 — CANON v1.4 -->
- **v1.4 (2026-11-05):** Thêm §0.7 sáu năng lực lõi, §0.8 bảy nguyên tắc tinh gọn LEAN-1..7 <!-- [2026-11-05 10:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-029 — nhật ký §0.7 / §0.8 -->. Thêm §0.3–§0.6 Enterprise Continuity ([ADR-0028](adr/ADR-0028-enterprise-continuity-nen-mong-doanh-nghiep.md)): ECP-01..13 (ECP-13 không thay đổi phá huỷ lịch sử đã tham chiếu), bốn nhóm nền móng 17 trụ cột, mô hình nhất quán ba tầng, sáu thao tác vòng đời; luật R-ECP; R-MD: mã ≠ định danh.

<!-- [2026-11-03 01:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — ADR-0020 tôn chỉ Core -->
- **v1.3 (2026-11-03):** Thêm §0 Tôn chỉ ([ADR-0020](adr/ADR-0020-ton-chi-core-nguoi-dung-quyet-dinh-mot-ngon-ngu-ma.md)): người dùng quyết định, Core chỉ đúng chỗ; một ngôn ngữ là thư viện mã có căn cứ; R-GATE-9 / 10 / 11.
<!-- [2026-11-01 11:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-020 — thêm luật R-VNC (bộ kiểm chuẩn pháp lý Việt Nam) vào danh mục luật. -->
- **v1.2 (2026-11-01):** Thêm luật R-VNC ([rules/RULE-VN-CONFORMANCE.md](rules/RULE-VN-CONFORMANCE.md)) — bộ kiểm chuẩn pháp lý Việt Nam (PHASE-020): kho nguồn pháp lý, rulepack / ca có phiên bản, cổng phê duyệt fail-closed, báo cáo bằng chứng.
- **v1.1 (2026-10-29):** Thêm Bizcity Framework Standard v1 (`docs/standard/`, 7 hợp đồng `STD-*`, bộ kiểm cài đặt, ca chuẩn Hợp đồng, Phase 1–6). Đổi tên khuôn nạp sổ `bizcity_event@1` → `bizcity_ledger_intake@1`; tên `bizcity_event@1` nay là sự kiện miền. `bizcity_workflow@1` gộp vào `bizcity_document@1`.
- **v1.0 (2026-10-28):** Khởi tạo bộ chuẩn: 11 luật, 8 hợp đồng, 4 tài liệu vận hành, audit nền. Tài liệu cũ ở gốc `docs/` chuyển thành tham chiếu (xem [README.md](README.md)).
