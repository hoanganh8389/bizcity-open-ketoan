# Nhật ký thay đổi

Mọi thay đổi đáng kể của Bizcity Core (open-ketoan) ghi ở đây. Khuôn theo [Keep a Changelog](https://keepachangelog.com/vi/1.1.0/), số phiên bản theo [SemVer](https://semver.org/lang/vi/). Luật: [docs/rules/RULE-RELEASE.md](docs/rules/RULE-RELEASE.md).

Mỗi bản ghi đủ sáu mục:
- **Thêm**
- **Đổi**
- **Sửa**
- **Thay đổi định khoản**: K2 trở lên, áp cho chứng từ ghi sau khi cập nhật
- **Nâng cấp cần làm**
- **Bảo mật**

## [Chưa phát hành]

### Thêm
- **Chính sách kế toán có phiên bản và ngày hiệu lực** (PHASE-005, ADR-0009, migration `0040`): mỗi bút toán định khoản theo luật và mỗi dòng nhật ký định khoản ghi phiên bản chính sách đã dùng; lịch sử ở `GET /api/v1/posting/policy/versions`; đổi chế độ bằng `POST /api/v1/posting/policy/publish` (ngày hiệu lực, ghi chú, không vào kỳ đã khoá). Tự chẩn đoán `POLICY_VERSION`.
- **Khôi phục tới một thời điểm (PITR)** (PHASE-008): `infrastructure/backup/docker-compose.pitr.yml` bật lưu WAL liên tục (chỉ cần PostgreSQL), `scripts/sao-luu-goc.sh` sao lưu gốc + dọn WAL cũ, `scripts/dien-tap-pitr.sh` diễn tập trên container tạm (khôi phục tới mốc T, kiểm sổ, đo RTO / RPO). Máy dev: RTO 8 giây, RPO ≤ 60 giây với 13.428 bút toán.
- **Trợ lý AI lập chứng từ nháp và đề xuất huỷ qua MCP** (PHASE-009): `accounting.document.create_draft` (bán, mua, thu, chi… theo khuôn nạp sổ) và `accounting.entry.reverse`. Luôn xem trước bút toán rồi người dùng xác nhận; kết quả luôn chờ kế toán duyệt ở ACC14, kể cả khi loại chứng từ đặt chế độ "Tự động". AI không duyệt, không khoá kỳ, không đổi cấu hình.
- **Sự kiện miền — transactional outbox** (PHASE-006, PHASES 3.4, migration `0039`): sự kiện ghi cùng giao dịch với dữ liệu, dispatcher trong tiến trình API giao ít nhất một lần, chống xử lý trùng, thử lại giãn nhịp, hết lượt → `dead` (tự chẩn đoán `EVENT_DEAD`), phát lại có bằng chứng (`POST /api/v1/system/events/replay`), xem tình trạng (`GET /api/v1/system/events`). Kernel phát `bizcity.ledger.entry.posted` / `.reversed`, `bizcity.period.locked` / `.unlocked`; đồng hồ `bizcity.clock.daily` / `.hourly`. Header `X-Correlation-Id` (mặc định mã yêu cầu) được ghi vào bằng chứng và sự kiện.
- Báo hệ thống bán hàng "danh mục đổi" nay đi qua outbox: không mất khi khởi động lại, tự thử lại khi bên kia lỗi, gửi kèm `Idempotency-Key`.
- **Một cửa ghi sổ cho sự việc Kernel tự lập** (PHASE-004, PHASES 2.1): phiếu kế toán tay, số dư đầu kỳ, kết chuyển, khấu hao / phân bổ, giá vốn ghi sổ qua `eventStore` (`modules/documents/event-store.ts`), không gọi thẳng `ledgerService`. Sổ không đổi (so 194 ô sổ cái trước / sau: trùng). Kết chuyển và giá vốn nay có `posted_version` và nhật ký định khoản như chứng từ khác; migration `0038` điền `posted_version` cho dữ liệu cũ. Tự chẩn đoán "sự việc đã ghi sổ có bút toán" không còn báo nhầm phiếu chuyển / điều chỉnh kho tổng tiền 0.
- Thư mục phase `docs/phases/PHASE-001…017`: mỗi việc lộ trình và mã checklist G thuộc đúng một phase (check SC-PHASE-1). Đánh giá codebase so với kiến trúc: `docs/audits/AUDIT-2026-10-30-KIEN-TRUC.md`. Lộ trình thêm việc 2.14 (chính sách có phiên bản), 2.15 (PITR), 2.16 (MCP ghi).
- Giấy phép **GPL-2.0-or-later** (`LICENSE`, cùng giấy phép với `bizcity-twin-ai`) và chính sách nhãn hiệu `TRADEMARK.md`. Trước đó repository chưa có giấy phép.
- Bộ chuẩn framework: CANON, luật `R-*`, hợp đồng `bizcity_*@N`, Bizcity Framework Standard v1 (7 hợp đồng module), ADR-0001..0006.
- Bộ kiểm chuẩn `tests/conformance/` gồm hai lane chạy song song:
  - selfcheck: tĩnh, không cần CSDL;
  - diagnostics: CSDL thật, chỉ đọc.

  Kèm theo: bảng điểm, danh sách nợ bánh cóc, tự kiểm trên dữ liệu mẫu, chế độ `--module`.
- Hợp đồng đề xuất:
  - `bizcity_posting_template@1` (gói định khoản theo ngành);
  - `bizcity_mcp@1` (công cụ MCP cho Cell / chatbot).
- Tài liệu: kết nối Cell bằng khoá 1API, port channel-gateway.
- Luật mới:
  - R-KER: thay đổi Kernel;
  - R-SEC: bảo mật;
  - R-REL: phát hành;
  - R-DIAG: tự chẩn đoán.
- `SECURITY.md`, `CHANGELOG.md`.
- Tra cứu mã số thuế: `DOANHNGHIEP_API_KEY`, `TAX_LOOKUP`.
- Đọc hoá đơn nhà cung cấp bằng dịch vụ AI: `INVOICE_AI_URL`, `INVOICE_AI_KEY`, `INVOICE_AI_TIMEOUT_MS`.
- `GET /api/v1/system/health` trả thêm `version`, `kernel`, `standard` (R-REL-1).
- Guard `requireUser()`, `requireAuthenticated()` cho route tự phục vụ (R-API-6).
- Migration `0030_hoa_don_ncc.sql`: bảng `supplier_invoices`, `supplier_invoice_lines`, `supplier_item_aliases` mà code Hoá đơn NCC đã dùng nhưng chưa có migration (khuôn theo `db/types.ts`).
- Migration `0032_vai_tro_ung_dung.sql`: vai trò CSDL `ketoan_app` cho API (không superuser, không sở hữu bảng); biến `DB_APP_USER`, `DB_APP_PASSWORD` (R-SEC-6).
- Phase 1:
  - nhãn lớp `// @bizcity-layer` ở mọi tệp `apps/api/src` (R-BOUND-10, `scripts/gan-nhan-lop.mjs`, SC-LAYER-1);
  - đồ thị phụ thuộc theo lớp, mốc `docs/audits/deps-2026-10-30.*` (`scripts/do-thi-phu-thuoc.mjs`, SC-LAYER-2);
  - bản nháp API `packages/module-sdk/API.md`.
- Tự chẩn đoán trong app (PHASES 2.10, RULE-SELF-DIAGNOSTICS):
  - `GET /api/v1/system/health/ready` (L1: migration, trigger bảo vệ sổ, CSDL ghi được); Docker healthcheck của `api` dùng điểm này;
  - `GET /api/v1/system/diagnostics` (L3 toàn vẹn sổ, quyền `reports:read`) và lịch sử `…/diagnostics/runs`;
  - bảng chỉ thêm `diagnostic_runs` (migration `0034_chan_doan.sql`);
  - mã lỗi mới `NOT_READY` (503).
- `GET /api/v1/system/capabilities`: bảng năng lực Bizcity Standard của bản đang chạy (PHASES 2.9).
- Test: `assertLedgerInvariants()` chạy sau mọi tệp test (PHASES 2.2).
- Runtime action `defineAction` (PHASES 2.5, `bizcity_action@1`):
  - quyền, kiểm input, giao dịch, bằng chứng tự động;
  - **chống gửi lặp** bằng header `Idempotency-Key` (bảng `action_requests`, migration `0035_action_requests.sql`);
  - chạy thử `?dryRun=1`;
  - mã lỗi mới `IDEMPOTENCY_CONFLICT`, `CAPABILITY_MISSING`, `MODULE_DISABLED`, `RATE_LIMITED`;
  - `GET /system/capabilities` liệt kê action.
- Bằng chứng chỉ thêm, có chuỗi băm (PHASES 2.6, `bizcity_evidence@1`):
  - migration `0036_bang_chung.sql`: `audit_logs` thêm cột bằng chứng; mọi dòng mới (kể cả nhật ký cũ do service ghi) vào chuỗi băm theo đơn vị;
  - **không sửa, xoá, TRUNCATE** được nhật ký thao tác;
  - action ghi trả biên nhận `meta.receipt`, ghi bằng chứng cả khi bị từ chối; `GET /api/v1/evidence/:id` kiểm lại;
  - tự chẩn đoán `EVIDENCE_CHAIN` phát hiện dòng bị sửa ngầm.
- **MCP cho trợ lý AI** (PHASES 2.11, 2.12, `bizcity_mcp@1`):
  - `POST /mcp`: Claude, ChatGPT hoặc agent khác đọc cân đối phát sinh, số dư tiền, công nợ theo đối tượng của đơn vị;
  - công cụ sinh tự động từ action, chỉ hiện công cụ người gọi có quyền;
  - ghi qua AI **luôn phải xem trước rồi người dùng xác nhận** (`confirm_token` một lần, 15 phút; migration `0037_mcp_xac_nhan.sql`);
  - bằng chứng ghi rõ "AI làm thay người dùng nào, qua kênh nào".
- **Tuyên bố tối thượng và 7 nguyên tắc kiến trúc** (Johnny Chu – Chu Hoàng Anh):
  - tuyên bố: SQL minh bạch, Accounting Core ổn định, cộng đồng tự do phát triển module nhưng không được thay đổi sự thật kế toán;
  - nguyên tắc AP-1..AP-7 khoá trong `bizcity-standard.json#principles`. Mỗi nguyên tắc trỏ tới check thực thi (SC-CMP-2). AP-6 là nợ đã biết, chờ outbox.
- **Ba lớp kiểm soát** Domain / Event / Compliance:
  - hợp đồng mới `bizcity_compliance@1`: 9 yêu cầu STD-CMP + ma trận pháp lý Việt Nam;
  - **ma trận tuân thủ tính tự động** trên bảng điểm từ `docs/standard/compliance-matrix.json` (SC-CMP-1). Ngày 2026-10-30: 59% (3 đạt, 4 một phần, 2 thiếu).
- **ADR-0007 chấp nhận: không dùng Prisma.** ADR-0008 chốt cây thư mục lean: `packages/kernel` một gói, `contracts/` theo ba lớp kiểm soát, sự kiện là gói Platform.
- **Migration** (R-DB-14..19):
  - SQL là nguồn sự thật;
  - migration đã phát hành bất biến (checksum);
  - `scripts/kiem-nang-cap.sh` + job CI `migrate-upgrade`: thử migration trên CSDL có dữ liệu sổ của bản phát hành trước;
  - migration do AI sinh không chạy production khi chưa kiểm + duyệt.
- **Bản công bố kiến trúc** (`docs/CONG-BO-KIEN-TRUC.md`, thiết kế: Johnny Chu – Chu Hoàng Anh):
  - 4 lớp hợp đồng: Domain, Capability, MCP Tool, Extension;
  - trình tự một lệnh ghi; đối chiếu mô hình 10 bước; mức ưu tiên P0–P3;
  - luật bắt buộc và checklist nhận việc 3 giai đoạn (G1–G3), kèm mẫu issue "Nhận việc".
- **Domain Contract** `bizcity_domain@1`: 22 bất biến kế toán (STD-DOM), mỗi bất biến ghi cách được bảo vệ; đổi = K3 + ADR.
- **Capability Contract**:
  - action ghi phải khai `sideEffects`;
  - `GET /api/v1/system/capabilities` công bố input / output schema, quyền, tác dụng phụ, idempotency, loại bằng chứng của từng action (STD-ACT-9).
- **MCP**:
  - công cụ của Core kế toán đổi miền `ketoan.*` → `accounting.*`;
  - thêm `accounting.balance.get` (số dư tài khoản tại một ngày, đọc thẳng sổ).
- **RULE-INFRASTRUCTURE**:
  - R-CACHE: không cache dữ liệu sổ, đọc nhất quán sau khi ghi;
  - R-OUTBOX: sự kiện cùng giao dịch, consumer idempotent;
  - R-BAK: sao lưu, PITR, kiểm khôi phục.
- `scripts/kiem-khoi-phuc.sh`: khôi phục bản sao lưu vào CSDL tạm, chạy kiểm toàn vẹn, so số dòng, ghi nhật ký (R-BAK-3).
- **Chuẩn hoá theo ADR-0007** (học từ bộ 27 gói tham chiếu, giữ sổ cái làm lõi, PostgreSQL là hạ tầng bắt buộc duy nhất):
  - **mã lỗi** `bizcity_errors@1`: danh mục máy đọc `ERROR_CATALOG` (HTTP, thử lại, thông báo, gợi ý), luật R-ERR, `details.reason`. Phản hồi lỗi có `error.requestId`;
  - **quan sát**:
    - mọi phản hồi có `X-Request-Id`; đọc `traceparent`;
    - log JSON một dòng mỗi yêu cầu (`tenant`, `actor`, `route`, `ms`, `errCode`);
    - `GET /metrics` Prometheus (HTTP, CSDL, action, MCP, sổ cái, tự chẩn đoán), có `METRICS_TOKEN` tuỳ chọn;
  - **bộ giám sát tuỳ chọn** `infrastructure/monitoring/`: Prometheus, Alertmanager, Grafana (6 dashboard), Loki + Promtail, exporter; 8 cảnh báo, trong đó có `LedgerIntegrityError`, `PostingBacklog`;
  - **cài nhanh** `bizcity_preset@1`: preset `thuong-mai-ban-le` + `scripts/cai-preset.mjs` (dữ liệu mẫu hư cấu, nạp qua API);
  - **tài liệu**: sơ đồ kiến trúc `docs/architecture/`, `CONTRIBUTING.md`, mẫu báo lỗi `.github/ISSUE_TEMPLATE/bao-loi.yml`, README mới, LAYOUT-7 / LAYOUT-8;
  - **bộ kiểm**: SC-ERR-1, SC-PRESET-1.

### Đổi
- Yêu cầu thanh toán chạy trên runtime action (mẫu đầu tiên). Đường dẫn và khuôn phản hồi giữ nguyên, nhưng:
  - `POST /api/v1/payment-requests` và `…/:id/pay` **bắt buộc** header `Idempotency-Key`. Giao diện tự gửi: bấm đúp "Ghi" / "Chi" không còn tạo yêu cầu hay phiếu chi trùng;
  - `…/:id/pay?dryRun=1` xem trước phiếu chi rồi huỷ;
  - nhật ký thao tác ghi theo mã action (`quy.payment-request.create`…), thay cho `payment_request.create`.
- **Khoá kỳ bị chặn khi sổ trong kỳ có lỗi toàn vẹn** (R-DIAG-4):
  - lỗi gồm Nợ ≠ Có, số dư ngày lệch, đảo sai, bút toán mồ côi, sự việc lệch phiên bản;
  - muốn vẫn khoá: ghi lý do chấp nhận (ít nhất 10 ký tự), lý do lưu vào nhật ký khoá;
  - bảng kiểm trước khi khoá có thêm mục "Lỗi toàn vẹn sổ".
- `POST /api/v1/auth/logout-others` khai `requireUser()` (khoá API → `403 FORBIDDEN`, như service vốn kiểm). `/api/v1/presence*` khai `requireAuthenticated()` — hành vi không đổi.
- Mua hàng → dữ liệu mẫu tạo kho mặc định qua dịch vụ danh mục kho của lõi (có ghi nhật ký), thôi ghi thẳng bảng `warehouses`.
- `0028_thue_kkkn.sql` đổi số thành `0031_thue_kkkn.sql` (sửa trùng số, A-03); `migrate.ts` ghi nhận tên mới cho bản cài đã áp tên cũ, không chạy lại.
- Khuôn nạp sổ đổi tên từ `bizcity_event@1` thành `bizcity_ledger_intake@1`. Tên `bizcity_event@1` từ nay dành cho sự kiện miền.

### Sửa
- Kiểm nâng cấp (`scripts/kiem-nang-cap.sh`) xác nhận:
  - mọi bản trước commit `ccfc341` (gồm `main` 23a834c) **không cài mới được trên CSDL sạch**: code dùng `users.session_version`, `products.parent_manual` khi chưa có migration;
  - nhánh này sửa bằng migration 0029, 0033 và chặn tái phát bằng SC-DATA-7;
  - bản phát hành đầu tiên từ nhánh này là mốc nâng cấp đầu tiên dùng được.
- Lỗi do trigger bảo vệ sổ / bằng chứng ném ra (sửa, xoá bút toán; bút toán không cân) trước đây trả **500 Lỗi hệ thống**; nay trả `CONFLICT` (reason `LEDGER_APPEND_ONLY`) hoặc `UNBALANCED_ENTRY` kèm câu tiếng Việt của trigger (R-ERR-8).
- Migration `0033_ma_hang_cha_sua_tay.sql`: cột `products.parent_manual` code đã dùng nhưng chưa có migration — thêm / sửa mặt hàng (và Mua hàng, ĐVT, tồn max dùng tới) báo "column parent_manual does not exist".
- Vé đăng nhập cấp trước khi có cơ chế thu hồi phiên (không ghi `sv`) bị từ chối ngay: code coi thiếu `sv` = 1 trong khi `users.session_version` mặc định 0 (migration 0029). Nay thiếu `sv` = 0, dùng được tới lần thu hồi đầu như thiết kế.
- Bộ kiểm thêm SC-DATA-7 (`db/types.ts` ↔ migration) để lỗi "khai kiểu mà quên migration" bị chặn ở CI.

### Thay đổi định khoản
- **Định khoản theo chính sách của ngày hạch toán (mức K3, ADR-0009):** chứng từ (cả khi định khoản lại) dùng phiên bản cấu hình định khoản có hiệu lực ở ngày hạch toán của nó.
  - Sửa cấu hình như trước vẫn có tác dụng ngay (hệ thống tự chụp bản bổ sung của chế độ đang áp).
  - Chỉ khi **phát hành** chế độ mới kèm ngày hiệu lực thì chứng từ trước ngày đó mới tiếp tục theo chế độ cũ.
  - Bản đầu = cấu hình đang dùng: sổ đã có không đổi (đã so 128 ô sổ cái trước / sau: trùng).
- Luật định khoản, tài khoản, giá vốn: không đổi.
- **Khoá kỳ (mức K2, RULE-KERNEL):** khoá kỳ bị chặn khi tự chẩn đoán L3 có lỗi trong kỳ (R-DIAG-4).
  - Không đổi bút toán đã ghi, không đổi khoá đã có.
  - Bản cài có sổ lệch sẽ thấy lỗi khi khoá tháng tới: xem `GET /api/v1/system/diagnostics?from&to`. Chấp nhận thì ghi lý do.

### Nâng cấp cần làm
- Migration `0036` cập nhật cột `actor_kind` cho toàn bộ `audit_logs` cũ một lần: bảng lớn thì job `db-migrate` chạy lâu hơn thường. Sau đó nhật ký thao tác **chỉ thêm**: không xoá được đơn vị đã có nhật ký (như sổ cái).
- Khuyên làm trên bản cài thật: đặt `DB_APP_USER=ketoan_app` + `DB_APP_PASSWORD` trong `.env` rồi `docker compose up -d` (DEPLOY D-9). Không đặt thì mọi thứ chạy như cũ.

### Bảo mật
- nginx (container `web`) gửi header bảo mật: `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, CSP `object-src 'none'; base-uri 'self'` (R-SEC-11).
- API có thể chạy bằng vai trò CSDL thường `ketoan_app`: không tắt được trigger bảo vệ sổ, không TRUNCATE (R-SEC-6, R-KER-3). Bật bằng biến môi trường (xem Nâng cấp cần làm).

## [0.1.0] - 2026-10-29

### Thêm
- Mã nguồn đầu tiên đưa lên GitHub:
  - sổ cái chỉ thêm, một cửa nạp chứng từ, luật định khoản, báo cáo;
  - các phân hệ kế toán, quỹ, mua hàng, bán hàng, kho, tài sản, thuế;
  - add-in.
