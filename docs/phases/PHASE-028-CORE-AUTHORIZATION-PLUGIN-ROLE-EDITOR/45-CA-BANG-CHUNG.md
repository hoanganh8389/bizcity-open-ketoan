# PHASE-028 · 45 — Ca bằng chứng T028-* và vai trò mẫu
<!-- [2026-11-09 07:19 PM Johnny Chu - Chu Hoàng Anh] PHASE-028 — tách hai mục của checklist draft W0 ra tệp riêng (checklist chính 40 là tệp nóng, nhiều phiên sửa); thêm đối chiếu mã -->

> Nguồn: bản draft `40-MASTER-CHECKLIST` ngày 05/11. **Trạng thái việc con** vẫn ở [40](40-MASTER-CHECKLIST.md); tệp này chỉ giữ danh sách ca và vai trò mẫu.
>
> **Đối chiếu 2026-11-09:** `T028-1`, `T028-2`, `T028-4`, `T028-5`, `T028-8`, `T028-9`, `T028-13`, `T028-16`, `T028-18`, `T028-22` có xuất hiện trong test của `apps/api` / `tests` (tìm theo mã, **chưa chạy lại**, chưa xác nhận từng ca đủ điều kiện "Đạt khi"). Các ca còn lại chưa có test mang mã đó. Ca T028-21 viết theo `authz:manage` (không tồn tại, màn dùng `users:write`) — cần viết lại. Ca T028-23..26 thuộc truy vết, xem [60](60-TRUY-VET-CHUNG-TU.md) §0.
>
> **Vai trò mẫu:** bản draft; 28 vai trò TGS đã nạp bản nháp vô hiệu ở `docs/standard/phan-quyen/`, còn các mẫu dưới đây (`cashier`, `warehouse_keeper`…) **chưa là mã**. Dòng `tenant_owner` "không tự có quyền module mới" **lỗi thời** (D-AUTH-03 bản sửa).

## Ca bằng chứng

| Ca | Đạt khi | Wave | Kiểm cho |
|---|---|---|---|
| T028-1 `USER_MULTI_ROLE` | một người 2 vai trò ở 2 chi nhánh, một vai trò chỉ báo cáo: lập phiếu ở A được, ở B bị từ chối, xem báo cáo B được | W1b | AUTHZ-10 |
| T028-2 `ROLE_DEFAULT_DENY` | cài module có quyền mới: chủ đơn vị cũ bị từ chối cho tới khi có luật | W1a | AUTHZ-03 |
| T028-3 `TENANT_ISOLATION` | biết id tài nguyên của đơn vị khác vẫn bị từ chối (NOT_FOUND) | W1b | AUTHZ-11 |
| T028-4 `WAREHOUSE_REPORT_VS_OPERATE` | phạm vi báo cáo kho K1 không lập / duyệt phiếu ở K1 | W5 | AUTHZ-05 |
| T028-5 `TRANSFER_TWO_SIDES` | người xuất ở A không xác nhận nhận ở B | W5 | AUTHZ-10 |
| T028-6 `REVOKE_NOW` | thu hồi gán → yêu cầu kế tiếp bằng vé cũ (API, MCP) bị từ chối | W3 | AUTHZ-15 |
| T028-7 `API_GUARD_NOT_UI_ONLY` | menu ẩn, gọi REST trực tiếp vẫn bị từ chối | W3 | AUTHZ-05 |
| T028-8 `EXPORT_SCOPE` | Excel / PDF cùng hạn chế dòng + trường như màn hình; `branchCodes` rỗng không thành "tất cả" | W5 | AUTHZ-05 |
| T028-9 `LEGACY_ROLE_PARITY` | 6 vai trò × 18 quyền: cũ = mới; dual-read 0 ALLOW sai trên toàn bộ test hiện có | W1b | D7 |
| T028-10 `MODULE_UPGRADE_PERMISSION_DIFF` | nâng cấp thêm quyền high / đổi low → high: không ai tự có, luật cũ bị treo | W2 | AUTHZ-03, 07 |
| T028-11 `PLUGIN_UNINSTALL_AUDIT_SURVIVES` | tắt / gỡ module: chứng từ, nhật ký, lịch sử gán còn | W2 | AUTHZ-07 |
| T028-12 `HIGH_RISK_STEP_UP` | cấp quyền / sửa giá vốn / khoá kỳ đòi xác thực lại; tự cấp cho mình bị từ chối (🟡 API có test; chưa có hạn 5 phút) | W4 | AUTHZ-09 |
| T028-13 `MCP_DELEGATION` | trợ lý không nhận quyền high; ghi vẫn qua xác nhận người | W3 | AUTHZ-14 |
| T028-14 `LEDGER_APPEND_ONLY` | vai trò cao nhất vẫn không UPDATE / DELETE / TRUNCATE `ledger_*` | W3 | AUTHZ-08, 12 |
| T028-15 `CONFORMANCE_QUARANTINE` | sự việc lỗi vào bể chờ, sửa có quyền, tái kiểm, ghi sổ | W3 | AUTHZ-08 |
| T028-16 `MENU_ID_STABILITY` | đổi nhãn / đường dẫn menu không đổi quyền | W2 | AUTHZ-02 |
| T028-17 `PERMISSION_ALIAS_CONFLICT` | SC-AUTH-11 bắt `DM12`, `ACC89`, `tgs:HT10` ↔ `repo:HT10` | W1a | AUTHZ-02 |
| T028-18 `BULK_100_BRANCHES` | `batchAuthorize` = gọi lẻ; báo cáo không N+1; công bố số đo | W3 | §8 kiến trúc |
| T028-19 `SOD_CONFLICT` | người lập không tự duyệt phiếu khi luồng đòi người độc lập | W5 | AUTHZ-13 |
| T028-20 `SCOREBOARD_EVIDENCE` | tiêu chí `dat` thiếu `checkId` / `testId + repoCommit` → schema từ chối; giao diện không có nút chấm | W6 | AUTHZ-16 |
| T028-23 `POSTED_SNAPSHOT` | sau V2, đọc bút toán E1 trả nội dung V1, không phải V2 | W5 | DOC-03, TRACE-02 |
| T028-24 `DOC_TO_LEDGER_CHAIN` | từ `doc_ref` của module ra đủ sự việc → bút toán (kể cả đảo) và đi ngược lại | W5 | DOC-05, TRACE-03 |
| T028-25 `REVERSAL_REASON` | mọi bút toán đảo có lý do không rỗng | W5 | TRACE-05 |
| T028-26 `CHAIN_ACROSS_VERSIONS` | mua 100 → bán 60 → sửa phiếu mua thành 90 → tính lại giá vốn: tồn 30, sổ cân, mỗi bút toán chỉ đúng V1 / V2 | W5 | TRACE-08 |
| T028-21 `LAST_OWNER` | thu hồi gán `authz:manage` cuối cùng bị từ chối (🟡 API chặn thu hồi lần gán chủ đơn vị cuối, có test; chưa có `authz:manage`) | W1b | [20](20-KIEN-TRUC.md) §6 |
| T028-22 `RELAX_NOT_GRANT` | Nới `*:update {edit_window: 3d}` không mở màn người đó chưa có Cho | W1b | D-AUTH-04 |

## Vai trò mẫu

Preset là **mẫu**: đơn vị dùng → thành vai trò của đơn vị, không tự đổi theo mẫu. Cột "Không bao giờ" là luật cứng, không phải mặc định.

| Mẫu | Phạm vi mẫu | Không bao giờ |
|---|---|---|
| `tenant_owner` (hệ thống: `owner`) | quản trị đơn vị, người dùng, vai trò, xem tổng thể | tự có quyền module mới; `period-reopen`, đảo sổ, quyền module high khi chưa cấp đích danh |
| `chief_accountant` (hệ thống) | toàn bộ nghiệp vụ kế toán, khoá kỳ, duyệt theo luồng, trong phạm vi pháp nhân / sổ được gán | ghi `ledger_*`; mở kỳ / đảo hàng loạt / publish luật định khoản không cấp đích danh |
| `general_accountant` | chứng từ tổng hợp, đối chiếu, báo cáo, đề xuất kết chuyển | tự duyệt phiếu của mình khi luồng đòi người độc lập |
| `sales_accountant` | doanh thu, phải thu, hoá đơn, công nợ bán | mở sổ, sửa giá vốn |
| `purchase_accountant` | nhập mua, phải trả, hoá đơn NCC | sửa điều khoản duyệt NCC |
| `inventory_accountant` | đối chiếu tồn, giá vốn (xem), sổ kho | thao tác kho ngoài phạm vi gán |
| `cash_accountant` | thu / chi, sổ quỹ | lập và duyệt cùng một phiếu chi vượt ngưỡng |
| `tax_accountant` | hồ sơ thuế, báo cáo thuế | xuất dữ liệu thuế không nhật ký |
| `cashier` | POS, thu tiền, in trong ca; sửa / huỷ trong ngày, phiếu của mình | xem giá vốn / lợi nhuận |
| `warehouse_keeper` | lập / xác nhận phiếu kho ở kho được gán | tự duyệt mọi bước, đổi giá vốn |
| `store_manager` | duyệt theo hạn mức, báo cáo cửa hàng | xem pháp nhân khác |
| `regional_manager` | nhiều cửa hàng / chi nhánh, duyệt theo ngưỡng | quyền kế toán xuyên đơn vị |
| `auditor` (hệ thống) | chỉ đọc, xuất có nhật ký, xem nhật ký | sửa dữ liệu |
| `developer` (hệ thống) | Bàn điều tra của đơn vị | ghi chứng từ, đọc ngoài phạm vi |
| `integration_service` | quyền kỹ thuật qua khoá / app | quyền high; dùng vai trò của người |
| `ai_assistant` | tra cứu, nháp, mô phỏng, đề xuất | hành động high; ghi không xác nhận của người |
