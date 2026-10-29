/**
 * MẪU IN thẻ tài sản (ACC28 tăng TSCĐ, ACC30 giảm TSCĐ, ACC22 công cụ dụng cụ, ACC23 chi phí trả trước):
 *   Thẻ tài sản cố định       rdlcTheTaiSan.rdlc (HTsoft ghi S11-DNN TT133; ở đây in số mẫu S23-DN TT200, bố cục như HTsoft):
 *                             căn cứ biên bản giao nhận, tên / số hiệu / nước, năm sản xuất, bộ phận sử dụng, năm đưa vào
 *                             sử dụng, công suất, đình chỉ sử dụng; bảng nguyên giá theo chứng từ + giá trị hao mòn theo năm;
 *                             dụng cụ phụ tùng kèm theo; ghi giảm TSCĐ.
 *   Thẻ công cụ dụng cụ / thẻ chi phí trả trước   cùng bố cục, cột "giá trị phân bổ" thay cho hao mòn (mẫu nội bộ).
 *   Biên bản thanh lý TSCĐ    mẫu 02-TSCĐ (TT200), cho tài sản đã ghi giảm (ACC30).
 * Hao mòn theo năm cộng từ các tháng đã ghi sổ ở lịch khấu hao (/assets/:code/plan) và luỹ kế đầu kỳ chuyển từ sổ cũ.
 */
import { api } from '@/lib/api';
import { date } from '@/lib/format';
import { Fields, Foot, OrgHead, Signs, Title, m, mb, words, type PrintCtx, type PrintTemplate, Dots, type Row } from '@/components/print';
import type { AssetKind } from './AssetPages';

/** Các trường của thẻ dùng khi in (khớp kiểu Asset của AssetPages). */
export interface AssetLike {
  code: string; name: string; kind: AssetKind; categoryName: string | null; branchCode: string; branchName: string; unit: string; quantity: number;
  acquiredDate: string | null; startDate: string; originalCost: number; currentCost: number; usefulLifeMonths: number; openingAccumulated: number; openingAsOf: string | null;
  assetAccount: string | null; depreciationAccount: string; departmentCode: string | null; specs?: { name: string; value: string }[];
  status: string; disposedDate: string | null; note: string; accumulated: number; remaining: number;
}
interface EventLike { kind: string; date: string; docNo: string; note: string; costDelta?: number }
interface PlanMonth { period: string; amount: number; status: 'posted' | 'planned' | 'missing' }
export interface AssetCardSheet { asset: AssetLike; departmentName: string; events: EventLike[]; months: PlanMonth[] }

/** Nạp lịch khấu hao, lịch sử, tên bộ phận của các thẻ trước khi in. */
export async function loadAssetCards(assets: AssetLike[]): Promise<AssetCardSheet[]> {
  const deps = await api.get<{ code: string; name: string }[]>('/api/v1/dimensions/department').catch(() => []);
  return Promise.all(assets.map(async (a) => {
    const [plan, events] = await Promise.all([
      api.get<{ months: PlanMonth[] }>(`/api/v1/assets/${encodeURIComponent(a.code)}/plan`).catch(() => ({ months: [] as PlanMonth[] })),
      api.get<EventLike[]>('/api/v1/asset-events', { assetCode: a.code }).catch(() => [] as EventLike[]),
    ]);
    return { asset: a, departmentName: deps.find((d) => d.code === a.departmentCode)?.name ?? a.departmentCode ?? '', events, months: plan.months };
  }));
}

const spec = (a: AssetLike, ...names: string[]) => a.specs?.find((s) => names.some((n) => s.name.toLowerCase() === n.toLowerCase()))?.value ?? '';
const KNOWN_SPECS = ['nước sản xuất', 'năm sản xuất', 'công suất', 'diện tích'];
const yearOf = (d?: string | null) => (d ? d.slice(0, 4) : '');
/** Dòng chấm ngắn để ghi tay giữa câu. */
const dots = (w = 120) => <Dots w={w} />;

/** Hao mòn / phân bổ theo năm: luỹ kế chuyển từ sổ cũ rồi từng năm đã ghi sổ, kèm cộng dồn. */
function yearRows(s: AssetCardSheet): { year: string; amount: number; cum: number }[] {
  const by = new Map<string, number>();
  for (const x of s.months) if (x.status === 'posted') by.set(x.period.slice(0, 4), (by.get(x.period.slice(0, 4)) ?? 0) + x.amount);
  const out: { year: string; amount: number; cum: number }[] = [];
  let cum = s.asset.openingAccumulated || 0;
  if (cum) out.push({ year: s.asset.openingAsOf ? `Đến ${date(s.asset.openingAsOf)}` : 'Luỹ kế sổ cũ', amount: cum, cum });
  for (const [year, amount] of [...by].sort(([a], [b]) => a.localeCompare(b))) { cum += amount; out.push({ year, amount, cum }); }
  return out;
}

/** Nguyên giá theo chứng từ: ghi tăng ban đầu và các lần đánh giá lại có chênh lệch nguyên giá. */
function costRows(s: AssetCardSheet): { docNo: string; date: string; text: string; amount: number }[] {
  const inc = s.events.find((e) => e.kind === 'increase');
  const rows = [{ docNo: inc?.docNo ?? '', date: inc?.date ?? s.asset.acquiredDate ?? s.asset.startDate, text: s.asset.kind === 'fixed_asset' ? 'Nguyên giá ghi tăng' : 'Giá trị ghi tăng', amount: s.asset.originalCost }];
  for (const e of s.events) if (e.kind === 'revaluation' && e.costDelta) rows.push({ docNo: e.docNo, date: e.date, text: `Đánh giá lại${e.note ? ` — ${e.note}` : ''}`, amount: e.costDelta });
  return rows;
}

const TITLE: Record<AssetKind, string> = { fixed_asset: 'THẺ TÀI SẢN CỐ ĐỊNH', tool: 'THẺ CÔNG CỤ DỤNG CỤ', prepaid: 'THẺ CHI PHÍ TRẢ TRƯỚC' };

function CardSheet({ s, ctx }: { s: AssetCardSheet; ctx: PrintCtx }) {
  const a = s.asset;
  const fa = a.kind === 'fixed_asset';
  const wear = fa ? 'Giá trị hao mòn' : 'Giá trị phân bổ';
  const inc = s.events.find((e) => e.kind === 'increase');
  const dec = s.events.find((e) => e.kind === 'decrease');
  const left = costRows(s);
  const right = yearRows(s);
  const n = Math.max(left.length, right.length, 4);
  const others = (a.specs ?? []).filter((x) => !KNOWN_SPECS.includes(x.name.toLowerCase()));
  return (
    <>
      <OrgHead ctx={ctx} branchCode={a.branchCode} form={fa ? 'Mẫu số S23 - DN' : undefined} />
      <Title title={TITLE[a.kind]} no={a.code} sub={<span className="pd-note">Ngày {date(a.acquiredDate ?? a.startDate)} lập thẻ</span>} />
      <Fields rows={[
        [fa ? 'Căn cứ vào Biên bản giao nhận TSCĐ số' : 'Căn cứ chứng từ ghi tăng số', inc ? <>{inc.docNo || dots()} ngày {date(inc.date)}</> : <>{dots(160)} ngày ...... tháng ...... năm ..........</>],
        [fa ? 'Tên, ký mã hiệu, quy cách (cấp hạng) TSCĐ' : 'Tên, quy cách', <><b>{a.name}</b>{a.categoryName ? ` — ${a.categoryName}` : ''} &nbsp; Số hiệu: <b>{a.code}</b></>],
        ['Nước sản xuất (xây dựng)', <>{spec(a, 'Nước sản xuất') || dots(160)} &nbsp; Năm sản xuất: {spec(a, 'Năm sản xuất') || dots(80)}</>],
        ['Bộ phận quản lý, sử dụng', <>{[ctx.branchName(a.branchCode) || a.branchName, s.departmentName].filter(Boolean).join(' — ')} &nbsp; Năm đưa vào sử dụng: <b>{yearOf(a.startDate)}</b> (bắt đầu {fa ? 'trích khấu hao' : 'phân bổ'} {date(a.startDate)}, {a.usefulLifeMonths} tháng)</>],
        ['Công suất (diện tích thiết kế)', spec(a, 'Công suất', 'Diện tích', 'Công suất (diện tích thiết kế)')],
        ...(others.length ? [['Thông số khác', others.map((x) => `${x.name}: ${x.value}`).join('; ')] as Row] : []),
        ['Số lượng', `${a.quantity} ${a.unit}`.trim()],
        [`Đình chỉ sử dụng ${fa ? 'TSCĐ' : ''} ngày`, a.status === 'stopped' ? <>Tạm ngừng trích{a.note ? ` — Lý do: ${a.note}` : ''}</> : <>...... tháng ...... năm .......... &nbsp; Lý do đình chỉ: {dots(220)}</>],
      ]} />
      <table className="pd-table">
        <thead>
          <tr><th rowSpan={2} style={{ width: 90 }}>Số hiệu chứng từ</th><th colSpan={3}>{fa ? 'Nguyên giá tài sản cố định' : 'Giá trị ghi tăng'}</th><th colSpan={3}>{wear}{fa ? ' tài sản cố định' : ''}</th></tr>
          <tr><th style={{ width: 76 }}>Ngày, tháng, năm</th><th>Diễn giải</th><th style={{ width: 96 }}>{fa ? 'Nguyên giá' : 'Giá trị'}</th><th style={{ width: 84 }}>Năm</th><th style={{ width: 96 }}>{wear}</th><th style={{ width: 96 }}>Cộng dồn</th></tr>
          <tr>{['A', 'B', 'C', '1', '2', '3', '4'].map((x) => <th key={x}>{x}</th>)}</tr>
        </thead>
        <tbody>
          {Array.from({ length: n }, (_, i) => {
            const l = left[i]; const r = right[i];
            return (
              <tr key={i}>
                <td>{l?.docNo ?? ''}</td><td className="c">{l ? date(l.date) : ''}</td><td>{l?.text ?? ''}</td><td className="num">{l ? m(l.amount) : ''}</td>
                <td className="c">{r?.year ?? ''}</td><td className="num">{r ? mb(r.amount) : ''}</td><td className="num">{r ? mb(r.cum) : ''}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot><tr><td colSpan={3} className="c">Cộng</td><td className="num">{m(a.currentCost)}</td><td /><td className="num">{m(right.length ? right[right.length - 1]!.cum : 0)}</td><td /></tr></tfoot>
      </table>
      <div><b>Dụng cụ phụ tùng kèm theo</b></div>
      <table className="pd-table compact">
        <thead><tr><th style={{ width: 36 }}>STT</th><th>Tên, quy cách dụng cụ, phụ tùng</th><th style={{ width: 70 }}>Đơn vị tính</th><th style={{ width: 70 }}>Số lượng</th><th style={{ width: 100 }}>Giá trị</th></tr></thead>
        <tbody>{[1, 2, 3].map((i) => <tr key={i}><td>&nbsp;</td><td /><td /><td /><td /></tr>)}</tbody>
      </table>
      <div className="pd-words">
        Ghi giảm {fa ? 'TSCĐ' : ''} chứng từ số: {dec ? <b>{dec.docNo}</b> : dots()} &nbsp;{a.disposedDate ? `ngày ${date(a.disposedDate)}` : 'ngày ...... tháng ...... năm ..........'}
      </div>
      <div className="pd-words">Lý do giảm: {a.status === 'disposed' ? (dec?.note || a.note || dots(300)) : dots(300)}</div>
      <Signs date={true} items={[{ title: 'Người lập biểu' }, { title: 'Kế toán trưởng' }, { title: 'Giám đốc', note: '(Ký, họ tên, đóng dấu)' }]} />
      <Foot ctx={ctx} text={`${a.code}${a.assetAccount ? ` · TK ${a.assetAccount}` : ''} · TK ${a.depreciationAccount}`} />
    </>
  );
}

/** Biên bản thanh lý TSCĐ — mẫu 02-TSCĐ. */
function DisposalSheet({ s, ctx }: { s: AssetCardSheet; ctx: PrintCtx }) {
  const a = s.asset;
  const dec = s.events.find((e) => e.kind === 'decrease');
  const line = <div className="pd-dots" style={{ margin: '6px 0' }} />;
  return (
    <>
      <OrgHead ctx={ctx} branchCode={a.branchCode} form="Mẫu số 02 - TSCĐ" />
      <Title title="BIÊN BẢN THANH LÝ TSCĐ" date={a.disposedDate ?? undefined} no={dec?.docNo ?? ''} side={<><div>Nợ: ..........</div><div>Có: {a.assetAccount ?? '..........'}</div></>} />
      <div>Căn cứ Quyết định số: {dots()} ngày ...... tháng ...... năm .......... của {dots(200)} về việc thanh lý tài sản cố định.</div>
      <div style={{ marginTop: 6 }}><b>I. Ban thanh lý TSCĐ gồm:</b></div>
      {['Trưởng ban', 'Uỷ viên', 'Uỷ viên'].map((r, i) => <div key={i}>- Ông/Bà {dots(200)} Chức vụ {dots(120)} Đại diện {dots(120)} {r}</div>)}
      <div style={{ marginTop: 6 }}><b>II. Tiến hành thanh lý TSCĐ:</b></div>
      <Fields rows={[
        ['Tên, ký mã hiệu, quy cách (cấp hạng) TSCĐ', <b>{a.name}</b>],
        ['Số hiệu TSCĐ', a.code],
        ['Nước sản xuất (xây dựng)', spec(a, 'Nước sản xuất')],
        ['Năm sản xuất', spec(a, 'Năm sản xuất')],
        ['Năm đưa vào sử dụng', <>{yearOf(a.startDate)} &nbsp; Số thẻ TSCĐ: {a.code}</>],
        ['Nguyên giá TSCĐ', <b>{m(a.currentCost)}</b>],
        ['Giá trị hao mòn đã trích đến thời điểm thanh lý', m(a.accumulated)],
        ['Giá trị còn lại của TSCĐ', <b>{m(a.remaining)}</b>],
      ]} />
      <div style={{ marginTop: 6 }}><b>III. Kết luận của Ban thanh lý TSCĐ:</b></div>
      {a.note || dec?.note ? <div>{dec?.note || a.note}</div> : <>{line}{line}</>}
      <div style={{ marginLeft: '50%' }}><Signs date={true} items={[{ title: 'Trưởng Ban thanh lý' }]} /></div>
      <div style={{ marginTop: 6 }}><b>IV. Kết quả thanh lý TSCĐ:</b></div>
      <div>- Chi phí thanh lý TSCĐ: {dots(140)} (viết bằng chữ) {dots(240)}</div>
      <div>- Giá trị thu hồi: {dots(140)} (viết bằng chữ) {dots(240)}</div>
      <div>- Đã ghi giảm sổ TSCĐ {a.disposedDate ? `ngày ${date(a.disposedDate)}` : 'ngày ...... tháng ...... năm ..........'}{a.remaining ? ` — giá trị còn lại ${m(a.remaining)} (${words(a.remaining)})` : ''}</div>
      <Signs date={true} items={[{ title: 'Giám đốc', note: '(Ký, họ tên, đóng dấu)' }, { title: 'Kế toán trưởng' }]} />
      <Foot ctx={ctx} />
    </>
  );
}

const CARD = (k: AssetKind): PrintTemplate<AssetCardSheet> => ({
  id: 'the', name: k === 'fixed_asset' ? 'Thẻ tài sản cố định S23-DN' : k === 'tool' ? 'Thẻ công cụ dụng cụ' : 'Thẻ chi phí trả trước', paper: 'A4',
  source: k === 'fixed_asset' ? 'rdlcTheTaiSan.rdlc' : 'rdlcTheTaiSan.rdlc (mẫu nội bộ)', render: (s, c) => <CardSheet s={s} ctx={c} />,
});
const DISPOSAL: PrintTemplate<AssetCardSheet> = { id: 'thanhly', name: 'Biên bản thanh lý TSCĐ 02-TSCĐ', paper: 'A4', source: 'mẫu 02-TSCĐ', render: (s, c) => <DisposalSheet s={s} ctx={c} /> };

/** Mẫu in theo loại thẻ; giảm TSCĐ (ACC30) / thẻ đã ghi giảm có thêm biên bản thanh lý (ACC30 đặt lên đầu). */
export function assetTemplates(kind: AssetKind, disposal: 'first' | 'last' | false = false): PrintTemplate<AssetCardSheet>[] {
  if (kind !== 'fixed_asset' || !disposal) return [CARD(kind)];
  return disposal === 'first' ? [DISPOSAL, CARD(kind)] : [CARD(kind), DISPOSAL];
}
