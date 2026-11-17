# Voucher (BH21)
<!-- [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-026: hướng dẫn màn Voucher (đóng góp) -->

Phát và theo dõi voucher của công ty (TGS) và của hãng / nhà cung cấp: voucher **tương đương tiền** (trừ thẳng tổng thanh toán, vd voucher Abbott 20–50K, voucher giấy 20K / 37K) và voucher **lần mua sau sản phẩm / nhãn** (chỉ trừ khi giỏ có sản phẩm / nhãn đó). Voucher **đổi điểm** vẫn ở màn *Điểm thành viên* (BH19).

Mở: **Bán hàng → Voucher**. Xem cần quyền *Xem voucher*; lập đợt, sinh / nạp mã, thu hồi cần quyền *Lập / sửa voucher* (kế toán). Thu ngân dùng voucher ở máy bán cần quyền *Dùng voucher* (`voucher:use`, gắn ở vé đăng nhập máy bán).

## Luật chung

- **Luôn gắn khách:** mỗi mã gắn một SĐT khách; chỉ khách đó dùng được (máy bán / phiếu bán phải chọn khách).
- **Dùng một lần:** dùng là hết; đơn nhỏ hơn mệnh giá thì **phần dư mất**. Mã đã dùng vẫn tra cứu được: đơn / phiếu nào, ngày, cửa hàng, số tiền trừ.
- **Một đơn dùng nhiều voucher**, trừ **sau** khuyến mại; tổng trừ không vượt số phải trả (mã không còn gì để trừ thì máy báo, không để khách mất mã).
- **Ghi sổ:** voucher **TGS phát** là chiết khấu trên hoá đơn — doanh thu và thuế giảm (như voucher đổi điểm). Voucher **hãng phát** là một **hình thức thanh toán** — doanh thu đủ, phải thu hãng; tài khoản do kế toán khai ở *Danh mục hình thức thanh toán* (vd hình thức "Voucher Abbott" — tài khoản phải thu khác, đối tượng Abbott).

## Thẻ Đợt phát

1. **Thêm đợt:** mã đợt, tên (in trên bill), loại, người phát (TGS / hãng — chọn hãng và hình thức thanh toán), mệnh giá, đơn tối thiểu, từ ngày, ngày hết hạn và / hoặc hạn mỗi mã tính từ ngày phát (số ngày). Loại lần mua sau: nhập mã hàng và / hoặc mã nhãn áp dụng.
2. **Kiểu phát:**
   - *Thủ công:* bấm vào đợt → **Sinh mã cho SĐT** (dán cột SĐT từ Excel, mỗi SĐT N mã) hoặc **Nạp mã có sẵn** (dán hai cột mã + SĐT — voucher giấy, mã của hãng). Dòng sai SĐT / mã trùng bị bỏ qua và báo lại theo dòng.
   - *Tự động:* khai điều kiện "mua sản phẩm / nhãn A ≥ N" (số lượng theo đơn vị nhỏ nhất), cửa hàng áp dụng. Đơn máy bán có khách đủ điều kiện → phần mềm tự phát mã gắn SĐT khách, **máy bán in mã trên bill** (vd mua 2 lon Biomil → voucher 30K cho lần mua sau Biomil).
3. Đợt đã phát mã thì không đổi được loại, người phát, mệnh giá, đơn tối thiểu, phạm vi (lập đợt mới); vẫn sửa tên, hạn, ghi chú, điều kiện tự phát, **Ngừng** / mở lại. Đợt ngừng: mã của đợt không dùng được, không tự phát nữa.
4. Danh sách mã của đợt: trạng thái Còn / Đã dùng / Hết hạn / Thu hồi, dùng ở đơn nào; nút xuất Excel.

## Thẻ Tra cứu mã

- Nhập **mã voucher** → đợt, khách, hạn, trạng thái; đã dùng ở đơn / phiếu nào, ngày, cửa hàng, số tiền trừ; nhật ký (phát, dùng, trả lại, thu hồi, dùng trùng). Mã còn → **Thu hồi** (nhập lý do).
- Nhập **SĐT khách** → mọi mã của khách.

## Thẻ Báo cáo

Theo đợt và người phát: phát hành, còn, đã dùng, hết hạn, thu hồi, tiền đã trừ (mã phát trong kỳ). Theo cửa hàng: số mã dùng, tiền đã trừ, nơi dùng (máy bán / phiếu bán BH10) — mã dùng trong kỳ. Lọc người phát, cửa hàng; xuất Excel từng bảng.

## Ở máy bán và phiếu bán

- **Máy bán:** bước thanh toán nhập mã hoặc chọn trong danh sách voucher còn hạn của khách. Voucher TGS hiện là dòng chiết khấu; voucher hãng hiện là dòng thanh toán. Máy chủ kiểm lại: không thuộc khách, đã dùng (nêu đơn), hết hạn, chưa đủ đơn tối thiểu, giỏ không có sản phẩm / nhãn áp dụng → từ chối, nói rõ lý do. Mất mạng không dùng voucher.
- **Hai máy cùng một mã:** chỉ một đơn nhận, đơn kia báo mã đã dùng.
- **Huỷ đơn chờ thanh toán:** mã về "còn". **Trả hàng** đơn đã dùng voucher: mã không trả lại (dùng một lần). **Trả hết đơn đã được phát voucher lần mua sau:** voucher đó (chưa dùng) bị thu hồi.
- **Phiếu bán nhập tay (BH10):** nhập mã voucher của khách trên phiếu; voucher áp lúc **Duyệt** (TGS = chiết khấu trên dòng, hãng = dòng thanh toán). Bỏ duyệt → phiếu về như lúc lập, mã về "còn".
- Hiếm gặp: cùng một mã dùng ở máy bán và BH10 trong vài giây → cả hai qua, nhật ký mã ghi **Dùng trùng** (giữ lần đầu) để kế toán xử lý.
