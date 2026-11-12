# NT-QUY-001 · Đính kèm chứng từ gốc trên phiếu tiền, phiếu chuyển tiền, phiếu kho
<!-- [2026-11-12 kiennt] NGHIEM-THU — tạo phiếu. -->

| | |
|---|---|
| Phân hệ | quỹ (kèm kho) |
| Màn hình | ACC51 Phiếu thu · ACC52 Phiếu chi · ACC54 Phiếu báo có · ACC53 Phiếu báo nợ · Q2 Phiếu chuyển tiền · KHO01 Phiếu chuyển kho · KHO02 Kiểm kê kho (NT-KHO-002) |
| Bộ phận yêu cầu | Phòng kế toán |
| Ngày tạo | 12/11/2026 |
| Trạng thái | Đã chốt (12/11/2026, kiennt) · phần 1 Chờ nghiệm thu · phần 2 chưa làm |

## 1. Mục đích quản trị
Mỗi phiếu giữ kèm **chứng từ gốc** (ảnh / PDF uỷ nhiệm chi, sao kê, biên lai, hoá đơn, biên bản ký tay) để kế toán,
kiểm toán, thuế xem lại ngay trên phiếu, không phải tìm giấy. Hôm nay chỉ phần Mua hàng đính được tệp; phiếu tiền và
phiếu kho chưa có, và form phiếu thu / chi chính không còn ô "Kèm theo … chứng từ gốc" (bản in 01-TT / 02-TT luôn ra dấu chấm).
Dùng API đính kèm chung đã có (`/api/v1/document-attachments`, khoá `ledger.event:<docKey>`); không sửa lõi.

## 2. Khai báo trước
- Người dùng có quyền `documents:write` (đính / gỡ), `documents:read` (xem).
- Tệp mẫu: `unc-0001.pdf` (300 KB), `bien-lai.jpg` (1,2 MB), `qua-lon.pdf` (16 MB).

## 3. Các bước thao tác
1. Lập phiếu chi PC0001 ngày 10/11/2026, 5.000.000 đ, ô **Kèm theo** = 2. Ghi.
2. Trong phiếu, khung **Đính kèm**: kéo thả `unc-0001.pdf` và `bien-lai.jpg`.
3. Đóng, mở lại phiếu: thấy 2 tệp; bấm tên tệp xem nhanh, bấm tải về.
4. Gỡ `bien-lai.jpg`.
5. In phiếu chi 02-TT.
6. Lặp bước 2–3 ở: phiếu báo nợ, phiếu chuyển tiền (từ danh sách mở phiếu), phiếu chuyển kho, biên bản kiểm kê.

## 4. Số liệu đầu vào

| Phiếu | Tệp | Kèm theo |
|---|---|---|
| PC0001 (phiếu chi) | unc-0001.pdf, bien-lai.jpg | 2 |
| Phiếu chuyển tiền đã có | unc-0001.pdf | — |
| Phiếu chuyển kho đã ghi | bien-lai.jpg | — |

## 5. Kết quả mong đợi

**Trên chứng từ / màn hình:**

| Mục | Mong đợi |
|---|---|
| Phiếu chưa ghi (mới) | Khung đính kèm hiện "Ghi phiếu trước rồi mới gắn tệp" |
| Sau bước 2 | Danh sách 2 tệp: tên, dung lượng, người gửi, giờ gửi |
| Gửi lại đúng tệp đã có | Không thêm bản trùng |
| `qua-lon.pdf` 16 MB | Từ chối: "Tệp tối đa 15 MB" |
| Sau bước 4 | Còn 1 tệp; tệp gỡ không xoá hẳn (vẫn tra lại được trong nhật ký) |
| Ô Kèm theo | Có trên form phiếu thu / chi / báo có / báo nợ; lưu cùng phiếu |
| In 02-TT | Dòng "Kèm theo: 2 chứng từ gốc" |
| Danh sách phiếu thu chi | Cột / biểu tượng 📎 + số tệp đính kèm |
| Người chỉ có `documents:read` | Xem / tải được; không thấy nút đính / gỡ |
| Sửa phiếu sang phiên bản mới | Tệp đã đính vẫn còn (gắn theo phiếu, không theo phiên bản) |

**Bút toán:** không đổi.

**Báo cáo phải thấy:** —

**Sai số làm tròn chấp nhận:** —

## 6. Trường hợp lệch chuẩn
| # | Làm thế này | Phần mềm phải |
|---|---|---|
| 1 | Huỷ phiếu chi PC0001 | Tệp vẫn giữ, xem được trên phiếu đã huỷ |
| 2 | Kỳ đã khoá | Vẫn đính / xem được tệp (đính tệp không đổi sổ) |
| 3 | Tệp tên có dấu cách, tiếng Việt | Giữ đúng tên khi tải về |
| 4 | Số "Kèm theo" âm / chữ | Chặn ghi, báo lỗi tại ô |

## 7. Kết quả chạy
<!-- [2026-11-12 kiennt] NT-QUY-001 — kết quả chạy phần 1 (phiếu chuyển tiền, phiếu chuyển kho) -->

**Phần 1** (phiếu chuyển tiền, phiếu chuyển kho) — nhánh `feat/dinh-kem-chung-tu`. Biên bản kiểm kê gắn khung khi làm NT-KHO-002.
**Phần 2** (phiếu thu / chi / báo có / báo nợ, ô "Kèm theo", cột 📎 ở danh sách) chưa làm — chờ người giữ `CashVoucherForm.tsx` (dòng PHASE-026) đồng ý.

| | |
|---|---|
| Ngày chạy | 12/11/2026 |
| Bản code (commit) | nhánh `feat/dinh-kem-chung-tu` (commit "feat(NT-QUY-001): đính kèm chứng từ gốc phần 1") |
| Test tự động | `apps/api/test/dinh-kem-chung-tu.test.ts` — 9 / 9 đạt |

| Mục | Mong đợi | Phần mềm | Chênh | Giải thích |
|---|---|---|---|---|
| Đính 2 tệp vào phiếu chuyển tiền | 2 tệp: tên, loại, dung lượng, người gửi, giờ | 2 tệp, đủ trường | 0 | |
| Gửi lại đúng tệp đã có | Không thêm bản trùng | `created = false`, vẫn 2 tệp | 0 | so sha256 trên máy chủ |
| Tệp > 15 MB | Từ chối | 413 (giới hạn thân yêu cầu) — giao diện chặn trước, báo "tệp tối đa 15 MB" | 0 | |
| Tải về | Đúng nội dung, giữ tên tiếng Việt có dấu cách | Đúng byte; `filename*=UTF-8''…` đúng tên | 0 | |
| Sửa phiếu sang phiên bản mới | Tệp vẫn còn | Còn 2 tệp | 0 | khoá theo phiếu, không theo phiên bản |
| Gỡ 1 tệp | Còn 1, không xoá hẳn | Còn 1; dòng có `archived_at`; nhật ký có `core.document-attachment.archive` | 0 | |
| Huỷ phiếu | Tệp vẫn giữ, xem được | Còn 1 tệp sau khi huỷ | 0 | |
| Người chỉ có quyền xem | Xem / tải được, không đính được | Xem 200, đính 403 | 0 | vai `viewer` |
| Phiếu chuyển kho đã ghi | Đính theo chứng từ đầu xuất | Khoá `ledger.event:erp:ck:<id>:out`, đính được | 0 | |

Bốn lệnh kiểm (12/11/2026):
- `npm run typecheck`: 0 lỗi (sau `npm run build -w @ketoan/contracts`).
- `bash scripts/kiem-chuan.sh`: ĐẠT.
- `node tests/conformance/selfcheck.mjs`: KHÔNG ĐẠT nhưng **không thêm mục mới so với `main`** (12 mục có sẵn trên `main`; thêm SC-SEC-1 chỉ do tệp `.env` cục bộ, không nằm trong git).
- `npm test` (CSDL test mới): 1988 đạt, 4 hỏng — `default-data.test.ts` (2) hỏng cả trên `main`; `nt-bh-004-pos-don-ban.test.ts` (2) chạy riêng thì đạt cả trên `main` lẫn nhánh này (phụ thuộc thứ tự chạy trên CSDL mới). Không ca nào do thay đổi này.
