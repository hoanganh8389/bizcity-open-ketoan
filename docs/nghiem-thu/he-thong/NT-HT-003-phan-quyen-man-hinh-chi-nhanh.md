# NT-HT-003 · Phân quyền theo màn × thao tác và theo chi nhánh
<!-- [2026-11-14 kiennt] NGHIEM-THU — viết lại phiếu theo bản thử đã chạy (thay nháp 13/11 "giới hạn nơi làm việc theo lần gán"); chờ chốt thiết kế (R-FLOW-2) trước khi đẩy code. -->

| | |
|---|---|
| Phân hệ | Hệ thống (phân quyền người dùng) · mọi phân hệ đăng ký màn (Kho, Quỹ, Mua hàng, Bán hàng, Kế toán, Tài sản, Thuế, Danh mục / Hệ thống) |
| Màn hình | HT12 Phân quyền (Sửa vai trò, Người dùng) · nút Chi nhánh làm việc (Alt+B), HT04 · nút Thêm / Sửa / Xoá / Duyệt… trên 62 màn |
| Bộ phận yêu cầu | Quản trị, phòng kế toán; yêu cầu của chủ dự án: "mỗi phân hệ tự đăng ký menu + quyền thêm / sửa / xoá vào bộ quản lý vai trò như WordPress, không phân quyền cứng trong code" |
| Ngày tạo | 13/11/2026 · viết lại 14/11/2026 |
| Trạng thái | Đã chốt thiết kế 14/11/2026 (mục 8) — đang làm GĐ1 · GĐ3–GĐ5 chờ chốt (mục 16) <!-- [2026-11-17 03:30 PM khanhtd] NT-HT-003 — trạng thái GĐ3–GĐ5 --> |
| Liên quan | ADR-0027 / PHASE-028 (sổ quyền, vai trò của đơn vị, Cho / Cấm, kéo theo `registerDocumentType`) · NT-HT-002 (cửa hàng ↔ site) |
| Người duyệt thiết kế | Johnny Chu – Chu Hoàng Anh (người phụ trách PHASE-028) |

## 1. Mục đích quản trị
1. **Phân quyền đến từng màn, từng nút**: cho / cấm riêng Thêm, Sửa, Xoá / Huỷ, Duyệt, Xuất và nút riêng (Ghi nhận chênh lệch, Nhận hàng, Gửi duyệt…) của từng màn. Ví dụ: thủ quỹ chỉ lập phiếu thu; kế toán không duyệt chứng từ mua, không xoá đơn vị tính.
2. **Phân quyền theo chi nhánh**: người được gán vai trò tại chi nhánh chỉ làm việc ở các chi nhánh đó, mỗi chi nhánh một bộ quyền; một người nhiều chi nhánh = gán nhiều lần (không thêm bảng, dùng `user_role_assignments` có sẵn).
3. **Không ai mất quyền khi bật**: vai trò đang dùng giữ nguyên quyền; muốn hẹp thì Cấm quyền chi tiết.

**Hôm nay trên `main`** (đã kiểm 13–14/11/2026):
- Ghi phần lớn đi qua vài quyền chung: `documents:write` gác ~80 lệnh, `catalog:write` ~100 lệnh — có quyền là làm mọi loại phiếu, mọi danh mục. 74 / 146 màn không ẩn nút theo quyền.
- Lần gán "tại chi nhánh" chỉ cộng quyền nộp chứng từ ở cửa nạp; nút Chi nhánh làm việc hiện mọi chi nhánh; máy chủ không kiểm chi nhánh.
- HT12 "Sửa vai trò" xếp theo khoá quyền: quyền thao tác không thuộc Xem / Lập / Huỷ / Xuất rơi vào cột "Khác", mỗi quyền một dòng.

## 2. Thiết kế

### A. Sổ đăng ký màn (`apps/api/src/modules/access/man-hinh.ts`) (đề xuất, chưa có trong mã)
Phân hệ gọi `dangKyManHinh` ở `index.ts` của mình:
```ts
dangKyManHinh({ key: 'quy.phieu-chi', ma: 'ACC52', nhom: 'Quỹ', nhan: 'Phiếu chi', duongDan: '/nghiep-vu/phieu-chi',
  thaoTac: {
    xem:  { quyen: 'quy:phieu-chi-xem', nhan: 'Xem',  loai: 'xem' },
    them: { quyen: 'quy:phieu-chi-lap', nhan: 'Thêm', loai: 'ghi', lenh: [{ method: 'POST', url: '/api/v1/vouchers', docType: ['payment'] }] },
    // goc: quyền gốc RỦI RO CAO lệnh vẫn đòi (không mượn được) — HT12 nhắc "cần kèm"
  } });
```
- Mỗi `quyen` khai ở `permissions[]` của manifest phân hệ (HT12 tự hiện). Hiện 62 màn, 198 thao tác, 8 phân hệ.
- **Kéo theo** (không ai mất quyền): `loai` quyết định quyền gốc kéo theo quyền chi tiết — xem ← `documents:read`, ghi / huỷ ← `documents:write`, xuất ← `reports:read` — mượn cơ chế `registerDocumentType` của lõi bằng khoá giả `man-hinh:<màn>:<thao tác>` (không sửa lõi).
- `GET /api/v1/man-hinh`: danh sách màn + thao tác + quyền (giao diện ẩn menu / nút; HT12 dựng lưới). (đề xuất, chưa có trong mã)

### B. Máy chủ gác lệnh
Hai cách, phân hệ chọn theo lệnh:
1. **Gác trực tiếp** — route của phân hệ dùng `requirePermission(quyenThaoTac(màn, thao tác))` (Kho, phần lớn Mua hàng, Thuế).
2. **Gác qua `lenh`** — cho lệnh của lõi / dùng chung mà phân hệ không sửa quyền tại chỗ (`/api/v1/vouchers`, `/api/v1/documents`, danh mục…). Một móc `preHandler` toàn app (`quyen-chi-nhanh.ts`, đăng ký ở `app.ts` sau `authPlugin`) với lệnh khớp `method + url` (+ `docType`, + `capNhat`):

| Người gọi | Kết quả |
|---|---|
| Có quyền chi tiết | **Mượn quyền gốc rủi ro thấp** của loại thao tác **cho riêng yêu cầu đó**: xem / xuất → `catalog:read`, `documents:read`, `reports:read`, `ledger:read`; ghi / huỷ → thêm `catalog:write`, `documents:write`. Không mượn quyền gốc đang bị Cấm. **Không bao giờ mượn quyền rủi ro cao** (`users:write`, `settings:write`, `periods:lock`, `payments:approve`, `documents:edit-all`…) — thao tác cần chúng khai `goc` |
| Không có quyền chi tiết vì bị **Cấm** (toàn đơn vị hoặc tại chi nhánh của yêu cầu) | 403 `Không có quyền "<nút>" ở màn <tên màn> (<quyền>)` |
| Không có quyền chi tiết, không bị Cấm (vd vai trò chỉ có `catalog:write`) | Để lệnh tự kiểm quyền gốc như hôm nay |

- `docType`: một lệnh nhiều loại phiếu → tra loại theo thân / query, theo `docKey`, hoặc theo `:id` của `/vouchers`.
- `capNhat`: cửa nạp vừa lập mới vừa sửa (gửi lại cùng `docKey`) → `capNhat: false` chỉ khi `docKey` chưa có (Thêm), `true` khi đã có (Sửa).
- Khoá API, chủ đơn vị (`ADMIN_ROLES`): không áp.

### C. Theo chi nhánh (`apps/api/src/modules/access/quyen-chi-nhanh.ts`) (đề xuất, chưa có trong mã)
- **Công tắc đơn vị** `bizcity.authz.branch_scope` (khoá mới trong `docs/contracts/bizcity-settings.registry.json`; lưu ở kho `setting_values`, `enum(on|off)`, **mặc định `off`**, loại B; quyền `settings:write`, nhật ký `settings.set`; bật / tắt ở Trung tâm cấu hình qua `PUT /api/v1/settings/values/:key`). **Tắt**: như hôm nay — lần gán tại chi nhánh chỉ cộng quyền ở cửa nạp, không giới hạn phạm vi, không cộng / trừ quyền theo chi nhánh. **Bật**: áp các mục dưới đây. Bảng rà trước khi bật: `GET /api/v1/quyen-chi-nhanh/ra-soat` (đề xuất, chưa có trong mã) — ai có lần gán tại chi nhánh / kho, phạm vi sẽ thành gì; hiện ở HT12 thẻ Người dùng (GĐ2).
- **Phạm vi làm việc** = chi nhánh của các lần gán tại chi nhánh + chi nhánh chứa kho của lần gán tại kho, còn hiệu lực hôm nay, **trừ vai trò Hạn chế**. Không có lần gán nào → mọi chi nhánh. Chủ đơn vị, khoá API → không áp.
- **Quyền tại chi nhánh**: vai trò gán tại chi nhánh B chỉ có hiệu lực ở B (nền + Cho − Cấm; Cấm toàn đơn vị vẫn trừ).
- **Vai trò Hạn chế gán tại B**: không thu hẹp phạm vi; luật Cấm của nó trừ thẳng vào quyền hiệu lực (kể cả quyền của vai trò chính) khi yêu cầu ở B — "Kế toán, nhưng ở OC02 không được lập phiếu chi".
- **Chi nhánh của yêu cầu**: ô chi nhánh trong thân (`branchCode` → `fromBranchCode` / `fromBranch`, `documents[]`) → chi nhánh của phiếu theo mã (chuyển kho: lệnh nhận lấy chi nhánh nhận; kiểm kê) → header `X-Chi-Nhanh` (chi nhánh đang làm việc). Ngoài phạm vi: ghi → 403 `BRANCH_OUT_OF_SCOPE`; đọc theo header → bỏ header.
- `GET /api/v1/quyen-chi-nhanh` → `{ branches, theoChiNhanh, camTheoChiNhanh }` cho giao diện. (đề xuất, chưa có trong mã)

### D. Giao diện
- `apps/web/src/lib/manHinh.ts`: `useThaoTac(màn)` → nút được hiện; `ganQuyenXem` ẩn mục menu không có quyền Xem. (đề xuất, chưa có trong mã)
- `can(p)` = quyền toàn đơn vị + quyền tại chi nhánh đang làm việc − Cấm tại chi nhánh đó; `x-chi-nhanh` gửi kèm mọi lệnh.
- Alt+B / HT04 chỉ hiện chi nhánh trong phạm vi; một chi nhánh → cố định; đổi chi nhánh → menu / nút đổi theo.
- **HT12 Sửa vai trò** (`modules/phan-quyen/web`): thẻ theo phân hệ (giống menu) + "Quyền chung"; mỗi màn một dòng; chế độ **Cơ bản** (mỗi quyền là nút bật / tắt theo tên nút trên màn, mức nhanh Không / Chỉ xem / Đầy đủ) và **Chi tiết** (cột cố định Xem · Thêm · Sửa · Xoá / Huỷ · Duyệt · Xuất · Khác); màu Cho riêng / có sẵn / đang Cấm; vai trò Hạn chế bấm = Cấm; nhắc "+ users:write" ở thao tác có `goc`. Lưu vẫn qua API luật Cho / Cấm sẵn có (lý do, nhập lại mật khẩu khi quyền rủi ro cao).

### E. Thứ dùng chung bị đụng (R-FLOW-2) — cần chốt
| Đụng | Vì sao | Đề xuất |
|---|---|---|
| `apps/api/src/app.ts` — đăng ký 1 plugin `preHandler` toàn app | móc gác lệnh + áp quyền chi nhánh cho mọi yêu cầu của người dùng | 1 dòng, sau `authPlugin`; tệp framework → chữ ký kiến trúc của người phụ trách PHASE-028 trước khi merge |
| Vị trí tệp (SC-LAYER-2) | phân hệ (`D phan-he/*`) import sổ đăng ký màn | **chốt: đặt ở `apps/api/src/modules/access/`** (lớp P `permissions`) — phân hệ import xuống đúng chiều, **không sửa** `layers.mjs`; tệp lớp P cần chữ ký kiến trúc (RULE-SIGNATURE R-SIG-1) |
| Mượn quyền gốc trong một yêu cầu | đổi cách tính quyền hiệu lực (thêm vào `auth.permissions` của yêu cầu) | chỉ quyền rủi ro thấp, chỉ khi lệnh do màn gác và đúng loại phiếu |
| `docs/standard/quyen.json` (S028-11) | sổ quyền tăng 198 quyền chi tiết | sinh lại bằng `scripts/phan-quyen/quyen-snapshot.mjs` khi S028-11 vào main (đề xuất, chưa có trong mã) |

Không sửa `packages/*`.

## 3. Công việc và tệp
| Bước | Việc | Tệp |
|---|---|---|
| 1 | Sổ đăng ký màn + gác lệnh + mượn quyền | `apps/api/src/modules/access/man-hinh.ts` (đề xuất, chưa có trong mã) |
| 2 | Theo chi nhánh + móc toàn app + công tắc | `apps/api/src/modules/access/quyen-chi-nhanh.ts`, `apps/api/src/app.ts`, `docs/contracts/bizcity-settings.registry.json` (đề xuất, chưa có trong mã) |
| 3 | Đăng ký màn 8 phân hệ (manifest + `man-hinh-*.ts` + gác trực tiếp ở route của phân hệ) | `apps/api/src/phan-he/{kho,quy,mua-hang,ban-hang,ke-toan,tai-san,thue,he-thong}/**` |
| 4 | Giao diện: ẩn nút / menu, chi nhánh làm việc | `apps/web/src/lib/{manHinh.ts,auth.tsx,api.ts}`, `apps/web/src/components/ChiNhanhLamViec.tsx`, `apps/web/src/layout/useAppMenu.ts`, các màn ở mục 6 |
| 5 | HT12 lưới theo màn | `modules/phan-quyen/web/lib/man-hinh-grid.ts`, `modules/phan-quyen/web/screens/RoleEditor.tsx` (đề xuất, chưa có trong mã) |
| 6 | Test | `apps/api/test/phan-quyen-*.test.ts` (8 tệp), `modules/phan-quyen/test/man-hinh-grid.test.ts` (đề xuất, chưa có trong mã) |

**Tệp đang trong phạm vi người khác — chưa đưa vào PR code, làm sau khi người giữ xong / đồng ý:**
`apps/api/src/phan-he/mua-hang/hoa-don-routes.ts`, `apps/web/src/phan-he/mua-hang/hoa-don/HoaDonModal.tsx`, `apps/web/src/phan-he/mua-hang/hoa-don/HoaDonNccPage.tsx` (MH22 — Thủy) · `apps/web/src/phan-he/mua-hang/chung-tu/PhieuMuaForm.tsx` (PHASE-026 — Thủy) · `apps/web/src/components/phieu-hang/PhieuHangPage.tsx`, `apps/web/src/phan-he/ban-hang/phieu-ban/PhieuBanPages.tsx` (NT-BH-015 — Võ Hoàng) · `apps/web/src/features/sale-programs/ChuongTrinhBanPage.tsx` (NT-BH-018 — Võ Hoàng).

## 4. Khai báo trước
Đơn vị thử có chi nhánh `CN01`, `CN02`, `CN03`; tài khoản: Kế toán, Người xem; vai trò của đơn vị theo mục 5. Bộ chạy tay trên demo Ớt Chuông: `docs/kiem-thu/` (tài khoản `thu.*`).

## 5. Các bước thao tác và kết quả mong đợi
| # | Thao tác | Mong đợi |
|---|---|---|
| 1 | Kế toán thường (không vai trò thêm) dùng mọi màn | Như hôm nay — mọi nút, mọi chi nhánh |
| 2 | Vai trò Hạn chế "Cấm `quy:phieu-chi-lap`" → lập phiếu chi | 403 "Không có quyền "Thêm" ở màn Phiếu chi"; phiếu thu vẫn lập được; nút Thêm ở Phiếu chi ẩn |
| 3 | Vai trò nền Người xem + Cho riêng `quy:phieu-thu-lap` | Lập phiếu thu được; phiếu chi 403 |
| 4 | Cho riêng `he-thong:nguoi-dung-them` (cần kèm `users:write`) | Vẫn 403; HT12 hiện "+ users:write" |
| 5 | Cấm `documents:write` + Cho `quy:phieu-thu-lap` | 403 (Cấm quyền gốc thắng) |
| 6 | Cấm `ke-toan:ket-chuyen-xem` → mở Kết chuyển | Menu ẩn; gọi API đọc → 403 |
| 7 | Cấm `ban-hang:hoa-don-sua` → gửi lại phiếu bán cùng `docKey` | 403 "Sửa ở màn Phiếu bán hàng"; lập phiếu mới được |
| 8 | Gán "Kế toán tại CN01" cho Người xem | Alt+B cố định CN01; lập ở CN02 → 403 `BRANCH_OUT_OF_SCOPE` |
| 9 | Gán "Lập kiểm kê tại CN01" + "Kế toán tại CN02" | Alt+B: CN01, CN02; ở CN01 chỉ Thêm / Sửa kiểm kê; ở CN02 đủ nút; chuyển kho xuất CN01 → 403 |
| 10 | Kế toán + Hạn chế "Cấm lập phiếu chi" tại CN02 | Phạm vi mọi chi nhánh; phiếu chi ở CN02 → 403, ở CN01 được; nút Thêm ẩn khi làm việc ở CN02 |
| 11 | HT12 → Sửa vai trò | Thẻ theo phân hệ, mỗi màn một dòng; bật / tắt từng quyền; Hạn chế bấm = Cấm; Lưu ra đúng luật Cho / Cấm |

**Bút toán:** không đổi. **Sai số chấp nhận:** 0.

## 6. Trường hợp lệch chuẩn
| # | Làm thế này | Phần mềm phải |
|---|---|---|
| 1 | Lần gán hết hạn / chưa tới ngày | Không tính; không còn lần gán nào → mọi chi nhánh |
| 2 | Lệnh theo mã phiếu không có | Không chặn ở móc — route báo "không tìm thấy" |
| 3 | Cấm theo mẫu `quy:*` rồi bỏ tick một ô ở HT12 | Không tự gỡ mẫu (mở nhiều quyền khác) — báo "gỡ mẫu ở thẻ Ma trận quyền" |
| 4 | Lô nhiều chi nhánh trong một yêu cầu | Chỉ cộng quyền chung của các chi nhánh; Cấm ở bất kỳ chi nhánh nào đều áp |
| 5 | Thao tác chỉ có ở giao diện (Duyệt phiếu bán — máy chủ chưa có lệnh) | Chỉ ẩn nút; ghi rõ ở mục 7 |

## 7. Ngoài phạm vi (phiếu sau)
- ~~**Lọc báo cáo / danh sách theo chi nhánh**~~ — làm ở GĐ3 (mục 13), sau rà soát 17/11/2026. <!-- [2026-11-17 02:25 PM khanhtd] NT-HT-003 — GĐ3: chuyển mục lọc theo chi nhánh từ ngoài phạm vi vào mục 13 -->
- Quyền Xem của các màn chỉ đọc qua lệnh dùng chung (Nhà cung cấp, Chính sách mua, Cài đặt mua, Công thức đặt hàng, Nhập dữ liệu khởi đầu, Thẻ / Biến động / Loại tài sản, Người nộp thuế, Đối trừ công nợ): cần tách lệnh đọc riêng.
- Duyệt phiếu bán / trả lại (chưa có lệnh ở máy chủ); nút Nhập Excel chưa ẩn theo Cấm tại chi nhánh.
- Phạm vi theo **kho** cho thủ kho (gán tại kho hôm nay chỉ mở chi nhánh của kho).

## 8. Câu hỏi cần chốt — đã chốt 14/11/2026
| # | Câu hỏi | Chốt |
|---|---|---|
| 1 | Mượn quyền gốc rủi ro thấp trong đúng lệnh do màn gác (mục B) | **Có** — theo bản thử; không mượn quyền rủi ro cao (khai `goc`) |
| 2 | Giới hạn theo chi nhánh luôn bật hay công tắc | **Công tắc đơn vị, mặc định tắt** + bảng rà ở HT12 (mục C) |
| 3 | Vị trí `man-hinh.ts` / `quyen-chi-nhanh.ts` | **`apps/api/src/modules/access/`** (lớp P) — không sửa `layers.mjs` |
| 4 | Hạn chế gán tại chi nhánh | **Chỉ Cấm tại chi nhánh đó, không thu hẹp phạm vi** — theo bản thử |
| 5 | Lần gán theo kho | **Mở chi nhánh của kho vào phạm vi** — theo bản thử (quyền theo kho để GĐ sau) |

Người chốt: kiennt (bộ phận yêu cầu) theo đề xuất của phiếu. Tệp lớp P (`modules/access`, `app.ts`) vẫn cần chữ ký kiến trúc của người phụ trách PHASE-028 trước khi merge PR code (RULE-SIGNATURE).

## 9. Kế hoạch đẩy (R-FLOW)
1. ~~PR tài liệu: phiếu + giữ chỗ~~ — #365 đã merge.
2. PR tài liệu: chốt mục 8 + nới phạm vi giữ chỗ (`modules/access`, registry cấu hình, HT12) — PR này.
3. PR code GĐ1 (từ `main` mới): sổ đăng ký màn + gác lệnh + mượn quyền, theo chi nhánh + công tắc, Kho + Quỹ, giao diện ẩn nút / chi nhánh làm việc, test.
4. PR code GĐ2: Mua hàng, Bán hàng, Kế toán, Tài sản, Thuế, Danh mục / Hệ thống + HT12 lưới theo màn.
5. Tệp trong phạm vi người khác (mục 3): PR riêng sau khi người giữ xong.

## 10. Kết quả chạy (bản thử, 14/11/2026)
| | |
|---|---|
| Bản code | nhánh tích hợp ở máy (`tich-hop/phan-quyen-thu`), chưa đẩy |
| Test tự động | `apps/api/test/phan-quyen-{man-hinh,chi-nhanh,quy,mua-hang,ban-hang,ke-toan,danh-muc,sua-loi}.test.ts`, `modules/phan-quyen/test/man-hinh-grid.test.ts` — đạt; cả bộ `npm test` 2141 đạt (3 lỗi có sẵn trên main) (đề xuất, chưa có trong mã) |
| Chạy trên demo Ớt Chuông | 21 / 21 ca phân quyền + 14 / 14 ca sửa lỗi (lệnh API) + bấm giao diện (HT12, ẩn nút theo chi nhánh) |

## 11. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 12. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 13/11/2026 | Tạo nháp "giới hạn nơi làm việc theo lần gán tại chi nhánh" (công tắc mặc định tắt, mã ở `modules/access`) |
| 14/11/2026 | Viết lại theo bản thử: sổ đăng ký màn × thao tác (yêu cầu chủ dự án), gác lệnh + mượn quyền gốc rủi ro thấp, quyền theo chi nhánh, Hạn chế theo chi nhánh, HT12 lưới theo màn; câu hỏi chốt mục 8 |
| 14/11/2026 | Chốt mục 8: mượn quyền gốc rủi ro thấp; công tắc giới hạn chi nhánh (mặc định tắt); tệp ở `modules/access`; Hạn chế tại chi nhánh chỉ Cấm; gán tại kho mở chi nhánh của kho |
| 17/11/2026 | GĐ3 (mục 13): chi nhánh tra từ bản ghi, phạm vi đọc, vai trò Nhân viên (`staff`), hook `dangKyChiNhanhBanGhi`, chuẩn [DANG-KY-QUYEN](../../standard/DANG-KY-QUYEN.md) <!-- [2026-11-17 02:25 PM khanhtd] NT-HT-003 — GĐ3 --> |
| 17/11/2026 | Đề xuất GĐ4 (mục 14: module mới khai màn ở manifest, `branchOf` ở action) và GĐ5 (mục 15: phạm vi theo nút sơ đồ tổ chức, gộp tính phạm vi về Core); câu hỏi chốt mục 16 <!-- [2026-11-17 03:30 PM khanhtd] NT-HT-003 — GĐ4, GĐ5 --> |

## 13. GĐ3 — vá lỗ rà soát 17/11/2026 (chờ chốt trước khi mở PR code)
<!-- [2026-11-17 02:25 PM khanhtd] NT-HT-003 — GĐ3: vá 9 lỗ ở biên bản rà soát 17/11; mục cần chủ dự án chốt (R-FLOW-2) -->

Biên bản: [REVIEW-2026-11-17-phan-quyen-chi-nhanh](../../audits/REVIEW-2026-11-17-phan-quyen-chi-nhanh.md). Chuẩn cho người / AI thêm màn: [DANG-KY-QUYEN](../../standard/DANG-KY-QUYEN.md).

| # | Việc | Tệp |
|---|---|---|
| 1 | Chi nhánh của yêu cầu = thân ∪ chi nhánh của bản ghi (`docKey` trong thân / tham số, `/vouchers/:id`, phiếu kho theo mã); header chỉ dùng khi không có cả hai | `apps/api/src/modules/access/quyen-chi-nhanh.ts` |
| 2 | Hook `dangKyChiNhanhBanGhi({ url, tra })` thay bảng viết cứng (nhận mọi tham số đường dẫn); Kho, phiếu nhập tay, Mua hàng (phiếu mua, đăng ký tồn max), Tài sản (theo mã) đăng ký | `apps/api/src/modules/access/quyen-chi-nhanh.ts` |
| 3 | Phạm vi đọc: tham số `branchCodes` / `branches` / `branchCode` bị ép về chọn ∩ phạm vi; lệnh đọc không lọc được → bỏ quyền đọc dữ liệu cho riêng yêu cầu | `apps/api/src/modules/access/quyen-chi-nhanh.ts` |
| 4 | Danh sách kiểm kê nhận `branchCodes` | `apps/api/src/phan-he/kho/kiem-ke.ts` |
| 5 | Vai trò chính **Nhân viên** (`staff` — chỉ `catalog:read`) | `packages/contracts/src/enums.ts`, `packages/platform/src/core/auth.ts`, `db/migrations/0149_vai_tro_nhan_vien.sql`, `apps/api/src/modules/access/access.schemas.ts`, `apps/api/src/modules/access/tenant-role.service.ts`, `modules/phan-quyen/web/screens/RolesTab.tsx`, `modules/phan-quyen/web/screens/UsersTab.tsx` |
| 6 | Bộ kiểm đăng ký quyền + 25 ca phạm vi chi nhánh | `apps/api/test/phan-quyen-dang-ky.test.ts`, `apps/api/test/phan-quyen-pham-vi-chi-nhanh.test.ts` |

Cần chốt (R-FLOW-2): (a) vai trò `staff` — đổi `packages/contracts` + migration 0149; (b) đổi hành vi khi công tắc bật: lệnh đọc không lọc được theo chi nhánh trả thiếu quyền thay vì số liệu toàn đơn vị; (c) sửa `packages/platform/src/core/auth.ts` (lớp P, PHASE-028).

GĐ3 đã chạy trên nhánh ở máy (`feat/phan-quyen-pham-vi-chi-nhanh`, chưa đẩy): 25 / 25 ca phạm vi chi nhánh, 4 / 4 ca bộ kiểm đăng ký, cả bộ `npm test` không thêm ca đỏ (chi tiết ở biên bản). Thêm việc vào GĐ3: đăng ký tra chi nhánh của bản ghi (H7) cho lệnh theo mã của Mua hàng, Bán hàng, Tài sản; `AuthContext.branchScope` (phạm vi chi nhánh của yêu cầu, `null` = mọi chi nhánh) để GĐ4 dùng.

## 14. GĐ4 — hook đăng ký quyền cho module mới (`modules/<key>`) (đề xuất, chờ chốt)
<!-- [2026-11-17 03:30 PM khanhtd] NT-HT-003 — GĐ4: module mới khai màn × thao tác ở manifest và tra chi nhánh bản ghi ở action (bậc 4, chủ dự án chốt) -->

**Vấn đề.** Module mới không import `apps/*` nên không gọi được `dangKyManHinh` (H2) và `dangKyChiNhanhBanGhi` (H7): màn của module không lên lưới HT12 theo màn, danh sách màn của `GET /api/v1/man-hinh` không có màn module, và lệnh theo mã của module chưa giới hạn được theo chi nhánh. Yêu cầu chủ dự án: "AI code một menu mới, tự nó register vào luôn; CRUD xoá sửa cũng thế".

**Thiết kế đề xuất** — chỉ thêm, không đổi gì đã có (hợp đồng `bizcity_module@1` tăng bản phụ theo [VERSIONING](../../standard/VERSIONING.md)):

1. **Manifest `extensions.screens[]`** (khai báo, AI viết cùng `extensions.menu`):

   ```json
   "screens": [{
     "key": "voucher.dot-phat", "code": "VC01", "group": "Bán hàng", "label": "Đợt phát voucher", "path": "/app/voucher/dot-phat",
     "operations": {
       "xem":   { "permission": "voucher:dot-phat-xem",   "label": "Xem",   "kind": "xem" },
       "them":  { "permission": "voucher:dot-phat-lap",   "label": "Thêm",  "kind": "ghi" },
       "sua":   { "permission": "voucher:dot-phat-sua",   "label": "Sửa",   "kind": "ghi" },
       "xoa":   { "permission": "voucher:dot-phat-xoa",   "label": "Xoá",   "kind": "huy" },
       "duyet": { "permission": "voucher:dot-phat-duyet", "label": "Duyệt", "kind": "ghi" }
     }
   }]
   ```

   Core nạp module → kiểm (quyền có trong `permissions[]`, cùng tiền tố `<key>:`; khoá màn dạng `<key>.<màn>`; có `xem`) → gọi `dangKyManHinh` thay module. `kind` như `loai` của H2 (xem / ghi / huy / xuat). Không có `lenh`: action của module đã gác bằng `permission` riêng.
2. **Bộ kiểm chéo action ↔ màn**: mỗi action `effect: 'write'` của module phải có `permission` là quyền của một thao tác màn (không thì màn có nút mà HT12 không phân quyền được). Mức: **cảnh báo** bản này, **chặn** từ bản phụ kế tiếp.
3. **`defineAction({ …, branchOf })`** — tra chi nhánh của bản ghi trong action:

   ```ts
   defineAction({ id: 'voucher.batch.cancel', permission: 'voucher:dot-phat-xoa', effect: 'write', …,
     branchOf: async (ctx, input) => ctx.data.module(async (tx) => /* SELECT branch_code FROM mod_voucher.batches WHERE id = input.id */),
     handler: … });
   ```

   Runtime action (`packages/platform/src/core/actions.ts`) gọi `branchOf` **trước** handler, trong cùng giao dịch; chi nhánh trả về phải nằm trong `ctx.branchScope` (`null` = mọi chi nhánh), không thì `FORBIDDEN` kèm `BRANCH_OUT_OF_SCOPE`. Action liệt kê đọc `ctx.branchScope` để lọc (hoặc nhận tham số `branchCodes` — lớp phân quyền đã ép, GĐ3).
4. **SDK + giao diện module**: `@bizcity/module-sdk` có kiểu màn, `branchOf` của action, `branchScope` của ngữ cảnh action; `@bizcity/module-sdk/web` có `useThaoTac(key)` như phân hệ cũ (đọc danh sách màn + quyền của người dùng).
5. **Khung module** (`npx bizcity module new`) sinh sẵn một màn mẫu đủ Xem / Thêm / Sửa / Xoá, quyền tương ứng, `branchOf` ở action theo mã.

**Tệp:** `docs/contracts/BIZCITY-MODULE-v1.md`, `docs/contracts/BIZCITY-MODULE-v1.schema.json`, `docs/contracts/BIZCITY-EXTENSION-v1.md`, `docs/contracts/BIZCITY-ACTION-v1.md`, `packages/module-sdk/src/manifest.ts`, `packages/module-sdk/src/index.ts`, `packages/module-sdk/src/web.ts`, `packages/module-sdk/API.md`, `packages/platform/src/core/actions.ts`, nạp màn module ở lớp phân quyền (tệp mới trong `apps/api/src/modules/access/`), khung `templates/starter-module/**`, test mới trong `apps/api/test/`.

**Kiểm bằng:** module thử khai 1 màn 5 thao tác → danh sách màn có màn đó; HT12 lưới có dòng; người chỉ Cho quyền lập thì lập được, xoá 403; action theo mã của chi nhánh ngoài phạm vi → 403; manifest khai quyền không có trong `permissions[]` → module không nạp (lỗi rõ tên quyền); action ghi không thuộc màn nào → cảnh báo.

## 15. GĐ5 — phạm vi theo vùng (sơ đồ tổ chức) và gộp với bộ tính của Core (đề xuất, chờ chốt)
<!-- [2026-11-17 03:30 PM khanhtd] NT-HT-003 — GĐ5: gán vai trò tại nút sơ đồ tổ chức (cây con), dùng kiểu phạm vi org_unit sẵn có của bộ tính ADR-0027 -->

**Vấn đề.** Quản lý vùng (Miền / Chi nhánh / Tỉnh trong sơ đồ tổ chức, NT-HT-001: 3 Miền, 12 Chi nhánh, 35 Tỉnh, 743 cửa hàng gắn nút) phải gán vai trò tại **từng** cửa hàng; mở cửa hàng mới phải gán thêm tay. Phạm vi chi nhánh lại tính ở hai nơi: `apps/api/src/modules/access/quyen-chi-nhanh.ts` (SQL riêng) và bộ tính `packages/platform/src/core/authz/` (`requireScope`, `allowedScope`).

**"Vùng" là gì — ba lựa chọn:**

| | Lựa chọn | Được | Mất |
|---|---|---|---|
| **A (đề xuất)** | **Nút sơ đồ tổ chức** (`org_units`, DM16) — gán tại nút = mọi chi nhánh có `branches.org_unit_id` thuộc nút đó hoặc cây con | Dữ liệu đã có và đang dùng thật (NT-HT-001); bộ tính đã có kiểu phạm vi `org_unit` + `subtree` (`packages/platform/src/core/authz/types.ts`); chuyển cửa hàng sang vùng khác ở DM02 thì quyền tự theo | Phải giữ sơ đồ tổ chức đúng; xoá nút còn lần gán phải chặn |
| B | Cây chi nhánh (`branches.parent_id`) | Không cần bảng khác | NT-HT-001 đã bỏ cách phân cấp theo chi nhánh cha (đoán theo mã, sai thực tế) |
| C | Nhóm chi nhánh riêng (bảng mới) | Tự do nhóm chéo cây | Thêm một danh mục phải giữ song song với sơ đồ tổ chức |

**Thiết kế đề xuất (A):**

1. Migration 0150: `user_role_assignments.scope_type` thêm `org_unit` (`scope_id` = `org_units.id`, cùng đơn vị); `COMMENT ON`. Xoá / ngừng nút còn lần gán hiệu lực → chặn, báo tên người được gán (ECP-13).
2. Nghĩa: vai trò gán tại nút N có hiệu lực ở mọi chi nhánh thuộc N **và cây con** (theo `org_units.path`), tính **tại thời điểm yêu cầu** — cửa hàng chuyển vùng thì quyền đổi theo; lịch sử chuyển nằm ở `org_link_versions`.
3. **Gộp tính phạm vi về Core**: `packages/platform/src/core/authz/store.ts` nạp lần gán `org_unit` (kèm path); thêm một hàm Core trả phạm vi chi nhánh của người dùng (mọi chi nhánh, hoặc danh sách mã + quyền thêm / Cấm theo từng chi nhánh) từ một truy vấn gộp lần gán chi nhánh / kho / nút. Lớp chi nhánh (`quyen-chi-nhanh.ts`) bỏ SQL riêng, gọi hàm này; `requireScope` / `allowedScope` dùng cùng nguồn. Bước sau (phiếu khác): tính quyền theo chi nhánh hẳn trong bộ tính.
4. HT12 (Người dùng → Gán vai trò): phạm vi chọn được **Nút sơ đồ tổ chức** (cây DM16) cạnh Chi nhánh / Kho; bảng rà trước khi bật công tắc hiện "tại vùng X (n cửa hàng)".
5. Hiệu năng: phạm vi một người vùng có thể hàng trăm cửa hàng — tính một lần mỗi yêu cầu, đệm theo `authz_version` như quyền hiện nay.

**Tệp:** `db/migrations/0150_pham_vi_so_do_to_chuc.sql` (đề xuất, chưa có trong mã), `packages/platform/src/core/authz/store.ts`, `packages/platform/src/core/authz/scope.ts`, `packages/platform/src/core/security/role-assignments.ts`, `apps/api/src/modules/access/quyen-chi-nhanh.ts`, `apps/api/src/modules/access/role-assignment.service.ts`, `apps/api/src/modules/access/access.schemas.ts`, `modules/phan-quyen/web/**`, test mới trong `apps/api/test/`.

**Kiểm bằng:** gán "Quản lý cửa hàng" tại Miền Bắc → làm được ở mọi cửa hàng thuộc Miền Bắc và tỉnh con, 403 ở cửa hàng Miền Nam; báo cáo không lọc chỉ ra số Miền Bắc; chuyển một cửa hàng sang Miền Nam ở DM02 → quyền đổi ngay yêu cầu kế tiếp; xoá nút còn lần gán → chặn; `requireScope` ở cửa nạp cho kết quả giống lớp chi nhánh.

## 16. Câu hỏi cần chốt cho GĐ3–GĐ5
<!-- [2026-11-17 03:30 PM khanhtd] NT-HT-003 — câu hỏi chốt GĐ3–GĐ5 (R-FLOW-2), mặc định tạm theo đề xuất -->

| # | Câu hỏi | Đề xuất (mặc định tạm) |
|---|---|---|
| 1 | Thêm vai trò hệ thống `staff` (Nhân viên, chỉ `catalog:read`) — đổi `packages/contracts` + migration 0149 | **Có** |
| 2 | Bật giới hạn chi nhánh: lệnh đọc không lọc được theo chi nhánh trả thiếu quyền thay vì số liệu toàn đơn vị | **Có** (đóng mặc định; màn nào cần thì thêm tham số `branchCodes`) |
| 3 | GĐ4: màn của module khai ở manifest `extensions.screens[]` (không phải hàm trong mã) | **Có** — khai báo, bộ kiểm đọc được không cần chạy mã |
| 4 | GĐ4: tra chi nhánh bản ghi bằng `branchOf` của action, chạy trong runtime action | **Có** — module đọc bảng của mình, Core chỉ so phạm vi |
| 5 | GĐ4: action ghi không thuộc thao tác màn nào | **Cảnh báo** bản này, **chặn** bản phụ sau |
| 6 | GĐ5: "vùng" = nút sơ đồ tổ chức, gồm cây con | **A** (bảng §15) |
| 7 | GĐ5: chuyển cửa hàng sang vùng khác → quyền đổi ngay (không chốt theo ngày gán) | **Có** |
| 8 | Thứ tự PR code | GĐ3 → GĐ5 → GĐ4 (GĐ4 dùng `branchScope` của GĐ3; GĐ5 sửa cùng tệp lớp phân quyền nên đi trước) |

Người chốt: chủ dự án (Johnny Chu – Chu Hoàng Anh) duyệt PR tài liệu này; câu nào đổi thì sửa bảng trước khi merge. Sau khi merge, PR code từng giai đoạn theo §16 câu 8, mỗi PR một nhánh ngắn (R-FLOW-4).
