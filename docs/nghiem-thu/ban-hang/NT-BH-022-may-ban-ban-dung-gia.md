# NT-BH-022 · Máy bán bán đúng bảng giá — không giảm tay, chưa có giá thì không bán
<!-- [2026-11-17 Võ Hoàng] NGHIEM-THU — chốt NT-BH-022 đợt 1 (anh Hoàng, 17/11) (đóng góp) -->

| | |
|---|---|
| Phân hệ | Bán hàng (module `pos`; máy bán React `tgs_pos_react`) |
| Màn hình | Máy bán POS React (`/pos/`) |
| Mục được giao | Bảng giá (lịch 11–13/11) — đợt 1: phần máy bán |
| Ngày tạo | 17/11/2026 |
| Trạng thái | **Đã chốt 17/11/2026** (Võ Hoàng) — sẵn sàng code |
| Căn cứ | Quy trình mua bán của phòng kế toán §3.2 bước 1.2 ("POS chỉ bán giá và CTKM từ ERP; không sửa giá tại quầy nếu không có quyền") |

## 1. Mục đích quản trị
Thu ngân chỉ bán theo giá của bảng giá cửa hàng và theo chương trình khuyến mại kế toán khai; không tự giảm giá. Hôm nay máy chủ **tin giá máy bán gửi lên** (không đối chiếu bảng giá) và nhận giảm tay — máy bán sửa giá hay giảm tay đều vào sổ.

## 2. Khai báo trước
- Cửa hàng `CN01` dùng bảng giá có `SUA330` Hộp 330.000, Thùng (×24) 7.900.000; mã `MOI01` chưa có giá ở CN01.
- Chương trình khuyến mại giảm 10 % `SUA330` (BH18).

## 3. Kết quả mong đợi
| Mục | Mong đợi |
|---|---|
| Bán `SUA330` 1 Hộp giá 330.000 | Bán được |
| Máy gửi giá 300.000 (khác bảng giá) | Từ chối `POS_PRICE_CHANGED`: `SUA330 (Hộp) giá bảng giá 330.000, máy gửi 300.000 — tải lại giá`; không ghi đơn |
| Máy gửi ĐVT Thùng hệ số sai | Từ chối `POS_PRICE_CHANGED` (hệ số theo danh mục) |
| Dòng có giảm tay (`manualDiscount`) | Từ chối `POS_MANUAL_DISCOUNT`: thu ngân không giảm tay, chỉ giảm theo chương trình khuyến mại |
| Bán `MOI01` (chưa có giá ở CN01) | Từ chối `POS_NO_PRICE`: `MOI01 (Cái) chưa có giá ở CN01 — báo kế toán khai giá` |
| Khuyến mại giảm 10 % | Vẫn bán được: giá dòng = giá bảng giá, tiền giảm theo chương trình |
| Hàng Nội bộ / quà 0 đ / dòng bill Z 0 đ | Như hôm nay (không cần giá) |
| Máy bán React | Không còn ô giảm tay (CK %, CK tiền) trên dòng; mã chưa có giá không cho vào giỏ, báo rõ |

**Bút toán:** không đổi.

## 4. Trường hợp lệch chuẩn
| # | Làm thế này | Phần mềm phải |
|---|---|---|
| 1 | Kế toán đổi giá lúc giỏ đang mở | Giá lúc **lưu đơn** (Q7): máy chủ từ chối giá cũ, máy bán tải giá mới rồi gửi lại |
| 2 | Đơn bán lúc mất mạng gửi bù, giá đã đổi trong lúc mất mạng | **Vẫn nhận** (hàng đã giao, tiền đã thu), đơn mang `priceChangedOffline` để kế toán xem — như đơn thiếu tồn khi mất mạng (NT-BH-021) |
| 3 | Đơn đổi hàng (dòng mới) | Kiểm giá như bán mới |
| 4 | BH10 phiếu bán nhập tay | **Không đổi**: kế toán sửa đơn giá / chiết khấu tự do |

## 5. Đã chốt (17/11/2026, Võ Hoàng)
| # | Câu hỏi | Chốt |
|---|---|---|
| Q1 | Bảng giá có ngày hiệu lực? | Có — **để đợt sau** (cần sửa phần lõi danh mục; anh chưa muốn đụng lõi) |
| Q2 | Duyệt bảng giá? | Cần duyệt, quyền riêng "Duyệt bảng giá" — **để đợt sau** |
| Q3 | Thêm cấp vùng? | Không, giữ cửa hàng → chi nhánh → công ty |
| Q4 | Giá ĐVT lớn | Tự tính, sửa tay được — **để đợt sau** (màn Bảng giá của lõi) |
| Q5 | Làm tròn 500 đ | Gần nhất, lúc khai giá — **để đợt sau** |
| Q6 / H3 | Giảm tay ở máy bán | **Không có**: thu ngân chỉ bán theo giá và chương trình khuyến mại |
| Q7 | Đổi giá giữa ngày | Giá lúc lưu đơn |
| Q8 | BH10 sửa giá / giảm tay | Được sửa tự do (không đổi) |
| Q9 | Mã chưa có giá | Chặn bán (trừ hàng Nội bộ / quà 0 đ) |

## 6. Kết quả chạy
| | |
|---|---|
| Ngày chạy | |
| Bản code (commit) | |
| Test tự động | `apps/api/test/nt-bh-022-may-ban-ban-dung-gia.test.ts` (tạo khi code) |

## 7. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 8. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 17/11/2026 | Tạo phiếu, chốt (đợt 1: phần máy bán) |
