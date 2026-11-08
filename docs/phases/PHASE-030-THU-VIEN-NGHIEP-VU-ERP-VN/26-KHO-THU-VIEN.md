# PHASE-030 · 26 — Kho thư viện: trụ cột `bizcity_library@1`, cập nhật, căn cứ, cấu hình, theo dõi sử dụng, bảng đánh giá, skill cho dev
<!-- [2026-11-08 11:37 AM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-46: thiết kế Kho thư viện (đợt B của ADR-0032) — trụ cột IX, màn HT14, sáu điểm gắn bộ kiểm, hai đường cập nhật, căn cứ pháp lý thành thư viện, cấu hình theo đơn vị, theo dõi sử dụng, bảng pass / không pass, skill use-bizcity-library; bản mẫu mockups/kho-thu-vien.html -->

> **Trạng thái:** Chấp nhận 2026-11-08 — chủ dự án duyệt bản mẫu [mockups/kho-thu-vien.html](mockups/kho-thu-vien.html) và chốt Q030-L1..L5 theo cột Đề xuất (§12): *"đồng ý phương án của bro, code nhé"*. Đợt A (bộ nạp, bộ kiểm, 4 thư viện) ở S030-45 / PR #166.
<!-- [2026-11-08 12:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-46: chủ dự án chốt thiết kế Kho thư viện và Q030-L1..L5 = đề xuất -->
> **Nguồn:** chủ dự án 2026-11-08 — *"mockup việc thể hiện được kho thư viện và trụ cột bizcity_library@1 kết hợp với skill để luôn giúp được dev theo chuẩn thư viện, update được thư viện, bổ sung được các căn cứ pháp lý cho thư viện, cấu hình thư viện, theo dõi việc sử dụng thư viện, dashboard đánh giá … cái nào pass thư viện, cái nào không? Các validator sử dụng thư viện thế nào"*.
> **Liên quan:** [ADR-0032](../../adr/ADR-0032-thu-vien-dung-chung-bizcity-library.md), [BIZCITY-LIBRARY-v1](../../contracts/BIZCITY-LIBRARY-v1.md), [24 Cấu hình hệ thống](24-CAU-HINH-HE-THONG.md), [21 Sổ cổng](21-SO-CONG-VA-BANG-DIEU-HANH.md), [ADR-0031 Policy Registry](../../adr/ADR-0031-policy-registry-rule-contracts.md).

## 1. Vì sao

Đợt A cho **khuôn** và **bộ kiểm**: thư viện là tệp JSON có phiên bản, kiểm được ô nhập, trả mã `LIB-*` kèm gợi ý. Còn thiếu năm thứ để thư viện thành **nền dùng hằng ngày**:

1. **Nhìn thấy:** chưa có màn nào cho người dùng / kế toán trưởng thấy thư viện nào có, bản nào, mục nào chưa duyệt.
2. **Đo được:** chưa biết module / kênh nào dùng thư viện, bao nhiêu lần qua, bao nhiêu lần trượt, trượt vì mã nào.
3. **Cập nhật được:** chỉ Nhóm Lõi sửa được (qua PR); đơn vị không có cách đề xuất sửa, ghi đè giá trị riêng, hay xác nhận căn cứ.
4. **Căn cứ rời rạc:** `LEGAL_BASES` (9 văn bản, mã nguồn) và `vn-rulepacks/registry/legal-sources.json` (17 văn bản) là hai sổ; căn cứ trong thư viện là chuỗi tự do.
5. **Dev không biết dùng:** chưa có skill / lệnh CLI dẫn dev "ô này phải lấy từ thư viện nào, kiểm thế nào, thêm thư viện ra sao".

## 2. Trụ cột IX — Thư viện tham chiếu có phiên bản

Đề xuất thêm vào [tru-cot.json](../../standard/tru-cot.json) (bảng HT10) một trụ cột nền móng, ngang Master Data (0) và Policy Registry (V):

> **IX · Thư viện tham chiếu có phiên bản (`bizcity_library@1`)** — dữ liệu tham chiếu chung mọi đơn vị (tham số pháp lý, lịch, mã chức năng, sườn nghiệp vụ, luật kiểm, mẫu) có một khuôn, có phiên bản, đọc tại ngày, kiểm được ô nhập với mã chung `LIB-*` và gợi ý; đơn vị chỉ đọc, ghi đè có lý do, xác nhận căn cứ; mọi lần dùng để lại dấu (thư viện @ bản # băm).
>
> **Ranh giới:** MDG (0) giữ dữ liệu **của đơn vị** (khách, hàng, kho); Policy Registry (V) giữ **quyết định của đơn vị** (giá, chiết khấu); Thư viện (IX) giữ **tham chiếu chung** (luật, lịch, mã chuẩn). Một giá trị tra theo thứ tự: đơn vị ghi đè → thư viện tại ngày → mặc định registry (D-LIB-8).

| Tiêu chí | Nội dung | Hôm nay |
|---|---|---|
| L-1 | Khuôn chung, phiên bản ba tầng, băm, changelog; SC-LIB-1 chặn | đạt (S030-45) |
| L-2 | Bộ kiểm chung, 7 mã `LIB-*` trong thư viện mã, gợi ý từ thư viện | đạt (S030-45) |
| L-3 | API đọc + ô chọn + MCP chỉ đọc | một phần (API có, `LibraryPicker` chưa — A2) |
| L-4 | Căn cứ pháp lý là thư viện; mục trỏ căn cứ bằng mã; xác nhận theo đơn vị | chưa (§6) |
| L-5 | Cấu hình theo đơn vị: ghi đè giá trị, hạ mức luật, gắn ô ↔ thư viện | chưa (§7) |
| L-6 | Theo dõi sử dụng + bảng đánh giá pass / không pass | chưa (§8, §9) |
| L-7 | Bộ kiểm ở mọi đường vào (form, module, cửa nạp, kết nối) dùng chung thư viện | một phần (§4) |
| L-8 | Skill + CLI cho dev và AI | chưa (§10) |

Thêm dòng trụ cột là sửa tệp dùng chung của PHASE-026: đi cùng PR code đợt B1 (S030-47), có dấu R-SIG.

## 3. Màn HT14 — Kho thư viện

Menu Hệ thống → **HT14 Kho thư viện** (`/he-thong/thu-vien`), quyền xem `catalog:read`; thao tác ghi (§5–§7) cần `settings:write`. Bản mẫu: [mockups/kho-thu-vien.html](mockups/kho-thu-vien.html).

| Tab | Cho thấy | Đọc từ |
|---|---|---|
| **Tổng quan** (bảng đánh giá) | thẻ: số thư viện, số mục, % đã duyệt, lượt kiểm 30 ngày, % qua; bảng thư viện × pass / cảnh báo / chặn; 10 mã trượt nhiều nhất; 10 mã lạ hay gặp (ứng viên bổ sung); module / kênh dùng mã ngừng | `library_usage_daily` (§8) + bộ nạp |
| **Danh sách** | thẻ từng thư viện: loại, bản, ngày phát hành, chủ duyệt, số mục, % duyệt, số luật, độ tươi (ngày phát hành so với hôm nay), nút Mở | `GET /api/v1/libraries` |
| **Chi tiết thư viện** | 6 phần: Mục (ô chọn thật, lọc nhóm / ngày, giá trị tại ngày); Phiên bản (changelog, băm, so sánh hai bản); Căn cứ (mỗi mục, trạng thái xác nhận); Luật (mã, mức, điều kiện đọc được bằng lời, mức sau khi đơn vị hạ); Nơi dùng (module / action / trường gắn thư viện này); Kiểm thử (dán giá trị → kết quả bộ kiểm) | bộ nạp + `library_bindings` + `validate` |
| **Căn cứ pháp lý** | thư viện `vn.can-cu-phap-ly`: văn bản, hiệu lực, trạng thái (còn / hết / sắp), số mục thư viện trỏ tới; mục chưa có căn cứ | §6 |
| **Cấu hình** | theo đơn vị: bật / tắt thư viện tuỳ chọn; ghi đè giá trị (tham số `policy`); hạ mức luật; gắn ô ↔ thư viện cho module của đơn vị | §7 |
| **Đề xuất cập nhật** | phiếu đề xuất của đơn vị (thêm mục, sửa giá trị, thêm căn cứ, báo sai) → trạng thái gửi / Nhóm Lõi nhận / đã vào bản x.y.z | §5 |

Màn chỉ dùng `@bizcity/ui-kit`; đặt ở module `modules/thu-vien/` (UI-only như `phan-quyen`, ADR-0024), API ở Platform.

## 4. Bộ kiểm dùng thư viện thế nào — sáu điểm gắn

Một bộ kiểm duy nhất (`validateAgainstLibrary`, Platform), sáu chỗ gọi. Mỗi chỗ cùng nhận `{ thư viện, giá trị, ngày }` và trả cùng một khuôn phát hiện.

| # | Điểm gắn | Ai gọi | Khi nào | Mức chặn | Hôm nay |
|---|---|---|---|---|---|
| ① | **Ô chọn** `LibraryPicker` (ui-kit) | màn của module | lúc gõ / chọn | không chặn — chỉ cho chọn mục còn dùng, hiện gợi ý / nhãn chưa duyệt | A2 |
| ② | **API kiểm** `POST /api/v1/libraries/:id/validate` | form trước khi lưu, app ngoài, AI (MCP) | trước khi gửi | trả `ok`; bên gọi quyết | có (S030-45) |
| ③ | **Trong action của module** `ctx.libraries.validate(id, value, { at })` | `defineAction` của module | trong giao dịch, trước khi ghi | `block` → `Errors.validation` kèm mã `LIB-*`; `warn` → cần lý do (như cổng `validation`, bizcity_action@1 1.4.0) | đề xuất B5 — hôm nay import thẳng `@bizcity/platform/core/libraries` |
| ④ | **Cửa nạp (Gate B)** | Kernel, cho mọi chứng từ từ mọi kênh | L3 (dữ liệu gốc) / L4 (nghiệp vụ) | theo bảng gắn trường ↔ thư viện của loại chứng từ (vd thuế suất ↔ `vn.thue-suat-gtgt` tại ngày chứng từ → `LIB-VALUE-001` cảnh báo); không thêm mã `IN-*` mới, dùng lại `LIB-*` | đề xuất B5 — cần chữ chốt K1/K2 riêng (R-FLOW §3) |
| ⑤ | **Bộ kiểm chuẩn tĩnh** | CI, `selfcheck` | mỗi PR | SC-LIB-1 (thư viện đúng khuôn); SC-LIB-2 đề xuất: module khai `libraries[]` trong `bizcity.module.json` thì mọi trường khai `library` phải trỏ thư viện có thật, mã cứng trong mã nguồn trùng mã thư viện bị báo | SC-LIB-1 có; SC-LIB-2 đề xuất |
| ⑥ | **Skill / CLI** | dev, trợ lý AI | khi viết module | `npx bizcity library check <id> <giá trị>` ra PASS / FAIL như `event check` | đề xuất B4 |

Mọi điểm ③ ④ ghi **bằng chứng** `basis_used: { kind: 'library', key: '<id>:<mã>', version, hash, at, value }` (S030-29) và **một dòng đếm** sử dụng (§8). Điểm ① ② chỉ đếm khi bên gọi gửi `source` (module / kênh).

**Khai gắn trong manifest** (đề xuất `bizcity_module@1` 1.3.0, minor):

```json
"libraries": [
  { "id": "vn.tham-so-phap-ly", "fields": ["payroll.insuranceRate"], "at": "docDate" },
  { "id": "core.khoan-muc",     "fields": ["voucher.lines[].costItem"], "required": true }
]
```

Khai gắn là căn cứ cho tab Nơi dùng (§3), cho SC-LIB-2 (⑤) và cho bảng đánh giá theo module (§9).

## 5. Cập nhật thư viện — hai đường

| Đường | Ai | Làm gì | Kết quả |
|---|---|---|---|
| **Repo** (nguồn sự thật) | Nhóm Lõi, người đóng góp | sửa nguồn trong `libraries/<id>/sources/` hoặc luật chuyển `build.mjs` → `node libraries/<id>/build.mjs` (tự lên bản, thêm changelog) → PR → SC-LIB-1 | bản mới phát hành theo bản dựng; mọi đơn vị nhận khi cập nhật phần mềm |
| **Đơn vị** (đề xuất) | kế toán trưởng / quản trị đơn vị | phiếu **Đề xuất cập nhật**: thêm mục · sửa giá trị (kèm căn cứ) · thêm / sửa căn cứ · báo sai; gắn tệp văn bản | lưu `library_change_requests` (đơn vị, thư viện, bản, mã, loại, nội dung, căn cứ, trạng thái); xuất JSON / issue cho Nhóm Lõi; **không** đổi thư viện ở đơn vị |

Đơn vị cần giá trị khác **ngay** (tham số loại `policy`, hoặc văn bản mới chưa vào thư viện) thì **ghi đè** ở Cấu hình (§7), không chờ bản mới. Ghi đè có ngày hiệu lực, lý do, căn cứ, nằm trong `setting_values` (đường có sẵn của HT13). Khi thư viện ra bản có giá trị đó, màn báo "ghi đè trùng thư viện — có thể bỏ".

## 6. Căn cứ pháp lý thành thư viện

- Gộp `LEGAL_BASES` + `legal-sources.json` thành thư viện **`vn.can-cu-phap-ly`** (`kind: code-list`): mã văn bản (`ND-73-2024`, `TT-99-2025`…), tên, cơ quan, ngày ban hành, hiệu lực (`effective[]`: từ – đến, văn bản thay thế = `replacedBy`), trang tóm tắt trong `docs/can-cu/`. Mã cũ (`TT99`, `ND123`…) là bí danh — `basisOf()` và SC-FIND-1 không đổi hành vi.
- `basis[]` của mục / luật thư viện thêm `key` trỏ mã văn bản; SC-LIB-1 kiểm `key` có trong `vn.can-cu-phap-ly` (chuỗi `ref` tự do vẫn được, nhưng hiện là "chưa liên kết").
- **Xác nhận theo đơn vị** (attestation): kế toán trưởng đánh dấu "đã đối chiếu" một mục / căn cứ cho đơn vị mình → `library_attestations` (đơn vị, thư viện, bản, mã, người, lúc, ghi chú, tệp). Không đổi `verified` của repo; màn hiện hai nhãn: *Nhóm Lõi đã duyệt* / *đơn vị đã đối chiếu*. Bản thư viện mới đổi giá trị của mục → xác nhận cũ hết hiệu lực (gắn theo băm của mục).
- Văn bản hết hiệu lực mà còn mục trỏ tới → bảng đánh giá báo "căn cứ hết hạn".
- **Chữ chốt bổ sung B3a (S030-49a)** <!-- [2026-11-08 05:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-49a: xác nhận theo đơn vị lưu bằng bằng chứng của action, không bảng riêng; nguồn thư viện căn cứ là vn-rulepacks/registry/legal-sources.json -->:
  - `vn.can-cu-phap-ly` sinh từ `packages/vn-rulepacks/registry/legal-sources.json` (17 văn bản: hiệu lực, sửa đổi / thay thế, điều khoản) cộng `LEGAL_BASES` (khoá cũ `LKT`, `TT99`, `NOI-BO`… là **bí danh** — không đổi `legal-basis.ts`, SC-FIND-1 giữ nguyên). Mã mục = id của sổ (vd `vn.law.88-2015-qh13`).
  - **Xác nhận theo đơn vị = bằng chứng**, không bảng `library_attestations`: action ghi `core.library.attest` (`settings:write` — chủ đơn vị, kế toán trưởng; lý do bắt buộc) → đúng một bản ghi `audit_logs` có `object_type = 'library-item'`, `object_id = '<thư viện>:<mã>'`, `after_data` mang bản thư viện + **băm của mục**. Đọc: `core.library.attestations`. Xác nhận **hết hiệu lực** khi băm của mục ở bản đang chạy khác băm đã xác nhận. Không migration, không sửa danh mục bảng.
  - SC-LIB-1 thêm: `basis[].key` (nếu có) phải là mã hoặc bí danh trong `vn.can-cu-phap-ly`.

## 7. Cấu hình thư viện theo đơn vị

Bảng `library_settings` (đơn vị × thư viện), đổi qua `core.library.configure` (`settings:write`, lý do bắt buộc, nhật ký):

| Cấu hình | Nghĩa | Giới hạn |
|---|---|---|
| `enabled` | bật thư viện tuỳ chọn (vd `authz.tgs-*` chỉ cần khi nạp vai trò mẫu) | thư viện Core bắt buộc không tắt được |
| `ruleLevels` | hạ mức luật riêng của thư viện (`warn` → `info`), như HT09 | không hạ `LIB-*` chuẩn mức `block` (toàn vẹn dữ liệu); không nâng quá `block` |
| `atPolicy` | đọc giá trị theo ngày chứng từ (mặc định) hay hôm nay | chỉ thư viện `param` |
| `overrides` | ghi đè giá trị tham số → `setting_values` khoá `library.<id>.<mã>` có hiệu lực, căn cứ | chỉ mục `kind: policy`; mục `law` ghi đè được nhưng kèm cảnh báo `TSPL-LAW-001` và hiện trên bảng đánh giá |
| `bindings` | gắn trường của module do đơn vị tự dựng ↔ thư viện (bổ sung cho khai ở manifest) | chỉ thêm, không gỡ khai của manifest |

### 7.1 Chữ chốt B3b (S030-49b) <!-- [2026-11-08 07:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-49b: chủ dự án chốt — ghi đè lưu trong cấu hình thư viện có phiên bản (không setting_values), hai bảng mới 0087, dùng chung schema-catalog.ts -->

Chủ dự án 2026-11-08: ghi đè giá trị **nằm trong cấu hình thư viện có phiên bản**, không dùng `setting_values` (registry cấu hình chỉ nhận khoá khai sẵn — không mở cho khoá động `library.<id>.<mã>`).

| Bảng (migration 0087) | Khuôn | Ghi |
|---|---|---|
| `library_settings` | (đơn vị, thư viện, **phiên bản**) → `config` jsonb, lý do, người, lúc. **Chỉ thêm** (trigger chặn sửa / xoá, như `setting_values`); bản hiện hành = phiên bản lớn nhất | `core.library.configure` (`settings:write`, lý do bắt buộc, `Idempotency-Key`) |
| `library_change_requests` | phiếu: thư viện, mã mục (tuỳ chọn), loại `them-muc · sua-gia-tri · can-cu · bao-sai · ngung-dung`, nội dung, khoá căn cứ (tuỳ chọn), trạng thái `gui → nhan → da-vao · tu-choi`, `rut` (người gửi), bản đã vào | `core.library.propose` (`catalog:write`), `core.library.proposal.update` (`settings:write`; người gửi chỉ `rut`) — mỗi lần là một bằng chứng |

`config` = `{ enabled?, atPolicy?, ruleLevels?, overrides? }`:
- `enabled: false` chỉ với thư viện khai `optional: true` trong phong bì (hợp đồng 1.4.0 — `authz.tgs-*` là tuỳ chọn); thư viện tắt thì `validate` / `items` trả lỗi `NOT_FOUND` cho đơn vị đó.
- `atPolicy`: `docDate` (mặc định) · `today` — chỉ thư viện `param`.
- `ruleLevels`: `{ <mã luật thư viện>: 'warn' | 'info' }` — **chỉ hạ**, không nâng; không áp cho `LIB-*` chuẩn (toàn vẹn dữ liệu).
- `overrides`: `{ <mã mục>: [{ from, value, reason, basisKey? }] }` — chỉ mục có `effective[]`; giá trị theo khuôn của mục; `from` rơi vào **kỳ đã khoá** → chặn (như HT13, D030-12); ghi đè mục loại **luật** được (Q030-L3) nhưng HT14 hiện đỏ. Bộ kiểm đọc: ghi đè đơn vị có hiệu lực tại ngày → thư viện tại ngày (D-LIB-8); `LIB-VALUE-001` so với giá trị đơn vị đang dùng và ghi rõ nguồn.

## 8. Theo dõi sử dụng

- Bảng **`library_usage_daily`** (đơn vị, ngày, thư viện, bản, nguồn = module / action / kênh, mã mục hoặc `?`, kết quả `pass / warn / block`, mã phát hiện, số lần). Ghi **sau commit** (eventual — ECP: số đếm không phải sự thật kế toán), gom trong bộ nhớ ≤ 60 giây rồi `upsert … count = count + n`; mất vài lượt đếm khi tiến trình chết là chấp nhận được, có đối chiếu: tổng lượt có bằng chứng (③ ④) ≤ tổng đếm.
- Không lưu giá trị nhập (tránh dữ liệu cá nhân / số tiền — R-SEC-10): chỉ mã thư viện, mã mục, mã phát hiện.
- **Gom không hẹn giờ** (chữ chốt S030-48 <!-- [2026-11-08 03:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-48: thay "gom ≤ 60 giây" bằng gom theo lượt, vì SC-EVT-1 cấm setInterval / setTimeout -->): lượt đếm giữ trong bộ nhớ; ghi xuống khi có lượt mới mà đã ≥ 30 giây từ lần ghi trước **hoặc** đã gom ≥ 200 dòng; ghi hết trước khi đọc số liệu (`core.library.usage`) và khi máy chủ tắt (`onClose`). Ghi một câu `INSERT … ON CONFLICT DO UPDATE SET count = count + EXCLUDED.count` cho cả lô; lỗi ghi thì bỏ lô (số đếm là quan sát, không phải sự thật kế toán) và ghi nhật ký.
- Đợt B2 đếm điểm gắn ② (`core.library.validate`, `source` tuỳ chọn trong thân yêu cầu; không gửi thì nguồn = `api`) và hàm `recordLibraryUsage()` cho Platform; điểm ③ ④ đếm khi gắn ở B5.
- `GET /api/v1/libraries/usage?from=&to=&library=&source=` (`core.library.usage`) cho bảng đánh giá; MCP chỉ đọc.

## 9. Bảng đánh giá — cái gì pass thư viện, cái gì không

Ba lớp, cùng một màn (tab Tổng quan) và cùng số liệu cho HT10:

| Lớp | Câu hỏi | Chỉ số | Nguồn |
|---|---|---|---|
| **Thư viện** | thư viện có khoẻ không? | % mục đã duyệt (repo) · % đơn vị đã đối chiếu · số căn cứ hết hạn · độ tươi (ngày từ bản cuối) · SC-LIB-1 | bộ nạp, `library_attestations`, `vn.can-cu-phap-ly` |
| **Sử dụng** | dữ liệu đi qua thư viện có đúng không? | lượt kiểm · % `pass` / `warn` / `block` · top mã phát hiện · top mã lạ (`LIB-UNKNOWN-001` — ứng viên thêm mục) · lượt dùng mã ngừng · lượt dùng mục chưa duyệt | `library_usage_daily` |
| **Module** | module / kênh có theo chuẩn thư viện không? | số trường khai `library` / số trường cần (độ phủ) · % lượt `pass` theo nguồn · SC-LIB-2 · mã cứng còn trong mã nguồn | manifest, `library_usage_daily`, selfcheck |

**Kết luận một module:** ĐẠT khi độ phủ = 100 % trường bắt buộc, SC-LIB-2 sạch, tỉ lệ `block` 30 ngày < 1 % lượt; ĐẠT có điều kiện khi còn mã ngừng / mục chưa duyệt; KHÔNG ĐẠT khi có trường bắt buộc chưa gắn hoặc mã cứng trùng thư viện. Kết luận này đi vào bảng điểm conformance của module (`npx bizcity module check`).

## 10. Skill `use-bizcity-library` và CLI

Skill mới ở `skills/use-bizcity-library/SKILL.md`, cài được sang dự án khác (`npx bizcity skills install`). Dạy dev / AI bốn việc, mỗi việc một lệnh:

| Việc | Lệnh (đề xuất, B4) | Skill bắt buộc |
|---|---|---|
| Tìm thư viện cho một ô | `npx bizcity library search "thuế suất"` → id + ô chọn mẫu | **không** tự đặt danh sách cứng khi thư viện đã có |
| Kiểm giá trị | `npx bizcity library check vn.tham-so-phap-ly LUONG_CO_SO --value 2340000 --at 2026-03-01` → PASS / WARN / FAIL + gợi ý | không đoán mã; nghĩa mã lấy từ `npx bizcity explain LIB-…` |
| Thêm thư viện | `npx bizcity library new <miền>.<tên> --kind param` → khung `library.json`, `README.md`, `build.mjs` | id đúng miền; mỗi mục có nguồn; README bắt buộc |
| Cập nhật / thêm căn cứ | sửa nguồn → `node libraries/<id>/build.mjs` → `npx bizcity library diff <id>` (mục thêm / ngừng / đổi giá trị, bản sẽ lên) | không sửa tay `library.json`; không xoá mục; căn cứ trỏ mã trong `vn.can-cu-phap-ly` |

Skill nêu rõ: chỉ báo "xong" khi `library check` ra PASS và `selfcheck --only SC-LIB` ĐẠT — SKIP không phải PASS (cùng luật với `event check`).

## 11. Đợt và việc

| Mã | Việc | Phụ thuộc |
|---|---|---|
| S030-46 | Chữ chốt tài liệu này + bản mẫu (PR tài liệu) | — |
| S030-47 | **B1** — HT14 bản chỉ đọc (Tổng quan không số sử dụng, Danh sách, Chi tiết: Mục / Phiên bản / Luật / Kiểm thử) ở `modules/thu-vien/`; `LibraryPicker` trong ui-kit (A2); trụ cột IX vào `tru-cot.json` | #166 |
| S030-48 | **B2** — theo dõi sử dụng: migration `library_usage_daily`, bộ đếm sau commit, `core.library.usage`, tab Tổng quan có số liệu | S030-47 |
| S030-49 | **B3** — căn cứ: thư viện `vn.can-cu-phap-ly` (gộp hai sổ), `basis[].key`, `library_attestations`, tab Căn cứ; cấu hình `library_settings` + ghi đè qua `setting_values`; phiếu đề xuất `library_change_requests` | S030-47; Q030-L2, L3 |
| S030-50 | **B4** — CLI `npx bizcity library search / check / new / diff` + skill `use-bizcity-library` | S030-47 |
| S030-51 | **B5** — gắn vào action (`ctx.libraries`, bizcity_module@1 1.3.0 `libraries[]`) và cửa nạp (bảng trường ↔ thư viện, K1/K2 — chữ chốt riêng); SC-LIB-2; kết luận module §9 | S030-48; Q030-L4 |
| S030-52 | Thư viện dữ liệu: `core.khoan-muc`, `vn.loai-thue`, `core.ly-do-dinh-khoan` (lọc từ `db/seeds`, chỉ danh mục chuẩn — không đối tượng / nhân viên / ngân hàng) | S030-45; Q030-L5 |

## 12. Câu hỏi cho chủ dự án

| Mã | Câu hỏi | Đề xuất — **đã chốt 2026-11-08** |
|---|---|---|
| Q030-L1 | Thư viện là **trụ cột IX** riêng, hay gộp vào IV (một ngôn ngữ mã) / 0 (MDG)? | IX riêng — ranh giới khác MDG và Policy Registry (§2) |
| Q030-L2 | Xác nhận căn cứ theo **đơn vị** (attestation) có cần không, hay chỉ Nhóm Lõi duyệt ở repo? | có — kế toán trưởng mỗi đơn vị chịu trách nhiệm số liệu của mình |
| Q030-L3 | Đơn vị được ghi đè mục **luật** (`law`) không? | được, kèm cảnh báo và hiện đỏ trên bảng đánh giá (ADR-0020: người dùng quyết) |
| Q030-L4 | Cửa nạp kiểm theo thư viện ở mức nào mặc định: cảnh báo hay chặn? | cảnh báo (`LIB-VALUE-001`), chặn chỉ cho `LIB-UNKNOWN-001` ở trường bắt buộc |
| Q030-L5 | `db/seeds/` có đối tượng / nhân viên / tài khoản ngân hàng thật trên repo công khai — giữ, hay gỡ (cần viết lại lịch sử)? | gỡ khỏi bản phát hành; thư viện mẫu chỉ lấy danh mục chuẩn — việc S030-53 (không viết lại lịch sử git trong việc này; nếu cần thì chủ dự án quyết riêng) |
