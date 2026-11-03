// @bizcity-layer K kernel/posting
// SC-ITEM-3 (mẫu sai): luật định khoản đọc danh mục mua hàng thay vì phân loại mặt hàng.
import { skuInfo } from '@bizcity/mua-hang-domain';
export const lineKind = (sku: string) => skuInfo(sku).kind;
