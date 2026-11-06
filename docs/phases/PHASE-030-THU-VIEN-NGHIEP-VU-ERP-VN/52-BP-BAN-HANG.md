# PHASE-030 · 52 — Blueprint Bán hàng, CRM, TMĐT (BH01–BH14)
<!-- [2026-11-06 12:45 AM Johnny Chu - Chu Hoàng Anh] PHASE-030 — blueprint bán hàng: báo giá, đơn bán, bảng giá theo kênh, khuyến mãi NĐ81 trần 50 %, hạn mức công nợ, hoá đơn điện tử điều chỉnh / thay thế, NPP, sàn -->

Khuôn: [30](30-KHUON-BLUEPRINT.md). Nguồn: `erp/addons/lfood_salesorder/models/{sale_order,lead,margin,allocation}.py`, `lfood_promotion/models/promotion.py`, `lfood_sale/models/{sale_invoice,payment_term,aging}.py`, `lfood_contract/models/distributor.py`, `lfood_ecommerce/models/ecommerce.py`. Module đích: **`modules/ban-hang/`** (mới, **P0**: màn BH10 / BH11 đang chạy JSON mẫu; POS / Woo đã đổ `sale` vào Kernel nhưng không có đơn bán nội bộ).

**Đã có ở open-ketoan:** `sale` / `sale_return` là `docType` Kernel (XBA, NTH1, XTA1.4, TTBHK, XCN), `sales_lines`, `price_lists` + `price_list_branches`, `partners.credit_limit` (chỉ kiểm phía mua), báo cáo lãi gộp BH01–05, Woo → `sale`, `tax_invoices` nhận hoá đơn CQT.

**Điểm mở:** `sale.priceLine` (bảng giá, khuyến mãi, NPP cắm vào theo thứ tự), `sale.beforeConfirm` (hạn mức, tồn khả dụng), `sale.invoiceIssue` (kết nối HĐĐT).
**Năng lực Kernel cần:** K-030-1 (lô khi xuất bán), K-030-2 (xuất khẩu), K-030-6 (tham số trần KM 50 %, hạn mức).

**Trả lời Q030-4 (đề nghị):** có chứng từ **giao hàng** `ban-hang.delivery` riêng khi đơn vị bật `ban_hang.giao_hang.tach = true`; mặc định false → xác nhận đơn = xuất kho + hoá đơn như POS hiện nay.

---

## BH01 Cơ hội bán hàng (tuỳ chọn)

`ban-hang.lead`: new → qualified → quoted → won | lost. Trường: khách (hoặc tên tự do trước khi có `partner_id`), nguồn, giá trị ước, người phụ trách, lý do mất. Không hạch toán. Golden `T030-BH-1` `won` phải có ≥ 1 báo giá liên kết.

## BH02 Báo giá · BH03 Đơn bán hàng

1. **Mục đích.** Nhân viên bán lập báo giá → khách đồng ý → đơn bán; đơn xác nhận giữ tồn, kiểm hạn mức; từ đơn lập hoá đơn / xuất kho (một hoặc nhiều lần).
2. **Chứng từ `ban-hang.order`** (báo giá = đơn ở `draft`):

   | Trạng thái | Nhãn | Nhóm |
   |---|---|---|
   | draft | Báo giá | draft |
   | pending_credit | Chờ duyệt hạn mức | submitted |
   | confirmed | Đã xác nhận | approved |
   | partially_invoiced | Đã lập HĐ một phần | approved |
   | done | Hoàn tất | done |
   | cancelled | Huỷ | cancelled |

   | Từ | Đến | Ai | Điều kiện | Lý do |
   |---|---|---|---|---|
   | draft | confirmed | `ban-hang:confirm` | ≥ 1 dòng; `sale.beforeConfirm` không chặn; **hạn mức đạt** (BH06) | — |
   | draft | pending_credit | hệ thống | vượt hạn mức | — |
   | pending_credit | confirmed | `ban-hang:approve-credit` (kế toán trưởng / giám đốc) | — | bắt buộc |
   | pending_credit | draft | `ban-hang:approve-credit` | — | bắt buộc |
   | confirmed | partially_invoiced / done | hệ thống | theo Σ lượng đã lập HĐ (nghe `bizcity.ledger.entry.posted` của `sale` tham chiếu đơn) | — |
   | draft, pending_credit, confirmed | cancelled | `ban-hang:confirm` | chưa có `sale` posted tham chiếu | bắt buộc nếu `confirmed` |

   Đơn `confirmed` **không sửa** (huỷ rồi lập mới, như Erp-vn) trừ ghi chú và ngày giao.
3. **Trường.** Đầu: số, ngày, khách (`partners.kind=customer`), kênh (DM12), bảng giá (suy từ kênh / khách), điều khoản thanh toán (DM08), hạn thanh toán (tính), chi nhánh, kho xuất, người bán, ngày giao dự kiến, tổng chưa thuế, thuế, tổng, ghi chú hạn mức. Dòng: `item_id`, số lượng, ĐVT, đơn giá gốc (bảng giá), chiết khấu %, chương trình KM áp (BH05), là hàng tặng (giá 0), thuế suất, thành tiền, đã lập HĐ (tính), còn lại.
4. **Luật.** `apply_prices` (chỉ ở `draft`): đi qua hook `sale.priceLine` theo thứ tự bảng giá → KM → NPP; máy chủ tính lại mọi tổng (không nhận số gửi lên). Hạn thanh toán = ngày + số ngày điều khoản. Tồn khả dụng = tồn − đã giữ bởi đơn `confirmed` chưa xuất; thiếu → cảnh báo (không chặn, vì có thể nhập về kịp) trừ khi `ban_hang.don.chan_thieu_ton = true`.
5. **Quyền.** `ban-hang:quote`, `ban-hang:confirm`, `ban-hang:approve-credit`; SoD cho duyệt hạn mức.
6. **Ngoại lệ.** Giá dòng < giá vốn bình quân → cảnh báo "bán dưới vốn", `override` `ban-hang:approve-credit`; khách "ngừng giao dịch" → chặn; đơn > `ban_hang.don.duyet_cap2_tu` → thêm bước duyệt giám đốc (cấu hình).
7. **Hạch toán.** Đơn **không** ghi sổ. Lập hoá đơn (BH08) hoặc xuất kho (nếu tách giao hàng) mới nộp `sale` (XBA + doanh thu + thuế + công nợ), `docKey` `ban-hang.order:<id>:inv:<n>`, chiều `channel`, `salesperson`, `order_id` (`document_links` origin).
8. **Căn cứ.** TT99 (doanh thu, 131); NĐ123/2020 + NĐ254/2026 (thời điểm lập hoá đơn).
9. **Golden.** `T030-BH-2` đơn 3 dòng, lập HĐ 2 lần (1 dòng + 2 dòng) → hai `sale` posted, đơn `done`, Σ `sales_lines` = Σ dòng đơn; `T030-BH-3` sửa dòng đơn `confirmed` → từ chối.

## BH04 Bảng giá theo kênh

1. **Mục đích.** Mỗi kênh (bán lẻ, NPP, siêu thị, online) một bảng giá có hiệu lực; khách / chi nhánh gán bảng giá.
2. **Chứng từ.** Danh mục có phiên bản (không workflow): `price_lists` hiện có + thêm `channel_id`, `valid_from / to`, dòng: `item_id`, ĐVT, giá, chiết khấu %, số lượng tối thiểu (bậc).
3. **Luật.** Giá dòng = dòng bảng giá khớp (`item_id`, ĐVT, lượng ≥ min, ngày trong hiệu lực); nhiều dòng khớp → min tối thiểu lớn nhất. Không có → giá bán chuẩn của Item Master; không có nữa → cảnh báo `PRICE_MISSING`.
4. **Quyền.** `ban-hang:pricing` (trưởng bán hàng).
5. **Ngoại lệ.** Giá bảng < giá vốn → cảnh báo khi lưu bảng.
6. **Hạch toán.** Không.
7. **Golden.** `T030-BH-5` bậc 1–9 giá 100, ≥ 10 giá 90 → đơn 10 lấy 90; ngày ngoài hiệu lực → giá chuẩn.

## BH05 Khuyến mãi, chiết khấu thương mại

1. **Mục đích.** Chương trình KM theo NĐ81/2018: giảm giá, tặng kèm mua, tặng không kèm mua, hàng mẫu; trần giá trị / mức giảm 50 %; thông báo Sở Công Thương khi thuộc diện.
2. **Chứng từ `ban-hang.promotion`**: draft → active → closed. `active` chỉ khi qua `_check_rules`; chương trình `active` **không sửa** (đóng rồi lập mới).
3. **Trường.** Tên, loại (`discount | gift_with_purchase | free_gift | sample`), hiệu lực từ – đến, kênh / khách áp, cần thông báo (tính), số thông báo; dòng: `item_id` áp, điều kiện (lượng / tiền tối thiểu), mức giảm % hoặc hàng tặng (`item_id`, lượng, giá trị).
4. **Luật.** Trần: giảm giá ≤ `ban_hang.km.tran_pct` (50, `legalRef` NĐ81 Điều 7); giá trị hàng tặng / đơn vị hàng KM ≤ 50 % giá bán (Điều 9); hàng tặng đơn giá = 0 trên đơn. `apply_promotions` chỉ ở `draft`; đơn ghi `promotion_id` từng dòng. Tặng không kèm mua / mẫu → phiếu xuất riêng tham chiếu chương trình, ngày trong hiệu lực.
5. **Quyền.** `ban-hang:pricing` lập; `ban-hang:approve-credit` kích hoạt.
6. **Ngoại lệ.** Vượt trần → **chặn** (luật), không override; thuộc diện thông báo mà chưa có số → cảnh báo.
7. **Hạch toán.** Hàng tặng kèm bán: trong `sale` dòng giá 0 → Kernel ghi XTA1.4 (đã có); tặng không kèm mua / mẫu: `stock_adjustment` XQUA (đã có lý do).
8. **Căn cứ.** NĐ81/2018 Điều 6, 7, 9, 10, 17; TT219 Điều 7 khoản 5 (VAT hàng KM đúng luật = 0 giá tính thuế).
9. **Golden.** `T030-BH-6` giảm 55 % → không kích hoạt; 50 % → được; đơn áp KM → dòng tặng giá 0, `sale` posted có dòng XTA1.4.

## BH06 Hạn mức công nợ khách hàng

1. **Mục đích.** Không xác nhận đơn khi nợ vượt hạn mức; duyệt ngoại lệ có lý do.
2. **Chứng từ.** Không; là luật trong `sale.beforeConfirm`.
3. **Trường.** `partners.credit_limit` (đã có), `partners.credit_days`; tham số `ban_hang.han_muc.tinh_don_mo = true`.
4. **Luật.** `nợ hiện tại (debt_items 131 chưa tất toán) + Σ đơn confirmed chưa lập HĐ + đơn này > hạn mức` → `pending_credit`, ghi `credit_note` nêu ba số. Nợ **quá hạn** > 0 → cảnh báo đỏ kèm. Hạn mức 0 = không kiểm.
5. **Quyền.** `ban-hang:approve-credit`.
6. **Ngoại lệ.** Khách có nợ quá hạn > `ban_hang.han_muc.ngay_qua_han_chan` (60) → **chặn** kể cả override (cấu hình được).
7. **Hạch toán.** Không.
8. **Căn cứ.** Chính sách tín dụng nội bộ.
9. **Golden.** `T030-BH-4` hạn mức 100, nợ 60, đơn mở 30, đơn mới 20 → `pending_credit`; duyệt có lý do → `confirmed`, audit có lý do.

## BH07 Hợp đồng và chính sách nhà phân phối

`ban-hang.distributor_contract`: draft → active → settled. Trường: NPP, kỳ, bậc doanh số (từ – đến → % thưởng), hàng áp. Luật: doanh số kỳ đọc từ `sales_lines` posted; thưởng = bậc đạt × doanh số; `settled` nộp `sale_return`-kiểu chiết khấu (reasonCode `CKNPP`, K2) hoặc `manual` giảm công nợ. Golden `T030-BH-7` doanh số 1,2 tỷ, bậc ≥ 1 tỷ 3 % → thưởng 36 tr, một bút toán.

## BH08 Hoá đơn điện tử có mã CQT · BH09 Điều chỉnh, thay thế · BH10 Trả lại

1. **Mục đích.** Lập hoá đơn từ đơn (hoặc trực tiếp), gửi HĐĐT, ghi sổ khi có số + ký hiệu; sai sót → điều chỉnh hoặc thay thế đúng NĐ123 / NĐ254; trả lại → hoá đơn điều chỉnh giảm.
2. **Chứng từ `ban-hang.invoice`**: draft → issued (có số CQT) → posted; replaced; cancelled. `kind = invoice | refund`; `correction = none | adjust | replace`, `origin_id`, `correction_reason` (`error | return | discount | settlement`).

   | Từ | Đến | Ai | Điều kiện |
   |---|---|---|---|
   | draft | issued | `ban-hang:invoice` | gửi `sale.invoiceIssue` → nhận ký hiệu + số + mã CQT (hoặc nhập tay) |
   | issued | posted | `ban-hang:invoice` | nộp `sale` / `sale_return`; `posted` khi `bizcity.ledger.entry.posted` |
   | posted (gốc) | replaced | hệ thống | khi hoá đơn `replace` tham chiếu nó `posted` |
   | posted | cancelled | kế toán trưởng | chưa có phiếu thu posted tham chiếu; đảo bút toán |

3. **Trường.** Mẫu số, ký hiệu, số (duy nhất theo đơn vị + mẫu + ký hiệu + số), ngày, khách (tên, MST, địa chỉ chụp theo ECP — S029-19), đơn tham chiếu, dòng (như đơn), tổng, đã thu (tính qua chuỗi thay thế), còn phải thu; thông báo sai sót 04/SS-HĐĐT (ngày, nội dung).
4. **Luật (từ `_check_correction`).** `correction=none` → không `origin`. `adjust | replace` → `origin` bắt buộc, `posted`, cùng khách; `replace` chỉ cho `correction_reason=error`; trả lại / chiết khấu / quyết toán → `adjust` (giảm); người mua là tổ chức → đính kèm văn bản thoả thuận; gốc đã có `adjust` lý do sai sót → lần sau tiếp tục `adjust`; gốc là hoá đơn thay thế → sai tiếp phải `replace`. `refund` (trả lại) = `adjust` giảm, không vượt lượng đã bán của gốc.
5. **Quyền.** `ban-hang:invoice`; huỷ: kế toán trưởng.
6. **Ngoại lệ.** Số CQT trùng → chặn; lập HĐ vượt lượng đơn còn lại → chặn; hoá đơn > 30 ngày sau giao → cảnh báo thời điểm lập.
7. **Hạch toán.** `issued → posted`: `invoice` → `sale` (XBA, doanh thu, thuế đầu ra, 131); `refund` → `sale_return` (NTH1); `adjust` tăng → `sale` dòng chênh; `adjust` giảm → `sale_return` dòng chênh; `replace` → đảo gốc + `sale` mới (Kernel: nộp phiên bản mới cùng `docKey` gốc). Tất cả `docKey` `ban-hang.invoice:<id>`.
8. **Căn cứ.** NĐ123/2020 Điều 19; NĐ254/2026; TT78/2021; mẫu 04/SS-HĐĐT; TT99 TK 5111 / 5212 / 33311 / 131.
9. **Golden.** `T030-BH-8` thay thế: gốc `replaced`, sổ có đúng một đảo + một mới, công nợ = hoá đơn mới; `T030-BH-9` điều chỉnh giảm 2 sản phẩm → `sale_return` 2, 131 giảm đúng; `T030-BH-10` `replace` với lý do `return` → từ chối.

## BH11 Hàng khuyến mãi, biếu tặng, mẫu — ✅ (XTA1.4, XQUA) + BH05.

## BH12 Chi phí trade marketing, trưng bày

`ban-hang.trade_program`: draft → active → settled. Trường: khách / NPP, kỳ, loại (trưng bày, hỗ trợ bán, hoa hồng), ngân sách, điều kiện; `settled` → chi phí bán hàng qua `payment` / `manual` (reasonCode `CPTM`, K2) có chiều khách. Golden `T030-BH-11` tất toán 10 tr → một bút toán chi phí, chiều `customer` đúng.

## BH13 Đơn sàn thương mại điện tử

1. **Mục đích.** Nhập đơn sàn (Shopee / Lazada / TikTok) từ tệp hoặc API → đơn bán + hoá đơn nháp; đối soát phí sàn theo kỳ thanh toán.
2. **Chứng từ `tmdt.settlement`**: draft → matched → posted. Đơn sàn → `ban-hang.order` kênh `online`, khách = "Khách lẻ sàn X" hoặc cá nhân; module `modules/tmdt` (P3) dùng lại `modules/ban-hang`.
3. **Trường.** Sàn, shop, kỳ, tệp đối soát, dòng: mã đơn sàn, doanh thu, phí sàn (nhiều loại), tiền về, đơn nội bộ khớp.
4. **Luật.** Khớp theo mã đơn sàn (ánh xạ định danh ngoài — S029-15); chênh tiền về ≠ doanh thu − phí → cảnh báo.
5. **Hạch toán.** `posted`: phí sàn → chi phí bán hàng (reasonCode `PHISAN`, K2) giảm phải thu sàn; tiền về → `bank_receipt` TTKH.
6. **Căn cứ.** NĐ117/2025 (sàn khấu trừ, nộp thay thuế cho hộ — ghi chú khi khách là hộ); TT99.
7. **Golden.** `T030-BH-12` 10 đơn, phí 8 % → phải thu sàn = 92 %, phí = 8 %, tiền về khớp.

## BH14 Bán hàng xuất khẩu

Module `modules/xuat-nhap-khau` (P3): `export_declaration` draft → cleared → posted; VAT 0 %, nguyên tệ (K-030-2), tỷ giá ngày tờ khai; hồ sơ hoàn thuế. Golden `T030-BH-13` doanh thu = FOB × tỷ giá; thuế đầu ra 0; CLTG khi thu tiền.
