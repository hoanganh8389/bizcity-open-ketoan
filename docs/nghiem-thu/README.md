# Nghiệm thu tính năng
<!-- [2026-11-02 11:50 AM Nguyễn Văn Thủy] NGHIEM-THU — thư mục phiếu nghiệm thu: một tính năng một phiếu, số liệu thật, kết quả mong đợi, kết quả chạy, biên bản. -->

Mỗi tính năng có **một phiếu nghiệm thu** trong thư mục này. Phiếu là **thước đo duy nhất** để nói một tính năng "xong":
có tình huống bằng số liệu thật, kết quả mong đợi từng con số, kết quả phần mềm chạy ra và xác nhận của bộ phận sử dụng.

Chưa có phiếu ở trạng thái **Đã chốt** thì chưa code. Phiếu chưa **Đạt** thì chưa đưa vào buổi họp tổng hợp.

## Cấu trúc

```
docs/nghiem-thu/
  README.md                      tệp này
  _MAU.md                        mẫu phiếu — chép ra để viết phiếu mới
  <phân hệ>/                     mua-hang, ban-hang, kho, quy, ke-toan, cong-no, tai-san, thue, danh-muc, he-thong
    NT-<MÃ>-<số>-<tên-ngắn>.md   một phiếu = một tính năng / một tình huống lớn
```

- **Mã phân hệ:** `MH` mua hàng · `BH` bán hàng · `KHO` kho · `QUY` quỹ · `KT` kế toán tổng hợp · `CN` công nợ · `TS` tài sản · `THUE` thuế · `DM` danh mục · `HT` hệ thống.
- **Số:** 3 chữ số, tăng dần trong từng phân hệ (`NT-MH-001`, `NT-MH-002`…). Không dùng lại số của phiếu đã bỏ.
- **Tên ngắn:** không dấu, nối bằng gạch ngang, nói đúng việc (`ck-theo-thung-giai-doan`).
- **Không ghi tên người** (người góp ý, kế toán) trong phiếu; ghi **bộ phận** (Phòng kế toán, Kho, Mua hàng…).

## Trạng thái phiếu

| Trạng thái | Nghĩa | Ai chuyển |
|---|---|---|
| Nháp | đang viết tình huống | người nhận yêu cầu |
| Đã chốt | bộ phận sử dụng đồng ý tình huống và kết quả mong đợi — **được phép code** | bộ phận sử dụng |
| Đang làm | đã giao việc (dán §10 sổ tay kèm đường dẫn phiếu) | người làm |
| Chờ nghiệm thu | test tự động khoá đúng số, đã ghi "Kết quả chạy" | người làm |
| Đạt / Chưa đạt | bộ phận sử dụng chạy lại trên phần mềm, ghi biên bản | bộ phận sử dụng |

Phiếu **Chưa đạt** ghi rõ chỗ sai, quay về **Đang làm**. Đổi yêu cầu sau khi đã chốt → sửa phiếu, ghi vào mục "Lịch sử thay đổi", chốt lại.

## Quy trình

1. **Viết phiếu** từ `_MAU.md`: mục đích quản trị, khai báo trước, các bước thao tác, số liệu đầu vào, kết quả mong đợi (từng con số + bút toán Nợ / Có + báo cáo phải thấy), các trường hợp lệch chuẩn.
2. **Chốt** với bộ phận sử dụng → trạng thái *Đã chốt*.
3. **Giao việc:** dán khối §10 của [sổ tay làm việc](../HUONG-DAN-LAM-VIEC.md#10-câu-giao-việc-cho-ai-agent), ô "Tình huống nghiệm thu" = đường dẫn phiếu.
4. **Test tự động** ở `apps/api/test/` khoá đúng từng con số của phiếu; tên `describe` mở đầu bằng mã phiếu (`NT-MH-001 — …`) để tìm ngược được.
5. **Ghi kết quả chạy** vào phiếu: ngày, bản code (commit), tệp test, bảng so mong đợi ↔ phần mềm, chênh lệch và lý do.
6. **Nghiệm thu** với bộ phận sử dụng trên phần mềm thật → ghi biên bản, trạng thái *Đạt*.

## Danh sách phiếu

| Mã | Tính năng | Trạng thái |
|---|---|---|
| [NT-MH-001](mua-hang/NT-MH-001-ck-theo-thung-giai-doan.md) | Nhập mua có CK theo thùng / %, chương trình theo giai đoạn, quà, CKTT, hỗ trợ ngoài | Chờ nghiệm thu |
| [NT-HT-001](he-thong/NT-HT-001-so-do-to-chuc.md) | Sơ đồ tổ chức làm gốc: cây 3 cấp, gắn chi nhánh, mua hàng theo cây, bộ lọc cây chi nhánh / kho | Chờ nghiệm thu |

Bộ 25 tình huống mua hàng cũ: `docs/kiem-thu/ke-hoach-test-mua-hang.xlsx` và test `apps/api/test/mua-hang-25-tinh-huong.test.ts`.
