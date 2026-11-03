// @bizcity-layer K kernel/intake
// Ca tự kiểm SC-FIND-2 (xem ../../../../../../expect.json): Core gửi thông báo bằng câu chữ tự do thay vì notifyFinding.
import { sendNotification } from '@bizcity/platform/core/notify';

export async function nhacTuDo(trx: never, tenantId: string) {
  await sendNotification(trx, tenantId, 'core', { to: { permission: 'catalog:write' }, title: 'Có mặt hàng mới, nhớ kiểm nhé' });
}
