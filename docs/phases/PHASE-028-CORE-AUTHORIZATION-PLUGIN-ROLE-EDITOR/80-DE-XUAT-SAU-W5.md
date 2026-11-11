# PHASE-028 · 80 — Sau W5: vá an toàn, quyền theo loại chứng từ, Role Editor dạng bảng
<!-- [2026-11-09 01:45 PM kiennt] PHASE-028 — giai đoạn 0 (chỉ tài liệu): rà mã sau W5, 7 quyết định chờ chủ (D-AUTH-17..23), xếp đợt tiếp vào wave sẵn có, việc dọn giữ chỗ -->
<!-- [2026-11-09 08:30 PM kiennt] PHASE-028 — cập nhật sau khi có mã trên nhánh (8 commit): trạng thái từng việc, đính chính phát hiện, tách quyết định đã có / mới, khoảng trống phạm vi chi nhánh so với HTsoft, kết quả kiểm -->

> **Trạng thái:** Nháp, chờ chủ dự án đọc. Mã nằm ở các nhánh cục bộ (chưa đẩy) — bảng §4.
> **Đọc trên:** `origin/main` @ `6b295c15` (2026-11-09). Khác `main` thì `main` thắng (R-FLOW-7).
> **Chi tiết sửa lõi:** [81-CHI-TIET-SUA-LOI](81-CHI-TIET-SUA-LOI.md) — từng tệp Platform / Kernel / hợp đồng / bộ kiểm: trước / sau, vì sao, ảnh hưởng, rủi ro, cách lùi, test.
> **Liên quan:** [ADR-0027](../../adr/ADR-0027-core-authorization-plugin-role-editor.md) Phụ lục A · [20 §0](20-KIEN-TRUC.md) · [45](45-CA-BANG-CHUNG.md) · [PHASE-030 / 22](../PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/22-DANH-GIA-GON-PHAN-QUYEN.md) · [`bizcity_authorization@1`](../../contracts/BIZCITY-AUTHORIZATION-v1.md)

## 1. Vì sao có tệp này

W1–W5 đã có mã (nhiều vai trò, vai trò của đơn vị Cho / Cấm, HT12, shadow, chi nhánh ở cửa nạp, thư viện TGS). Khi rà để bổ sung chi tiết nghiệp vụ (so HTsoft, MISA) thấy hai việc phải làm trước khi mở rộng: còn **lỗ an toàn** (§2) và quyền khai được nhưng **chưa có chỗ chặn** ở đường nghiệp vụ chính (cửa nạp chỉ kiểm `documents:write`, báo cáo lấy phạm vi từ client, ký chứng từ theo tên vai trò).

## 2. Phát hiện đọc mã và trạng thái

| # | Phát hiện | Bằng chứng (main) | Trạng thái |
|---|---|---|---|
| F1 | Leo thang qua tạo / sửa người dùng (`users:write` tự nâng owner, đặt lại mật khẩu owner) | `apps/api/src/modules/access/access.service.ts:39-82` | ✅ vá (`638b209f`) |
| F2 | Khoá API vượt quyền người tạo | `access.service.ts:130`; `core/auth.ts:143` | ✅ vá (`638b209f`); khoá cũ không đụng — chủ quyết thu hồi hay giữ |
| F3 | Ký / huỷ chữ ký (action ghi) gác `documents:read` | `packages/platform/src/documents/signature.routes.ts:73,104` | ✅ vá (`638b209f`) |
| F4 | Kiểm theo tên vai trò: ô kế toán trưởng / giám đốc, huỷ chữ ký; chấp nhận cảnh báo nạp | `signature.routes.ts:39-40,116`; `packages/kernel/src/modules/intake/repair.ts:137` | ✅ phần ký (ánh xạ tạm `periods:lock`, `payments:approve-final` — D-AUTH-26); ⏳ `repair.ts` (cấu hình đơn vị, Kernel) |
| F5 | Báo cáo / xuất lấy phạm vi do client gửi, rỗng = tất cả | `addins/excel-export`; `modules/sales/sales-report.routes.ts:46` | ⏳ **chưa** — xem §5 (khoảng trống lớn nhất còn lại) |
| F6 | Cửa nạp không phân biệt loại chứng từ | `packages/kernel/src/modules/documents/document.routes.ts:81,99` | ✅ (`d8f7fb7a`, `397e8210`) |
| F7 | Chưa module nào khai `permissions[]` | `modules/*`, `apps/api/src/phan-he/*/bizcity.module.json` | ✅ 5 phân hệ khai 32 quyền (`d8f7fb7a`, `397e8210`) |
| F8 | SSO: vé dùng lại được 5 phút; JWT 12 giờ; quyền WP thay toàn bộ | `apps/api/src/modules/auth/wp-sso.ts:82` | ✅ vé một lần + phiên SSO 2 giờ (`b764fd72`); ⏳ WP chỉ xác thực, phạm vi theo blog |
| F9 | Route đọc không khai bảo vệ (12 nợ SC-API-3); không giới hạn đăng nhập sai | `system.routes.ts`, `auth.routes.ts` | ✅ (`638b209f`) — SC-API-3 hết nợ |

**Đính chính bản trước (2 phát hiện sai):** `GET /api/v1/tenant` chỉ trả logo trong `settings`, không lộ cấu hình; `core.notification.read` chỉ đánh dấu hộp thư của chính người dùng — gác `documents:read` là hợp lý. Hai mục này đã bỏ khỏi F9 / F3.

## 3. Quyết định

### 3.1 Đã có quyết định (không phải chờ duyệt — bản trước ghi nhầm là mới)

| Mục | Căn cứ | Đã làm |
|---|---|---|
| Hạn gỡ đường cũ: hai tuần shadow sạch rồi `auth.ts` chỉ gọi `authorize`, PR riêng | ADR-0027 chữ chốt W3 đợt 2 mục 3 | số đo + API xem lệch (`b764fd72`); **chưa** chuyển |
| Bỏ Nới, điều kiện 8 → 5 | ADR-0027 chữ chốt W3 đợt 2 mục 5; PHASE-030 / 22 §3 #1–#4 (Q030-5 = B) | ✅ bộ tính + hợp đồng 1.1.0-draft (`18560aa0`) |

### 3.2 Chờ chủ dự án

| ID | Quyết định | Đề xuất / đã làm thử | Ảnh hưởng nếu không duyệt |
|---|---|---|---|
| D-AUTH-17 | Thứ tự: vá an toàn trước mở rộng | đã làm như vậy | — |
| D-AUTH-18 | Lấy lại phần draft W0: `registerMenu` / `registerAction`, vai trò mẫu "Dùng mẫu", `maskFields`, bỏ kiểm theo tên vai trò | đã làm: "Dùng mẫu TGS", bỏ kiểm theo tên vai trò ở ký; **chưa**: `registerMenu`, `maskFields` | — |
| D-AUTH-19 | **Sổ đăng ký loại chứng từ**: phân hệ đăng ký quyền theo thao tác (`registerDocumentType(loại, { read, create, cancel, export })`, quyền khai ở manifest); cửa nạp / danh sách / chi tiết / huỷ / bảng kê bán hàng tra sổ; phân hệ chưa bật → quyền Core | ✅ (`d8f7fb7a`, `397e8210`) | gỡ hai commit đó | — chữ chốt đề xuất §3.4, mã S028-22
| D-AUTH-20 | Quyền khai phải có chỗ chặn (quyền mồ côi) | ✅ SC-AUTH-11 (`83367f15`) | — |
| D-AUTH-23 | 28 nhóm TGS trong repo công khai (draft W0 D-AUTH-11 nói không) | chưa đổi — xin chủ xác nhận | — |
| **D-AUTH-24** (mới) | **Quyền kéo theo**: `documents:read` → quyền xem chi tiết, `documents:write` → lập / huỷ, `reports:read` → xuất; tính sau Cho, trước Cấm; **Cấm quyền gốc phủ quyền kéo theo** (luật `documents:*` cũ vẫn chặn được mọi loại phiếu) | ✅ (`d8f7fb7a`, `397e8210`) — để không ai mất quyền khi phân hệ đăng ký | Nới cách hiểu D-AUTH-03 (quyền module mới mặc định chỉ owner có): kế toán có sẵn quyền chứng từ chi tiết. Không duyệt → phải cấp quyền chi tiết cho vai trò hệ thống qua `roles` của manifest | — chữ chốt đề xuất §3.4, mã S028-22
| **D-AUTH-25** (mới) | Phạm vi **kho** ở lần gán (`scopeType = warehouse`), cửa nạp kiểm mọi kho của dòng hàng (trống = kho mặc định) | chữ chốt đề xuất §3.3; mã S028-19 | — |
| **D-AUTH-26** (mới) | Ký ô kế toán trưởng / giám đốc theo quyền: ánh xạ tạm `periods:lock` / `payments:approve-final` tới khi có quyền ký riêng (cần nới D-AUTH-13) | ✅ (`638b209f`) | về kiểm theo tên vai trò |
| **D-AUTH-27** (mới) | Phân hệ đăng ký quyền vào **vai trò mẫu** (`permissions[].roles = "tpl:<mã>"`) + thư viện vai trò mẫu theo phần hành + khởi tạo kiểu WP | đã làm thử rồi **bỏ** (chưa commit) — đổi hợp đồng `bizcity_module@1`, cần chủ chốt trước | — |

### 3.3 Chữ chốt đề xuất D-AUTH-25 — phạm vi kho (S028-19)
<!-- [2026-11-11 09:00 AM kiennt] PHASE-028 — chữ chốt đề xuất D-AUTH-25 (R-FLOW-2) trước PR code S028-19; merge PR này = chủ dự án đồng ý -->

> **Trạng thái:** đề xuất, chờ chủ dự án. Merge PR tài liệu chứa mục này = đồng ý; không đồng ý thì gỡ dòng giữ chỗ S028-19.

- **Vấn đề.** W5 đợt 1 chỉ gán vai trò theo **chi nhánh**. Thủ kho, nhân viên bán hàng ở một kho (HTsoft: `tblUserKho`) không giới hạn được theo kho: được gán chi nhánh là lập phiếu được ở mọi kho của chi nhánh.
- **Lựa chọn.** (a) Thêm phạm vi **kho** ở lần gán, kiểm ở cửa nạp — **chọn**. (b) Giữ chi nhánh, tách kho thành chi nhánh con — loại: sai mô hình dữ liệu, kho không phải chi nhánh. (c) Để sau W6 — loại: thủ kho là trường hợp thật ở đơn vị đang dùng.
- **Hình dạng.**
  - `core.user.role-assign` nhận `scopeType: 'tenant' | 'branch' | 'warehouse'`; `warehouse` cần `scopeId` = id kho của **đơn vị**, kho **đang dùng** (không thì 404 / 409). Không đổi lược đồ (cột `scope_type` / `scope_id` có sẵn từ 0073).
  - Cửa nạp (`POST /api/v1/documents`, `/batch`, Kernel): chứng từ có dòng hàng — `sale`, `sale_return`, `purchase`, `purchase_return`, `transfer`, `stock_adjustment` — trả **một vị trí cho mỗi kho** của dòng (`{ branchId, warehouseId }`); dòng không ghi kho = kho mặc định của chi nhánh (cùng `defaultWarehouseOf` lúc ghi kho). **Mọi** vị trí phải được phép (`requireScope`). Chuyển kho: kho **xuất**. Kho không thuộc chi nhánh của phiếu → vị trí rỗng → từ chối (đóng an toàn). Chứng từ không có hàng → chỉ chi nhánh (như W5).
  - Có quyền toàn đơn vị → đi đường nhanh, không truy vấn kho.
  - `GET /api/v1/warehouses` trả thêm `id`; HT12 thẻ Người dùng có "Một kho".
- **Ảnh hưởng.** Chỉ người được gán theo kho hoặc chi nhánh; người có quyền toàn đơn vị (kế toán, khoá API) không đổi. Người gán theo chi nhánh vẫn lập được ở mọi kho của chi nhánh đó. Chưa phủ: **xem** / báo cáo theo kho (§5), phía nhận của chuyển kho.
- **Kiểm bằng.** `apps/api/test/authz-scope-intake.test.ts` (4 ca kho: được / không được kho, dòng trống = kho mặc định, kho khác chi nhánh); typecheck; selfcheck.

### 3.4 Chữ chốt đề xuất D-AUTH-19 + D-AUTH-24 — quyền theo loại chứng từ (S028-22)
<!-- [2026-11-11 09:30 AM kiennt] PHASE-028 — chữ chốt đề xuất D-AUTH-19, D-AUTH-24 (R-FLOW-2) trước PR code S028-22; hình dạng ở hợp đồng §3a; merge PR này = chủ dự án đồng ý -->

> **Trạng thái:** đề xuất, chờ chủ dự án. Merge PR tài liệu chứa mục này = đồng ý cả hai; không đồng ý thì gỡ dòng giữ chỗ S028-22 (và S028-23 đi sau nó).

- **Vấn đề.** 18 quyền Core không chi tiết tới nghiệp vụ: có `documents:write` là lập / huỷ được mọi loại phiếu; không có cách cho thủ kho chỉ lập phiếu chuyển kho, hay cấm một người huỷ hoá đơn bán. HTsoft / MISA phân theo từng chức năng × thao tác (xem / thêm / sửa / xoá / xuất). Phân hệ cũng chưa có chỗ khai "loại phiếu của tôi cần quyền gì" — lõi phải viết cứng.
- **Lựa chọn.**
  - D-AUTH-19: (a) **sổ đăng ký trong mã**, phân hệ đăng ký kiểu hook lúc nạp (`registerDocumentType`), quyền khai ở manifest — **chọn**; (b) thêm quyền Core cho từng loại — loại: D-AUTH-13 không cho thêm quyền Core, và lõi phải biết nghiệp vụ; (c) bảng CSDL loại → quyền — loại: thêm migration, không có lợi hơn khi phân hệ là mã.
  - D-AUTH-24: (a) **quyền Core kéo theo quyền chi tiết**, Cấm quyền gốc phủ quyền kéo theo — **chọn**: không ai mất quyền khi phân hệ đăng ký, luật Cấm `documents:*` đơn vị đang dùng không bị lách; (b) không kéo theo, khai `roles` cho từng quyền trong manifest và cấp riêng cho khoá API / SSO — loại: dễ sót, khoá API của hệ thống bán hàng ngừng chạy ngay khi phân hệ bật.
  - **Nới cách hiểu D-AUTH-03:** quyền module mới mặc định chỉ owner có; với quyền chứng từ chi tiết, ai có quyền Core cũng có. Đây là điểm cần chủ dự án đồng ý.
- **Hình dạng.** [`bizcity_authorization@1` §3a](../../contracts/BIZCITY-AUTHORIZATION-v1.md) (1.2.0-draft): `registerDocumentType`, `documentPermissionOf`, `canDocument`, `withImplied`, `impliersOf`; tên quyền `<module>:<chức-năng>-<xem|lap|huy|xuat>`; nơi thi hành và giới hạn. Năm phân hệ khai 32 quyền: bán hàng (hoá đơn, trả lại — có `-xuat`), mua hàng, kho (chuyển kho, điều chỉnh), quỹ (thu / chi / chuyển tiền), kế toán (phiếu kế toán).
- **Ảnh hưởng.**
  - `/auth/me` trả thêm quyền chi tiết (kéo theo); `apps/ticket/exchange` **không** đổi (chỉ quyền Core).
  - Người có quyền Core: không đổi gì. Người bị Cấm một loại: danh sách không còn loại đó, chi tiết 404, không lập / huỷ / xuất được loại đó.
  - Action `kho.transfer.*` đổi cổng từ `documents:write` sang `kho:chuyen-kho-lap` / `-huy` (kéo theo từ `documents:write`, không ai mất quyền).
  - Lõi: `core/auth.ts` (+~100 dòng), `core/authz/*` (kéo theo trong bộ tính shadow), Kernel `document.routes.ts`, `document.repository.ts` (K3). Không migration. Chi tiết từng tệp: [81 §1.3, §1.4, §3.2, §5](81-CHI-TIET-SUA-LOI.md).
- **Kiểm bằng.** `apps/api/test/authz-scope-intake.test.ts` (kế toán có sẵn mọi quyền chi tiết; Cấm `ban-hang:*`; thủ kho chỉ Cho `kho:chuyen-kho-lap`; Cấm `documents:*` vẫn chặn mọi loại; khoá API vẫn nạp mọi loại; Cấm xem → lọc + 404; Cấm huỷ; Cấm xuất; Cấm lập / huỷ chuyển kho chặn cả action); SC-AUTH-11 (32 quyền đều có chỗ chặn); typecheck; selfcheck.

## 4. Mã trên nhánh (chưa đẩy, chưa PR)

Chuỗi nối tiếp từ `main` @ `6b295c15`; mỗi commit một PR khi được duyệt (R-FLOW-4: không chồng quá 2 tầng — mở lần lượt).

| Commit | Nội dung | Đụng lõi |
|---|---|---|
| `638b209f` | F1, F2, F3, F4 (ký), F9: chống leo thang người dùng / khoá API, ký theo quyền, 12 route khai bảo vệ, giới hạn đăng nhập sai | `core/auth.ts` (scopePermissions), `documents/signature.routes.ts` |
| `b764fd72` | Kiểm phiên không đệm + đệm quyền theo `tenants.authz_version` (thu hồi có hiệu lực từ yêu cầu kế tiếp ở mọi bản API); `bizcity_authz_shadow_total` + `GET /api/v1/system/authz-shadow`; vé SSO một lần, `WP_SSO_TTL_HOURS` (2) | `core/security/*`, `core/authz/shadow.ts`, `metrics.ts`, `tokens.ts`, `env.ts` |
| `18560aa0` | Bỏ Nới, điều kiện còn 5 (hợp đồng 1.1.0-draft); phạm vi kho ở lần gán và cửa nạp | `core/authz/*`, Kernel `document.routes.ts` |
| `83367f15` | HT12: "Dùng mẫu TGS", Cho / Cấm cả nhóm, HT01 → HT12; SC-AUTH-11 | — (module, bộ kiểm) |
| `d8f7fb7a` | D-AUTH-19 / -24 phần lập: cửa nạp theo loại chứng từ, 5 phân hệ khai và đăng ký | `core/auth.ts`, `core/authz/*`, Kernel |
| `397e8210` | D-AUTH-19 đủ bộ thao tác: xem (danh sách lọc, chi tiết 404), huỷ, xuất (bảng kê bán hàng); 32 quyền | `core/auth.ts`, Kernel `document.*` |
| `abc05112` | HT12 màn "Sửa vai trò" dạng bảng chức năng × thao tác (Danh mục / Nghiệp vụ / Báo cáo / Tiện ích, Toàn quyền theo dòng / nhóm / mục, Lưu mới ghi) | — |
| `a89319ea` | HT12 giao diện: một thang chữ, tên tiếng Việt, mở vào thẻ Vai trò, vai trò mặc định chỉ xem | — |

## 5. Khoảng trống lớn nhất: phạm vi chi nhánh khi XEM

Gán theo chi nhánh / kho hôm nay chỉ có tác dụng khi **nạp chứng từ**. Mọi người dùng có vai trò chính (thấp nhất Người xem) với `documents:read` / `reports:read` toàn đơn vị → kế toán gán "chỉ CN01" vẫn xem và xuất số mọi chi nhánh.

HTsoft (dịch ngược, `phan-tich-htsoft-vat`) tách **theo từng người** hai danh sách: `tblUserKho` (kho làm việc — ô chọn kho trên phiếu, `sp_LoadKhoByUserIDAndSRID`) và `tblUserKhoReport` (kho xem báo cáo — hơn 30 màn báo cáo, `sp_LoadKhoForUserKhoReportByUserID`); cờ nhóm `HT11` "#xem báo cáo mọi kho", `HT34` "#chỉ định kho xem báo cáo", `HT55` hạn ngày xem. Chỉ lọc ở máy trạm.

Đề xuất (cần chữ chốt, đụng Kernel + báo cáo):

1. Màn gán: mục đích **Xem báo cáo** bên cạnh **Làm việc**; chọn **nhiều** chi nhánh / kho một lần (mỗi lựa chọn một dòng gán) và nút sơ đồ tổ chức + cây con.
2. Có lần gán mục đích Xem báo cáo theo phạm vi → danh sách chứng từ, sổ, báo cáo, xuất chỉ lấy phạm vi đó (`requested ∩ allowed`, rỗng = rỗng, lọc ở máy chủ). Không có → như hôm nay (HT11).
3. Ô chọn kho trên phiếu lọc theo kho làm việc.
4. Huỷ chứng từ theo phạm vi; SSO mang `blog_id` → chi nhánh.

## 6. Còn lại (chưa làm)

- Chuyển hẳn sang bộ tính mới (sau hai tuần shadow sạch, công tắc lùi — công tắc `AUTHZ_ENGINE` của draft W0 **chưa có** trong mã).
- Điều kiện trên luật (hạn mức, hạn sửa từ lúc lập, người lập self / branch / all) — chỉ có nghĩa sau khi chuyển bộ tính (AUTHZ-16).
- `registerMenu` / `registerScreen` (khai một lần: menu + route + nút theo thao tác); nút trong màn chưa ẩn theo quyền chi tiết.
- `maskFields` (giá vốn, lợi nhuận); tách `users:write` (D-AUTH-13 bước 2); duyệt nhiều cấp (PHASE-030).
- Vai trò mẫu theo phần hành do phân hệ đăng ký (D-AUTH-27).

## 7. Kiểm

Trên nhánh cuối (`a89319ea`), CSDL test riêng `ketoan_test_p028`:

| Lệnh | Kết quả |
|---|---|
| `npm run typecheck` | 0 lỗi |
| `node tests/conformance/selfcheck.mjs` | KHÔNG ĐẠT chỉ do lỗi có sẵn trên `main` (SC-SEC-1, SC-SIG-1 ×2, SC-SIG-2 ×6); không phát hiện mới; SC-API-3 hết 12 nợ; tự kiểm (`--self-test`) ĐẠT |
| `bash scripts/kiem-chuan.sh` | ĐẠT |
| `npm test` (apps/api) | xem §7.1 |
| `npm test -w @bizcity-module/phan-quyen` | 24 / 24 |

### 7.1 `npm test`

2026-11-09, nhánh `a89319ea`: **211 tệp đạt, 1 bỏ qua; 1757 ca đạt, 12 bỏ qua, 0 lỗi.** Ca mới của các đợt nằm ở `apps/api/test/vai-tro-don-vi-api.test.ts` (vá an toàn, đệm theo `authz_version`, shadow, vé SSO, Dùng mẫu TGS), `authz-scope-intake.test.ts` (phạm vi kho, quyền theo loại chứng từ, xem / huỷ / xuất), `authz-engine.test.ts` (bỏ Nới); module `phan-quyen`: `test/template.test.ts`, `test/grid.test.ts`.

Dấu ký: các tệp mới / sửa mang dấu `[… kiennt] PHASE-028 — …`; tệp framework mới cần thêm dấu của chủ dự án khi duyệt (R-SIG-1).

## 8. Việc dọn

1. `CLAIMS.md` còn dòng *PHASE-028 · W5 đợt 2* đã merge — xin người giữ xoá (R-FLOW-6).
2. Trước khi đẩy từng nhánh: giữ chỗ `CLAIMS.md` trên `main`, `node scripts/nhan-viec.mjs kiem` ĐẠT, gộp `origin/main`, chạy lại 4 lệnh kiểm.
