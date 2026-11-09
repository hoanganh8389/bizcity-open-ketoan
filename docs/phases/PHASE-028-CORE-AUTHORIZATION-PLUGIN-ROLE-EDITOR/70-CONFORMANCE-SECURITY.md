# PHASE-028 · 70 — AUTHZ-STD-001 và phép kiểm SC-AUTH
<!-- [2026-11-05 05:45 PM Johnny Chu - Chu Hoàng Anh] PHASE-028 — W0: 16 luật AUTHZ, 14 phép kiểm SC-AUTH (đánh số lại 2026-11-09) (mở rộng bộ kiểm có sẵn, không validator riêng), mức chặn / cảnh báo theo RULE-QUALITY-GATE -->
<!-- [2026-11-09 Johnny Chu - Chu Hoàng Anh] PHASE-028 — đưa bản draft W0 (05/11) vào main, thêm §0 đối chiếu với mã W1–W5 -->

## 0. Đối chiếu với mã đã merge (2026-11-09)

> Bảng §2 là **đề xuất W0**. Số hiệu đã bị dùng khác đi khi viết mã, nên **không đọc số theo draft**:

| Số hiệu | Draft đề xuất | Đã có trên main |
|---|---|---|
| SC-AUTH-03 | route ghi / MCP / subscriber thiếu gác | ✅ giữ số 03 với nghĩa **danh sách đóng 17 route ghi cố ý** (`route-giu.json`) — bổ sung SC-ACT-1. Phần "thiếu gác / thiếu `resource`" của draft **dời sang SC-AUTH-13** |
| SC-AUTH-04 | route báo cáo / xuất đọc `branchCodes` không qua `scopeOf` | ✅ giữ số 04 với nghĩa **thư viện TGS khớp nguồn, ánh xạ không cho thừa**. Phần báo cáo / xuất của draft **dời sang SC-AUTH-14** |
| SC-AUTH-05 | đổi `risk / operation / resource` không `replaces` | chưa là phép kiểm; có **băm nghĩa** ở `core/authz/types.ts` và test `authz-engine.test.ts` (T028-16) |
| SC-AUTH-06 | mã cấp quyền theo tên vai trò | **không tìm thấy** trong `authz.check.mjs`; dòng "đã có (W1a)" ở §2 là của nhánh draft, kiểm lại trước khi tin |
| SC-AUTH-01, 02, 07..12 | như bảng §2 (giữ số) | chưa |
| SC-AUTH-13, 14 | **mới** do đánh số lại | chưa |

**Đã chốt 2026-11-09:** đánh số lại — SC-AUTH-03 / 04 giữ nghĩa như mã; nội dung draft của hai số này thành **SC-AUTH-13 / 14**; 01, 02, 05..12 giữ số. Bộ nay là **SC-AUTH-01..14** (00-MASTER-PLAN §5 và S028-11 còn ghi `01..12`; sửa ở PR W6). Danh sách thuộc W6 (S028-11). `docs/standard/AUTHZ-STD-001.md` **chưa ban hành**. Luật AUTHZ-03 "hôm nay: vi phạm `auth.ts:95`" **hết đúng** sau D-AUTH-03 bản sửa (owner vẫn tự có quyền module). AUTHZ-10 (nhiều vai trò / người, Cấm thắng Cho) nay đã có mã ở W1–W2. Ca T028 nào đã có test: xem [45](45-CA-BANG-CHUNG.md).


Ban hành thành `docs/standard/AUTHZ-STD-001.md` khi [ADR-0027](../../adr/ADR-0027-core-authorization-plugin-role-editor.md) được duyệt. Phép kiểm mới mức **chặn** cần chữ chốt ở [RULE-QUALITY-GATE](../../rules/RULE-QUALITY-GATE.md) (R-FLOW §3) — bảng §2 là bản đề xuất cho chữ chốt đó.

## 1. Luật

| ID | Luật | Kiểm bằng | Hôm nay |
|---|---|---|---|
| AUTHZ-01 | Menu, route, action, subscriber có tác động nghiệp vụ khai id ổn định, module chủ, quyền, nhãn | SC-AUTH-01, 02, 03, 13 | route: SC-API-3; menu: 18 / 304 mục có quyền |
| AUTHZ-02 | Nhãn, thứ tự, đường dẫn, mã màn, tên nút không làm khoá quyền; mã cũ = bí danh có không gian tên | SC-AUTH-11 | chưa |
| AUTHZ-03 | Đăng ký ≠ cấp; quyền mới chưa ai có, kể cả chủ đơn vị | SC-AUTH-06; T028-2 | **vi phạm** `auth.ts:95` |
| AUTHZ-04 | Role Editor sinh từ sổ quyền đã kiểm, không nhận quyền tuỳ ý từ client | T028-12 | — |
| AUTHZ-05 | Gác ở API / action; báo cáo, xuất, tìm, lô, job áp phạm vi + che trường | SC-AUTH-03, 13, 14; T028-7, 8 | **vi phạm** phạm vi báo cáo |
| AUTHZ-06 | Module không tự tạo / cấp vai trò, không ghi bảng `authz_*`, không ghi sổ | SC-AUTH-07 | sổ: đã chặn bằng vai trò CSDL |
| AUTHZ-07 | Quyền, bí danh có phiên bản, nhật ký, ma trận tương thích; gỡ module không xoá lịch sử | SC-AUTH-05; T028-11 | — |
| AUTHZ-08 | Năm cổng độc lập; một cổng trượt = từ chối / chờ | T028-14, 15 | cổng 1, 3, 4, 5 có |
| AUTHZ-09 | Quyền cao cấp đích danh, xác thực lại, không ký tự đại diện, không cho AI / khoá API | SC-AUTH-09; T028-12, 13 | một phần `actions.ts:392` |
| AUTHZ-10 | Nhiều vai trò / người, mỗi gán có phạm vi, mục đích, hiệu lực; Cấm thắng Cho | T028-1 | chưa |
| AUTHZ-11 | Đơn vị / chi nhánh / kho của tài nguyên giải quyết ở server; RLS là lớp thứ hai | SC-AUTH-08; T028-3 | RLS có; phạm vi do client gửi |
| AUTHZ-12 | Tách `cancel` / `void` / `reverse`; "Xóa" cũ không thành xoá cứng | schema `operation` không có `delete`; T028-14 | sổ chỉ thêm có |
| AUTHZ-13 | Người lập không tự duyệt khi luồng đòi người độc lập | T028-19 | chưa xác minh |
| AUTHZ-14 | AI / MCP, khoá API, job có định danh riêng, quyền tối thiểu | T028-13 | MCP có; job chạy `system` |
| AUTHZ-15 | Đổi quyền tăng `authz_version`, đệm cũ mất hiệu lực ngay; quyết định có `reasonCode` + `decisionId` | T028-6 | `session_version` có |
| AUTHZ-16 | Chức năng có menu nhưng thiếu gác / phạm vi / test = `mot-phan` hoặc `chua`, không `dat` | schema tiêu chí; T028-20 | HT10 không tick tay |

## 2. Phép kiểm

Mở thư mục `tests/conformance/checks/authz/` theo khuôn check hiện có (`id`, `gate`, `rules`, `enforce`, `run(ctx)` — xem `tests/conformance/checks/action/action.check.mjs`); ca tự kiểm ở `tests/conformance/fixtures/repo-bad/**` + dòng trong `fixtures/expect.json` (sổ dùng chung, R-FLOW). `npx bizcity module check <key>` gọi cùng các check với `targets: ['module']`.

| Check | Nội dung | Mở rộng / mới | Mức đề xuất | Wave |
|---|---|---|---|---|
| SC-AUTH-01 | id menu / route / action trùng, rỗng, sai không gian tên, cha không có | mở rộng SC-CON-2 (`contract.check.mjs:79`) + `defineWebModule` | chặn | W2 |
| SC-AUTH-02 | action / menu / route trỏ quyền không có; quyền không thuộc module | runtime đã có (`app.ts:234-235`); thêm phía web menu + manifest | chặn | W2 |
| SC-AUTH-03 | **ĐÃ CÓ (W3 đợt 2):** route ghi cố ý không là `defineAction` phải khai `// @bizcity-route: <lý do>` và có tên trong danh sách đóng 17 route (`route-giu.json`) | bổ sung SC-ACT-1 (`tests/conformance/checks/authz/authz.check.mjs`) | chặn | W3 ✅ |
| SC-AUTH-04 | **ĐÃ CÓ (W5 đợt 2):** thư viện TGS khớp nguồn CSV, ánh xạ không cho thừa quyền | `authz.check.mjs` + fixture `authz-tgs-bad` | chặn | W5 ✅ |
| SC-AUTH-05 | `permissions[]` đổi `risk` / `operation` / `resource` của key đã có mà không `replaces` / ghi chú | mới, so `docs/standard/quyen.json` (bản chụp sinh tự động) | chặn | W2 |
| SC-AUTH-06 | mã cấp quyền module theo tên vai trò (`role === 'owner'`, đọc `roles` để cấp) | **chưa có** (draft ghi "đã có" ở nhánh W1a; không tìm thấy trong `authz.check.mjs` trên main) | chặn | W1a ✅ |
| SC-AUTH-07 | module ghi `authz_*`, `ledger_*`, migration lõi, gọi `ledgerService` | mở rộng SC lớp / biên module (`tests/conformance/lib/layers.mjs`) + vai trò CSDL ADR-0011 D4 | chặn | W2 |
| SC-AUTH-08 | handler đọc `tenantId` / `branchId` từ body / query rồi dùng làm điều kiện ghi | mới, quét tĩnh mẫu `req.body.tenantId` | cảnh báo | W3 |
| SC-AUTH-09 | luật mẫu (`*:*`, `quy/*:*`) phủ quyền `high`; gán quyền `high` cho `apikey` / `agent` | runtime (từ chối lưu) + test | chặn | W3 |
| SC-AUTH-10 | quyền mới không có ca demo / test theo vai trò | mới | cảnh báo → chặn khi phát hành | W6 |
| SC-AUTH-11 | quyền mồ côi, bí danh trùng nghĩa (DM12, ACC89, mã TGS), mã màn trùng nhãn khác | **một phần đã có**: phần "mã màn một mã hai nhãn" trong `apps/web/src` (mức info; repo thật 13 mã — DM12, ACC89, DM02, DM08, DM10, HT05, MH01/04/05/06/21/22, TI12; cần người phân biệt đổi cách gọi với khác nghĩa). Còn: quyền mồ côi, bí danh trùng, đối chiếu `tgs-mapping` | cảnh báo (có người xử lý) | W1a 🟡 |
| SC-AUTH-12 | sổ cái bị ghi trực tiếp / sự việc bị loại bị rơi | dùng lại phép kiểm sổ chỉ thêm và bể chờ hiện có | chặn (đã có) | — |
| SC-AUTH-13 | công cụ MCP / subscriber thiếu gác, hoặc route / action thiếu `resource` khi quyền có `scopeKinds` | phần còn lại của đề xuất 03 cũ; mở rộng SC-API-3 (`action.check.mjs:39-63`) | chặn (giữ baseline 12 nợ) | W3 |
| SC-AUTH-14 | route báo cáo / xuất đọc `branchCodes` / `warehouseCodes` mà không qua `scopeOf` | mới, quét tĩnh | cảnh báo → chặn ở W6 | W5 |

Sinh `docs/standard/quyen.json` (bản chụp sổ quyền: id, module, risk, operation, aliases) bằng lệnh, như `tru-cot-md.mjs`: mọi đổi cây quyền thành diff khi duyệt PR. Đổi `docs/standard/*` theo luật phiên bản của chính tệp.

## 3. Ca kiểm nghiệm thu

Danh sách 20 ca `T028-*` và vị trí test: [45-CA-BANG-CHUNG §Ca bằng chứng](45-CA-BANG-CHUNG.md#ca-bằng-chứng).
