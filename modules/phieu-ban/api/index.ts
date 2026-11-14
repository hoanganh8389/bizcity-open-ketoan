/** Phiếu bán nhập tay (BH10 / BH11, phiếu NT-BH-015) — phần máy chủ. Mọi action khai ở đây VÀ trong bizcity.module.json (`actions`). */
// [2026-11-13 11:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-015: đăng ký action phiếu bán / trả nhập tay (đóng góp)
import { defineModule } from '@bizcity/module-sdk';
import manifest from '../bizcity.module.json' with { type: 'json' };
import docApprove from './actions/doc-approve.js';
import docCreate from './actions/doc-create.js';
import docDelete from './actions/doc-delete.js';
import docGet from './actions/doc-get.js';
import docList from './actions/doc-list.js';
import docReturnable from './actions/doc-returnable.js';
import docUnapprove from './actions/doc-unapprove.js';
import docUpdate from './actions/doc-update.js';
import quoteGet from './actions/quote-get.js';

export default defineModule({ manifest, actions: [docList, docGet, docCreate, docUpdate, docDelete, docApprove, docUnapprove, docReturnable, quoteGet], subscribers: [] });
