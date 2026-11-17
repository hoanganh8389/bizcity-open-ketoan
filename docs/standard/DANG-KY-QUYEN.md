# Đăng ký quyền cho màn và nghiệp vụ (Xem · Thêm · Sửa · Xoá · Duyệt · Xuất)
<!-- [2026-11-17 02:25 PM khanhtd] NT-HT-003 — chuẩn hoá đăng ký quyền theo màn × thao tác (bảng hook, luật CRUD, phạm vi chi nhánh, bộ kiểm) theo chỉ đạo "chuẩn hoá theo hướng register từng màn, có bảng danh sách hooks để AI code menu mới tự register" -->
<!-- [2026-11-17 03:30 PM khanhtd] NT-HT-003 — GĐ4 (H13, H14 module mới), GĐ5 (gán tại nút sơ đồ tổ chức): đề xuất, chờ chốt mục 16 -->

> **Trạng thái:** chốt thiết kế bằng PR tài liệu (R-FLOW-2); mã đi theo từng PR code GĐ3 → GĐ5 → GĐ4 (NT-HT-003 §16). Hook H7, H8, vai trò `staff`, bộ kiểm §6 có trong mã khi PR code GĐ3 merge; H13, H14 khi GĐ4 merge (đề xuất, chưa có trong mã). · **Phiếu:** [NT-HT-003](../nghiem-thu/he-thong/NT-HT-003-phan-quyen-man-hinh-chi-nhanh.md) · **Nền:** [ADR-0027](../adr/ADR-0027-core-authorization-plugin-role-editor.md) (mặc định cấm quyền module, Cho / Cấm, vai trò theo phạm vi) · **Biên bản rà:** [REVIEW-2026-11-17](../audits/REVIEW-2026-11-17-phan-quyen-chi-nhanh.md)

Người hay AI thêm **một màn, một menu, một nút, hay một nghiệp vụ Thêm / Sửa / Xoá / Duyệt** đều phải đăng ký quyền theo tài liệu này, trong **cùng PR** với mã nghiệp vụ. Không đăng ký thì quản trị viên không phân quyền được cho màn đó ở HT12, và bộ kiểm báo đỏ.

## 1. Bảy luật

1. **Màn mới = đăng ký màn + thao tác.** Mỗi màn có thao tác `xem`, và một thao tác cho mỗi nút làm thay đổi dữ liệu (Thêm, Sửa, Xoá / Huỷ, Duyệt, Bỏ duyệt, Xuất, nút riêng). Màn danh mục / hệ thống xem bằng `catalog:read` thì được miễn `xem`.
2. **Mỗi lệnh ghi** (POST / PUT / PATCH / DELETE) gác bằng quyền chi tiết của đúng thao tác: `requirePermission(quyenThaoTac(màn, thao tác))`, hoặc `lenh` trong thao tác nếu đó là lệnh của lõi dùng chung. Không route nào bỏ trống quyền (R-API-6).
3. **Quyền khai ở `permissions[]` của manifest** phân hệ / module (`key`, `label`, `roles` = vai trò mặc định có quyền, `risk`). Không khai `roles` thì chỉ chủ đơn vị có (mặc định cấm, ADR-0027 D-AUTH-03). Xoá, duyệt, huỷ, chi tiền: `risk: "high"` khi lộ ra là mất tiền / mất dữ liệu.
4. **Tên quyền** `<module>:<chức-năng>-<việc>`, việc ∈ `xem · lap · sua · xoa · huy · duyet · bo-duyet · xuat` hoặc động từ riêng (`nhan`, `ghi-nhan`, `quyet-dinh`…). Lưới HT12 xếp theo đuôi này.
5. **Bản ghi có chi nhánh / kho**: lệnh theo mã (`/…/:id`) đăng ký cách tra chi nhánh bằng `dangKyChiNhanhBanGhi`. Lệnh danh sách / báo cáo nhận tham số lọc tên `branchCodes` (nhiều mã, cách nhau dấu phẩy). Không tin chi nhánh từ thân yêu cầu hay header (AUTHZ-11).
6. **Không viết cứng quyền ở giao diện**: nút / menu ẩn hiện theo `useThaoTac(màn)` (phân hệ cũ) hoặc `permission` của mục menu / route (module mới). Ẩn nút **không phải** là chặn: máy chủ chặn ở luật 2.
7. **Chạy bộ kiểm** §6 trước khi đẩy: `phan-quyen-dang-ky.test.ts` phải ĐẠT, cộng một test của chính màn đó (người có quyền làm được, người bị Cấm nhận 403).

## 2. Bảng hook

| # | Hook / chỗ khai | Ở đâu | Dùng khi | Bắt buộc |
|---|---|---|---|---|
| H1 | `permissions[]` trong `bizcity.module.json` | manifest phân hệ / module; Core tự gọi `registerModulePermissions` lúc khởi động | Mọi quyền mới | Luôn |
| H2 | `dangKyManHinh({ key, ma, nhom, nhan, duongDan, thaoTac })` | `apps/api/src/modules/access/man-hinh.ts`; phân hệ gọi trong `phan-he/<key>/man-hinh-<key>.ts`, import ở `index.ts` | Màn / menu của phân hệ cũ (`phan-he/`) | Mỗi màn |
| H3 | `requirePermission(quyenThaoTac('<màn>', '<thao tác>'))` | `preHandler` của route trong phân hệ | Route của chính phân hệ | Mỗi route |
| H4 | `lenh: [{ method, url, docType?, capNhat? }]` trong thao tác | cùng chỗ H2 | Lệnh của lõi dùng chung (`/api/v1/vouchers`, `/api/v1/documents`, danh mục) mà phân hệ không sửa quyền tại chỗ | Khi dùng lệnh lõi |
| H5 | `goc: '<quyền Core>'` trong thao tác | cùng chỗ H2 | Lệnh vẫn đòi quyền gốc **rủi ro cao** (`users:write`, `settings:write`, `periods:lock`, `payments:approve`) — không mượn được | Khi có |
| H6 | `registerDocumentType(docType, { read, create, cancel, export })` | `index.ts` của phân hệ (`@bizcity/platform/core/auth`) | Loại chứng từ đi cửa nạp: quyền xem / lập / huỷ / xuất theo loại phiếu | Mỗi docType mới |
| H7 | `dangKyChiNhanhBanGhi({ url, tra })` | `apps/api/src/modules/access/quyen-chi-nhanh.ts`; phân hệ gọi trong `index.ts` | Lệnh `/…/:id` đọc / sửa / huỷ / duyệt bản ghi có chi nhánh | Mỗi bản ghi có chi nhánh |
| H8 | Tham số `branchCodes` (`THAM_SO_CHI_NHANH`) | `querystring` của route GET | Danh sách, báo cáo, xuất Excel trả dữ liệu nhiều chi nhánh | Mỗi danh sách / báo cáo |
| H9 | `defineAction({ permission, effect })` | `modules/<key>/api/actions/*.ts` | Nghiệp vụ của module mới | Mỗi action |
| H10 | Quyền trong `*.workflow.yaml` | `modules/<key>/api/documents/` | Bước duyệt / bỏ duyệt của chứng từ module; `sod` tách người lập – người duyệt | Khi có duyệt |
| H11 | `useThaoTac(key)`, `ganQuyenXem` | `apps/web/src/lib/manHinh.ts` | Ẩn nút / menu của phân hệ cũ theo quyền | Mỗi màn có nút |
| H12 | `permission` của `WebMenuItem` / `WebRoute` | `modules/<key>/web/index.tsx` (`defineWebModule`) | Ẩn menu / màn của module mới | Mỗi mục menu |
| H13 | `extensions.screens[]` trong manifest (đề xuất GĐ4, chưa có trong mã) | `modules/<key>/bizcity.module.json` — Core gọi H2 thay module lúc nạp | Màn / menu của module mới, đủ thao tác Xem · Thêm · Sửa · Xoá · Duyệt | Mỗi màn (GĐ4) |
| H14 | `defineAction({ branchOf })` + `ctx.branchScope` (đề xuất GĐ4, chưa có trong mã) | `modules/<key>/api/actions/*.ts` — runtime action so chi nhánh của bản ghi với phạm vi | Action theo mã bản ghi có chi nhánh; action liệt kê lọc theo phạm vi | Mỗi action theo mã (GĐ4) |

## 3. Thao tác chuẩn của một màn CRUD

| Nút | Khoá thao tác | Quyền | `loai` | Kéo theo từ (không ai mất quyền khi thêm màn) | Ghi chú |
|---|---|---|---|---|---|
| Xem | `xem` | `<m>:<cn>-xem` | `xem` | `documents:read` | Bắt buộc (trừ màn danh mục / hệ thống) |
| Thêm | `them` | `<m>:<cn>-lap` | `ghi` | `documents:write` | |
| Sửa | `sua` | `<m>:<cn>-sua` | `ghi` | `documents:write` | Cửa nạp gửi lại cùng `docKey` = Sửa: `capNhat: true` |
| Xoá / Huỷ | `xoa` / `huy` | `<m>:<cn>-xoa` / `-huy` | `huy` | `documents:write` | Chứng từ đã ghi sổ: huỷ = bút toán đảo. Dữ liệu gốc đã dùng: ngừng dùng, không xoá ([DU-LIEU-GOC](DU-LIEU-GOC.md), ECP-13) |
| Duyệt / Bỏ duyệt | `duyet` / `boDuyet` | `<m>:<cn>-duyet` / `-bo-duyet` | `ghi` | `documents:write` | `risk: "high"` nếu duyệt chi tiền; tách người lập – người duyệt |
| Xuất Excel | `xuat` | `<m>:<cn>-xuat` | `xuat` | `reports:read` | Danh sách xuất phải lọc theo phạm vi (H8) |
| Nút riêng | camelCase (`nhapExcel`, `ghiNhan`) | `<m>:<cn>-<việc>` | theo tính chất | theo `loai` | |

`loai` quyết định quyền Core kéo theo quyền chi tiết: người đang có `documents:write` vẫn làm được như cũ khi màn mới được đăng ký. Muốn hẹp thì vai trò của đơn vị chỉ Cho quyền chi tiết, hoặc Cấm quyền chi tiết. Người chỉ có quyền chi tiết được **mượn** quyền gốc rủi ro thấp trong đúng lệnh màn gác (NT-HT-003 §2B), không bao giờ mượn quyền rủi ro cao (khai `goc`).

## 4. Mẫu đầy đủ — thêm màn "Phiếu đề nghị xuất kho" vào phân hệ Kho

**a. Manifest** (`apps/api/src/phan-he/kho/bizcity.module.json`, mảng `permissions`):

```json
{ "key": "kho:de-nghi-xuat-xem", "label": "Đề nghị xuất kho — xem", "roles": ["chief_accountant", "accountant", "viewer"], "risk": "low" },
{ "key": "kho:de-nghi-xuat-lap", "label": "Đề nghị xuất kho — thêm", "roles": ["chief_accountant", "accountant"], "risk": "low" },
{ "key": "kho:de-nghi-xuat-sua", "label": "Đề nghị xuất kho — sửa", "roles": ["chief_accountant", "accountant"], "risk": "low" },
{ "key": "kho:de-nghi-xuat-xoa", "label": "Đề nghị xuất kho — xoá nháp", "roles": ["chief_accountant"], "risk": "high" },
{ "key": "kho:de-nghi-xuat-duyet", "label": "Đề nghị xuất kho — duyệt", "roles": ["chief_accountant"], "risk": "high" }
```

**b. Đăng ký màn** (`apps/api/src/phan-he/kho/man-hinh-kho.ts`):

```ts
dangKyManHinh({
  key: 'kho.de-nghi-xuat', ma: 'KHO05', nhom: 'Kho', nhan: 'Đề nghị xuất kho', duongDan: '/kho/de-nghi-xuat',
  thaoTac: {
    xem:   { quyen: 'kho:de-nghi-xuat-xem',   nhan: 'Xem',   loai: 'xem' },
    them:  { quyen: 'kho:de-nghi-xuat-lap',   nhan: 'Thêm',  loai: 'ghi' },
    sua:   { quyen: 'kho:de-nghi-xuat-sua',   nhan: 'Sửa',   loai: 'ghi' },
    xoa:   { quyen: 'kho:de-nghi-xuat-xoa',   nhan: 'Xoá',   loai: 'huy' },
    duyet: { quyen: 'kho:de-nghi-xuat-duyet', nhan: 'Duyệt', loai: 'ghi' },
  },
});
```

**c. Route gác theo thao tác + lọc chi nhánh** (route của phân hệ):

```ts
r.get('/api/v1/kho/de-nghi-xuat', { preHandler: requirePermission(quyenThaoTac('kho.de-nghi-xuat', 'xem')),
  schema: { querystring: z.object({ from: day.optional(), to: day.optional(), branchCodes: z.string().optional() }) }, … });   // H8
r.post('/api/v1/kho/de-nghi-xuat', { preHandler: requirePermission(quyenThaoTac('kho.de-nghi-xuat', 'them')), … });
r.put('/api/v1/kho/de-nghi-xuat/:id', { preHandler: requirePermission(quyenThaoTac('kho.de-nghi-xuat', 'sua')), … });
r.delete('/api/v1/kho/de-nghi-xuat/:id', { preHandler: requirePermission(quyenThaoTac('kho.de-nghi-xuat', 'xoa')), … });
r.post('/api/v1/kho/de-nghi-xuat/:id/duyet', { preHandler: requirePermission(quyenThaoTac('kho.de-nghi-xuat', 'duyet')), … });
```

**d. Chi nhánh của bản ghi** (H7, trong `index.ts` của phân hệ):

```ts
dangKyChiNhanhBanGhi({ url: /^\/api\/v1\/kho\/de-nghi-xuat\/:id(\/.*)?$/,
  tra: async (t, id) => (await sql<{ c: string }>`SELECT branch_code AS c FROM stock_issue_requests WHERE tenant_id = ${t} AND id = ${id}`.execute(db)).rows.map((r) => r.c) });
```

**e. Giao diện**: `const tt = useThaoTac('kho.de-nghi-xuat'); {tt.duyet && <Button>Duyệt</Button>}`. Mục menu khớp `duongDan` tự ẩn khi không có quyền `xem` (`ganQuyenXem`).

**f. Test**: thêm ca vào tệp test phân quyền của phân hệ (`apps/api/test/phan-quyen-<phân hệ>.test.ts`): vai trò đơn vị chỉ Cho `kho:de-nghi-xuat-lap` → lập được, duyệt 403; vai trò Hạn chế Cấm `kho:de-nghi-xuat-xoa` → xoá 403.

## 5. Module mới (`modules/<key>/`)

Module mới không import `apps/*`, nên **không gọi** `dangKyManHinh` / `dangKyChiNhanhBanGhi`. Thay vào đó:

- Khai quyền ở `permissions[]` (H1), tên đúng luật 4: lưới HT12 tự xếp dòng / cột theo đuôi tên.
- Mỗi action khai `permission` đúng thao tác (H9); action ghi `idempotency: 'required'`.
- Màn và lệnh theo mã bản ghi có chi nhánh: **GĐ4 (đề xuất, chờ chốt — NT-HT-003 §14)** thêm H13 (`extensions.screens[]`: Core tự đăng ký màn × thao tác) và H14 (`branchOf` ở action: so chi nhánh của bản ghi với phạm vi). Trong lúc chờ, ghi rõ trong README của module là lệnh theo mã chưa giới hạn được theo chi nhánh, và gửi chi nhánh trong thân lệnh ghi (`branchCode`) để lớp phân quyền kiểm được.
- Danh sách / báo cáo nhận `branchCodes` (H8): lớp phân quyền tự ép về phạm vi, kể cả với action của module (tham số đi qua querystring).
- Lệnh theo mã bản ghi có chi nhánh: **chưa có hook cho module** — đề xuất bậc 4 ([VERSIONING §5](VERSIONING.md)): manifest `screens[]` và `records[]` để Core tự gọi H2 / H7. Trong lúc chờ, ghi rõ trong README của module là lệnh theo mã chưa giới hạn được theo chi nhánh, và gửi chi nhánh trong thân lệnh ghi (`branchCode`) để lớp phân quyền kiểm được.

## 6. Bộ kiểm

| Test | Kiểm gì |
|---|---|
| `apps/api/test/phan-quyen-dang-ky.test.ts` | Mỗi màn nghiệp vụ có `xem`; khoá màn `<module>.<màn>`; mỗi quyền thao tác đã khai ở manifest và cùng tiền tố module; mỗi `lenh` là route có thật |
| `apps/api/test/phan-quyen-pham-vi-chi-nhanh.test.ts` | 25 ca phạm vi chi nhánh: nhân viên chỉ ở cửa hàng mình, quản lý chỉ xem chi nhánh mình, chi nhánh tra từ bản ghi |
| `apps/api/test/phan-quyen-{quy,kho,…}.test.ts` | Ca riêng của từng phân hệ |

```bash
cd apps/api && npx vitest run test/phan-quyen
```

Thứ tự khi AI thêm một màn: manifest (H1) → đăng ký màn (H2 / H4 / H5) → route (H3, H8) → chi nhánh bản ghi (H7) → giao diện (H11 / H12) → test (§6) → `selfcheck`.

## 7. Phạm vi chi nhánh (khi bật `bizcity.authz.branch_scope`)

| Cấp | Vai trò chính | Gán tại | Được |
|---|---|---|---|
| 1. Nhân viên bán hàng | `staff` (Nhân viên) | 1 cửa hàng: vai trò "Thu ngân" (Cho `pos:sell`) | Bán, mở / đóng ca ở cửa hàng đó; không sổ, không báo cáo |
| 2. Quản lý cửa hàng | `staff` hoặc `viewer` | 1 cửa hàng: "Quản lý cửa hàng" (Cho `pos:report`, `reports:read`…) | Báo cáo, đơn POS, kiểm kê **chỉ của cửa hàng đó** |
| 3. Quản lý vùng | `staff` hoặc `viewer` | hôm nay: từng cửa hàng (một lần gán mỗi cửa hàng); GĐ5 (đề xuất, chờ chốt — NT-HT-003 §15): một lần gán tại nút sơ đồ tổ chức (Miền / Chi nhánh / Tỉnh), gồm cây con | Như cấp 2 cho mọi cửa hàng thuộc vùng |
| 4. Kế toán / mua hàng | `accountant` | không gán theo chi nhánh | Toàn đơn vị theo nghiệp vụ |
| 5. Kế toán trưởng / chủ | `chief_accountant` / `owner` | — | Toàn đơn vị; chủ đơn vị không bị giới hạn |

Máy chủ áp cho người có lần gán theo chi nhánh / kho:
- **Ghi**: chi nhánh = chi nhánh trong thân ∪ chi nhánh của bản ghi (H7, `docKey`, `/vouchers/:id`); ngoài phạm vi → 403 `BRANCH_OUT_OF_SCOPE`. Header `X-Chi-Nhanh` chỉ dùng khi không có cả hai.
- **Đọc có tham số chi nhánh** (H8): tham số bị ép = chọn ∩ phạm vi; không chọn = cả phạm vi; chọn ngoài phạm vi → 403.
- **Đọc theo mã**: chi nhánh của bản ghi phải trong phạm vi.
- **Đọc không lọc được theo chi nhánh**: bỏ `ledger:read`, `reports:read`, `documents:read` (và quyền xem chứng từ chúng kéo theo) cho riêng yêu cầu đó — báo thiếu quyền thay vì trả số liệu toàn đơn vị. Màn nào bị chặn vì lý do này thì thêm tham số `branchCodes` (H8).

## 8. Chỗ còn hở (việc tiếp)

- Lệnh ghi không mang chi nhánh trong thân và không theo mã (vd một số lệnh danh mục): header `X-Chi-Nhanh` vẫn cộng quyền tại chi nhánh đó. Hướng sửa: lệnh ghi dữ liệu dùng chung không cộng quyền gán tại chi nhánh.
- Module mới chưa có hook H2 / H7 (§5) — đề xuất GĐ4 (H13, H14), NT-HT-003 §14.
- Phạm vi theo **vùng** chưa có: quản lý vùng gán từng cửa hàng — đề xuất GĐ5 (gán tại nút sơ đồ tổ chức), NT-HT-003 §15.
- Gộp cơ chế chi nhánh của `quyen-chi-nhanh.ts` với bộ tính `requireScope` / `allowedScope` của Core (ADR-0027) — một nơi tính phạm vi: đề xuất GĐ5 bước 3, NT-HT-003 §15.
- POS: `pos:return` / `pos:cancel` đang `risk: low`; chưa có quyền giảm giá tay, sửa giá, xem giá vốn (module `pos` đang do NT-BH-025, NT-BH-026 giữ).
