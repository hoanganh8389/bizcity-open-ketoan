# Công thức đặt hàng (MH18)

Mỗi **chi nhánh cha có một công thức** tính **SL cần nhập** cho màn **Phân tích đặt hàng (MH02)**. Nhân viên mua hàng tự chỉnh công thức. Chi nhánh chưa lưu công thức riêng thì dùng **công thức chuẩn** dưới đây.

```
SL cần nhập = Tồn max kho − Tồn kho − Hàng đi đường về kho − Hàng đi đường xuống shop
            + Tổng tồn max shop − Tổng tồn shop
            + Bán 7 ngày của mọi shop            (dự phòng)
            − SL mua chưa nhập kho              (đơn đã đặt, chưa về — mọi NCC)
```

Số dương nghĩa là cần nhập thêm, số âm nghĩa là đang dư.

## Các khối cấu hình

**① Kho của chi nhánh cha**
- Cột **Tính tồn**: tích những kho cộng vào *Tồn kho* (ví dụ kho hàng + kho khuyến mại, bỏ kho chờ xử lý).
- Cột **Lấy max**: tích những kho lấy *Tồn max kho*.
- Cột **Lấy min**: tích những kho lấy *Tồn min kho* — dùng khi đặt hàng theo **min** (ở phần thành phần: tắt *Tồn max kho*, bật *Tồn min kho*). Không tích thì lấy min ở chính các kho lấy max.
- Không cộng phần dự phòng bán ("bán 0 ngày"): tắt thành phần *Doanh số bán của toàn bộ shop*.
- Không tích ô nào thì phần mềm tính tồn ở mọi kho đang dùng, và lấy max ở kho mặc định.

**② Kho chuẩn của từng shop**
- Shop thường chỉ có một kho, phần mềm lấy luôn kho đó.
- Shop có nhiều kho thì chọn kho dùng làm chuẩn tồn và max.

**③ Thành phần**
- Mỗi dòng là một thành phần. Với mỗi dòng có thể:
  - **bật / tắt**;
  - chọn **dấu + / −**;
  - đặt **hệ số** (ví dụ doanh số × 1,5);
  - đặt **số ngày** bán dự phòng (ví dụ 14 ngày);
  - đổi thứ tự hiển thị bằng nút ↑ ↓.
- Phần shop có 2 cách tính:
  - **Cộng gộp** (cách đang dùng): shop dư bù cho shop thiếu.
  - **Chỉ cộng phần thiếu từng shop**: shop dư không bù. Dùng khi hàng không điều chuyển giữa các shop.

**④ Làm tròn, tốc độ bán, chuyển hàng, duyệt max**

| Mục | Nghĩa |
|---|---|
| Làm tròn SL gợi ý mua | Lên nguyên thùng / thùng gần nhất / không làm tròn |
| Đo tốc độ bán trong N ngày | Bán / ngày = tổng bán N ngày ÷ N. Mặc định 7. Cài riêng từng mã ở MH16 (nút ⚙) |
| Max shop gợi ý đủ bán | Bán / ngày × số ngày này |
| Max kho gợi ý | Tổng max shop + % dự phòng |
| Chuyển xuống shop (tự động) | Thiếu từ % thùng này trở lên thì làm tròn lên nguyên thùng (mặc định 50%) |
| Duyệt tự động phiếu đăng ký max | Lệch không quá % này so với max cũ thì duyệt ngay (0 = luôn duyệt tay) |

## Bên phải

- **Công thức đang dùng** viết bằng chữ, đổi ngay theo cấu hình đang sửa.
- **Ví dụ trên một mã thật**: gõ mã hàng để xem từng thành phần ra số bao nhiêu, cộng lại thành SL cần nhập.
- Chọn lại kho thì số tồn trong ví dụ **sau khi Lưu** mới đúng kho mới.

Sửa xong bấm **Lưu công thức**. **Về công thức chuẩn** đưa các thành phần về mặc định nhưng giữ phần chọn kho.

Chi nhánh cha khác có thể làm công thức kiểu khác, ví dụ không cộng doanh số dự phòng hoặc cộng 14 ngày. Công thức của chi nhánh nào chỉ áp cho chi nhánh đó.

## Họ mã (mã con có đuôi)

Không cần khai "bỏ qua mã có đuôi" nữa. Mã có đuôi (Z, Q, K, M, B…) mà mã gốc 9 số có trong danh mục là **mã con** của mã gốc (tự quét theo mã, 1 cấp). Phân tích đặt hàng **cộng dồn** tồn, max, bán, đi đường, đơn đang đặt của cả họ vào **mã cha** (đuôi T có tem đặt riêng, không gộp) — hàng tặng / kẹp quà còn nhiều thì mã cha không bị đề xuất nhập thêm; dưới tên mã cha ghi chi tiết từng mã con.

## Shop tính vào công thức

Khối **② Shop tính vào công thức & kho chuẩn**: mỗi shop con của chi nhánh cha có một ô tích.
- **Tích** = shop được cộng vào công thức (tồn max shop, tồn shop, bán 7 ngày, bán tháng trước, đi đường xuống shop).
- Shop **đã nghỉ / tạm dừng** (nhãn đỏ *ngừng* theo danh mục chi nhánh) mà vẫn nằm trong cây phân cấp — vd còn max khai từ trước — thì **bỏ tích** để không tính; nút *Bỏ N shop đang ngừng ra khỏi công thức* bỏ tích nhanh. Tích lại là tính lại. Bấm **Lưu**.
- Bỏ tích **không** đổi cây phân cấp; muốn bỏ hẳn shop khỏi chi nhánh cha thì bấm **Cấu hình phân cấp (MH15) →**.
