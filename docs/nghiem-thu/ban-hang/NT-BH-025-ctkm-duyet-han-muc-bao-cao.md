# NT-BH-025 · CTKM: duyệt chương trình, cảnh báo trùng, hạn mức lượt theo cửa hàng, báo cáo khuyến mại đã dùng, chuyển chương trình cũ
<!-- [2026-11-18 Võ Hoàng] NGHIEM-THU — chốt NT-BH-025 (anh Hoàng, 18/11) (đóng góp) -->

| | |
|---|---|
| Phân hệ | Bán hàng (module `pos` — màn Chương trình khuyến mại; module `phieu-ban`; website `tgs_pos` công cụ chuyển) |
| Mục được giao | Chính sách khuyến mại (lịch 16–20/11): duyệt, cảnh báo trùng, hạn mức, báo cáo; chuyển CTKM cũ |
| Ngày tạo | 18/11/2026 |
| Trạng thái | **Đã chốt 18/11/2026** (Võ Hoàng) |
| Căn cứ | Quy trình mua bán §3.1 bước 1.2 (CTKM — ngân sách CTKM), §3.2 bước 6 (báo cáo CTKM đã dùng) |

## 1. Hiện trạng
Màn Chương trình khuyến mại (8 loại) lưu là **phát hành ngay** vào sổ chính sách của lõi (Policy Registry chỉ có "đang áp" / "đã ngừng"). Hạn mức theo cửa hàng chỉ có ở chương trình bán (tặng hàng / giảm giá BH12). Chưa có báo cáo khuyến mại đã dùng cho mọi chương trình; chương trình cũ còn ở plugin website `tgs_selling_policy`.

## 2. Cách làm (không sửa lõi)
1. **Duyệt** (Q1): lưu / sửa chương trình → **bản nháp** trong module `pos` (bảng riêng), chưa áp ở máy bán / BH10. Người có **quyền riêng "Duyệt khuyến mại"** (`pos:promo-approve`, mặc định chủ đơn vị + kế toán trưởng; gán thêm ở phân quyền) bấm **Duyệt** → màn phát hành vào sổ chính sách như hôm nay; **Từ chối** → về nháp kèm lý do. Người lập không tự duyệt. Nhật ký: lập, sửa, duyệt, từ chối, ngừng. *Giới hạn:* người có quyền ghi chính sách của lõi vẫn gọi thẳng API lõi được — màn của module không đi đường đó.
2. **Cảnh báo trùng** (Q2): khi lưu và khi duyệt, liệt kê chương trình đang áp / chờ duyệt **cùng mã hàng, cùng cửa hàng, trùng thời gian**; chỉ cảnh báo, vẫn lưu / duyệt được (luật "áp riêng / ưu tiên" lúc bán quyết định).
3. **Hạn mức lượt theo cửa hàng** (Q5) cho 6 loại khuyến mại mới (bậc, tổng đơn, quà tổng đơn, combo, món rẻ nhất, mã giảm): khai số lượt đơn mỗi cửa hàng; module `pos` (máy bán) và `phieu-ban` (BH10) đếm lượt đã dùng theo chương trình × cửa hàng; hết lượt → không nhận đơn còn áp chương trình đó (`POS_PROMO_QUOTA` / `PHIEU_BAN_PROMO_QUOTA`), máy bán báo trước khi thanh toán; trả hàng cả đơn trả lại lượt.
4. **Không nợ quà** (Q4): hết quà thì không tặng (như hôm nay).
5. **Báo cáo khuyến mại đã dùng** (Q6): theo chương trình × cửa hàng × khoảng ngày — số đơn áp, tiền giảm, số quà, giá trị quà (giá vốn khi đã tính), lượt hạn mức đã dùng / còn; bấm xem đơn; xuất Excel.
6. **Chuyển chương trình cũ** (Q7): lệnh chạy một lần ở website (WP-CLI của `tgs_pos`): đọc chương trình còn hiệu lực của `tgs_selling_policy`, tạo **bản nháp** tương ứng bên kế toán; loại không chuyển được thì liệt kê; người có quyền duyệt rồi mới áp.

## 3. Kết quả mong đợi
| Mục | Mong đợi |
|---|---|
| Kinh doanh lập "Giảm 10 % SUA330" | Nháp, máy bán chưa áp |
| Kế toán trưởng duyệt | Phát hành; máy bán áp từ ngày hiệu lực; nhật ký ghi người duyệt |
| Người lập tự duyệt | Không có nút / bị chặn |
| Lập "Giảm 5 % SUA330" cùng CN01, trùng thời gian | Cảnh báo trùng với "Giảm 10 % SUA330 (CN01, 20–30/11)"; vẫn lưu được |
| Chương trình bậc, hạn mức CN01 = 2 lượt | Đơn 1, 2 áp; đơn 3 không nhận khuyến mại đó (`POS_PROMO_QUOTA`); trả cả đơn 1 → đơn sau áp lại được |
| Báo cáo 20–30/11 CN01 | Dòng "Giảm 10 % SUA330": số đơn, tiền giảm, lượt |
| Chạy chuyển chương trình cũ | Bản nháp tương ứng + danh sách loại không chuyển được |

## 4. Đã chốt (18/11/2026, Võ Hoàng)
| # | Câu hỏi | Chốt |
|---|---|---|
| Q1 | Duyệt chương trình | Cần duyệt, **quyền riêng "Duyệt khuyến mại"** |
| Q2 | Trùng chương trình | **Cảnh báo** khi lưu / duyệt |
| Q3 | "Dùng một lần" | Thuộc voucher (NT-BH-026): mỗi mã voucher dùng một lần, dùng là mất (phần dư mất), vẫn tra cứu lại mã được |
| Q4 | Nợ quà | **Không** — hết quà thì không tặng |
| Q5 | Hạn mức loại mới | **Số lượt áp theo cửa hàng** |
| Q6 | Báo cáo | **Chương trình × cửa hàng × kỳ** |
| Q7 | Chương trình cũ | **Công cụ chuyển một lần** → bản nháp → duyệt |

## 5. Kết quả chạy
<!-- [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-025 kết quả chạy (đóng góp) -->
| | |
|---|---|
| Ngày chạy | 18/11/2026 |
| Bản code (commit) | `38dd857f` (nhánh `feat/nt-bh-025-ctkm`) |
| Test tự động | `apps/api/test/nt-bh-025-ctkm-duyet-han-muc.test.ts` — 6/6 ĐẠT; `modules/pos/test/promo.test.ts` — 8/8 ĐẠT; máy bán `tgs_pos_react/src/features/checkout/promoQuota.test.ts` — 3/3 ĐẠT; `tgs_pos/tests/test-promo-migrate.php` ĐẠT |
| Bộ kiểm | `npx bizcity module check pos` / `phieu-ban` ĐẠT; `npm test -w @ketoan/api -- nt-bh-0` ĐẠT trừ lỗi đã biết `nt-bh-005` "app tgs-wp" |

| Mục §3 | Kết quả | Test |
|---|---|---|
| Lập "Giảm 10 % SUA330" | Nháp (chờ duyệt), `GET /api/v1/policies` chưa có — máy bán chưa áp | §3 dòng 1–3 |
| Kế toán trưởng duyệt | Phát hành bản 1, có ở sổ chính sách; nhật ký `create, submit, approve, publish`, người duyệt = KTT | §3 dòng 1–3 |
| Người lập tự duyệt | 403 (màn: nút Duyệt chỉ hiện với quyền `pos:promo-approve`, máy chủ chặn người lập) | §3 dòng 1–3 |
| "Giảm 5 % SUA330" cùng CN01, trùng thời gian | Lưu được; cảnh báo trùng "Giảm 10 % SUA330 (KM10-SUA330; CN01; …)"; khác cửa hàng → không cảnh báo; từ chối → sửa gửi lại | §3 dòng 4 |
| Bậc, hạn mức CN01 = 2 | Đơn 1, 2 nhận; đơn 3 `POS_PROMO_QUOTA`; phiếu bán BH10 `PHIEU_BAN_PROMO_QUOTA`; trả cả đơn 1 → còn 1 lượt; phiếu bán duyệt được và tính chung; bỏ duyệt trả lượt; hai máy cùng lượt cuối → một nhận; đơn mất mạng gửi bù nhận + `promoQuotaOffline` | §3 dòng 5, lệch chuẩn |
| Báo cáo CN01 trong kỳ | Dòng KM-BAC: 3 đơn, tiền giảm 270.000, 2 đơn đã trả lượt, lượt 3 / hạn mức 2, 1 vượt khi mất mạng; xem đơn 5 dòng | §3 dòng 6 |
| Chuyển chương trình cũ | `POST …/promo/drafts/import` tạo nháp; chạy lại bỏ qua "đã chuyển lần trước"; lệnh website `wp tgs-pos promo-migrate [--dry-run]` in loại không chuyển được | §3 dòng 7 |

Giới hạn còn lại: phiếu trả BH11 chưa trả lượt; báo cáo chưa có giá trị quà theo giá vốn; lượt tính từ ngày cài bản (đơn cũ không đếm); lượt của phiếu bán ghi qua sự kiện (sau commit) — cửa sổ rất nhỏ giữa duyệt phiếu và lúc giao sự kiện.

## 6. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 18/11/2026 | Tạo phiếu, chốt Q1–Q7 |
| 18/11/2026 | Code xong, điền §5 |
