# PHASE-026 · 30 — UI / UX: Enterprise Master Data Center, bốn khả năng, bảng trụ cột
<!-- [2026-11-04 02:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-026 — giao diện thể hiện nền móng: trung tâm dữ liệu gốc, thẻ thực thể bốn thẻ, nhóm đơn vị, HT10 + thẻ Trụ cột, luồng small win -->

Bản mẫu: [mockups/master-data-center.html](mockups/master-data-center.html) (5 thẻ, bấm thử). Nguyên tắc: **giữ mọi màn danh mục hiện có** (DM01…DM16, ACC…, MH…), chỉ **bọc** chúng bằng một trang trung tâm và một khung chung; mọi mức đạt là số do engine tính, không có ô tích.

## 1. Trung tâm dữ liệu gốc (`/danh-muc`, thay trang chủ phân hệ Danh mục)

| Nhóm | Gồm (màn hiện có) | Số nhanh trên thẻ |
|---|---|---|
| Tổ chức & pháp nhân | Thông tin đơn vị HT03, Sơ đồ tổ chức DM16, Chi nhánh DM02, Nhóm đơn vị (mới) | pháp nhân · chi nhánh · cửa hàng · kho; vai trong nhóm |
| Hàng hoá & SKU | Mặt hàng DM10, Phân loại hàng DM11, Biến thể MH26, Đơn vị tính DM15, Bảng giá DM14 | mặt hàng · nháp · mồ côi · mã đổi 30 ngày |
| Kho & đơn vị tính | Danh mục kho DM12, Tồn max MH16, phương pháp tính giá | kho · phương pháp · tháng chưa tính giá |
| Đối tượng | Đối tượng DM03, Khách hàng, NCC, Nhóm đối tượng DM08, Nhân viên DM04 | đối tượng · thiếu MST · trùng tên |
| Tài khoản & chính sách | DM Tài khoản ACC1, TK ngầm định ACC41, Lý do ACC18, Mặt hàng – TK ACC17, Loại thuế ACC43, Hồ sơ kế toán HT07 | TK · phiên bản chính sách hiệu lực · TK chưa dùng |
| Lịch sử & thay đổi | Lịch sử (mới), Quy định dữ liệu danh mục HT09, luật nhắc | thay đổi 7 ngày · thay đổi lớp 3 chờ xem tác động |
| Kiểm chuẩn & kiểm toán | Kiểm chuẩn HT06, Bàn đánh giá HT08, Bàn điều tra, **Trụ cột & mức đạt HT10** | mã Gate A / C đang mở · % nền móng |

Thanh trên: **ô tìm một mã bất kỳ** (sku, mã cũ, mã vạch, mã đối tượng, số TK, mã chi nhánh) → mở thẻ thực thể. Dải "Việc cần làm" như Mua hàng: mặt hàng nháp, mã mồ côi, thay đổi lớp 3 chưa xem tác động, trùng mã vạch.

## 2. Thẻ thực thể — bốn thẻ chung (`MasterDataFrame`)

Mọi form danh mục (mặt hàng, đối tượng, tài khoản, chi nhánh, kho) có cùng bốn thẻ bên phải form:

| Thẻ | Người dùng thấy | Nguồn |
|---|---|---|
| **Lịch sử** | dòng thời gian: *01/10/2026 — đổi mã SUA-400 → SUA400N (từ 01/10) — Lan Kế toán*; *15/09 — đổi nhóm hạch toán NHT01 → NHT02 (từ 15/09)*; *2024 — tạo từ POS* | `item_codes` / `entity_codes` / `item_classification` / `audit_logs` |
| **Tác động** | *mã này có 1.248 chứng từ (09/2024 → nay), 12 kho còn tồn, TK 1561 / 632 / 5111, bảng giá BL, 3 báo cáo đã phát hành* — và **xem trước** khi sắp đổi mã / đổi nhóm / ngừng: "đổi nhóm từ hôm nay: 37 chứng từ tháng này sẽ định khoản theo nhóm mới; sổ cũ không đổi" | chỉ mục tham chiếu |
| **Kiểm chuẩn** | khung Vì sao (Gate A) + mã Gate C đang mở của thực thể, mỗi mã có *vì sao · sửa ở đâu · căn cứ* | thư viện mã |
| **Truy vết** | Hành trình (ACC95) nhúng: định danh, mọi mã, sự kiện, bút toán, giá vốn | `bizcity_lineage@1` |

Nút ở đầu thẻ: **Đổi mã** (mở hộp: mã mới, từ ngày, xem tác động, lý do), **Gộp mã** (xem trước), **Ngừng dùng**. Không có nút "duyệt" (ADR-0020).

## 3. Nhóm đơn vị (mới, Hệ thống)

Sơ đồ: HO (tenant) — kho tổng (tenant) — cửa hàng (tenant) ×n; mỗi nút: vai, MST tỉnh, số chứng từ liên đơn vị chưa khớp; bấm nút → danh sách `intercompany_refs` lệch (mỗi dòng: hai chứng từ, chênh, mã `CT-IC-*`, sửa ở đâu). Danh mục nhóm: mặt hàng chung với số đơn vị đã nhận.

## 4. Bảng trụ cột × mức đạt (HT10) và thẻ "Trụ cột" ở phân hệ

- **HT10** (Hệ thống): ô mỗi trụ cột (thanh %, đạt / một phần / chưa) → bấm lọc; bảng tiêu chí: mã · tiêu chí · mức · bằng chứng · khoảng cách · việc tiếp · ưu tiên; lọc "chỉ chưa đạt". Đọc được bởi mọi người đăng nhập.
- **Thẻ Trụ cột** ở trang chủ phân hệ (cạnh *Quy trình*, *Tất cả chức năng*): cùng bảng, lọc `modules` chứa phân hệ; đóng hai vai: *training* — kế toán hiểu luật nào đang bảo vệ số liệu của mình; *kim chỉ nam* — dev thấy tiêu chí chưa đạt gắn với phân hệ đang làm.
- Đã code (W0, 2026-11-04): `PillarsPage.tsx`, `GET /api/v1/system/pillars`, `docs/standard/tru-cot.json`. Chưa: engine ghi mức đạt (S026-15).
- Đợt 2 (S026-19, chữ chốt [50-BAN-DO-VIEC-TRU-COT](50-BAN-DO-VIEC-TRU-COT.md), bản mẫu [tru-cot-ban-do-viec.html](mockups/tru-cot-ban-do-viec.html)): khối trụ cột mở rộng (nhiệm vụ · ranh giới · vai · tài liệu), tiêu chí mở việc con có bằng chứng, lọc vai, vị trí trong URL. <!-- [2026-11-04 01:11 AM Johnny Chu - Chu Hoàng Anh] PHASE-026 — S026-19 -->

## 5. Luồng "small win" cho kế toán

| Việc | Luồng | Số bước |
|---|---|---|
| **Setup nhanh** | Trung tâm → Hàng hoá → Nhập Excel (xem thử) → Kiểm chuẩn (Gate A, nháp tự tách) → Kích hoạt hàng loạt | 4 |
| **Quản trị nhanh** | tìm mã → thẻ thực thể → Đổi mã / Đổi nhóm: xem tác động → lý do → xong; lịch sử tự ghi | 3 |
| **Theo dõi nhanh** | dải Việc cần làm ở Trung tâm (nháp, mồ côi, lớp 3 chưa xem tác động, lệch liên đơn vị) → bấm vào từng việc | 1 |
| **Trace nhanh** | gõ mã bất kỳ (kể cả mã cũ) → Truy vết → bấm sự kiện → chứng từ / bút toán / giá vốn | 2 |

## 6. Mẫu dùng lại cho đối tượng, tài khoản

`MasterDataFrame` nhận `{ type: 'item' | 'partner' | 'account' | 'branch' | 'warehouse', id }`; thẻ Truy vết hiện khi có lineage cho loại đó (mặt hàng hôm nay; đối tượng / tài khoản sau S026-13). Thành phần con: `HistoryTimeline`, `ImpactPanel` (+ `ImpactPreview` cho hộp Đổi mã), `GateFindings`, `LineageEmbed`.
