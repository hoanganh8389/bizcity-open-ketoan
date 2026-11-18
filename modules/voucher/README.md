# Module `voucher` — Voucher 3 loại (BH21)
<!-- [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-026: module voucher (đóng góp) -->

Phiếu nghiệm thu: [NT-BH-026](../../docs/nghiem-thu/ban-hang/NT-BH-026-voucher.md). Hướng dẫn người dùng: [docs/huong-dan/voucher.md](../../docs/huong-dan/voucher.md).

Ba loại voucher: **tương đương tiền** và **lần mua sau sản phẩm / nhãn** ở module này; **tương đương điểm** (voucher đổi điểm) ở module `loyalty` (NT-BH-020), giữ nguyên.

## Nghiệp vụ

- **Đợt phát** (`mod_voucher.campaigns`): loại, người phát (TGS / hãng – NCC), mệnh giá, hạn (ngày hết hạn và / hoặc số ngày từ ngày phát), đơn tối thiểu, sản phẩm (lưu `item_id`) / nhãn áp dụng, kiểu phát (thủ công / tự động "lần mua sau" kèm điều kiện mua sản phẩm / nhãn ≥ N). Voucher hãng phải chọn **hình thức thanh toán** kế toán khai (tài khoản phải thu hãng ở hình thức — module không viết số tài khoản). Đợt đã phát mã thì không đổi điều kiện tiền (ECP-13).
- **Mã** (`mod_voucher.codes`): sinh N mã cho danh sách SĐT, nạp danh sách mã có sẵn kèm SĐT, hoặc tự phát theo đơn máy bán. Luôn gắn SĐT khách — chỉ khách đó dùng. **Dùng một lần**: dùng là hết, phần dư mất; vẫn tra cứu được đã dùng ở đơn / phiếu nào, ngày, cửa hàng, số tiền trừ.
- **Nhật ký** (`mod_voucher.code_log`, chỉ thêm): phát, dùng, trả lại (huỷ đơn chờ thanh toán, bỏ duyệt phiếu), thu hồi, dùng trùng.

## Dùng voucher khi bán (module pos, phieu-ban)

Module bán không import module này: gọi action đọc `voucher.order.quote` (ctx.actions.call, quyền `voucher:use` của người bán) rồi tự trừ trên chứng từ bán của mình.

1. Bên bán khoá theo từng mã trong giao dịch của đơn: `pg_advisory_xact_lock(hashtext('voucher:'||mã))` (máy bán, BH10 và module này dùng cùng khoá).
2. Bên bán kiểm lần dùng chưa tới module này (máy bán: `mod_pos.voucher_uses` — mã đang dùng duy nhất; BH10: phiếu bán khác đã duyệt mang mã).
3. `voucher.order.quote` kiểm: của khách này (SĐT ở đơn / danh mục), chưa dùng ở đơn khác, còn hạn, đợt chưa ngừng, đơn tối thiểu (tổng sau khuyến mại), giỏ có sản phẩm / nhãn áp dụng. Trả mệnh giá, người phát, mã hàng trong giỏ được trừ; với máy bán kèm voucher lần mua sau sẽ phát (mã định theo đơn × đợt).
4. Bên bán trừ SAU khuyến mại: voucher TGS = **chiết khấu** chia vào dòng (giảm doanh thu + thuế, như voucher đổi điểm); voucher hãng = **dòng thanh toán** theo hình thức của đợt (doanh thu đủ, phải thu hãng). Không gửi reasonCode riêng. Mỗi mã tối đa mệnh giá và tối đa phần còn phải trả.
5. Sự kiện đơn / phiếu đã ghi sổ → module này đánh dấu đã dùng, thêm mã tự phát.

| Sự kiện nghe | Việc |
|---|---|
| `pos.order.recorded` (đơn hoàn tất) | `order.voucherUses` → đã dùng; `order.issuedVouchers` → thêm mã tự phát gắn SĐT khách |
| `pos.order.cancelled` | Mã đã dùng của đơn về "còn"; mã tự phát của đơn thu hồi |
| `pos.return.recorded` (`orderFullyReturned`) | Mã tự phát chưa dùng của đơn gốc thu hồi |
| `phieu-ban.doc.recorded` / `.cancelled` (phiếu bán) | `doc.vouchers` → đã dùng / bỏ duyệt → về "còn" |

**Cửa sổ rủi ro:** máy bán ↔ máy bán và BH10 ↔ BH10 chặn chắc trong giao dịch (khoá + bảng dùng của chính module bán). Máy bán ↔ BH10 cùng một mã trong khoảng thời gian module voucher chưa nhận sự kiện (outbox, vài giây) thì cả hai cùng qua; khi nhận sự kiện thứ hai module ghi **dùng trùng** vào nhật ký mã (giữ lần đầu) để kế toán xử lý.

## Action

| Đường | Action | Quyền |
|---|---|---|
| `GET /api/v1/m/voucher/campaigns` · `GET /campaigns/:id` | `voucher.campaign.list` · `.get` | `voucher:read` |
| `POST /api/v1/m/voucher/campaigns` · `PUT /campaigns/:id` | `voucher.campaign.create` · `.update` | `voucher:write` |
| `POST /api/v1/m/voucher/campaigns/:id/generate` · `/import` | `voucher.code.generate` · `.import` | `voucher:write` |
| `GET /api/v1/m/voucher/codes` · `GET /codes/:code` | `voucher.code.list` · `.get` (tra cứu + nhật ký) | `voucher:read` |
| `POST /api/v1/m/voucher/codes/:code/revoke` | `voucher.code.revoke` | `voucher:write` |
| `GET /api/v1/m/voucher/customer?phone&skus&total&code` | `voucher.customer.available` — voucher còn hạn của khách cho máy bán | `voucher:use` |
| (không HTTP) | `voucher.order.quote` — module bán gọi chéo | `voucher:use` |
| `GET /api/v1/m/voucher/report` | `voucher.report.get` | `voucher:read` |

Vé thu ngân (WP SSO) cần thêm quyền `voucher:use` để máy bán dùng voucher.

## Chưa làm / giới hạn

- Danh mục đối tượng chỉ đọc theo mã (`bizcity_read.partners` chưa có định danh): hãng phát lưu mã đối tượng. Nhãn hàng lưu mã nhãn (`products.brand_code`) — chưa có định danh nhãn.
- Trả một phần đơn gốc chưa thu hồi voucher lần mua sau (chỉ trả hết đơn). Trả hàng đơn đã trả bằng voucher hãng: tiền trả khách theo tiền dòng (gồm phần voucher hãng) — kế toán xem khi duyệt trả.
- Máy bán mất mạng không dùng voucher (đơn gửi bù có mã sai bị từ chối như đơn thường).
