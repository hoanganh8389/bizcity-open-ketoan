// [2026-11-20 Nguyễn Văn Thủy] UX MUA HÀNG GỌN — thanh chuỗi chứng từ trong phiếu mua hàng (đóng góp)
/**
 * CHUỖI CHỨNG TỪ của một phiếu mua hàng, hiện ngay dưới đầu phiếu: Hợp đồng → Đơn đặt → Phiếu nhập → Hoá đơn NCC → Thanh toán
 * (kèm Trả hàng, Chi phí nếu có). Lần theo vết có sẵn trong phiếu (contractCode, refIds — phiếu nhập trỏ đơn, phiếu trả / chi phí /
 * trả tiền trỏ phiếu nhập), không cần gọi thêm máy chủ.
 * Mỗi mắt xích: đã có (✓, bấm số phiếu để mở), đang mở (đậm), thiếu / lệch (cam — đúng các điểm kiểm soát của quy trình:
 * đơn không theo hợp đồng, nhập ngoài đơn, nhận chưa đủ, phiếu nhập chưa có hoá đơn, chưa thanh toán).
 */
import { Fragment } from 'react';
import { ChevronRight } from 'lucide-react';
import { orderProgress, type PDoc } from '@bizcity/mua-hang-domain';
import type { StoredDoc } from '../du-lieu';

type Trang = 'co' | 'dang' | 'thieu' | 'chua';
interface Mat { ten: string; trang: Trang; docs: PDoc[]; ghi?: string }

const live = (d: PDoc) => d.status !== 'cancelled';
const giao = (a: string[] | undefined, ids: Set<string>) => (a ?? []).some((x) => ids.has(x));

export function ChuoiChungTu({ doc, docs, units, onOpen }: { doc: PDoc; docs: StoredDoc[]; units?: Parameters<typeof orderProgress>[3]; onOpen?: (d: PDoc) => void }) {
  const byId = new Map(docs.map((d) => [d.id, d as PDoc]));
  byId.set(doc.id, doc);
  const ref0 = (d?: PDoc) => (d?.refIds?.[0] ? byId.get(d.refIds[0]) : undefined);

  // Phiếu nhập gốc của phiếu đang mở (trả hàng, chi phí, giảm giá, trả tiền trỏ phiếu nhập).
  let receipts: PDoc[] = [];
  let order: PDoc | undefined;
  if (doc.kind === 'order') order = doc;
  else if (doc.kind === 'receipt') { receipts = [doc]; order = ref0(doc)?.kind === 'order' ? ref0(doc) : undefined; }
  else {
    receipts = (doc.refIds ?? []).map((id) => byId.get(id)).filter((d): d is PDoc => d?.kind === 'receipt');
    const o = ref0(receipts[0]);
    order = o?.kind === 'order' ? o : undefined;
  }
  if (order) {
    const of = docs.filter((d) => d.kind === 'receipt' && live(d) && d.refIds?.includes(order!.id));
    receipts = [...new Map([...receipts, ...of].map((d) => [d.id, d])).values()];
  }
  const rIds = new Set(receipts.map((d) => d.id));
  const ofKind = (k: PDoc['kind'][]) => {
    const found = docs.filter((d) => k.includes(d.kind) && live(d) && giao(d.refIds, rIds)) as PDoc[];
    if (k.includes(doc.kind) && !found.some((d) => d.id === doc.id)) found.push(doc);
    return found;
  };
  const payments = ofKind(['payment']);
  const returns = ofKind(['return', 'exchange']);
  const costs = ofKind(['cost', 'rebate']);
  const contract = doc.contractCode ?? order?.contractCode ?? receipts.find((r) => r.contractCode)?.contractCode;
  const prog = order && order.status === 'approved' ? orderProgress(order, docs, undefined, units) : null;
  const coHd = receipts.filter((r) => r.invoice?.no);
  const dang = (ds: PDoc[]): Trang => (ds.some((d) => d.id === doc.id) ? 'dang' : 'co');

  const mats: Mat[] = [
    { ten: 'Hợp đồng', docs: [], trang: contract ? 'co' : 'thieu', ghi: contract ?? 'Không theo hợp đồng' },
    { ten: 'Đơn đặt', docs: order ? [order] : [], trang: order ? dang([order]) : receipts.length ? 'thieu' : 'chua',
      ghi: order ? (prog && !prog.done && prog.ordered ? `nhận ${Math.round((prog.received / prog.ordered) * 100)}%` : undefined) : receipts.length ? 'Nhập ngoài đơn' : undefined },
    { ten: 'Phiếu nhập', docs: receipts, trang: receipts.length ? (prog && !prog.done ? 'thieu' : dang(receipts)) : 'chua', ghi: prog && !prog.done && receipts.length ? 'chưa nhận đủ' : undefined },
    { ten: 'Hoá đơn NCC', docs: [], trang: !receipts.length ? 'chua' : coHd.length === receipts.length ? 'co' : 'thieu',
      ghi: !receipts.length ? undefined : coHd.length === receipts.length ? coHd.map((r) => `${r.invoice!.serial ? `${r.invoice!.serial}-` : ''}${r.invoice!.no}`).join(', ') : `${receipts.length - coHd.length} phiếu nhập chưa có hoá đơn` },
    { ten: 'Thanh toán', docs: payments, trang: payments.length ? dang(payments) : 'chua', ghi: payments.length ? undefined : receipts.length ? 'Chưa trả' : undefined },
  ];
  if (returns.length) mats.push({ ten: 'Trả / đổi hàng', docs: returns, trang: dang(returns) });
  if (costs.length) mats.push({ ten: 'Chi phí / giảm giá', docs: costs, trang: dang(costs) });
  if (doc.kind === 'prepayment') mats.splice(4, 1, { ten: 'Ứng trước', docs: [doc], trang: 'dang' });

  return (
    <div className="mh-chuoi" aria-label="Chuỗi chứng từ">
      {mats.map((m, i) => (
        <Fragment key={m.ten}>
          {i > 0 && <ChevronRight size={13} className="mh-chuoi-mui" />}
          <span className={`mh-chuoi-mat ${m.trang}`} title={m.trang === 'thieu' ? `Thiếu / lệch: ${m.ghi ?? m.ten}` : undefined}>
            <b>{m.trang === 'co' ? '✓ ' : ''}{m.ten}</b>
            {m.docs.map((d) => (d.id === doc.id || d.id.startsWith('new-') || !onOpen
              ? <span key={d.id} className="mono">{d.docNo || '(đang lập)'}</span>
              : <button key={d.id} type="button" className="mono" onClick={() => onOpen(d)} title={`Mở ${d.docNo}`}>{d.docNo}</button>))}
            {m.ghi && <small>{m.ghi}</small>}
          </span>
        </Fragment>
      ))}
    </div>
  );
}
