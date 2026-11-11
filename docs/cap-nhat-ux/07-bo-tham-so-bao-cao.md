# 07. Lưu bộ tham số báo cáo

<!-- [2026-11-11 Nguyễn Văn Thủy] bộ tham số đã lưu ở đầu bảng tham số mọi báo cáo (đóng góp) -->

Kế toán hay xem đi xem lại cùng một bộ điều kiện (vd *Tháng này – các shop Phú Thọ – TK 131*). Đầu bảng **Chọn tham số** của báo cáo có khối **Bộ tham số đã lưu**:

| Nút | Việc |
|---|---|
| Ô chọn | Chọn một bộ đã lưu → áp ngay mọi tham số (kỳ, chi nhánh, kho, tài khoản, đối tượng, tuỳ chọn…) và xem luôn. |
| 💾 Lưu | Đặt tên, lưu các tham số đang chọn (trùng tên thì ghi đè). Tích **Mở báo cáo dùng bộ này** để mỗi lần mở báo cáo tự áp. |
| ★ | Đặt / bỏ bộ đang chọn làm bộ mặc định khi mở báo cáo (mỗi báo cáo một bộ mặc định, hiện ★ trước tên). |
| 🗑 Xoá | Xoá bộ đang chọn. |

- **Kỳ chọn nhanh lưu theo kỳ, không đóng cứng ngày**: lưu lúc đang chọn *Tháng này* thì tháng sau mở vẫn là tháng mới (dòng gợi ý dưới ô tên nói rõ). Chọn ngày tuỳ ý thì lưu đúng ngày.
- Mở báo cáo từ liên kết có sẵn tham số (bấm số tài khoản ở bảng cân đối mở sổ chi tiết…) thì theo liên kết, không áp bộ mặc định.
- Lưu trên trình duyệt theo người dùng và theo màn (như màn hay dùng, bộ chọn nhanh chi nhánh); mỗi thẻ đang mở giữ bộ của màn đó.

## Màn đã có

Sổ nhật ký chung, sổ cái / sổ chi tiết tài khoản, bảng cân đối số phát sinh, báo cáo tình hình tài chính, kết quả kinh doanh, sổ quỹ / nhật ký thu chi tiền, nhật ký bán hàng / mua hàng, bảng kê chứng từ, lưu chuyển tiền tệ, sổ tổng hợp / chi tiết công nợ, công nợ theo hạn, tuổi nợ, công nợ theo nhân viên / mặt hàng, chi phí theo khoản mục / bộ phận, lãi lỗ hợp đồng, kiểm tra chứng từ, thuế, số dư tiền, tổng hợp hạch toán, nhập xuất tồn, sổ chi tiết hàng hoá, lãi gộp, bảng kê chuyển kho, lãi lỗ theo bộ phận, báo cáo bán hàng (chi tiết, tổng hợp, thu tiền, hình thức thanh toán) — 34 màn.

## Kỹ thuật

- `components/BoThamSo.tsx`: nhận `value` (state tham số của màn) và `onApply`; lưu `localStorage['ketoan.bo-tham-so.<user>.<đường dẫn>']` = `[{ name, value, ky?, macDinh? }]`. Áp = tham số đang có + bộ đã lưu (trường thêm sau vẫn giữ); `ky` = khoá kỳ chọn nhanh (`presetOf`), áp lại bằng `PERIOD_PRESETS.range()`.
- `ReportSideLayout` / `FilterLayout` nhận prop `boThamSo`; màn chỉ thêm `boThamSo={{ value: f, onApply: setF }}` (màn có bản nháp riêng thì đặt cả nháp).
- Ô chi nhánh / kho trong bảng tham số tự theo giá trị mới (đã có), nên áp bộ không cần bấm Tìm kiếm.
- Thêm màn mới: truyền `boThamSo` là xong; màn có nhiều thẻ báo cáo cùng đường dẫn thì thêm `id`.
