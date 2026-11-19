# NT-DM-012 · Loại thuế GTGT cố định theo quy định: một danh mục chung cho mua và bán, tài khoản thuế theo quy tắc hạch toán
<!-- [2026-11-19 kiennt] NGHIEM-THU — viết lại phiếu (thay phương án B "chọn theo thuế suất, tự lấy mã đúng chiều"): danh mục cố định theo quy định nhà nước, bỏ Chiều, bỏ Tài khoản; chờ chữ chốt phần lõi (R-FLOW-2) (đóng góp) -->

| | |
|---|---|
| Phân hệ | Danh mục · Thuế · Kế toán (ghi sổ) |
| Màn hình | ACC43 Loại thuế · DM10 Mặt hàng · mọi ô chọn thuế trên phiếu (BH10 / BH11, MH03, phiếu thu / chi, ACC16, CN02 / CN03, ghi sổ tài sản) · ACC41 Quy tắc hạch toán · bảng kê thuế, tờ khai 01/GTGT |
| Bộ phận yêu cầu | Phòng kế toán |
| Ngày tạo | 19/11/2026 |
| Trạng thái | Đã chốt nghiệp vụ (kiennt, 19/11/2026) — **chờ chữ chốt phần lõi** (mục 7) trước khi code |

## 1. Mục đích

Thuế suất và loại chịu thuế GTGT **do nhà nước quy định** (Luật Thuế GTGT 48/2024/QH15, Nghị định 181/2025/NĐ-CP; mức giảm 8% theo Nghị quyết 204/2025/QH15, Nghị định 174/2025/NĐ-CP). Đơn vị không được tự đặt thuế suất, nên danh mục loại thuế **không để người dùng thêm / sửa / xoá**.

Ba quyết định (người dùng chốt 19/11/2026):

| # | Quyết định | Lý do |
|---|---|---|
| Q1 | Phần mềm **cấu hình sẵn** các loại thuế theo quy định; người dùng chỉ xem | Thuế suất là quy định, không phải lựa chọn của đơn vị |
| Q2 | **Bỏ Chiều** (đầu vào / đầu ra): một loại thuế dùng cho cả mua và bán | Thuế suất mua và bán là một; hoá đơn là mua hay bán do **loại chứng từ** quyết định (tờ khai 01/GTGT đã xếp như vậy) |
| Q3 | **Bỏ ô Tài khoản**: tiền thuế ghi vào tài khoản ngầm định của Quy tắc hạch toán (ACC41) | Tài khoản thuế theo chế độ kế toán, không theo từng mã |

Hệ quả có lợi: hết lỗi chọn nhầm chiều (phiếu bán dùng mã đầu vào → thuế đầu ra ghi Có 1331, lỗi đang có trên main); mặt hàng chỉ còn một loại thuế; người lập phiếu chỉ chọn trong 6 loại.

## 2. Danh mục loại thuế cố định

| Mã | Tên | Thuế suất | Nhóm (bảng kê / tờ khai) | Hiệu lực | Căn cứ |
|---|---|---|---|---|---|
| KCT | Không chịu thuế GTGT | 0 | Không chịu thuế | — | Luật Thuế GTGT 48/2024 |
| 0 | Thuế suất 0% | 0 | 0% | — | Luật Thuế GTGT 48/2024 |
| 5 | Thuế suất 5% | 5 | 5% | — | Luật Thuế GTGT 48/2024 |
| 8 | Thuế suất 8% (giảm từ 10%) | 8 | 8% | **đến hết 31/12/2026** | NQ 204/2025/QH15, NĐ 174/2025/NĐ-CP |
| 10 | Thuế suất 10% | 10 | 10% | — | Luật Thuế GTGT 48/2024 |
| KKKN | Không phải kê khai, tính nộp thuế GTGT | 0 | Không kê khai | — | Văn bản hướng dẫn Luật Thuế GTGT |

- Danh mục do **bản cập nhật phần mềm** quản lý (dữ liệu gốc + migration), giống nhau mọi đơn vị. Nhà nước đổi thuế suất → phát hành bản cập nhật, ghi căn cứ.
- **Hiệu lực:** chứng từ có ngày ngoài hiệu lực của loại thuế (vd 8% cho ngày từ 01/01/2027) → không ghi sổ, báo "Thuế suất 8% hết hiệu lực từ 01/01/2027 theo NQ 204/2025/QH15". Màn ACC43 và DM10 nhắc trước 30 ngày: "N mặt hàng đang dùng 8%".
- Màn **ACC43** chỉ xem: Mã · Tên · Thuế suất · Nhóm · Hiệu lực · Căn cứ. Không còn Thêm / Sửa / Xoá / Nhập Excel.

## 3. Tài khoản thuế theo quy tắc hạch toán (bỏ ô Tài khoản)

| Trường hợp | Tài khoản | Khoá ở ACC41 |
|---|---|---|
| Phiếu mua, hàng mua trả lại — hàng hoá, dịch vụ | 1331 | `tax_input` (có sẵn) |
| Phiếu mua **tài sản cố định**: dòng ghi Nợ TK bắt đầu bằng 211, 213, 217 hoặc 241 | **1332** | `tax_input_fixed_asset` (**mới**) |
| Phiếu bán, hàng bán trả lại | 33311 | `tax_output` (có sẵn) |

- Thuế TSCĐ **tự nhận** theo tài khoản Nợ của dòng hàng (Q chốt 19/11): kế toán không phải chọn mã riêng (thay V054, V104, V00C…).
- Tài khoản thuế đã ghi được **lưu vào dòng hoá đơn thuế**; bảng kê đọc tài khoản đã ghi (hết lệch bảng kê ↔ sổ cái khi đổi cấu hình — lỗi đang có trên main).

## 4. Mặt hàng: một loại thuế

- DM10: ô **Thuế suất GTGT** chọn 1 trong 6 loại; dùng cho cả bán và mua. Bỏ cặp *Mã VAT ra / Mã VAT vào* (dữ liệu chuyển: mục 5).
- Nhập Excel mặt hàng: cột **Thuế suất GTGT** (KCT, 0, 5, 8, 10, KKKN; nhận cả "8%", "10%"); tệp cũ có cột *Mã VAT ra* vẫn nhập được (quy đổi theo mục 5).
- Cờ "không chịu thuế" của mặt hàng suy từ loại thuế KCT.

## 5. Dữ liệu cũ

**Chứng từ đã ghi giữ nguyên** (chốt 19/11): sổ cái, bảng kê, tờ khai các kỳ đã qua không đổi. 51 mã cũ (V…, R…) vẫn còn để đọc lịch sử, đánh dấu **mã cũ** — không chọn được trên phiếu mới.

**Quy đổi mã cũ → loại mới** (dùng cho: mặt hàng, chứng từ mới gửi từ máy bán POS / website còn mang mã cũ, tệp Excel cũ):

| Loại mới | Mã cũ |
|---|---|
| KCT | KCT, R00K, V13K |
| 0 | R00, R00C, R00D, R00L, V00, V00C, V00D, V00K, V105, V10B, V11B, V13B |
| 5 | R05, R05A, R05C, V05, V051, V053, V054, V05C, V51A, V53A, V54A |
| 8 | R08, R08A, R08C, V08, V081, V083 |
| 10 | R10, R10A, R10C, V10, V101, V103, V104, V10C, V11A, V13A, V14A |
| KKKN | KKKN |

- Cổng nhận chứng từ (POS, cầu nối website, nhập Excel) **tự đổi** mã cũ sang loại mới trước khi lưu; chứng từ mới chỉ mang 6 loại.
- **Cần kế toán xác nhận trước khi quy đổi** (mục 8): R05B, R08B, R10B, V05B, V05S (tên ghi 5% / 8% / 10% "người dùng tự nhập" nhưng thuế suất khai 0) · V071 (thuế suất 7%) · V20 (TK 13888 — thuế đầu vào kỳ sau) · V13K (dữ liệu gốc nhóm 0, dữ liệu đang chạy nhóm KCT).

## 6. Báo cáo

| Báo cáo | Sau khi sửa |
|---|---|
| Bảng kê bán ra / mua vào | Xếp mục theo **nhóm** của loại thuế (như cũ); cột TK đọc **tài khoản đã ghi** trên dòng hoá đơn |
| Tờ khai 01/GTGT | Như cũ: mua / bán theo loại chứng từ, chỉ tiêu theo nhóm + thuế suất |

## 7. Thứ dùng chung bị đụng — cần chữ chốt (R-FLOW-2)

| Đụng | Việc | Ghi chú |
|---|---|---|
| Lõi ghi sổ `packages/kernel/src/modules/posting/` | TK thuế theo loại chứng từ + quy tắc TSCĐ; bỏ kiểm chiều của mã; kiểm hiệu lực loại thuế | Tệp lõi — người phụ trách lõi duyệt |
| Lõi hoá đơn thuế, loại thuế (`tax-invoices`, `tax-codes`) | Lưu TK thuế đã ghi trên dòng; khoá thêm / sửa / xoá loại thuế qua API; quy đổi mã cũ ở cửa nạp | Tệp lõi |
| Lược đồ (migration mới) | Loại thuế: hiệu lực, căn cứ, cờ mã cũ + mã thay thế; dòng hoá đơn thuế: TK thuế; mặt hàng: một loại thuế | Số migration lấy bằng `scripts/so-tiep-theo.mjs` |
| Quy tắc hạch toán (ACC41) | Khoá mới `tax_input_fixed_asset` (1332) | |
| Dữ liệu gốc `db/seeds/loai-thue.jsonl` | 6 loại + 51 mã cũ đánh dấu | |

Ngoài lõi: màn ACC43, DM10 (tệp trong phạm vi PHASE-026 — phối hợp người giữ), các ô chọn thuế trên phiếu, Mua hàng (bảng thuế suất viết cứng `TAX_RATE` — việc N030-2 của PHASE-030), máy bán POS, cầu nối website.

## 8. Câu hỏi cần trả lời trước khi code

| # | Câu hỏi | Ai trả lời |
|---|---|---|
| 1 | Các mã R05B / R08B / R10B / V05B / V05S ("người dùng tự nhập") nghiệp vụ là gì — hoá đơn ghi tay tiền thuế? Quy đổi về loại nào? | Kế toán trưởng |
| 2 | V071 (7%) dùng cho trường hợp nào? | Kế toán trưởng |
| 3 | V20 (thuế đầu vào kỳ sau, TK 13888) còn dùng không? Nếu còn: cần cách ghi riêng (không phải loại thuế) | Kế toán trưởng |
| 4 | Đơn vị có nhập khẩu trực tiếp (thuế GTGT hàng nhập khẩu 33312) không? | Kế toán trưởng |
| 5 | Chữ chốt phần lõi (mục 7) | Người phụ trách lõi |

## 9. Ngoài phạm vi (phiếu riêng)

- **Khấu trừ thuế đầu vào dùng chung theo tỷ lệ** (hàng mua dùng cho cả hoạt động chịu thuế và không chịu thuế — Điều 14 Luật Thuế GTGT 2024, Điều 23 NĐ 181/2025): làm như thuộc tính của chứng từ mua / khoản chi, không gắn vào loại thuế. Trước đây HTsoft ghi bằng mã V…3 ("dùng chung").
- Thuế GTGT hàng nhập khẩu 33312 (tuỳ câu hỏi 4).
- Nhóm KKKN phía mua vào: bảng kê ghi "không tổng hợp trên tờ khai" nhưng tờ khai vẫn cộng [23] [24] (lỗi đang có trên main).

## 10. Các bước và kết quả mong đợi

| # | Thao tác | Mong đợi |
|---|---|---|
| 1 | Mở ACC43 | 6 loại, mỗi loại có thuế suất, nhóm, hiệu lực, căn cứ; không có nút Thêm / Sửa / Xoá |
| 2 | DM10 mặt hàng chọn thuế | Danh sách 6 loại, dùng chung mua và bán |
| 3 | Phiếu bán 10.000.000đ, loại 10 | Có 33311: 1.000.000 |
| 4 | Phiếu mua hàng hoá 10.000.000đ, loại 10 | Nợ 1331: 1.000.000 |
| 5 | Phiếu mua TSCĐ (Nợ 2112) 100.000.000đ, loại 10 | Nợ **1332**: 10.000.000 |
| 6 | Phiếu ngày 05/01/2027 dùng loại 8 | Không ghi sổ: "Thuế suất 8% hết hiệu lực từ 01/01/2027…" |
| 7 | Máy bán POS gửi đơn mang mã R08 | Chứng từ lưu loại 8, ghi sổ Có 33311 |
| 8 | Xem bảng kê kỳ cũ (đã ghi với V05 / 1331) | Không đổi |
| 9 | Đổi khoá `tax_input` ở ACC41 sang TK khác rồi xem bảng kê kỳ cũ | Cột TK vẫn là TK đã ghi |

**Bút toán:** đổi đúng như bảng mục 3; các phần khác của bút toán không đổi.

## 11. Kế hoạch

1. PR tài liệu: phiếu này + giữ chỗ → trả lời câu hỏi mục 8, chữ chốt lõi.
2. PR 1 (lõi + migration): danh mục cố định, hiệu lực, quy đổi mã cũ ở cửa nạp, TK thuế theo quy tắc + TSCĐ, lưu TK trên dòng hoá đơn.
3. PR 2 (giao diện): ACC43 chỉ xem, ô chọn thuế một danh sách, bảng kê đọc TK đã ghi.
4. PR 3 (phối hợp người giữ): DM10, Mua hàng, POS, cầu nối website.

Phương án B trước đó (chọn theo thuế suất, tự lấy mã đúng chiều — nhánh `feat/nt-dm-011-chon-thue-theo-thue-suat (đã dừng)` ở máy) **dừng, không đẩy**; thư viện ô chọn thuế dùng chung giữ lại làm nền cho PR 2.

## 12. Kết quả chạy
| | |
|---|---|
| Ngày chạy | |
| Bản code (commit) | |
| Test | |

## 13. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 14. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 19/11/2026 | Tạo phiếu theo phương án B (chọn theo thuế suất, tự lấy mã đúng chiều) |
| 19/11/2026 | **Viết lại** theo quyết định người dùng: danh mục cố định theo quy định nhà nước, bỏ Chiều, bỏ Tài khoản (TK thuế theo ACC41 + tự nhận TSCĐ 1332), chứng từ cũ giữ nguyên |
