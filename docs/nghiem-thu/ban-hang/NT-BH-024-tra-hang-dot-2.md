# NT-BH-024 · Trả lại hàng bán đợt 2 — chặn trả đơn có hoá đơn MST, không trả quà đổi điểm, hàng lỗi vào kho trả lại
<!-- [2026-11-18 Võ Hoàng] NGHIEM-THU — chốt NT-BH-024 (anh Hoàng, 18/11) (đóng góp) -->

| | |
|---|---|
| Phân hệ | Bán hàng (module `pos`; máy bán React) |
| Màn hình | Máy bán — hộp Hoàn hàng / Đổi hàng; BH17 Cài đặt bán hàng; BH14 Phiếu trả hàng |
| Mục được giao | Trả lại hàng bán (lịch 17–19/11): "chặn theo MST", phần còn lại |
| Ngày tạo | 18/11/2026 |
| Trạng thái | **Đã chốt 18/11/2026** (Võ Hoàng) |
| Căn cứ | Quy trình mua bán của phòng kế toán §3.2 bước 5 (đổi trả theo bill gốc, trong hạn, **hàng trả vào kho chờ xử lý**), §3.1 bước 7 (tham chiếu hoá đơn gốc) |

## 1. Hiện trạng (sau NT-BH-005, 019, 020)
Máy bán đã: bắt buộc bill gốc, hạn trả + duyệt quá hạn, thu lại quà vượt suất, trả bill Z, trừ lại điểm đã tích. Chưa: chặn đơn có hoá đơn MST, chặn trả quà đổi điểm, kho cho hàng trả lỗi.

## 2. Kết quả mong đợi
| Mục | Mong đợi |
|---|---|
| Đơn có người mua hoá đơn kèm **MST** (doanh nghiệp) | Máy bán **không trả / không đổi** tại quầy: `POS_RETURN_TAX_INVOICE` "Đơn đã xuất hoá đơn cho MST … — kế toán lập phiếu trả BH11 kèm hoá đơn điều chỉnh". Phiếu trả BH11 của kế toán không bị chặn |
| Đơn không MST (khách lẻ / chỉ tên) | Trả như hôm nay |
| Dòng **quà đổi bằng điểm** (NT-BH-020) | **Không trả được**: `POS_RETURN_LOYALTY_GIFT`; khi trả hàng chính, quà đổi điểm không tính vào "thu lại quà vượt suất" |
| Mỗi dòng trả: thu ngân chọn **Nguyên vẹn** (mặc định) / **Lỗi – hết hạn** | Nguyên vẹn → về kho bán (kho mặc định); Lỗi → vào **kho loại KTL "Kho hàng trả lại"** (DM18) của cửa hàng, chọn ở BH17 (khoá `bizcity.pos.return_bad_warehouses`, như kho KCB của NT-BH-023). Cửa hàng chưa khai kho KTL mà chọn Lỗi → báo rõ, không trả |
| BH14 Phiếu trả hàng | Thêm cột tình trạng / kho nhận |
| Tỷ lệ trả tối đa (bán buôn) | **Chưa giới hạn** — chờ kế toán trả lời K3 |

**Bút toán:** không đổi cách định khoản; hàng lỗi ghi vào TK kho của loại KTL (theo DM18) thay vì kho bán.

## 3. Trường hợp lệch chuẩn
| # | Làm thế này | Phần mềm phải |
|---|---|---|
| 1 | MST được thêm vào đơn sau khi bán (ghi người mua hoá đơn sau) | Tính theo đơn lúc trả: đã có MST thì chặn |
| 2 | Đổi hàng đơn có MST | Chặn như trả |
| 3 | Trả một phần: 1 dòng nguyên vẹn + 1 dòng lỗi | Một phiếu trả, mỗi dòng vào đúng kho |
| 4 | Đơn trả quá hạn (cần duyệt) có dòng lỗi | Duyệt như hôm nay; kho theo tình trạng |

## 4. Đã chốt (18/11/2026, Võ Hoàng)
| # | Câu hỏi | Chốt |
|---|---|---|
| Q1 | "Chặn trả theo MST" | Đơn đã xuất hoá đơn cho khách có MST thì máy bán không trả / đổi; kế toán làm BH11 + hoá đơn điều chỉnh. Máy chủ không biết website đã phát hành hoá đơn Viettel chưa → coi **đơn có người mua hoá đơn kèm MST** là đã xuất |
| Q2 | Trả quà đã đổi bằng điểm | **Không cho trả** |
| Q3 | Kho nhận hàng trả (K1) | Thu ngân chọn: nguyên vẹn → kho bán; lỗi / hết hạn → kho KTL của cửa hàng |
| Q4 | Tỷ lệ trả tối đa (K3) | Chưa giới hạn, chờ kế toán |

## 5. Kết quả chạy
| | |
|---|---|
| Ngày chạy | |
| Bản code (commit) | |
| Test tự động | `apps/api/test/nt-bh-024-tra-hang-dot-2.test.ts` (tạo khi code) |

## 6. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 7. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 18/11/2026 | Tạo phiếu, chốt Q1–Q4 |
