# NT-HT-003 · Phân quyền theo màn × thao tác và theo chi nhánh
<!-- [2026-11-14 kiennt] NGHIEM-THU — viết lại phiếu theo bản thử đã chạy (thay nháp 13/11 "giới hạn nơi làm việc theo lần gán"); chờ chốt thiết kế (R-FLOW-2) trước khi đẩy code. -->

| | |
|---|---|
| Phân hệ | Hệ thống (phân quyền người dùng) · mọi phân hệ đăng ký màn (Kho, Quỹ, Mua hàng, Bán hàng, Kế toán, Tài sản, Thuế, Danh mục / Hệ thống) |
| Màn hình | HT12 Phân quyền (Sửa vai trò, Người dùng) · nút Chi nhánh làm việc (Alt+B), HT04 · nút Thêm / Sửa / Xoá / Duyệt… trên 62 màn |
| Bộ phận yêu cầu | Quản trị, phòng kế toán; yêu cầu của chủ dự án: "mỗi phân hệ tự đăng ký menu + quyền thêm / sửa / xoá vào bộ quản lý vai trò như WordPress, không phân quyền cứng trong code" |
| Ngày tạo | 13/11/2026 · viết lại 14/11/2026 |
| Trạng thái | Chờ chốt thiết kế — bản thử đã chạy trên máy (nhánh tích hợp, chưa đẩy) |
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

### A. Sổ đăng ký màn (`apps/api/src/phan-he/man-hinh.ts`)
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
- `GET /api/v1/man-hinh`: danh sách màn + thao tác + quyền (giao diện ẩn menu / nút; HT12 dựng lưới).

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

### C. Theo chi nhánh (`apps/api/src/phan-he/quyen-chi-nhanh.ts`)
- **Phạm vi làm việc** = chi nhánh của các lần gán tại chi nhánh + chi nhánh chứa kho của lần gán tại kho, còn hiệu lực hôm nay, **trừ vai trò Hạn chế**. Không có lần gán nào → mọi chi nhánh. Chủ đơn vị, khoá API → không áp.
- **Quyền tại chi nhánh**: vai trò gán tại chi nhánh B chỉ có hiệu lực ở B (nền + Cho − Cấm; Cấm toàn đơn vị vẫn trừ).
- **Vai trò Hạn chế gán tại B**: không thu hẹp phạm vi; luật Cấm của nó trừ thẳng vào quyền hiệu lực (kể cả quyền của vai trò chính) khi yêu cầu ở B — "Kế toán, nhưng ở OC02 không được lập phiếu chi".
- **Chi nhánh của yêu cầu**: ô chi nhánh trong thân (`branchCode` → `fromBranchCode` / `fromBranch`, `documents[]`) → chi nhánh của phiếu theo mã (chuyển kho: lệnh nhận lấy chi nhánh nhận; kiểm kê) → header `X-Chi-Nhanh` (chi nhánh đang làm việc). Ngoài phạm vi: ghi → 403 `BRANCH_OUT_OF_SCOPE`; đọc theo header → bỏ header.
- `GET /api/v1/quyen-chi-nhanh` → `{ branches, theoChiNhanh, camTheoChiNhanh }` cho giao diện.

### D. Giao diện
- `apps/web/src/lib/manHinh.ts`: `useThaoTac(màn)` → nút được hiện; `ganQuyenXem` ẩn mục menu không có quyền Xem.
- `can(p)` = quyền toàn đơn vị + quyền tại chi nhánh đang làm việc − Cấm tại chi nhánh đó; `x-chi-nhanh` gửi kèm mọi lệnh.
- Alt+B / HT04 chỉ hiện chi nhánh trong phạm vi; một chi nhánh → cố định; đổi chi nhánh → menu / nút đổi theo.
- **HT12 Sửa vai trò** (`modules/phan-quyen/web`): thẻ theo phân hệ (giống menu) + "Quyền chung"; mỗi màn một dòng; chế độ **Cơ bản** (mỗi quyền là nút bật / tắt theo tên nút trên màn, mức nhanh Không / Chỉ xem / Đầy đủ) và **Chi tiết** (cột cố định Xem · Thêm · Sửa · Xoá / Huỷ · Duyệt · Xuất · Khác); màu Cho riêng / có sẵn / đang Cấm; vai trò Hạn chế bấm = Cấm; nhắc "+ users:write" ở thao tác có `goc`. Lưu vẫn qua API luật Cho / Cấm sẵn có (lý do, nhập lại mật khẩu khi quyền rủi ro cao).

### E. Thứ dùng chung bị đụng (R-FLOW-2) — cần chốt
| Đụng | Vì sao | Đề xuất |
|---|---|---|
| `apps/api/src/app.ts` — đăng ký 1 plugin `preHandler` toàn app | móc gác lệnh + áp quyền chi nhánh cho mọi yêu cầu của người dùng | 1 dòng, sau `authPlugin`; tệp framework → chữ ký kiến trúc |
| `tests/conformance/lib/layers.mjs` | SC-LAYER-2: phân hệ (`D phan-he/*`) import `phan-he/man-hinh.ts` (`D`) | khai `phan-he/man-hinh.ts`, `phan-he/quyen-chi-nhanh.ts` là tệp dùng chung của lớp D (hoặc chuyển sang lớp Platform) — sửa RULE-MODULE-BOUNDARY trước |
| Mượn quyền gốc trong một yêu cầu | đổi cách tính quyền hiệu lực (thêm vào `auth.permissions` của yêu cầu) | chỉ quyền rủi ro thấp, chỉ khi lệnh do màn gác và đúng loại phiếu |
| `docs/standard/quyen.json` (S028-11) | sổ quyền tăng 198 quyền chi tiết | sinh lại bằng `scripts/phan-quyen/quyen-snapshot.mjs` khi S028-11 vào main |

Không sửa `packages/*`.

## 3. Công việc và tệp
| Bước | Việc | Tệp |
|---|---|---|
| 1 | Sổ đăng ký màn + gác lệnh + mượn quyền | `apps/api/src/phan-he/man-hinh.ts` |
| 2 | Theo chi nhánh + móc toàn app | `apps/api/src/phan-he/quyen-chi-nhanh.ts`, `apps/api/src/app.ts` |
| 3 | Đăng ký màn 8 phân hệ (manifest + `man-hinh-*.ts` + gác trực tiếp ở route của phân hệ) | `apps/api/src/phan-he/{kho,quy,mua-hang,ban-hang,ke-toan,tai-san,thue,he-thong}/**` |
| 4 | Giao diện: ẩn nút / menu, chi nhánh làm việc | `apps/web/src/lib/{manHinh.ts,auth.tsx,api.ts}`, `apps/web/src/components/ChiNhanhLamViec.tsx`, `apps/web/src/layout/useAppMenu.ts`, các màn ở mục 6 |
| 5 | HT12 lưới theo màn | `modules/phan-quyen/web/lib/man-hinh-grid.ts`, `modules/phan-quyen/web/screens/RoleEditor.tsx` |
| 6 | Test | `apps/api/test/phan-quyen-*.test.ts` (8 tệp), `modules/phan-quyen/test/man-hinh-grid.test.ts` |

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
- **Lọc báo cáo / danh sách theo chi nhánh** (người một chi nhánh vẫn xem số liệu chi nhánh khác nếu tự chọn ở bộ lọc).
- Quyền Xem của các màn chỉ đọc qua lệnh dùng chung (Nhà cung cấp, Chính sách mua, Cài đặt mua, Công thức đặt hàng, Nhập dữ liệu khởi đầu, Thẻ / Biến động / Loại tài sản, Người nộp thuế, Đối trừ công nợ): cần tách lệnh đọc riêng.
- Duyệt phiếu bán / trả lại (chưa có lệnh ở máy chủ); nút Nhập Excel chưa ẩn theo Cấm tại chi nhánh.
- Phạm vi theo **kho** cho thủ kho (gán tại kho hôm nay chỉ mở chi nhánh của kho).

## 8. Câu hỏi cần chốt (người duyệt thiết kế)
1. **Mượn quyền gốc rủi ro thấp** trong đúng lệnh do màn gác (mục B) — đồng ý? (Thay thế: chỉ cho Cấm, không cho Cho riêng ở lệnh của lõi — khi đó HT12 phải khoá ô Cho của các thao tác đó.)
2. **Giới hạn theo chi nhánh luôn bật** (bản thử) hay **công tắc đơn vị, mặc định tắt** + bảng rà trước khi bật (nháp 13/11)? Đề xuất: công tắc — tránh khoá nhầm người đang được "gán thêm để hỗ trợ".
3. Đặt `man-hinh.ts` / `quyen-chi-nhanh.ts` ở đâu cho đúng lớp: giữ ở `apps/api/src/phan-he/` (khai tệp dùng chung lớp D trong `layers.mjs`) hay chuyển sang Platform (`apps/api/src/modules/access/`)?
4. Vai trò Hạn chế gán tại chi nhánh: **không** thu hẹp phạm vi, chỉ Cấm tại đó (bản thử) — đồng ý?
5. Lần gán theo kho có tính chi nhánh của kho vào phạm vi? (Bản thử: có.)

## 9. Kế hoạch đẩy (R-FLOW)
1. PR tài liệu: phiếu này + giữ chỗ (`CLAIMS.md`) — chờ duyệt mục 8.
2. Nếu mục 8 câu 3 cần sửa bảng lớp: PR tài liệu RULE-MODULE-BOUNDARY + `layers.mjs` (người phụ trách).
3. PR code GĐ1 (từ `main` mới): mục 3 bước 1–2 + Kho + Quỹ + test (nhỏ, dễ duyệt).
4. PR code GĐ2: các phân hệ còn lại + giao diện + HT12.
5. Tệp trong phạm vi người khác (mục 3): PR riêng sau khi người giữ xong.

## 10. Kết quả chạy (bản thử, 14/11/2026)
| | |
|---|---|
| Bản code | nhánh tích hợp ở máy (`tich-hop/phan-quyen-thu`), chưa đẩy |
| Test tự động | `apps/api/test/phan-quyen-{man-hinh,chi-nhanh,quy,mua-hang,ban-hang,ke-toan,danh-muc,sua-loi}.test.ts`, `modules/phan-quyen/test/man-hinh-grid.test.ts` — đạt; cả bộ `npm test` 2141 đạt (3 lỗi có sẵn trên main) |
| Chạy trên demo Ớt Chuông | 21 / 21 ca phân quyền + 14 / 14 ca sửa lỗi (lệnh API) + bấm giao diện (HT12, ẩn nút theo chi nhánh) |

## 11. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 12. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 13/11/2026 | Tạo nháp "giới hạn nơi làm việc theo lần gán tại chi nhánh" (công tắc mặc định tắt, mã ở `modules/access`) |
| 14/11/2026 | Viết lại theo bản thử: sổ đăng ký màn × thao tác (yêu cầu chủ dự án), gác lệnh + mượn quyền gốc rủi ro thấp, quyền theo chi nhánh, Hạn chế theo chi nhánh, HT12 lưới theo màn; câu hỏi chốt mục 8 |
