# Kế hoạch thu chi (KH01), định mức chi phí (KH02), cảnh báo

## Kế hoạch thu chi (KH01)

Dự kiến tiền thu vào, chi ra theo tháng, chi nhánh.

**Tab Kế hoạch**: chọn từ tháng, đến tháng.

- **Điền từ công nợ, hợp đồng**: với từng tháng trong khoảng, phần mềm điền
  - các khoản **phải thu** (TK 13x) còn nợ có hạn thanh toán trong tháng → dòng **Thu** (số còn nợ, chi nhánh của chứng từ);
  - các khoản **phải trả** (TK 33x) còn nợ có hạn trong tháng → dòng **Chi**;
  - các kỳ **thanh toán hợp đồng** chưa trả đến hạn trong tháng (số tiền + thuế nộp thay) → dòng **Chi** (cả công ty).

  Bấm lại lúc nào cũng được: dòng đã điền được cập nhật số còn nợ, khoản đã trả hết thì bỏ, không sinh trùng.
- **Thêm dòng**: nhập tay các khoản dự kiến khác (lương, điện nước, thu tiền khách buôn, vay…): tháng, thu hay chi, chi nhánh (trống = cả công ty), ngày dự kiến, khoản mục, đối tượng, nội dung, số tiền. Bấm một dòng để sửa, nút thùng rác để xoá.

**Tab So với thực hiện**: mỗi tháng × chi nhánh: thu, chi theo kế hoạch và thực hiện, chênh lệch. Thực hiện = tiền vào (phát sinh Nợ) và ra (phát sinh Có) các tài khoản 111, 112, 113 trên sổ kế toán, không tính phiếu chuyển tiền nội bộ.

## Định mức chi phí (KH02)

**Tab Khai định mức**: chọn tháng; mỗi dòng một chi nhánh (hoặc *cả công ty*) × bộ phận (hoặc *mọi bộ phận*) × khoản mục × số tiền định mức của tháng. **Ghi định mức tháng …** để lưu; dòng bỏ khỏi bảng thì bỏ định mức. **Chép sang các tháng sau** chép toàn bộ định mức của tháng đang xem sang N tháng tiếp theo (ghi đè định mức đã có của các tháng đó).

**Tab Thực tế so định mức**: chọn khoảng tháng và tài khoản chi phí (mặc định 641, 642). Mỗi dòng chi nhánh × bộ phận × khoản mục: định mức (cộng các tháng), chi phí thực tế (phát sinh Nợ − Có của tài khoản chi phí, theo khoản mục gắn trên dòng phiếu, không tính kết chuyển), vượt (+) / tiết kiệm (−), % định mức. Vượt định mức tô đỏ; tick **Chỉ khoản vượt định mức** để lọc. Định mức *cả công ty* so với tổng chi phí khoản mục đó ở mọi chi nhánh; định mức một bộ phận so với chi phí gắn bộ phận đó trên dòng phiếu, *mọi bộ phận* so với tổng. Một khoản chi phí khớp nhiều dòng định mức (ví dụ vừa có định mức bộ phận, vừa có định mức cả công ty) thì được tính vào từng dòng; chi phí không khớp dòng định mức nào hiện riêng, "chưa có định mức". Chi phí không gắn khoản mục hiện ở dòng "(chưa gắn khoản mục)".

## Cảnh báo ở Tổng quan

Màn Tổng quan hiện khung **Cần chú ý** (chỉ khi có việc):

- khoản phải thu, phải trả **quá hạn**; khoản **đến hạn trong 7 ngày** (bấm để mở Khoản công nợ CN01);
- kỳ thanh toán hợp đồng chưa trả **đến hạn trong 15 ngày** hoặc đã quá hạn (mở Lịch thanh toán hợp đồng HD01);
- hợp đồng **hết hạn trong 30 ngày** (theo ngày kết thúc khai ở danh mục hợp đồng).
