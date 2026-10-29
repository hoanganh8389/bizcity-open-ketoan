/**
 * CƠ SỞ DỮ LIỆU MUA HÀNG (MH13) — trang cho dev mới học hệ thống và để thuyết trình thiết kế CSDL:
 *   Tóm tắt 1 phút (thuật ngữ ↔ bảng ↔ màn) · Sơ đồ · Ví dụ một phiếu (từng dòng ghi vào bảng nào) · Quy trình từng bước ·
 *   ĐVT & tồn kho · Bảng & cột (đọc THẲNG từ PostgreSQL; chế độ thuyết trình ẩn cột kỹ thuật) · JSON · 25 tình huống · Mở rộng.
 * Phần cấu trúc lấy từ /purchase/db-schema nên luôn khớp CSDL thật; phần quy trình / giải thích viết ở đây.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, errorText } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Loading } from '@/components/ui';
import { P } from '../du-lieu';
import '../mua-hang.css';
import './csdl.css';

interface DbColumn { name: string; type: string; nullable: boolean; default: string | null; comment: string | null }
interface DbTable { name: string; layer: 'module' | 'catalog' | 'core'; label: string; purpose: string; comment: string | null; rows: number; columns: DbColumn[]; indexes: { name: string; def: string }[]; triggers: { name: string; timing: string; events: string; fn: string; note: string }[] }
interface Schema { layers: { layer: string; label: string; tables: string[] }[]; tables: DbTable[]; migrations: string[] }
interface Scenario { th: number; title: string; how: string; expected?: string; result?: string; ok?: boolean }

type Tab = 'tom-tat' | 'tong-quan' | 'vi-du' | 'quy-trinh' | 'dvt' | 'bang' | 'json' | 'tinh-huong' | 'mo-rong';
const TABS: [Tab, string][] = [['tom-tat', '① Tóm tắt 1 phút'], ['tong-quan', '② Sơ đồ & nguyên tắc'], ['vi-du', '③ Ví dụ một phiếu'], ['quy-trinh', '④ Quy trình từng bước'], ['dvt', '⑤ ĐVT & tồn kho'], ['bang', '⑥ Bảng & cột'], ['json', '⑦ JSON'], ['tinh-huong', '⑧ 25 tình huống'], ['mo-rong', '⑨ Mở rộng & tối ưu']];
const LAYER_CLS: Record<string, string> = { module: 'db-l-module', catalog: 'db-l-catalog', core: 'db-l-core' };

export function CsdlPage() {
  const [tab, setTab] = useState<Tab>('tom-tat');
  const [table, setTable] = useState('purchase_documents');
  const q = useQuery({ queryKey: ['mua-hang', 'db-schema'], queryFn: () => api.get<Schema>(`${P}/db-schema`) });
  const open = (name: string) => { setTable(name); setTab('bang'); };
  return (
    <>
      <PageHeader title="Cơ sở dữ liệu mua hàng" code="MH13" helpKey="mua-hang-csdl"
        subtitle="Thiết kế CSDL phân hệ Mua hàng: bảng nào, vì sao, quy trình ghi đọc từng bước, ĐVT quy về ĐVT nhỏ nhất, 25 tình huống — cấu trúc đọc thẳng từ CSDL thật" />
      <div className="card" style={{ padding: '6px 12px' }}>
        <div className="tabs" style={{ margin: 0, flexWrap: 'wrap' }}>{TABS.map(([k, l]) => <button key={k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{l}</button>)}</div>
      </div>
      <ErrorBox error={q.error ? errorText(q.error) : null} />
      {tab === 'tom-tat' && <TomTat schema={q.data} onOpen={open} go={setTab} />}
      {tab === 'tong-quan' && <TongQuan schema={q.data} onOpen={open} />}
      {tab === 'vi-du' && <ViDu onOpen={open} />}
      {tab === 'quy-trinh' && <QuyTrinh onOpen={open} />}
      {tab === 'dvt' && <Dvt onOpen={open} />}
      {tab === 'bang' && (q.isLoading ? <Loading /> : q.data ? <Bang schema={q.data} table={table} setTable={setTable} /> : null)}
      {tab === 'json' && <JsonMau />}
      {tab === 'tinh-huong' && <TinhHuong onOpen={open} />}
      {tab === 'mo-rong' && <MoRong schema={q.data} />}
    </>
  );
}

const T = ({ n, onOpen }: { n: string; onOpen?: (n: string) => void }) => <button type="button" className="db-tag mono" onClick={() => onOpen?.(n)} title="Xem cột, chỉ mục, trigger">{n}</button>;
const Panel = ({ title, children }: { title: ReactNode; children: ReactNode }) => <div className="card db-panel"><h3>{title}</h3>{children}</div>;

/* ------------------------------------------------------------------ ① Tóm tắt 1 phút (mở đầu thuyết trình) */

const IDEAS: { n: string; title: string; text: string; tables: string[]; cls: string }[] = [
  { n: '1', title: 'Khai báo một nơi', text: 'NCC, mặt hàng, ĐVT, giá mua — mỗi thứ khai đúng một chỗ, chỗ khác chỉ chọn. Không khai trùng, không lệch số.', tables: ['partners', 'products', 'product_units', 'unit_names', 'supplier_products'], cls: 'blk-blue' },
  { n: '2', title: 'Mọi phiếu mua — một bảng', text: '10 loại phiếu (đơn đặt, nhập, trả, quà, chi phí, thưởng, ứng trước, trả tiền…) chung một bảng: cột để lọc, JSON cho dòng hàng.', tables: ['purchase_documents'], cls: 'blk-green' },
  { n: '3', title: 'Chính sách là dữ liệu', text: '15 loại điều kiện mua (CK đơn, CK theo bảng nhiều mã, KM, thưởng, hạn mức, hạn trả…) chung một bảng. Một chính sách chứa được cả nghìn mã (nhập Excel). Thêm loại mới không cần thêm bảng.', tables: ['purchase_policies'], cls: 'blk-purple' },
  { n: '5', title: 'Hoá đơn NCC giữ nguyên cách NCC ghi', text: 'Hoá đơn NCC lưu riêng, dòng đúng như NCC ghi (mã / tên / ĐVT của họ). Phần mềm nhận diện mã bên mình và HỌC mỗi lần người dùng chọn mã. Phiếu nhập cùng số hoá đơn được đối soát từng dòng.', tables: ['supplier_invoices', 'supplier_invoice_lines', 'supplier_item_aliases'], cls: 'blk-blue' },
  { n: '4', title: 'Duyệt = ghi sổ lõi', text: 'Không có sổ riêng cho mua hàng. Duyệt phiếu là ghi bút toán, công nợ, kho của sổ kế toán chung — báo cáo tự có số.', tables: ['accounting_events', 'ledger_lines', 'debt_items', 'inventory_movements'], cls: 'blk-orange' },
];
const TERMS: [string, string, string][] = [
  ['Nhà cung cấp, nhóm NCC', 'partners, partner_groups', 'MH01 Nhà cung cấp · DM08 Nhóm NCC'],
  ['Mặt hàng + cây Ngành → Nhãn → Nhóm (nhãn khai MỘT chỗ ở đây)', 'products (industry_code, brand_code, group_code), item_classes', 'DM10 Danh mục mặt hàng · DM11 Nhãn / ngành / nhóm'],
  ['Mã hàng: ngành 2 + nhãn 3 + nhóm 1 + số 3 (quà: Q + 3 + 1 + 4), đuôi K / M / Q / T / Z', 'products.sku · item_classes.sku_code (đoạn mã của nhóm)', 'DM10 → chọn nhóm hàng là tự sinh mã, tự điền ngành / nhãn'],
  ['Nhãn của từng dòng phiếu · nhãn chính của phiếu (tự suy, không nhập)', 'purchase_documents.data.lines[].brandCode · brand_code', 'Máy chủ ghi theo danh mục mặt hàng khi lưu phiếu'],
  ['Tên ĐVT (Hộp, Lốc_4, Thùng…)', 'unit_names', 'DM15 Danh mục đơn vị tính'],
  ['ĐVT của mặt hàng + tỉ lệ quy đổi', 'product_units', 'DM10 → thẻ Đơn vị tính'],
  ['Giá mua riêng của sản phẩm', 'supplier_products (NCC trống)', 'DM10 → thẻ Mua hàng'],
  ['Giá mua theo từng NCC, mã bên NCC', 'supplier_products', 'Hồ sơ NCC → Mặt hàng & giá mua'],
  ['Chính sách: CK, KM, thưởng, hạn mức, hạn trả', 'purchase_policies', 'MH04 Chính sách · Hồ sơ NCC'],
  ['Phân cấp chi nhánh cha (kho tổng) → shop, 2 cấp', 'branches.level, branches.parent_id · warehouses', 'MH15 Phân cấp chi nhánh – shop'],
  ['Tồn max / min theo chi nhánh – kho – mã', 'stock_levels', 'MH16 Tồn max · DM10 → thẻ Mua hàng'],
  ['Số ngày đo bán, số ngày đủ hàng, cách chuyển (riêng mã)', 'stock_sku_settings', 'MH16 → nút ⚙ / cột Chuyển xuống shop'],
  ['Phiếu đăng ký tồn max (mã có sẵn / hàng mới × shop)', 'stock_max_requests', 'MH17 Phiếu đăng ký tồn max · API cho POS'],
  ['Công thức đặt hàng của chi nhánh cha', 'order_formulas', 'MH18 Công thức đặt hàng'],
  ['Đề nghị chuyển hàng kho → shop', 'transfer_requests', 'MH19 Chuyển hàng xuống shop · API cho kho / POS'],
  ['Nhập dữ liệu khởi đầu từ Excel: giá mua NCC, cân tồn (phiếu điều chỉnh kho +/−), tồn max', 'supplier_products · accounting_events + inventory_movements (stock_adjustment) · stock_levels', 'MH20 Nhập dữ liệu khởi đầu'],
  ['Mã + tên hàng bên NCC, ghi chú mặt hàng NCC', 'supplier_products.ncc_sku, ncc_name, note', 'Hồ sơ NCC → Mặt hàng & giá mua'],
  ['Chiết khấu riêng từng mã (bảng nghìn mã, nhập Excel)', 'purchase_policies (kind item_discount)', 'Hồ sơ NCC → Chiết khấu & khuyến mại'],
  ['Đơn đặt, phiếu nhập, trả hàng, trả tiền…', 'purchase_documents', 'MH11 Tổng hợp mua hàng (chứng từ mua hàng)'],
  ['Hoá đơn đầu vào của NCC (đầu hoá đơn: mẫu số, ký hiệu, số, ngày, MST, tổng tiền)', 'supplier_invoices', 'MH22 Hoá đơn NCC · Hồ sơ NCC → thẻ Hoá đơn NCC'],
  ['Dòng hoá đơn theo cách NCC ghi + mã / ĐVT bên mình đã nhận diện', 'supplier_invoice_lines', 'MH22 → mở hoá đơn → thẻ Hàng hoá'],
  ['Nhận diện mã hàng NCC (dữ liệu học: NCC ghi gì → mã nào bên mình)', 'supplier_item_aliases', 'MH22 → Bảng nhận diện mã'],
  ['Hợp đồng, CO, CQ, báo giá, ảnh / PDF / XML hoá đơn (tệp)', 'purchase_attachments', 'Hồ sơ NCC / phiếu / hoá đơn NCC → Tệp đính kèm'],
  ['Bút toán Nợ / Có', 'accounting_events, ledger_lines', 'Sổ cái, báo cáo kế toán'],
  ['Công nợ phải trả NCC, hạn trả', 'debt_items, debt_allocations', 'MH05 Hạn mức & công nợ'],
  ['Kho (theo ĐVT nhỏ nhất), lô, hạn dùng', 'inventory_movements', 'Nhập xuất tồn, MH08 Lô & hạn'],
  ['Giá vốn bình quân tháng', 'inventory_costs', 'Tính giá vốn · thẻ Mua hàng của mặt hàng'],
  ['Nhật ký ai làm gì, đổi gì', 'tệp JSONL (ngoài CSDL)', 'MH10 Nhật ký mua hàng'],
];

function TomTat({ schema, onOpen, go }: { schema?: Schema; onOpen: (n: string) => void; go: (t: Tab) => void }) {
  const rows = (n: string) => schema?.tables.find((t) => t.name === n)?.rows;
  return (
    <>
      <div className="db-ideas">
        {IDEAS.map((x) => (
          <section key={x.n} className={`blk ${x.cls}`}>
            <header><div><b>{x.n}. {x.title}</b></div></header>
            <div className="blk-body"><p style={{ margin: '0 0 8px' }}>{x.text}</p>{x.tables.map((t) => <T key={t} n={t} onOpen={onOpen} />)}</div>
          </section>
        ))}
      </div>
      <section className="blk blk-blue" style={{ marginTop: 12 }}>
        <header><div><b>Một câu: ĐVT là trung gian, tồn kho là ĐVT nhỏ nhất</b><span>Đơn / phiếu ghi đúng ĐVT NCC bán (Lốc, Thùng); ghi kho, so tiến độ, so giá đều quy về ĐVT tỉ lệ 1.</span></div>
          <button className="btn btn-sm" onClick={() => go('dvt')}>Xem ⑤ ĐVT & tồn kho →</button></header>
        <div className="blk-body"><div className="db-flow">
          <div><b>Phiếu nhập</b><span>2 Thùng × 258.711</span><small>giữ ĐVT NCC bán</small></div>
          <div><b>product_units</b><span>Thùng = 48 Hộp</span><small>tỉ lệ khai ở mặt hàng</small></div>
          <div><b>inventory_movements</b><span>+96 Hộp</span><small>tồn kho chỉ một đơn vị</small></div>
        </div></div>
      </section>
      <section className="blk blk-green" style={{ marginTop: 12 }}>
        <header><div><b>Thuật ngữ ↔ bảng ↔ màn hình</b><span>Nói với người dùng bằng cột trái, với dev bằng cột giữa.</span></div></header>
        <div className="blk-body">
          <table className="mh-mini">
            <thead><tr><th>Nghiệp vụ</th><th>Bảng</th><th>Màn hình</th><th className="num">Số dòng (đơn vị này)</th></tr></thead>
            <tbody>{TERMS.map(([a, b, c]) => { const first = b.split(/[ ,(]/)[0]!; return <tr key={a}><td><b>{a}</b></td><td>{b.split(', ').map((x) => { const n = x.split(' ')[0]!; return schema?.tables.some((t) => t.name === n) ? <T key={x} n={n} onOpen={onOpen} /> : <span key={x} className="mono">{x} </span>; })}{b.includes('(') && <span className="muted"> {b.slice(b.indexOf('('))}</span>}</td><td>{c}</td><td className="num">{rows(first)?.toLocaleString('vi-VN') ?? ''}</td></tr>; })}</tbody>
          </table>
        </div>
      </section>
      <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Thứ tự thuyết trình gợi ý: ① Tóm tắt → ② Sơ đồ → ③ Ví dụ một phiếu → ⑧ 25 tình huống. Dev mới đọc thêm ④ ⑤ ⑥ ⑨.</div>
    </>
  );
}

/* ------------------------------------------------------------------ ③ Ví dụ một phiếu */

const STORY: { step: string; who: string; rows: { table: string; text: string }[] }[] = [
  { step: '1. Khai báo (một lần)', who: 'Kế toán / mua hàng', rows: [
    { table: 'product_units', text: 'Sữa tươi TH 110ml (130181002): Hộp ×1 · Lốc ×4 · Thùng ×48 — Thùng là ĐVT mua mặc định' },
    { table: 'supplier_products', text: 'Vinh Châu (NC100227) bán 130181002 theo Thùng, 258.711đ chưa thuế, mã bên NCC TH-ST110-D' },
    { table: 'purchase_policies', text: 'NC100227-HANMUC: hạn mức 600 triệu · NC100227-HANTT: 10 ngày làm việc từ ngày nhận đủ hàng & hồ sơ · NC100227-CKMA: bảng chiết khấu theo mã (tháng 11)' },
    { table: 'products', text: 'Nhãn khai ở mặt hàng: 130181002 thuộc nhãn TH (cây Ngành → Nhãn → Nhóm). Phiếu mua tự lấy nhãn theo từng dòng; NCC không khai nhãn riêng' },
    { table: 'purchase_policies', text: 'NC100227-KM: mua 10 tặng 1 (nhãn TH) → lập phiếu là phần mềm tự thêm dòng quà, đổi số lượng là quà tự chạy theo' },
  ] },
  { step: '2. Lập đơn đặt 10 Thùng', who: 'Phân tích đặt hàng MH02 (theo tồn max + công thức) hoặc gõ tay', rows: [
    { table: 'purchase_documents', text: 'kind = order, doc_no DH…, partner_code NC100227 · data.lines: [{ sku 130181002, unit "Thùng", qty 10, price 258.711 }]' },
  ] },
  { step: '3. Nhận hàng lần 1: 5 Thùng', who: 'Mở đơn → "Lập phiếu nhập từ đơn" (chép phần còn lại)', rows: [
    { table: 'purchase_documents', text: 'kind = receipt, ref_ids = [id đơn] · data.lines: 5 Thùng, lô, hạn dùng · data.checks: "Giao một phần — còn 5 Thùng (240 Hộp)"' },
  ] },
  { step: '4. Duyệt phiếu nhập (ghi sổ)', who: 'Nút "Duyệt (ghi sổ)"', rows: [
    { table: 'accounting_events', text: '1 chứng từ kế toán (bản duyệt) — purchase_documents.links giữ đường nối' },
    { table: 'ledger_lines', text: 'Nợ 1561 1.293.555 · Nợ 1331 103.484 · Có 331 1.397.039 (cân Nợ = Có, trigger kiểm)' },
    { table: 'debt_items', text: 'Nợ NCC NC100227: 1.397.039, hạn trả = 10 ngày làm việc (trừ T7, CN, lễ)' },
    { table: 'inventory_movements', text: '+240 Hộp (5 Thùng × 48), 1.293.555đ, lô + hạn dùng — ĐVT nhỏ nhất' },
  ] },
  { step: '5. Trả tiền NCC', who: 'Chứng từ → Trả tiền (gợi ý khoản đến hạn)', rows: [
    { table: 'purchase_documents', text: 'kind = payment, số tiền 1.397.039' },
    { table: 'ledger_lines', text: 'Nợ 331 / Có 1121 (trả đúng hạn có CKTT thì thêm Có 515)' },
    { table: 'debt_allocations', text: 'Đối trừ khoản nợ của phiếu nhập — hết nợ' },
  ] },
  { step: '6. Cuối tháng', who: 'Tính giá vốn', rows: [
    { table: 'inventory_costs', text: 'Giá vốn bình quân tháng của 130181002 (theo Hộp) — so với giá mua riêng của sản phẩm ở thẻ Mua hàng' },
  ] },
];

function ViDu({ onOpen }: { onOpen: (n: string) => void }) {
  return (
    <section className="blk blk-green" style={{ marginTop: 10 }}>
      <header><div><b>Ví dụ: Vinh Châu giao Sữa tươi TH 110ml</b><span>Mỗi bước phần mềm ghi dòng nào vào bảng nào (số liệu minh hoạ đúng cách tính của phần mềm).</span></div></header>
      <div className="blk-body">
        <table className="mh-mini db-story">
          <thead><tr><th>Bước</th><th>Ai / ở đâu</th><th>Bảng</th><th>Ghi gì</th></tr></thead>
          <tbody>
            {STORY.flatMap((s) => s.rows.map((r, i) => (
              <tr key={s.step + r.table + i} className={i === 0 ? 'db-story-first' : ''}>
                {i === 0 && <td rowSpan={s.rows.length}><b>{s.step}</b></td>}
                {i === 0 && <td rowSpan={s.rows.length} className="muted">{s.who}</td>}
                <td><T n={r.table} onOpen={onOpen} /></td>
                <td style={{ whiteSpace: 'normal' }}>{r.text}</td>
              </tr>
            )))}
          </tbody>
        </table>
        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Bỏ duyệt: không xoá dòng sổ nào — phần mềm ghi bút toán số âm để đảo, phiếu về nháp, lịch sử còn nguyên. Mọi thao tác ghi thêm một dòng vào nhật ký JSONL (ai, lúc nào, đổi gì).</div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ Tổng quan & sơ đồ */

function TongQuan({ schema, onOpen }: { schema?: Schema; onOpen: (n: string) => void }) {
  const rows = (n: string) => schema?.tables.find((t) => t.name === n)?.rows;
  return (
    <>
      <div className="db-kpis">
        <div className="card kpi"><div className="label">Bảng riêng của phân hệ</div><div className="value">{schema?.layers.find((l) => l.layer === 'module')?.tables.length ?? '…'}</div><div className="hint">chứng từ · chính sách · giá mua · hoá đơn NCC + nhận diện mã · tệp · tồn max, công thức, chuyển hàng</div></div>
        <div className="card kpi"><div className="label">Danh mục dùng chung</div><div className="value">8</div><div className="hint">NCC, nhóm NCC, mặt hàng, ĐVT, danh mục ĐVT, chi nhánh, kho, thuế</div></div>
        <div className="card kpi"><div className="label">Sổ lõi được ghi khi duyệt</div><div className="value">8</div><div className="hint">không có sổ riêng cho mua hàng — báo cáo kế toán tự có số</div></div>
        <div className="card kpi"><div className="label">Chứng từ mua hàng (đơn vị này)</div><div className="value">{rows('purchase_documents')?.toLocaleString('vi-VN') ?? '…'}</div><div className="hint">{rows('purchase_policies') ?? '…'} chính sách · {rows('supplier_products') ?? '…'} dòng giá mua</div></div>
      </div>
      <Panel title="Sơ đồ quan hệ — bấm tên bảng để xem cột">
        <Diagram onOpen={onOpen} />
        <div className="db-legend"><span className="db-l-catalog">Danh mục dùng chung</span><span className="db-l-module">Bảng riêng Mua hàng</span><span className="db-l-core">Sổ lõi kế toán</span><span className="db-l-file">Tệp ngoài CSDL</span></div>
      </Panel>
      <Panel title="Năm nguyên tắc thiết kế">
        <ol className="db-list">
          <li><b>Dùng lại lõi, không làm sổ riêng.</b> Duyệt phiếu = đưa chứng từ vào <T n="accounting_events" onOpen={onOpen} /> → bút toán <T n="ledger_lines" onOpen={onOpen} />, công nợ <T n="debt_items" onOpen={onOpen} />, kho <T n="inventory_movements" onOpen={onOpen} />. Sổ cái, công nợ, nhập xuất tồn, bảng kê thuế tự có số liệu mua hàng.</li>
          <li><b>Cột cho thứ cần lọc / tổng hợp, JSON cho thứ hay đổi.</b> <T n="purchase_documents" onOpen={onOpen} /> có cột loại, trạng thái, ngày, NCC, nhãn, chi nhánh, hoá đơn, hạn, tổng tiền; dòng hàng, điều khoản, lịch trả, kết quả kiểm tra nằm trong <code>data jsonb</code> (tra được bằng chỉ mục GIN).</li>
          <li><b>Một bộ máy chính sách thay cho nhiều bảng cấu hình.</b> 15 loại (CK đơn, CK theo bảng nhiều mã, bậc SL, KM, CKTT, thưởng ×3, hạn mức, điều khoản, chỉ tiêu, lô, ngân sách quà, hợp đồng, min–max) cùng nằm ở <T n="purchase_policies" onOpen={onOpen} />: phạm vi + hiệu lực + <code>rule jsonb</code> kiểm khuôn theo loại. Thêm loại = thêm khuôn, không thêm bảng.</li>
          <li><b>Mỗi thứ khai một nơi.</b> NCC ở <T n="partners" onOpen={onOpen} />; tên ĐVT ở <T n="unit_names" onOpen={onOpen} />; tỉ lệ ĐVT ở <T n="product_units" onOpen={onOpen} />; NCC bán mã nào / giá bao nhiêu ở <T n="supplier_products" onOpen={onOpen} />. Chỗ khác chỉ chọn.</li>
          <li><b>ĐVT là trung gian — cuối cùng quy về ĐVT nhỏ nhất.</b> Phiếu ghi ĐVT người dùng chọn (Thùng); so tiến độ đơn, so giá, ghi kho đều quy về ĐVT tỉ lệ 1 (Hộp). Tồn kho chỉ có một đơn vị.</li>
        </ol>
        <div className="muted" style={{ fontSize: 12 }}>Nhật ký (ai làm gì, đổi gì từ gì sang gì) ghi tệp JSONL theo tháng trên ổ dữ liệu ERP — chỉ thêm, đọc theo thời gian, không phình CSDL. Tệp đính kèm cũng nằm trên ổ, CSDL chỉ giữ đường dẫn.</div>
      </Panel>
    </>
  );
}

/** Sơ đồ quan hệ vẽ tay (SVG, theo màu giao diện sáng / tối). */
function Diagram({ onOpen }: { onOpen: (n: string) => void }) {
  type B = { n: string; x: number; y: number; w?: number; l: string; sub: string; file?: boolean };
  const boxes: B[] = [
    { n: 'partners', x: 20, y: 30, l: 'catalog', sub: 'NCC (+ nhóm partner_groups)' },
    { n: 'unit_names', x: 20, y: 150, l: 'catalog', sub: 'Tên ĐVT: Hộp, Lốc_4, Thùng' },
    { n: 'products', x: 20, y: 270, l: 'catalog', sub: 'Mặt hàng (ĐVT nhỏ nhất)' },
    { n: 'product_units', x: 20, y: 390, l: 'catalog', sub: 'ĐVT × tỉ lệ (Thùng = 48)' },
    { n: 'supplier_products', x: 330, y: 30, w: 220, l: 'module', sub: 'NCC × mã × ĐVT → giá' },
    { n: 'purchase_policies', x: 580, y: 30, w: 220, l: 'module', sub: '15 loại (rule jsonb)' },
    { n: 'purchase_documents', x: 400, y: 200, l: 'module', sub: '10 loại phiếu (data jsonb)' },
    { n: 'purchase_attachments', x: 400, y: 340, l: 'module', sub: 'Hợp đồng, CO, CQ… (đường dẫn)' },
    { n: 'JSONL nhật ký', x: 400, y: 470, l: 'file', sub: 'ổ dữ liệu ERP, theo tháng', file: true },
    { n: 'accounting_events', x: 900, y: 30, l: 'core', sub: 'Chứng từ kế toán (bản duyệt)' },
    { n: 'ledger_lines', x: 900, y: 150, l: 'core', sub: 'Bút toán Nợ / Có (chỉ thêm)' },
    { n: 'debt_items', x: 900, y: 270, l: 'core', sub: 'Công nợ NCC, hạn, lịch trả' },
    { n: 'inventory_movements', x: 900, y: 390, l: 'core', sub: 'Kho theo ĐVT nhỏ nhất, lô, hạn' },
    { n: 'supplier_item_aliases', x: 20, y: 540, l: 'module', sub: 'NCC ghi (mã / tên / ĐVT) → mã mình' },
    { n: 'supplier_invoices', x: 400, y: 590, l: 'module', sub: 'Hoá đơn NCC (+ supplier_invoice_lines)' },
  ];
  const H = 62;
  // [đường vẽ, nhãn, x nhãn, y nhãn, căn nhãn]
  const edges: [string, string, number, number, 'start' | 'middle' | 'end'][] = [
    ['M145,212 L145,270', 'trigger: tên ĐVT mới tự vào danh mục', 155, 246, 'start'],
    ['M145,332 L145,390', 'sku', 155, 366, 'start'],
    ['M270,61 L330,61', 'partner_code', 300, 52, 'middle'],
    ['M260,30 C300,4 560,4 600,30', 'scope.partnerCode', 430, 12, 'middle'],
    ['M270,405 C320,405 330,200 380,92', 'ĐVT phải có ở mặt hàng', 282, 185, 'start'],
    ['M270,425 C340,425 340,240 400,240', 'SL × tỉ lệ → ĐVT nhỏ nhất', 282, 330, 'start'],
    ['M440,92 L440,200', 'giá gợi ý / cảnh báo lệch', 448, 150, 'start'],
    ['M690,92 C690,150 620,150 620,200', 'tự áp CK, KM, hạn trả', 650, 170, 'start'],
    ['M650,212 C780,212 780,61 900,61', 'duyệt → chứng từ kế toán (links)', 800, 128, 'middle'],
    ['M650,224 C790,224 790,181 900,181', 'Nợ 1561 / 1331 · Có 331', 892, 172, 'end'],
    ['M650,238 C790,238 790,301 900,301', 'công nợ, hạn trả, lịch trả', 892, 292, 'end'],
    ['M650,252 C790,252 790,421 900,421', 'SL × tỉ lệ, lô, hạn dùng', 892, 412, 'end'],
    ['M525,262 L525,340', 'owner_id', 535, 305, 'start'],
    ['M525,402 L525,470', 'mọi thay đổi ghi nhật ký', 535, 440, 'start'],
    ['M145,452 L145,540', 'mã + ĐVT bên mình', 155, 500, 'start'],
    ['M270,571 C330,571 340,621 400,621', 'nhận diện / học mã', 280, 612, 'start'],
    ['M650,612 C840,612 840,262 650,250', 'đối soát: NCC + số hoá đơn', 770, 575, 'start'],
  ];
  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox="0 0 1170 670" className="db-diagram" role="img" aria-label="Sơ đồ quan hệ các bảng mua hàng">
        <defs><marker id="db-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" className="db-arrow" /></marker></defs>
        {edges.map(([d]) => <path key={d} d={d} className="db-edge" markerEnd="url(#db-arrow)" />)}
        {boxes.map((b) => (
          <g key={b.n} className={`db-box ${LAYER_CLS[b.l] ?? 'db-l-file'}`} onClick={() => !b.file && onOpen(b.n)} style={{ cursor: b.file ? 'default' : 'pointer' }}>
            <rect x={b.x} y={b.y} width={b.w ?? 250} height={H} rx={8} />
            <text x={b.x + 12} y={b.y + 24} className="db-box-title">{b.n}</text>
            <text x={b.x + 12} y={b.y + 45} className="db-box-sub">{b.sub}</text>
          </g>
        ))}
        {edges.map(([d, label, x, y, anchor]) => <text key={`t${d}`} x={x} y={y} className="db-edge-label" textAnchor={anchor}>{label}</text>)}
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ Quy trình từng bước */

const STEPS: { title: string; screen: string; reads: string[]; writes: string[]; auto: string[]; rules: string[] }[] = [
  { title: '1. Khai báo danh mục', screen: 'DM13 / form NCC · DM08 Nhóm NCC · DM10 Mặt hàng (thẻ ĐVT) · DM15 Danh mục ĐVT', reads: ['unit_names'], writes: ['partners', 'partner_groups', 'products', 'product_units', 'unit_names'],
    auto: ['Chọn nhóm sản phẩm (cây ngành → nhãn → nhóm) → tự sinh mã hàng (ngành 2 + nhãn 3 + nhóm 1 + số 3; quà Q + 3 + 1 + 4; đuôi K/M/Q/T/Z…) và tự điền ngành, nhãn; đoạn mã của nhóm chưa khai thì suy từ mã đang có', 'Đối tượng chọn vai trò Nhà cung cấp / Khách hàng (tích một hoặc cả hai — also_kinds); NCC dùng một bộ tên / MST / địa chỉ chính thức như trên hoá đơn', 'Tên ĐVT mới khai ở mặt hàng → CSDL tự thêm vào unit_names (trigger, mọi đường ghi)', 'Gõ "hộp" → lưu thành "Hộp" theo đúng danh mục', 'ĐVT tỉ lệ 1 tự thành ĐVT của mặt hàng (products.unit)'],
    rules: ['Mỗi mặt hàng đúng một ĐVT tỉ lệ 1, không trùng tên (kể cả khác hoa thường), tỉ lệ > 0', 'Tối đa một ĐVT bán chính, một ĐVT mua mặc định', 'Tên ĐVT đang dùng không đổi tên / không xoá (phiếu cũ ghi theo tên)'] },
  { title: '2. Giá mua: riêng của sản phẩm + theo từng NCC', screen: 'Mặt hàng → thẻ "Mua hàng" (giá mua riêng của sản phẩm = dòng NCC trống) · Hồ sơ NCC → thẻ "Mặt hàng & giá mua" (giá từng NCC)', reads: ['product_units', 'purchase_documents'], writes: ['supplier_products'],
    auto: ['"Khai N mã đã mua" lấy mã từ lịch sử đơn / phiếu của NCC', 'Nhập Excel: hướng dẫn cột → xem trước (mã / ĐVT sai báo đỏ) → đưa vào bảng'],
    rules: ['ĐVT phải có ở product_units của mã', 'Một dòng / NCC × mã × ĐVT × ngày hiệu lực (chỉ mục duy nhất); trùng trong một lần lưu báo ngay', 'Đến ngày ≥ Từ ngày; "Đặt theo ĐVT này" chỉ dòng có NCC', 'Đổi giá theo đợt = thêm dòng hiệu lực mới'] },
  { title: '3. Chính sách của NCC', screen: 'Hồ sơ NCC → Hợp đồng & điều khoản · Chiết khấu & KM · Thưởng', reads: ['partners'], writes: ['purchase_policies'],
    auto: ['Báo cáo chi tiết chính sách (MH14) trải mỗi chính sách ra từng dòng ưu đãi (từng mã, bậc, giai đoạn, chi nhánh) để xuất Excel', 'Mẫu nhanh điền sẵn quy tắc, mã tự đặt <mã NCC>-<loại>', 'Câu "Phần mềm sẽ hiểu là…" đọc lại quy tắc bằng chữ', 'Chiết khấu theo mã: một chính sách chứa cả bảng nghìn mã — thêm từ danh mục (bấm dòng là thêm), dán, nhập / xuất Excel có file mẫu'],
    rules: ['rule kiểm khuôn theo loại (zod) — sai khuôn 400', 'Mã chính sách duy nhất', 'Đã áp vào phiếu thì không xoá được, chỉ tắt (tra lại cách tính phiếu cũ)'] },
  { title: '4a. Phân cấp + tồn max (gốc của chia hàng và đặt mua)', screen: 'MH15 Phân cấp · MH16 Tồn max · MH17 Phiếu đăng ký tồn max (2 lần / tháng, POS gửi qua API) · MH18 Công thức', reads: ['branches', 'warehouses', 'inventory_movements', 'stock_sku_settings', 'order_formulas'], writes: ['branches', 'stock_levels', 'stock_sku_settings', 'stock_max_requests', 'order_formulas'],
    auto: ['Tự xếp phân cấp theo mã (xx000 = chi nhánh cha, cùng 2 số đầu = shop)', 'Gợi ý max shop = bán / ngày (đo N ngày, mặc định 7) × số ngày đủ hàng; max kho = tổng max shop + % dự phòng', 'Phiếu đăng ký: điền sẵn mọi mã của shop + gợi ý; lệch nhỏ thì duyệt tự động; duyệt = ghi stock_levels', 'Hàng mới chưa có mã: bảng mặt hàng × shop, gắn mã sau thì ghi max'],
    rules: ['Chỉ 2 cấp: chi nhánh cha không có cha, shop phải có cha là chi nhánh cha', 'Max theo (chi nhánh, kho, mã); kho trống = kho mặc định', 'Mã phải có trong danh mục mới ghi max; min ≤ max'] },
  { title: '4b. Chuyển hàng xuống shop', screen: 'MH19 Chuyển hàng xuống shop', reads: ['stock_levels', 'inventory_movements', 'accounting_events', 'stock_sku_settings', 'transfer_requests'], writes: ['transfer_requests'],
    auto: ['Thiếu = max shop − tồn shop − đi đường đến shop − đề nghị đã chốt chưa làm', 'Làm tròn thùng: tự động (≥ nửa thùng lên thùng) / nguyên thùng / lẻ', 'Kho không đủ → ưu tiên shop thiếu nhiều nhất so với max', 'Chốt → mỗi shop một đề nghị DNC…; kho / POS quét qua API'],
    rules: ['Đi đường = xuất − đã nhận theo cặp phiếu chuyển (đầu đi trừ tồn ngay khi xuất)', 'Không chia quá tồn của kho xuất'] },
  { title: '4c. Phân tích đặt hàng → đơn đặt gửi NCC', screen: 'MH02 Phân tích đặt hàng · Chứng từ → Đơn đặt hàng (mẫu Excel NCC)', reads: ['order_formulas', 'stock_levels', 'inventory_movements', 'purchase_documents', 'supplier_products', 'product_units', 'purchase_policies'], writes: ['purchase_documents'],
    auto: ['SL cần nhập theo công thức của chi nhánh cha (thành phần bật / tắt, dấu, hệ số, số ngày)', 'Nhóm theo nhãn + NCC; gợi ý mua làm tròn thùng (xuống / lên)', 'Lập đơn: mỗi NCC một đơn, dòng mang quy cách, ghi chú NCC, số liệu tồn', 'Xuất Excel đúng mẫu NCC (ô cam / vàng); dòng hàng mới chưa có mã → gắn mã ở phiếu nhập, ghi ngược vào đơn'],
    rules: ['"Chưa nhập kho" = phần còn lại của mọi đơn đặt đang mở, mọi NCC (không đặt trùng)', 'Đơn đặt chưa phát sinh công nợ: không có hạn trả / CKTT / hạch toán — tính khi nhập hàng', 'Phiếu nhập còn dòng chưa có mã thì chặn duyệt'] },
  { title: '5. Nhập kho (từ đơn hoặc độc lập)', screen: 'Chứng từ → Phiếu nhập kho / Lập phiếu nhập từ đơn / Nhập Excel', reads: ['purchase_documents', 'product_units'], writes: ['purchase_documents'],
    auto: ['Chép phần CÒN LẠI của đơn (giao nhiều lần), hàng tặng theo tỷ lệ', 'Giao một phần là bình thường (thông tin), nhận thừa / lệch giá thì cảnh báo — so theo ĐVT nhỏ nhất', 'Đổi mã K/M/Q/T so với đơn → phải duyệt'],
    rules: ['ref_ids nối phiếu với đơn; số hoá đơn + ký hiệu + MST duy nhất (chỉ mục)'] },
  { title: '5b. Hoá đơn NCC → nhận diện mã → đối soát phiếu nhập', screen: 'MH22 Hoá đơn đầu vào của NCC (Nhập Excel · Quét ảnh / PDF qua AI · Thêm tay) · Hồ sơ NCC → thẻ Hoá đơn NCC · Phiếu nhập → khung Kiểm tra', reads: ['supplier_item_aliases', 'supplier_products', 'products', 'product_units', 'purchase_documents', 'purchase_policies'], writes: ['supplier_invoices', 'supplier_invoice_lines', 'supplier_item_aliases', 'purchase_attachments'],
    auto: ['Đọc hoá đơn (Excel gom theo ký hiệu + số; AI trả khuôn chung) → chuẩn hoá: giá gồm thuế quy về chưa thuế, dòng giá 0 = hàng tặng, tự cộng tổng nếu thiếu', 'Nhận diện mã theo thứ tự tin cậy: đã học (supplier_item_aliases, theo mã NCC rồi theo tên) → khai mặt hàng NCC (supplier_products.ncc_sku / ncc_name) → NCC ghi đúng mã mình → chỉ GỢI Ý (giống tên, cùng quy cách 400g / 800g, mặt hàng NCC có bán được cộng điểm)', 'Người dùng chọn mã cho dòng chưa nhận diện → lưu là HỌC (ghi / cộng số lần gặp ở supplier_item_aliases)', 'ĐVT bên mình = ĐVT đã khai trùng tên ĐVT NCC ghi, không có thì ĐVT mua mặc định', 'Phiếu nhập có số hoá đơn trùng hoá đơn đã lưu → đối soát từng mã: SL quy ĐVT nhỏ nhất, giá chưa thuế sau CK, thuế suất, tổng thanh toán (cộng mọi phiếu cùng hoá đơn)', '"Lập phiếu nhập từ hoá đơn" → phiếu nhập điền sẵn dòng, giá, thuế, số / ngày hoá đơn'],
    rules: ['Một hoá đơn còn hiệu lực / NCC × ký hiệu × số (bỏ số 0 đầu) — chỉ mục duy nhất', 'Mã / ĐVT bên mình phải có trong danh mục; dòng chưa nhận diện vẫn lưu được (chọn sau)', 'Hoá đơn chỉ huỷ (bắt buộc lý do), không xoá; huỷ xong số được dùng lại', 'Lệch hoá đơn là cảnh báo (inv_diff), không chặn duyệt phiếu nhập', 'Xoá một cách ghi đã học: nhật ký JSONL ghi đủ nội dung'] },
  { title: '6. Phân tích mỗi lần sửa phiếu', screen: 'Bảng "Trợ lý mua hàng" cạnh form', reads: ['purchase_policies', 'supplier_products', 'product_units', 'debt_items', 'purchase_documents'], writes: [],
    auto: ['Khuyến mại tự áp khi bảng hàng đổi: quà mua X tặng Y tự thêm / chỉnh / bỏ dòng (giftPlan, syncGifts); bảng khuyến mại báo đã áp · cần xem (thiếu / thừa quà) · mua thêm để được', 'Mọi giá gợi ý / so sánh quy về đúng loại giá của phiếu (gồm hoặc chưa VAT) và ĐVT của dòng; lệch quá mức chung ở Cài đặt (mặc định 2%) thì cảnh báo', 'Tự áp CK đơn, CK theo bảng mã, bậc SL, KM, CKTT, hạn trả (ngày làm việc, trừ lễ), lịch nhiều đợt', 'Nhãn theo mặt hàng từng dòng (không chọn tay); hạn mức / thưởng theo nhãn tính theo phần nhãn trong phiếu', 'Khuyến mại tự áp khi bảng hàng đổi: tự thêm / chỉnh / bỏ quà; bảng khuyến mại báo đã áp · cần xem · mua thêm để được', 'Giá lệch giá cố định (quy đổi ĐVT) / lần gần nhất', 'Hạn mức NCC / nhãn / chi nhánh (nợ theo sổ + đơn đang mở)', 'Lô, hạn dùng, cận date; xem trước bút toán'],
    rules: ['Chỉ đọc chứng từ liên quan (cùng NCC / nhãn / phiếu gắn) — không quét cả bảng'] },
  { title: '7. Duyệt = ghi sổ', screen: 'Nút "Duyệt (ghi sổ)" / "Duyệt ngoại lệ"', reads: ['purchase_documents', 'product_units'], writes: ['accounting_events', 'ledger_entries', 'ledger_lines', 'debt_items', 'inventory_movements', 'document_sequences', 'purchase_documents'],
    auto: ['Bút toán Nợ 1561 / 1331, Có 331 (tài khoản theo cấu hình)', 'Công nợ với hạn trả, lịch nhiều đợt', 'Kho: SL × tỉ lệ → ĐVT nhỏ nhất, kèm lô / hạn dùng; quà vào kho quà', 'purchase_documents.links giữ chứng từ kế toán đã sinh; revision tăng mỗi lần duyệt lại'],
    rules: ['Còn cảnh báo chặn (vượt hạn mức, trùng hoá đơn…) thì 409; duyệt ngoại lệ cần quyền + lý do (nhật ký)', 'Sổ cái chỉ thêm; sai thì bỏ duyệt = ghi số âm rồi ghi lại'] },
  { title: '8. Trả tiền NCC', screen: 'Chứng từ → Trả tiền (gợi ý khoản đến hạn)', reads: ['debt_items'], writes: ['accounting_events', 'ledger_lines', 'debt_allocations'],
    auto: ['Đối trừ FIFO theo hạn; trả đúng hạn tự tính CKTT (Nợ 331 / Có 515); ứng trước tự đối trừ khi nhập hàng'], rules: ['Trả quá hạn không được CKTT'] },
  { title: '9. Cuối kỳ', screen: 'MH06 Tính thưởng · MH07 Phân bổ & giá vốn thực tế', reads: ['purchase_documents', 'purchase_policies', 'inventory_movements'], writes: ['purchase_documents', 'accounting_events', 'ledger_lines', 'inventory_movements'],
    auto: ['Thưởng doanh số / chỉ tiêu / giai đoạn → phiếu thưởng, phân bổ theo mã', 'Chi phí mua (vận chuyển…) phân bổ theo giá trị / SL → dòng kho SL 0 chỉ tiền (cost_adjust) để giá vốn bình quân tự nhận'], rules: ['Không tính trùng một kỳ thưởng'] },
];

function QuyTrinh({ onOpen }: { onOpen: (n: string) => void }) {
  return (
    <>
      {STEPS.map((s) => (
        <Panel key={s.title} title={s.title}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Màn: {s.screen}</div>
          <div className="db-step">
            <div><h4>Đọc</h4>{s.reads.length ? s.reads.map((n) => <T key={n} n={n} onOpen={onOpen} />) : <span className="muted">—</span>}</div>
            <div><h4>Ghi</h4>{s.writes.length ? s.writes.map((n) => <T key={n} n={n} onOpen={onOpen} />) : <span className="muted">không ghi (chỉ tính)</span>}</div>
            <div><h4>Phần mềm tự làm</h4><ul>{s.auto.map((x) => <li key={x}>{x}</li>)}</ul></div>
            <div><h4>Luật / kiểm tra</h4><ul>{s.rules.map((x) => <li key={x}>{x}</li>)}</ul></div>
          </div>
        </Panel>
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ ĐVT & tồn kho */

function Dvt({ onOpen }: { onOpen: (n: string) => void }) {
  return (
    <>
      <Panel title="ĐVT là trung gian — tồn kho chỉ có ĐVT nhỏ nhất">
        <div className="db-flow">
          <div><b>unit_names</b><span>Tên: Hộp · Lốc · Lốc_4 · Thùng</span><small>chỉ là tên, không có tỉ lệ</small></div>
          <div><b>product_units</b><span>Sữa TH 110ml: Hộp 1 · Lốc 4 · Thùng 48</span><small>tỉ lệ theo từng mặt hàng, đúng 1 dòng tỉ lệ 1</small></div>
          <div><b>supplier_products</b><span>Vinh Châu bán theo Thùng, 258.711đ / Thùng</span><small>đặt theo ĐVT Thùng</small></div>
          <div><b>purchase_documents</b><span>Phiếu nhập: 2 Thùng × 258.711</span><small>giữ ĐVT người dùng chọn</small></div>
          <div><b>inventory_movements</b><span>+96 Hộp, 517.422đ</span><small>2 × 48 = 96 — ĐVT nhỏ nhất</small></div>
        </div>
      </Panel>
      <Panel title="Chỗ nào quy đổi">
        <table className="mh-mini">
          <thead><tr><th>Việc</th><th>Cách quy</th><th>Ví dụ</th></tr></thead>
          <tbody>
            <tr><td>Ghi kho khi duyệt</td><td>SL × tỉ lệ ĐVT dòng → ĐVT nhỏ nhất; đơn giá ÷ tỉ lệ</td><td>2 Thùng → 96 Hộp</td></tr>
            <tr><td>Tiến độ đơn ↔ phiếu nhập</td><td>Cộng mọi phiếu nhập theo ĐVT nhỏ nhất, hiện lại theo ĐVT của dòng đơn</td><td>Đặt 10 Thùng, nhận 240 Hộp + 2 Thùng → còn 3 Thùng (144 Hộp)</td></tr>
            <tr><td>Giá cố định</td><td>Giá khai theo ĐVT A, phiếu ĐVT B: giá ÷ tỉ lệ A × tỉ lệ B (chỉ khi cả hai ĐVT có ở mặt hàng)</td><td>258.711 / Thùng → 5.389,81 / Hộp</td></tr>
            <tr><td>Đối chiếu giá đơn ↔ hoá đơn</td><td>Đơn giá hoá đơn quy về ĐVT của dòng đơn</td><td>5.200 / Hộp = 249.600 / Thùng</td></tr>
            <tr><td>Phân tích đặt hàng</td><td>Tồn, max, đi đường, đang đặt theo ĐVT nhỏ nhất; số đặt ÷ tỉ lệ ĐVT mua, làm tròn thùng</td><td>Cần 14.976 Hộp → 312 Thùng</td></tr>
            <tr><td>Đổi ĐVT trên dòng phiếu</td><td>Đơn giá quy theo tỉ lệ</td><td>Thùng 258.711 → Hộp 5.390</td></tr>
          </tbody>
        </table>
        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Hàm dùng chung (máy chủ + giao diện): <code>ratioOf</code>, <code>priceFor</code>, <code>defaultUnitFor</code> (packages/contracts/src/mua-hang/gia-mua.ts), <code>orderProgress</code> / <code>ratioIn</code> (dat-hang.ts), <code>toBase</code> (apps/api/src/phan-he/mua-hang/posting.ts). Bảng: <T n="unit_names" onOpen={onOpen} /> <T n="product_units" onOpen={onOpen} /> <T n="inventory_movements" onOpen={onOpen} /></div>
      </Panel>
      <Panel title="ĐVT mặc định khi lập phiếu (thứ tự ưu tiên)">
        <ol className="db-list">
          <li>Dòng của đúng NCC tích "Đặt theo ĐVT này" (<code>supplier_products.is_default_unit</code>)</li>
          <li>NCC chỉ khai một ĐVT cho mã → ĐVT đó</li>
          <li>ĐVT "Mua mặc định" của mặt hàng (<code>product_units.is_purchase_default</code>)</li>
          <li>ĐVT bán chính (<code>product_units.is_default</code>) → ĐVT nhỏ nhất</li>
        </ol>
      </Panel>
    </>
  );
}

/* ------------------------------------------------------------------ Bảng & cột */

function Bang({ schema, table, setTable }: { schema: Schema; table: string; setTable: (n: string) => void }) {
  const [find, setFind] = useState('');
  // Chế độ thuyết trình: chỉ tên cột + ý nghĩa (ẩn kiểu, bắt buộc, mặc định, chỉ mục, trigger).
  const [present, setPresent] = useState(true);
  const t = schema.tables.find((x) => x.name === table) ?? schema.tables[0]!;
  const cols = t.columns.filter((c) => !find || `${c.name} ${c.comment ?? ''}`.toLowerCase().includes(find.toLowerCase()));
  return (
    <div className="db-split">
      <div className="card db-side">
        {schema.layers.map((l) => (
          <div key={l.layer}>
            <div className={`db-side-h ${LAYER_CLS[l.layer]}`}>{l.label}</div>
            {schema.tables.filter((x) => x.layer === l.layer).map((x) => <button key={x.name} className={`db-side-i ${x.name === t.name ? 'on' : ''}`} onClick={() => setTable(x.name)}><span className="mono">{x.name}</span><span className="muted">{x.rows.toLocaleString('vi-VN')}</span></button>)}
          </div>
        ))}
        <div className="muted" style={{ fontSize: 11, padding: 8 }}>Migration của phân hệ: {schema.migrations.filter((m) => /mua_hang|gia_mua|dvt/.test(m)).join(' · ') || '—'}</div>
      </div>
      <div className="card db-main">
        <h3 className="mono" style={{ margin: 0 }}>{t.name} <span className="muted" style={{ fontFamily: 'inherit', fontSize: 13 }}>— {t.label}</span></h3>
        <p style={{ margin: '4px 0 8px' }}>{t.comment || t.purpose}</p>
        {t.comment && t.purpose && t.purpose !== t.comment && <p className="muted" style={{ margin: '0 0 8px', fontSize: 12 }}>{t.purpose}</p>}
        <div className="row" style={{ gap: 8, marginBottom: 6 }}><input className="input" style={{ width: 260 }} placeholder="Tìm cột / chú thích" value={find} onChange={(e) => setFind(e.target.value)} /><label className="checkbox" style={{ fontSize: 12 }}><input type="checkbox" checked={present} onChange={(e) => setPresent(e.target.checked)} /> Chế độ thuyết trình (chỉ ý nghĩa)</label><span className="muted" style={{ fontSize: 12 }}>{t.columns.length} cột · {t.indexes.length} chỉ mục · {t.triggers.length} trigger · {t.rows.toLocaleString('vi-VN')} dòng (đơn vị này)</span></div>
        <table className="mh-mini">
          <thead><tr><th>#</th><th>Cột</th>{!present && <><th>Kiểu</th><th>Bắt buộc</th><th>Mặc định</th></>}<th>Ý nghĩa</th></tr></thead>
          <tbody>{cols.filter((c) => !present || !['id', 'tenant_id'].includes(c.name)).map((c, i) => <tr key={c.name}><td>{i + 1}</td><td className="mono"><b>{c.name}</b></td>{!present && <><td className="mono">{c.type}</td><td>{c.nullable ? '' : '✓'}</td><td className="mono" style={{ fontSize: 11 }}>{c.default?.replace(/::[\w ]+/g, '') ?? ''}</td></>}<td style={{ whiteSpace: 'normal' }}>{c.comment ?? <span className="muted">—</span>}</td></tr>)}</tbody>
        </table>
        {!present && t.indexes.length > 0 && <><h4 className="mh-h4" style={{ marginTop: 12 }}>Chỉ mục</h4><table className="mh-mini"><thead><tr><th>Tên</th><th>Định nghĩa</th></tr></thead><tbody>{t.indexes.map((i) => <tr key={i.name}><td className="mono">{i.name}</td><td className="mono" style={{ fontSize: 11, whiteSpace: 'normal' }}>{i.def.replace(/^CREATE (UNIQUE )?INDEX \S+ ON public\.\S+ USING /, (_m, u) => (u ? 'DUY NHẤT · ' : ''))}</td></tr>)}</tbody></table></>}
        {t.triggers.length > 0 && (!present || t.triggers.some((x) => x.note)) && <><h4 className="mh-h4" style={{ marginTop: 12 }}>Trigger (luật ở tầng CSDL)</h4><table className="mh-mini"><thead><tr><th>Trigger</th><th>Khi</th><th>Hàm</th><th>Làm gì</th></tr></thead><tbody>{t.triggers.map((x) => <tr key={x.name}><td className="mono">{x.name}</td><td>{x.timing} {x.events}</td><td className="mono">{x.fn}</td><td style={{ whiteSpace: 'normal' }}>{x.note || <span className="muted">—</span>}</td></tr>)}</tbody></table></>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ JSON mẫu */

const JSON_DOC = `{
  "priceIncludesVat": false,
  "orderDiscount": { "pct": 7 },
  "term": { "basis": "receipt_date", "payDays": 10, "dayType": "working" },
  "receivedDate": "2026-10-22",
  "schedule": [ { "seq": 1, "dueDate": "2026-11-05", "amount": 180000000 } ],
  "lines": [
    { "lineKey": "a1", "sku": "130181002", "name": "Sữa tươi TH 110ml", "unit": "Thùng", "qty": 2, "price": 258711,
      "taxCode": "V08", "lineType": "buy", "lotNo": "TH2610", "expDate": "2027-04-30" },
    { "lineKey": "g1", "sku": "130181002", "unit": "Hộp", "qty": 4, "price": 0, "lineType": "gift_seller", "program": "NC100227-KM" }
  ],
  "checks": [ { "level": "warn", "code": "price_fixed", "text": "Lệch giá cố định 3,2%" } ],
  "policyTrace": [ { "policy": "NC100227-CK", "kind": "trade_discount", "text": "Tự áp CK 7%" } ]
}`;
const JSON_POL: [string, string][] = [
  ['trade_discount', '{ "pct": 7 }'],
  ['item_discount', '{ "items": [ { "sku": "130181002", "pct": 2 }, { "sku": "130181002", "pct": 3, "unit": "Thùng", "minQty": 10 }, { "sku": "140181001", "amount": 300, "unit": "Hộp" } ] }'], ['qty_tier', '{ "tiers": [ { "from": 100, "pct": 3 }, { "from": 150, "pct": 5 } ] }'],
  ['promo_gift', '{ "splitIntoCost": true, "items": [{ "sku": "140181006", "buyQty": 1, "buyUnit": "Thùng", "giftSku": "", "getQty": 2, "getUnit": "Hộp", "repeat": true }] }'], ['credit_limit', '{ "limit": 600000000, "warnPct": 90, "branches": { "CN-NA": 300000000 } }'],
  ['payment_term', '{ "basis": "receipt_date", "payDays": 10, "dayType": "working" }'], ['period_rebate', '{ "period": "month", "tiers": [ { "from": 300000000, "pct": 3 } ] }'],
  ['stage_rebate', '{ "mode": "stage", "stages": [ { "from": 1, "to": 10, "min": 100000000, "pct": 1 } ] }'],
];

function JsonMau() {
  return (
    <>
      <Panel title="purchase_documents.data — phần hay đổi của chứng từ">
        <pre className="db-code">{JSON_DOC}</pre>
        <div className="muted" style={{ fontSize: 12 }}>Truy vấn dòng hàng: <code>{"data->'lines' @> '[{\"sku\":\"130181002\"}]'"}</code> (chỉ mục GIN <code>purchase_documents_lines_gin</code>). Báo cáo theo dòng dùng <code>{"jsonb_array_elements(data->'lines')"}</code>.</div>
      </Panel>
      <Panel title="purchase_policies.rule — mỗi loại một khuôn (máy chủ kiểm bằng zod)">
        <table className="mh-mini"><thead><tr><th>kind</th><th>rule</th></tr></thead><tbody>{JSON_POL.map(([k, v]) => <tr key={k}><td className="mono">{k}</td><td className="mono" style={{ whiteSpace: 'normal' }}>{v}</td></tr>)}</tbody></table>
        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>scope = <code>{'{ partnerCode?, brandCode?, sku?, branchCode? }'}</code> — phạm vi hẹp nhất thắng; trùng phạm vi thì <code>priority</code> lớn hơn thắng.</div>
      </Panel>
      <Panel title="Khuôn hoá đơn đọc được (Excel / AI / API) → POST /purchase/invoices/prepare · /scan">
        <pre className="db-code">{JSON_INVOICE}</pre>
        <div className="muted" style={{ fontSize: 12 }}>Đơn giá <b>chưa thuế</b> (trừ khi <code>priceIncludesVat: true</code>); <code>taxRate: null</code> = không chịu thuế; dòng giá 0 = hàng tặng. Dịch vụ AI (<code>INVOICE_AI_URL</code>) trả <code>{'{ invoices: [ … ] }'}</code> đúng khuôn này. Lõi tính: <code>packages/contracts/src/mua-hang/hoa-don.ts</code>.</div>
      </Panel>
      <Panel title="Nhật ký JSONL (mỗi dòng một sự kiện)">
        <pre className="db-code">{`{"ts":"2026-10-26T09:12:18Z","event":"supplier_products","user":"Quản trị","docNo":"","data":{"partnerCode":"NC100227","added":1,"updated":0,"rows":["130181002 Thùng 258.711đ"]}}
{"ts":"2026-10-26T09:20:02Z","event":"policy_changed","user":"Kế toán","docNo":"NC100227-HANMUC","data":{"before":{"rule":{"limit":600000000}},"rule":{"limit":700000000}}}
{"ts":"2026-10-28T08:05:11Z","event":"invoice_created","user":"Kế toán","docNo":"C26TAB-101","data":{"partnerCode":"NC100227","source":"excel","total":20736000,"lines":1,"unmatched":0}}
{"ts":"2026-10-28T08:05:11Z","event":"alias_learned","user":"Kế toán","docNo":"C26TAB-101","data":{"partnerCode":"NC100227","count":1,"lines":[{"nccSku":"AB-G800","nccName":"SUA BOT ABBOTT GROW VANI 800G","nccUnit":"THUNG","sku":"110154035","unit":"Thùng"}]}}`}</pre>
      </Panel>
    </>
  );
}

const JSON_INVOICE = `{
  "form": "1", "series": "C26TAB", "no": "0000101", "date": "2026-10-20",
  "sellerTaxCode": "0101234567", "sellerName": "Công ty …", "buyerTaxCode": "…",
  "totalBeforeTax": 19200000, "totalTax": 1536000, "total": 20736000,
  "lines": [
    { "nccSku": "AB-G800", "nccName": "SUA BOT ABBOTT GROW VANI 800G", "nccUnit": "THUNG",
      "qty": 2, "price": 9600000, "discountAmount": 0, "amount": 19200000,
      "taxRate": 8, "taxAmount": 1536000, "isGift": false }
  ]
}`;

/* ------------------------------------------------------------------ 25 tình huống */

const DB_OF: Record<number, string[]> = {
  1: ['purchase_policies', 'purchase_documents', 'ledger_lines', 'debt_items', 'supplier_invoices'], 2: ['purchase_documents', 'inventory_movements', 'ledger_lines'], 3: ['purchase_policies', 'debt_items'], 4: ['purchase_policies', 'debt_allocations', 'ledger_lines'],
  5: ['purchase_documents', 'debt_allocations', 'supplier_invoices'], 6: ['purchase_policies'], 7: ['purchase_policies'], 8: ['purchase_policies', 'purchase_documents', 'inventory_movements'], 9: ['purchase_policies', 'purchase_documents'],
  10: ['purchase_documents'], 11: ['purchase_documents', 'debt_items'], 12: ['purchase_policies', 'debt_items'], 13: ['purchase_policies', 'debt_items', 'purchase_documents'], 14: ['purchase_policies', 'inventory_movements'],
  15: ['purchase_policies', 'purchase_documents'], 16: ['purchase_policies', 'purchase_documents'], 17: ['purchase_policies'], 18: ['purchase_policies', 'debt_items'], 19: ['purchase_policies', 'inventory_movements'],
  20: ['purchase_documents', 'purchase_policies', 'inventory_movements'], 21: ['purchase_documents', 'inventory_movements'], 22: ['purchase_documents', 'inventory_movements'], 23: ['purchase_documents', 'inventory_movements', 'ledger_lines'],
  24: ['inventory_movements', 'products'], 25: ['purchase_documents', 'supplier_products', 'inventory_movements'],
};

function TinhHuong({ onOpen }: { onOpen: (n: string) => void }) {
  const q = useQuery({ queryKey: ['mua-hang', 'scenarios'], queryFn: () => api.get<Scenario[]>(`${P}/scenarios`) });
  const list = useMemo(() => q.data ?? [], [q.data]);
  return (
    <Panel title="25 tình huống của tài liệu yêu cầu — giải quyết ở bảng nào">
      {q.isLoading ? <Loading /> : (
        <table className="mh-mini">
          <thead><tr><th>TH</th><th>Tình huống</th><th>Phần mềm làm gì</th><th>Bảng</th><th>Số tài liệu / số phần mềm</th></tr></thead>
          <tbody>{list.map((s) => (
            <tr key={s.th}><td><b>{s.th}</b></td><td style={{ whiteSpace: 'normal', minWidth: 200 }}>{s.title}</td><td style={{ whiteSpace: 'normal', minWidth: 260 }}>{s.how}</td>
              <td>{(DB_OF[s.th] ?? []).map((n) => <T key={n} n={n} onOpen={onOpen} />)}</td>
              <td style={{ whiteSpace: 'normal' }}>{s.expected ? <>{s.expected} → {s.result} {s.ok === true ? <span className="mh-ok">✓ khớp</span> : s.ok === false ? <span className="mh-bad">✗</span> : null}</> : <span className="muted">báo cáo có sẵn</span>}</td></tr>
          ))}</tbody>
        </table>
      )}
      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Phép thử tự động <code>apps/api/test/mua-hang-25-tinh-huong.test.ts</code> chạy từng tình huống trên sổ thật (ghi phiếu, duyệt, kiểm bút toán / công nợ / kho).</div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ Mở rộng & tối ưu */

function MoRong({ schema }: { schema?: Schema }) {
  return (
    <>
      <Panel title="Thêm tính năng — làm ở đâu">
        <table className="mh-mini">
          <thead><tr><th>Muốn thêm</th><th>Làm</th><th>Không cần</th></tr></thead>
          <tbody>
            <tr><td>Loại chính sách mới</td><td>Khuôn zod (store.ts) + câu tóm tắt + ô nhập (quyTac.tsx) + nhánh tính (engine.ts)</td><td>bảng mới</td></tr>
            <tr><td>Loại chứng từ mới</td><td>Thêm vào CHECK <code>kind</code> + cách hạch toán (posting.ts)</td><td>bảng mới</td></tr>
            <tr><td>Trường mới trên phiếu</td><td>Thêm khoá vào <code>data</code> (DATA_KEYS) — cần lọc / tổng hợp mới thành cột + chỉ mục</td><td>migration (nếu chỉ hiển thị)</td></tr>
            <tr><td>Tên ĐVT mới</td><td>Khai ở mặt hàng — CSDL tự thêm vào danh mục</td><td>vào DM15</td></tr>
            <tr><td>Nguồn đọc hoá đơn mới (AI khác, cổng hoá đơn điện tử)</td><td>Dịch vụ ngoài trả khuôn <code>ParsedInvoice</code> (tab ⑦) — đặt <code>INVOICE_AI_URL</code>, hoặc gọi thẳng <code>/purchase/invoices/prepare</code> + <code>/import</code></td><td>sửa lõi, bảng mới</td></tr>
            <tr><td>Phân hệ khác (bán hàng…)</td><td>Dùng lại bộ máy chính sách + cùng cách ghi sổ lõi</td><td>sổ riêng</td></tr>
            <tr><td>Bảng mới thật sự</td><td>File <code>db/migrations/00NN_*.sql</code> (COMMENT cho mọi cột) + db/types.ts + schema-catalog.ts — trang này tự hiện</td><td>sửa trang này</td></tr>
          </tbody>
        </table>
      </Panel>
      <Panel title="Tối ưu đang có">
        <ul className="db-list">
          <li>Phân tích / lưu / duyệt một phiếu chỉ đọc chứng từ liên quan (cùng NCC, cùng nhãn, phiếu gắn, phiếu phụ thuộc) — đo ~35 ms với 20 nghìn phiếu.</li>
          <li>Lịch sử giá một mã, phiếu gắn: chỉ mục GIN trên <code>data-&gt;'lines'</code> và <code>ref_ids</code>.</li>
          <li>Danh sách chứng từ lọc trong SQL; chính sách nhân theo mã (min–max) không tải khi phân tích phiếu.</li>
          <li>Hoá đơn NCC: chặn trùng NCC × ký hiệu × số bằng chỉ mục duy nhất (bỏ số 0 đầu); nhận diện mã tra bảng đã học trước, chỉ so tên khi chưa học.</li>
          <li>Chặn trùng ở tầng CSDL: số hoá đơn (duy nhất), dòng giá mua (duy nhất), tên ĐVT (duy nhất không phân biệt hoa thường).</li>
          <li>Nhật ký và tệp đính kèm nằm ngoài CSDL — sao lưu nhanh, CSDL nhẹ.</li>
        </ul>
      </Panel>
      <Panel title="Khi dữ liệu lớn (việc tiếp theo)">
        <ul className="db-list">
          <li>Danh sách chứng từ trên giao diện đang tải hết phiếu của đơn vị → tải theo kỳ + phân trang khi vượt khoảng 20–30 nghìn phiếu.</li>
          <li>Báo cáo theo dòng hàng: bảng tổng hợp theo tháng nếu <code>jsonb_array_elements</code> chậm.</li>
        </ul>
        {schema && <div className="muted" style={{ fontSize: 12 }}>Hiện tại: {schema.tables.filter((t) => t.layer === 'module').map((t) => `${t.name} ${t.rows.toLocaleString('vi-VN')} dòng`).join(' · ')}</div>}
      </Panel>
    </>
  );
}
