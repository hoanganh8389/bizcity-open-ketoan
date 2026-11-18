# NT-BH-021 · Chặn bán quá tồn — máy bán POS và phiếu bán nhập tay
<!-- [2026-11-16 11:30 AM Võ Hoàng] NGHIEM-THU — tạo phiếu (nháp, chờ chốt Q1–Q4) (đóng góp) -->
<!-- [2026-11-16 05:30 PM Võ Hoàng] NGHIEM-THU — chốt thêm Q5–Q8 (anh Hoàng, 16/11): mỗi shop một kho; công tắc riêng của phiếu bán ở BH17; BH10 tạm theo tồn hiện tại; chặn mọi mã (đóng góp) -->
<!-- [2026-11-16 04:00 PM Võ Hoàng] NGHIEM-THU — chốt Q1–Q4 (anh Hoàng, 16/11): máy bán chặn cứng; BH10 dùng công tắc kho NT-KHO-003; kiểm theo kho của máy bán / kho trên phiếu; chuyển kho tách sang Đơn đặt hàng (đóng góp) -->

| | |
|---|---|
| Phân hệ | Bán hàng (module `pos`, module `phieu-ban`) |
| Màn hình | Máy bán POS React (`/pos/`); BH10 Phiếu bán hàng (nhập tay) |
| Bộ phận yêu cầu | Phòng kế toán (bảng phân việc: "Bán hàng — chặn tồn âm khi bán") |
| Ngày tạo | 16/11/2026 |
| Trạng thái | **Đã chốt 16/11/2026** (Võ Hoàng) — sẵn sàng code |
| Căn cứ | `docs123/tong-quan-he-thong/Mô tả chi tiết nghiệp vụ mua bán hàng hoá thương mại.docx`: §3.1 bước 2.3, §3.2 bước 1.1 và 4.1 |

## 1. Mục đích quản trị
Không để cửa hàng bán số hàng lớn hơn số đang có trong sổ kho. Tồn âm làm sai giá vốn bình quân, và che giấu việc thiếu phiếu nhập hoặc nhập sai kho.

Đối chiếu quy trình mua bán của phòng kế toán:
- **Bán lẻ (§3.2)**:
  - Bước 1.1: mỗi máy bán gắn với **một kho shop**. Phiếu này kiểm tồn theo đúng kho đó.
  - Bước 4.1: chỉ ghi "cảnh báo tồn âm". **Phiếu này chốt chặt hơn: máy bán chặn cứng** (quyết định của anh Hoàng ngày 16/11).
- **Bán buôn (§3.1)**, bước 2.3: kiểm tồn khả dụng, "chặn hoặc chuyển duyệt". Với BH10, chặn hay không do công tắc của phiếu bán quyết định.

Hiện trạng (16/11/2026):
- **Máy bán**: hiện tồn cả chi nhánh khi tìm hàng, nhưng **không kiểm** khi lập đơn. Đơn bán quá tồn vẫn vào sổ, chỉ bộ kiểm cuối kỳ báo `INVENTORY_NEGATIVE`.
- **BH10 phiếu bán nhập tay**: có **cảnh báo** khi bán quá tồn (từ 14/11) nhưng không chặn.
- **Kho**: phiếu NT-KHO-003 (kiennt, chốt 12/11, chưa code) đặt công tắc chung `bizcity.kho.negative_stock` cho các màn lập tay trong kế toán. Hai giá trị: `allow_warn` (mặc định) và `block`.

## 2. Khai báo trước
- Cửa hàng `CN01`, kho shop `CN01-K1` (kho của máy bán CN01). Mặt hàng `11005100103`, ĐVT nhỏ nhất là hộp.
- Chỗ đặt công tắc và người dùng:

| Phần | Ở màn | Ai được đổi | Ai gặp hằng ngày |
|---|---|---|---|
| Máy bán: **luôn chặn**, không có công tắc | — | Không ai đổi được tại quầy hay ở cài đặt | Thu ngân: dòng hàng báo đỏ, không thanh toán được tới khi giảm số lượng hoặc bỏ dòng |
| BH10: công tắc **Chặn bán quá tồn ở phiếu bán nhập tay**: Không (mặc định, chỉ cảnh báo như hôm nay) / Có | **BH17 Cài đặt bán hàng**. Khoá riêng của module phiếu bán `bizcity.phieu_ban.block_negative_stock` (Q6) | Người có quyền ghi cài đặt (`settings:write`): kế toán trưởng / chủ đơn vị. Đổi có lưu lịch sử | Kế toán bán hàng lập BH10. Công tắc = Có thì bấm Duyệt sẽ báo lỗi, không ghi được |

- Mỗi shop chỉ có **một kho** chứa toàn bộ hàng của shop (Q5), nên "tồn kho của máy bán" = tồn cả chi nhánh như máy bán đang hiện. Máy bán hiện tồn 0 thì không bán được.
- Luật của phần mềm kế toán chỉ cho mỗi module đọc cài đặt của chính nó, nên BH10 dùng công tắc riêng của phiếu bán (Q6). Các màn kho (KHO01 chuyển kho, MH11 trả hàng mua) dùng công tắc riêng của kho ở NT-KHO-003, không thuộc phiếu này. kiennt đồng ý cho sửa.

## 3. Các bước thao tác
1. Máy bán CN01 bán `11005100103` số lượng 7.
2. Máy bán CN01 bán `11005100103` số lượng 5.
3. BH10 lập phiếu bán CN01 / `CN01-K1`, ngày 16/11/2026, `11005100103` số lượng 7, bấm Duyệt (lần lượt với công tắc kho = Có rồi = Không).
4. Công tắc = Không: sửa phiếu bước 3 thành 5, bấm Duyệt.

## 4. Số liệu đầu vào

| Ngày | Chứng từ | Kho | `11005100103` |
|---|---|---|---|
| 10/11/2026 | Nhập mua | CN01-K1 | +10 |
| 14/11/2026 | Bán (máy bán) | CN01-K1 | −5 |
| **Tồn 16/11/2026** | | | **5** |

Mỗi bước tính từ tồn 5 ở trên (bước 2 và bước 3 chạy riêng, không cộng dồn).

## 5. Kết quả mong đợi

| Mục | Mong đợi |
|---|---|
| Máy bán, giỏ có 7 (tồn 5) | Dòng hàng báo đỏ "Tồn 5, đang bán 7". Nút Thanh toán bị khoá, kèm câu "Giảm số lượng hoặc bỏ dòng hàng thiếu tồn". Không bán được |
| Máy chủ nhận đơn 7 (gọi thẳng API, bỏ qua màn hình) | Từ chối với mã `POS_STOCK_SHORT`: `11005100103 cần 7, tồn 5 ở CN01`. Không ghi đơn, không ghi sổ |
| Máy bán, giỏ có 5 (tồn 5) | Bán bình thường; tồn còn 0 |
| BH10, công tắc = Không (mặc định), bán 7 | Như hôm nay: cảnh báo, vẫn duyệt được |
| BH10, công tắc = Có, bán 7 | **Không duyệt được**: `11005100103 cần 7, tồn 5 ở CN01-K1` (mã `PHIEU_BAN_STOCK_SHORT`) |
| BH10, công tắc = Có, sửa thành 5 | Duyệt được (phiếu đang sửa đã bỏ duyệt nên không còn trừ tồn) |

**Bút toán:** không đổi. Phiếu này chỉ quyết định có cho ghi hay không.

## 6. Trường hợp lệch chuẩn
| # | Làm thế này | Phần mềm phải |
|---|---|---|
| 1 | Hai dòng cùng mã (4 + 3) | Cộng theo mã: 7 > 5 → chặn |
| 2 | Bán theo ĐVT thùng (1 thùng = 6 hộp), 1 thùng | Quy về hộp: 6 > 5 → chặn |
| 3 | Quà 0đ / dòng bill Z cùng mã | Tính vào số xuất (hàng vẫn ra khỏi kho) |
| 4 | Phiếu BH10 ngày lùi 12/11 (tồn ngày đó 10, tồn hiện tại 5), bán 7 | **Tạm thời** kiểm theo tồn hiện tại (5) → chặn (Q7). Kiểm theo ngày phiếu cần phần lõi có bảng tồn theo ngày, làm sau |
| 5 | Hai máy cùng lúc bán 3 + 3 (tồn 5) | Đơn đến trước được bán. Đơn đến sau bị kiểm với tồn đã trừ đơn trước (còn 2) → `POS_STOCK_SHORT` |
| 6 | Mạng mất, máy bán dùng bản bán dự phòng | Lúc bán: chặn theo tồn tải về lần cuối khi còn mạng. Khi gửi lại: nếu tồn đã bị máy khác bán hết, máy chủ **không từ chối** (hàng đã giao, tiền đã thu, từ chối sẽ làm mất một giao dịch thật) mà nhận đơn và đánh dấu "bán quá tồn khi mất mạng" để kế toán xem ở màn Đơn bán máy POS |
| 7 | Mã phí / dịch vụ không có tồn (tồn 0) | Vẫn chặn như mọi mã (Q8): phần mềm kế toán ghi xuất kho cho mọi dòng bán. Sau này có mã dịch vụ thì khai danh sách bỏ qua |
| 8 | Đổi hàng tại quầy (trả A, lấy B) | Dòng B kiểm tồn như bán mới |

## 7. Đã chốt (16/11/2026, Võ Hoàng)

| # | Câu hỏi | Chốt |
|---|---|---|
| Q1 | Máy bán: chặn cứng, hay cho bán khi có người duyệt? | **Chặn cứng**, không có duyệt ngoại lệ tại quầy và không có công tắc. Ngoại lệ duy nhất là đơn bán dự phòng khi mất mạng (lệch chuẩn 6) |
| Q2 | BH10 dùng công tắc nào? | ~~Dùng chung công tắc kho của NT-KHO-003~~ → đổi theo Q6: công tắc riêng của phiếu bán |
| Q3 | Tồn kiểm ở đâu? | Máy bán: **kho shop của máy bán** (= cả chi nhánh, Q5). BH10: **kho ghi trên phiếu** (tồn hiện tại, Q7) |
| Q5 | "Kho của máy bán" là kho nào? | Mỗi shop chỉ có **một kho** chứa toàn bộ hàng → tồn cả chi nhánh; máy bán hiện tồn 0 thì không bán được |
| Q6 | Công tắc BH10 đặt ở đâu (module không đọc được cài đặt chung của kho)? | **Công tắc riêng của phiếu bán**, hiện ở BH17 Cài đặt bán hàng; không sửa phần lõi |
| Q7 | BH10 kiểm tồn tại ngày phiếu (phần lõi chưa có bảng tồn theo ngày)? | **Tạm dùng tồn hiện tại**; tồn theo ngày phiếu làm sau |
| Q8 | Mã không có tồn thật (phí, dịch vụ)? | **Chặn tất cả** |
| Q4 | "Chuyển kho" trong mục Bán hàng nghĩa là gì? | Từ **đơn đặt hàng (SO)**, nếu shop bán thiếu hàng thì lập chuyển kho nội bộ shop ↔ shop hoặc shop ↔ kho tổng. **Không làm trong phiếu này**; đưa vào phiếu Đơn đặt hàng (18–20/11), dùng lại KHO01 Phiếu chuyển kho, báo kiennt |

## 8. Kết quả chạy
| | |
|---|---|
| Ngày chạy | 16–17/11/2026 (CSDL test `ketoan_test`; chạy thật LocalWP shop2 + kế toán Docker) <!-- [2026-11-17 Võ Hoàng] NGHIEM-THU — kết quả chạy NT-BH-021 (đóng góp) --> |
| Bản code (commit) | nhánh `feat/nt-bh-021-chan-ban-qua-ton` (PR code) |
| Test tự động | `apps/api/test/nt-bh-021-chan-ban-qua-ton.test.ts` **6/6**: §5 dòng 2–3, lệch chuẩn 1–3, 5 (hai máy 3 + 3 trên tồn 5 → một đơn, đơn kia `POS_STOCK_SHORT` tồn 2), 6 (đơn mất mạng nhận + lọc BH13), BH10 công tắc tắt / bật / sửa còn đủ. Module: `modules/pos/test/stock.test.ts`, `modules/phieu-ban/test/doc.test.ts`. Test bán hàng cũ NT-BH-003…020 nhập tồn trước khi bán (`apps/api/test/pos-nhap-ton.ts`) |
| Chạy thật | máy bán React (shop2) bán / hoàn / chốt ca qua kế toán thật: 3/3 đạt (máy bán đã có hàng nhập tồn đầu) |
| Bộ kiểm | `module check pos`, `module check phieu-ban` ĐẠT; typecheck ĐẠT; selfcheck không thêm phát hiện so với main |
| Còn lại | Lệch chuẩn 4 (BH10 theo ngày phiếu) tạm theo tồn hiện tại (Q7). Bán lẻ để chế độ "chờ duyệt" thì đơn chưa duyệt chưa trừ sổ kho → kiểm tồn không thấy (mặc định bán lẻ ghi ngay) |

## 9. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 10. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 16/11/2026 | Tạo phiếu (nháp) |
| 16/11/2026 | **Chốt Q1–Q4**: máy bán chặn cứng; BH10 dùng công tắc kho; kiểm theo kho của máy bán / kho trên phiếu; chuyển kho tách sang Đơn đặt hàng. Thêm căn cứ quy trình kế toán và lệch chuẩn 7, 8 |
| 16/11/2026 | **Chốt thêm Q5–Q8**: mỗi shop một kho; BH10 công tắc riêng của phiếu bán ở BH17 (thay công tắc chung của kho); BH10 tạm theo tồn hiện tại; chặn mọi mã |
| 17/11/2026 | Code + test xong, ghi kết quả chạy |
| 17/11/2026 | Sửa Q5 theo NT-BH-023 Q11 (anh Hoàng): cửa hàng có thêm kho KCB (giữ hàng cho đơn đặt hàng) nên máy bán chỉ kiểm tồn **kho mặc định** của cửa hàng, không cộng cả chi nhánh. Code làm cùng NT-BH-023 <!-- [2026-11-17 Võ Hoàng] NGHIEM-THU — sửa Q5 (đóng góp) --> |
