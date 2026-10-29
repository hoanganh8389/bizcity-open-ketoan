# Bảng tổng hợp thuế GTGT (ACC91)

Mỗi **chi nhánh, mỗi tháng** một dòng, cho biết tháng đó phải nộp hay còn được khấu trừ bao nhiêu thuế GTGT.

| Cột | Lấy từ đâu |
|---|---|
| Doanh thu, Thuế ra | Sổ hoá đơn bán ra trong tháng (hàng trả lại ghi âm) — cùng nguồn với **Báo cáo thuế ra (ACC65)** |
| Thuế vào | Phát sinh tài khoản 133 trong tháng |
| Khấu trừ | Dư Nợ tài khoản 133 tại đầu tháng (tháng đầu tiên: tại "Từ ngày") |
| **Thuế nộp cuối kỳ** | Thuế ra − Thuế vào − Khấu trừ |

Số **âm** ở cột cuối nghĩa là chi nhánh còn được khấu trừ, chuyển sang tháng sau.

## Lưu ý

- Thuế đầu vào chỉ tính các phiếu có hoá đơn (ghi vào sổ hoá đơn).
- Thuế đầu vào hiện chỉ có từ các phiếu chi, báo nợ, phiếu kế toán ghi Nợ tài khoản 133. Chưa có chứng từ mua hàng tự động.
- Tổng thuế ra ở đây phải bằng tổng thuế trên **Báo cáo thuế ra (ACC65)** cùng kỳ.
- Xem nhiều tháng thì dòng tổng cộng cột "Khấu trừ" là tổng khấu trừ đầu mỗi tháng (giống cách bảng này vẫn được dùng); số phải nộp của cả kỳ đọc ở dòng của tháng cuối.
