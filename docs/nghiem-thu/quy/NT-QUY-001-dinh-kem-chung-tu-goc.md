# NT-QUY-001 · Đính kèm chứng từ gốc trên phiếu tiền, phiếu chuyển tiền, phiếu kho
<!-- [2026-11-12 kiennt] NGHIEM-THU — tạo phiếu. -->

| | |
|---|---|
| Phân hệ | quỹ (kèm kho) |
| Màn hình | ACC51 Phiếu thu · ACC52 Phiếu chi · ACC54 Phiếu báo có · ACC53 Phiếu báo nợ · Q2 Phiếu chuyển tiền · KHO01 Phiếu chuyển kho · KHO02 Kiểm kê kho (NT-KHO-002) |
| Bộ phận yêu cầu | Phòng kế toán |
| Ngày tạo | 12/11/2026 |
| Trạng thái | Đã chốt (12/11/2026, kiennt) |

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
| | |
|---|---|
| Ngày chạy | |
| Bản code (commit) | |
| Test tự động | `apps/api/test/dinh-kem-chung-tu.test.ts` |

| Mục | Mong đợi | Phần mềm | Chênh | Giải thích |
|---|---|---|---|---|
