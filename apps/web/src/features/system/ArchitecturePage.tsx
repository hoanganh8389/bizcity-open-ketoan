/**
 * Kiến trúc & Nghiệp vụ — "xương sống" của phần mềm cho người phát triển và kế toán cùng đọc:
 *   - Luồng dữ liệu: một chứng từ đi từ lúc nhận vào tới sổ cái, sổ hoá đơn, báo cáo; cờ trạng thái; hỏi gì đọc bảng nào; các luật bảo vệ sổ.
 *   - Ví dụ từng bước: một lần đổi trả (phiếu hoàn + phiếu bán + phiếu thu) đi qua từng bảng, rồi sửa phiếu.
 *   - Cấu trúc dữ liệu: đọc thật từ cơ sở dữ liệu (bảng, cột, chú thích, khoá ngoại, trigger), có giải thích tiếng Việt.
 *   - Thuật ngữ: từ kế toán ↔ bảng ↔ thư mục code.
 *   - Tài liệu: docs/nghiep-vu/*.md.
 * Bấm tên bảng ở bất cứ đâu để mở bảng đó trong tab Cấu trúc dữ liệu.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { marked } from 'marked';
import { api, errorText } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { Empty, ErrorBox, Loading } from '@/components/ui';
import { businessDocs } from '@/help/business-docs';

interface SchemaColumn { name: string; type: string; nullable: boolean; default: string | null; identity: boolean; comment: string | null; hint: string | null; references: { table: string; column: string } | null }
interface SchemaTable {
  name: string; group: string; label: string; term: string | null; purpose: string | null; module: string | null; comment: string | null; rowEstimate: number;
  columns: SchemaColumn[]; primaryKey: string[];
  foreignKeys: { name: string; columns: string[]; refTable: string; refColumns: string[]; def: string }[];
  referencedBy: { name: string; table: string; columns: string[] }[];
  constraints: { name: string; kind: 'unique' | 'check'; def: string }[];
  indexes: { name: string; unique: boolean; def: string }[];
  triggers: { name: string; func: string; def: string; note: string | null }[];
}
interface SchemaGroup { key: string; label: string; summary: string }
interface SchemaDto { groups: SchemaGroup[]; tables: SchemaTable[] }

type Tab = 'luong' | 'vi-du' | 'cau-truc' | 'thuat-ngu' | 'tai-lieu';
const TABS: { key: Tab; label: string }[] = [
  { key: 'luong', label: 'Luồng dữ liệu' },
  { key: 'vi-du', label: 'Ví dụ từng bước' },
  { key: 'cau-truc', label: 'Cấu trúc dữ liệu' },
  { key: 'thuat-ngu', label: 'Thuật ngữ ↔ bảng' },
  { key: 'tai-lieu', label: 'Tài liệu nghiệp vụ' },
];

export function ArchitecturePage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'luong';
  const table = params.get('bang') ?? '';
  const go = (next: { tab?: Tab; bang?: string; doc?: string }) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) v ? p.set(k, v) : p.delete(k);
    setParams(p, { replace: true });
  };
  const openTable = (name: string) => go({ tab: 'cau-truc', bang: name });

  const q = useQuery({ queryKey: ['system-schema'], queryFn: () => api.get<SchemaDto>('/api/v1/system/schema'), staleTime: 60_000 });

  return (
    <>
      <PageHeader title="Kiến trúc & Nghiệp vụ" code="TI10" subtitle="Xương sống của phần mềm: chứng từ đi đâu, ghi vào bảng nào, luật nào bảo vệ sổ cái" />
      <div className="card kt">
        <div className="tabs">
          {TABS.map((t) => (
            <button key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => go({ tab: t.key })}>{t.label}</button>
          ))}
        </div>
        <ErrorBox error={q.error ? errorText(q.error) : null} />
        {tab === 'luong' && <FlowTab onTable={openTable} />}
        {tab === 'vi-du' && <ExampleTab onTable={openTable} />}
        {tab === 'cau-truc' && (q.isLoading ? <Loading /> : q.data ? <SchemaTab data={q.data} selected={table} onTable={openTable} /> : null)}
        {tab === 'thuat-ngu' && <TermsTab onTable={openTable} />}
        {tab === 'tai-lieu' && <DocsTab current={params.get('doc') ?? ''} onDoc={(doc) => go({ doc })} />}
      </div>
    </>
  );
}

/** Tên bảng bấm được. */
function T({ name, onTable }: { name: string; onTable: (n: string) => void }) {
  return <button className="kt-table-link mono" onClick={() => onTable(name)} title="Xem cấu trúc bảng">{name}</button>;
}

// -----------------------------------------------------------------------------
// Luồng dữ liệu

function FlowTab({ onTable }: { onTable: (n: string) => void }) {
  const t = (n: string) => <T name={n} onTable={onTable} />;
  return (
    <div className="card-body">
      <p className="kt-lead">
        Kế toán là <b>một cuốn log chỉ được thêm</b> các lần giá trị chuyển giữa các tài khoản, với một luật bảo toàn: mỗi bút toán <b>tổng Nợ = tổng Có</b>.
        Phần mềm làm đúng ba việc: <b>nhận chứng từ</b> từ hệ thống bán hàng → <b>định khoản</b> thành dòng Nợ / Có, ghi vào log → <b>cộng log lại</b> thành sổ, báo cáo.
        Phiếu mua, bán, hoàn, chuyển kho, thu chi lập ở hệ thống bán hàng; ERP không lập lại các phiếu đó.
      </p>

      <div className="kt-flow">
        <FlowStep n="0" title="Nguồn chứng từ · cấu hình kết nối ở ACC14">
          Hệ thống bán hàng nhiều cửa hàng, web bán hàng (WooCommerce)… Mỗi nguồn là một <b>kết nối</b> (địa chỉ, khoá, chi nhánh mặc định, bảng đổi hình thức thanh toán)
          lưu trong cấu hình của đơn vị ({t('tenants')}, mục <span className="mono">settings.connections</span>) — không có bảng riêng.
          ACC14 <b>kéo</b> các phiếu đang chờ gửi; nguồn cũng có thể tự <b>đẩy</b> vào <span className="mono">POST /api/v1/documents</span>.
          Mỗi phiếu có khoá <span className="mono">doc_key</span> (ví dụ <span className="mono">btsoft:3:sale:321</span> = site 3, phiếu bán số 321) và <span className="mono">version</span>.
          Phần nhập tay trong ERP chỉ còn: số dư đầu kỳ, bút toán kế toán.
        </FlowStep>
        <FlowArrow label="nhận vào, CHƯA ghi sổ" />
        <FlowStep n="①" title="Sự kiện kế toán = một dòng mỗi phiếu nguồn" tone="in">
          {t('accounting_events')} giữ nguyên JSON phiếu (cột <span className="mono">payload</span>: dòng hàng, khách, hoá đơn, phiếu nguồn để bấm mở lại).
          Phiếu đổi nội dung → <span className="mono">version</span> tăng, bản trước cất ở {t('accounting_event_versions')}. Gửi lại y nguyên thì không ghi gì thêm.
          Mọi lần nhận / định khoản / lỗi / huỷ ghi một dòng {t('posting_log')}.
          <div className="kt-note">Phiếu bán và phiếu thu tiền là <b>hai sự kiện riêng</b>: phiếu thu (Thanh toán khách hàng) trỏ về phiếu bán qua <span className="mono">invoiceDocKey</span>.</div>
        </FlowStep>
        <FlowArrow label="kế toán bấm dòng → xem trước → Định khoản (ACC14)" />
        <FlowStep n="②" title="Xem trước và định khoản" tone="rule">
          Xem trước chạy thử định khoản rồi bỏ đi, không ghi gì. Định khoản thật: tra tài khoản theo thứ tự lý do {t('posting_reasons')} → nhóm hàng {t('product_posting_groups')} →
          loại thuế {t('tax_codes')} → hình thức thanh toán {t('payment_methods')} → mặc định {t('posting_defaults')}; danh mục {t('accounts')}. Thiếu cấu hình thì báo lỗi, không ghi nửa chừng.
          <div className="kt-note">Code: <span className="mono">apps/api/src/modules/documents</span> (nhận, xem trước), <span className="mono">modules/posting</span> (luật)</div>
        </FlowStep>
        <FlowArrow label="ghi trong MỘT giao dịch: được hết hoặc không gì cả" />
        <FlowStep n="③" title="Sổ nhật ký chung — chỉ thêm, không sửa" tone="ledger">
          {t('ledger_entries')} = <b>phiếu cha</b> (một bút toán: số, ngày, chi nhánh, loại chứng từ, số phiếu, trỏ về sự kiện).
          {t('ledger_lines')} = <b>dòng con</b> (tài khoản, Nợ hoặc Có, đối tượng, mã hàng, bộ phận; <span className="mono">pair_no</span> nối cặp đối ứng).
          Số bút toán cấp từ {t('ledger_entry_sequences')}, kỳ ở {t('fiscal_periods')}. Sửa = ghi số âm bút toán cũ + ghi bút toán mới, nối nhau ở {t('ledger_links')}.
          <div className="kt-note">Code: <span className="mono">apps/api/src/modules/ledger/ledger.service.ts</span></div>
        </FlowStep>
        <FlowArrow label="cùng giao dịch đó, các bảng phụ dựng theo bút toán" />
        <div className="kt-fan">
          <FlowStep n="④" title="Công nợ từng phiếu" tone="out">
            {t('debt_items')}: mỗi phiếu một khoản khách nợ / mình nợ. {t('debt_allocations')}: phiếu thu trừ vào phiếu bán nào, phiếu hoàn đối trừ đơn nào.
          </FlowStep>
          <FlowStep n="⑤" title="Kho (số lượng)" tone="out">
            {t('inventory_movements')}: mỗi lần hàng vào (+) / ra (−) một cửa hàng = thẻ kho. Cuối tháng ra {t('inventory_costs')} (giá vốn bình quân).
          </FlowStep>
          <FlowStep n="⑥" title="Hoá đơn" tone="out">
            {t('tax_invoices')}, {t('tax_invoice_lines')} → bảng kê, tờ khai GTGT. Bổ sung hoá đơn về muộn ở {t('tax_info_patches')}.
          </FlowStep>
          <FlowStep n="⑦" title="Số phát sinh theo ngày" tone="out">
            {t('ledger_balances_daily')} → cân đối phát sinh, sổ cái, báo cáo tài chính, không phải quét cả triệu dòng.
          </FlowStep>
        </div>
        <FlowArrow label="cuối tháng" />
        <FlowStep n="⑧" title="Giá vốn, kết chuyển, khoá sổ" tone="rule">
          Tính giá vốn bình quân, ghi "Giá vốn hàng xuất" từng chi nhánh; kết chuyển theo {t('closing_rules')} (doanh thu, chi phí → 911 → 421); khoá kỳ ở {t('period_locks')}.
        </FlowStep>
      </div>

      <h3 className="kt-h">Cờ của một chứng từ: nhìn cột nào để biết mới / đổi / xong</h3>
      <p className="kt-muted">Không có bảng hàng đợi riêng — trạng thái nằm ngay trên dòng {t('accounting_events')}.</p>
      <table className="grid">
        <thead><tr><th>Tình trạng</th><th>Điều kiện trên cột</th><th>Nghĩa</th><th>ACC14 hiện</th></tr></thead>
        <tbody>
          <tr><td><b>Mới, chưa định khoản</b></td><td className="mono">status = 'pending' AND posted_version IS NULL</td><td>Vừa kéo / nhận về, sổ chưa có gì.</td><td>Chờ định khoản</td></tr>
          <tr><td><b>Đã đổi, chờ định khoản lại</b></td><td className="mono">status = 'pending' AND version &gt; posted_version</td><td>Bên bán hàng sửa phiếu (thêm hàng, đổi giá, đổi khách…). Bút toán cũ vẫn đứng trong sổ tới khi định khoản lại.</td><td>Chờ định khoản lại</td></tr>
          <tr><td><b>Đã vào sổ</b></td><td className="mono">status = 'posted' AND version = posted_version</td><td>Sổ khớp đúng phiên bản mới nhất.</td><td>Đã định khoản</td></tr>
          <tr><td><b>Lỗi</b></td><td className="mono">status = 'error'</td><td>Thiếu cấu hình (tài khoản, chi nhánh, mã hàng…). Xem lý do ở {t('posting_log')}.</td><td>Lỗi</td></tr>
          <tr><td><b>Huỷ</b></td><td className="mono">status = 'cancelled'</td><td>Bên bán hàng huỷ phiếu. Bút toán cũ đã được ghi số âm.</td><td>Đã huỷ</td></tr>
        </tbody>
      </table>
      <p className="kt-muted">
        Phía hệ thống bán hàng: mỗi phiếu đã gửi lưu một dấu vân tay (băm nội dung) ở nhật ký gửi của nó; phiếu sửa thì dấu đổi → lần kéo sau gửi lại với version mới.
        ERP nhận xong thì báo lại (đã nhận / từ chối / huỷ) để bên kia đánh dấu.
      </p>

      <h3 className="kt-h">Muốn xem gì thì đọc bảng nào</h3>
      <table className="grid">
        <thead><tr><th>Câu hỏi</th><th>Đọc ở</th><th>Ghi chú</th></tr></thead>
        <tbody>
          <tr><td>Phiếu gốc bên bán hàng gửi sang trông thế nào, đã sửa mấy lần?</td><td>{t('accounting_events')} · {t('accounting_event_versions')}</td><td>Cột <span className="mono">payload</span> là nguyên phiếu.</td></tr>
          <tr><td>Phiếu này định khoản lúc nào, ai làm, có lỗi gì?</td><td>{t('posting_log')}</td><td>Chỉ ghi thêm.</td></tr>
          <tr><td>Sổ nhật ký chung, sổ cái một tài khoản</td><td>{t('ledger_entries')} + {t('ledger_lines')}</td><td>Cộng <span className="mono">debit</span> / <span className="mono">credit</span> theo tài khoản, ngày, chi nhánh.</td></tr>
          <tr><td>Doanh thu, thuế đầu ra, tiền mặt, ngân hàng</td><td>{t('ledger_lines')} (TK 511, 33311, 111, 112…)</td><td>Báo cáo tổng hợp đọc {t('ledger_balances_daily')} cho nhanh.</td></tr>
          <tr><td>Khách / nhà cung cấp còn nợ phiếu nào, đã trả bằng phiếu nào?</td><td>{t('debt_items')} + {t('debt_allocations')}</td><td>Còn nợ = <span className="mono">amount − settled_amount</span>.</td></tr>
          <tr><td>Tồn kho, thẻ kho, lịch sử nhập xuất một mã hàng (bán, hoàn, chuyển, điều chỉnh)</td><td>{t('inventory_movements')}</td><td>Chỉ có <b>số lượng</b>; tiền của hàng nằm ở sổ (TK 156, 632).</td></tr>
          <tr><td>Dòng hàng bán, tiền thu theo hình thức thanh toán</td><td>bảng ảo <span className="mono">sales_lines</span>, <span className="mono">sales_payments</span></td><td>Đọc thẳng từ JSON phiếu đã định khoản (không lưu trùng).</td></tr>
          <tr><td>Hoá đơn bán ra / mua vào để kê khai</td><td>{t('tax_invoices')} + {t('tax_invoice_lines')}</td><td>Không phải sổ kế toán, là danh sách kê khai.</td></tr>
        </tbody>
      </table>

      <h3 className="kt-h">Sáu luật không đổi và chỗ phần mềm giữ luật</h3>
      <table className="grid kt-rules">
        <thead><tr><th>Luật kế toán</th><th>Ý nghĩa với lập trình viên</th><th>Giữ ở đâu</th></tr></thead>
        <tbody>
          <Rule law="Không chứng từ thì không ghi sổ" dev="Mọi bút toán có event_id trỏ về sự kiện đã nhận." where={<>{t('ledger_entries')} · cột <span className="mono">event_id</span>; số dư đầu kỳ, bút toán nhập tay cũng tạo sự kiện (<span className="mono">source_system = 'manual'</span>)</>} />
          <Rule law="Nợ = Có ở từng bút toán" dev="Invariant của transaction. Lệch một đồng là huỷ cả giao dịch." where={<>trigger <span className="mono">ledger_lines_balanced</span> (kiểm lúc COMMIT); CHECK mỗi dòng đúng một bên Nợ hoặc Có</>} />
          <Rule law="Sổ không tẩy xoá" dev="Append-only log. Sửa = ghi số âm (như git revert) rồi ghi lại." where={<>trigger <span className="mono">ledger_lines_no_update</span>, <span className="mono">*_no_truncate</span>; liên kết bút toán gốc ở {t('ledger_links')} (mỗi bút toán chỉ bị đảo một lần)</>} />
          <Rule law="Số âm chỉ dùng để chữa sổ" dev="Dòng số âm chỉ hợp lệ trong bút toán ghi số âm." where={<>trigger <span className="mono">ledger_lines_negative_guard</span></>} />
          <Rule law="Kỳ đã khoá thì không ghi, không sửa" dev="Như khoá nhánh sau khi gắn tag release." where={<>{t('period_locks')}; kiểm trong <span className="mono">ledger.service.ts</span> trước khi ghi</>} />
          <Rule law="Đánh số liên tục, không trùng, không nhảy" dev="Cấp số bằng bộ đếm khoá dòng, trong cùng giao dịch ghi sổ." where={<>{t('ledger_entry_sequences')}, {t('document_sequences')}</>} />
        </tbody>
      </table>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Ví dụ từng bước: một lần đổi trả đi qua các bảng

const money = (n: number) => (n === 0 ? '' : n.toLocaleString('vi-VN'));

function ExRows({ head, rows }: { head: string[]; rows: (string | number | ReactNode)[][] }) {
  return (
    <table className="grid">
      <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>{r.map((c, j) => <td key={j} className={typeof c === 'number' ? 'num' : undefined}>{typeof c === 'number' ? money(c) : c}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}

function ExampleTab({ onTable }: { onTable: (n: string) => void }) {
  const t = (n: string) => <T name={n} onTable={onTable} />;
  return (
    <div className="card-body">
      <p className="kt-lead">
        Tình huống: cửa hàng <b>CNTES</b>, ngày 10/10. Khách <b>0912 345 678</b> mang trả <b>1 hộp sữa</b> (432.000đ, gồm thuế 8%), rồi mua <b>2 hộp</b> khác (864.000đ).
        Tiền hàng trả lại được trừ vào đơn mới (đối trừ 432.000đ), khách <b>chuyển khoản thêm 432.000đ</b>. Đổi trả luôn cùng một cửa hàng.
      </p>

      <h3 className="kt-h">Bước 1 · Hệ thống bán hàng có 3 phiếu → ACC14 kéo về 3 sự kiện</h3>
      <p>Mỗi phiếu nguồn một dòng {t('accounting_events')}, trạng thái <b>Chờ định khoản</b>. Chưa có dòng nào trong sổ.</p>
      <ExRows
        head={['doc_key', 'Loại', 'Số phiếu', 'Nội dung chính trong payload', 'version', 'posted_version', 'status']}
        rows={[
          [<span className="mono">btsoft:3:return:320</span>, 'Hàng bán trả lại', 'CNTESAA00320', '1 hộp, 400.000 + thuế 32.000', '1', '—', 'pending'],
          [<span className="mono">btsoft:3:sale:321</span>, 'Hoá đơn bán lẻ', 'CNTESAA00321', <>2 hộp, 800.000 + thuế 64.000; <span className="mono">offsets</span>: [phiếu hoàn 320, 432.000]</>, '1', '—', 'pending'],
          [<span className="mono">btsoft:3:receipt:77</span>, 'Thanh toán khách hàng', 'CNTESTT00077', <>chuyển khoản 432.000, <span className="mono">invoiceDocKey</span> = phiếu bán 321</>, '1', '—', 'pending'],
        ]}
      />
      <p className="kt-muted">Phần đối trừ không phải tiền thật nên không có phiếu thu; nó nằm trong phiếu bán (<span className="mono">offsets</span>) và trỏ tới phiếu hoàn.</p>

      <h3 className="kt-h">Bước 2 · Kế toán bấm từng dòng, xem trước, định khoản → 3 bút toán (phiếu cha)</h3>
      <ExRows
        head={['ledger_entries · số', 'Loại chứng từ', 'Số phiếu', 'Chi nhánh', 'Tổng', 'Trỏ về sự kiện']}
        rows={[
          ['BT26-0000101', 'Hàng bán trả lại', 'CNTESAA00320', 'CNTES', 432000, 'return:320'],
          ['BT26-0000102', 'Hoá đơn bán lẻ', 'CNTESAA00321', 'CNTES', 864000, 'sale:321'],
          ['BT26-0000103', 'Thanh toán khách hàng', 'CNTESTT00077', 'CNTES', 432000, 'receipt:77'],
        ]}
      />

      <h3 className="kt-h">… và các dòng con trong {t('ledger_lines')}</h3>
      <ExRows
        head={['Bút toán', 'Tài khoản', 'Nợ', 'Có', 'Đối tượng', 'Mã hàng', 'Diễn giải']}
        rows={[
          ['000101', '5213 Hàng bán bị trả lại', 400000, 0, '', 'SUA01', 'Giảm doanh thu'],
          ['000101', '33311 Thuế GTGT đầu ra', 32000, 0, '', 'SUA01', 'Giảm thuế'],
          ['000101', '131 Phải thu khách', 0, 432000, '0912345678', '', 'Khách được trả lại'],
          ['000102', '131 Phải thu khách', 864000, 0, '0912345678', '', 'Khách nợ tiền hàng'],
          ['000102', '5111 Doanh thu bán hàng', 0, 800000, '', 'SUA02', 'Doanh thu'],
          ['000102', '33311 Thuế GTGT đầu ra', 0, 64000, '', 'SUA02', 'Thuế đầu ra'],
          ['000103', '1121 Tiền gửi ngân hàng', 432000, 0, '', '', 'Thu chuyển khoản'],
          ['000103', '131 Phải thu khách', 0, 432000, '0912345678', '', 'Khách trả tiền'],
        ]}
      />
      <p className="kt-muted">
        Mỗi bút toán Nợ = Có (cơ sở dữ liệu tự kiểm). Mọi dòng mang bộ phận của cửa hàng CNTES. Giá vốn (632 / 156) ghi cuối tháng bằng chứng từ "Giá vốn hàng xuất".
        Tài khoản 131 của khách: Nợ 864.000 − Có 432.000 − Có 432.000 = <b>0</b> → khách hết nợ.
      </p>

      <h3 className="kt-h">Bước 3 · Cùng giao dịch đó, các bảng phụ</h3>
      <p><b>Công nợ</b> — {t('debt_items')} (mỗi phiếu một khoản) và {t('debt_allocations')} (ghép khoản nào trả cho khoản nào):</p>
      <ExRows
        head={['Khoản công nợ', 'Bên', 'Số tiền', 'Đã ghép', 'Còn lại']}
        rows={[
          ['Phiếu bán CNTESAA00321', 'Nợ 131', 864000, 864000, '0'],
          ['Phiếu hoàn CNTESAA00320', 'Có 131', 432000, 432000, '0'],
          ['Phiếu thu CNTESTT00077', 'Có 131', 432000, 432000, '0'],
        ]}
      />
      <ExRows
        head={['debt_allocations · ghép', 'Số tiền', 'Vì sao']}
        rows={[
          ['Phiếu bán 321 ↔ phiếu hoàn 320', 432000, 'offsets của phiếu bán (đối trừ hàng bán trả lại)'],
          ['Phiếu bán 321 ↔ phiếu thu 77', 432000, 'invoiceDocKey của phiếu thu'],
        ]}
      />
      <p className="kt-muted">Phiếu thu về trước phiếu bán cũng được: khi phiếu bán định khoản, phần ghép tự chạy lại.</p>

      <p><b>Kho</b> — {t('inventory_movements')} (chỉ số lượng):</p>
      <ExRows
        head={['Ngày', 'Chi nhánh', 'Mã hàng', 'Số lượng', 'Loại', 'Phiếu']}
        rows={[
          ['10/10', 'CNTES', 'SUA01', '+1', 'Khách trả', 'CNTESAA00320'],
          ['10/10', 'CNTES', 'SUA02', '−2', 'Bán', 'CNTESAA00321'],
        ]}
      />
      <p className="kt-muted">Tồn của một mã hàng = cộng cột số lượng. Thẻ kho = các dòng xếp theo ngày.</p>

      <p><b>Báo cáo bán hàng</b> — bảng ảo <span className="mono">sales_payments</span> của phiếu 321 ra 2 dòng: <span className="mono">DOITRU 432.000</span> (đối trừ) và <span className="mono">CK 432.000</span> (từ phiếu thu). Mở phiếu bán ở ACC14 thấy "Đã thanh toán 864.000".</p>
      <p><b>Nhật ký</b> — {t('posting_log')}: mỗi phiếu 2 dòng (nhận, định khoản), có người làm và giờ.</p>

      <h3 className="kt-h">Bước 4 · Hôm sau cửa hàng sửa phiếu thu: chuyển khoản → tiền mặt</h3>
      <ol>
        <li>Bên bán hàng thấy phiếu thu 77 đổi nội dung (dấu vân tay khác) → lần kéo sau gửi <b>version 2</b>.</li>
        <li>{t('accounting_events')}: <span className="mono">version = 2</span>, <span className="mono">posted_version = 1</span>, <span className="mono">status = 'pending'</span> → ACC14 hiện <b>Chờ định khoản lại</b>. Bản version 1 cất ở {t('accounting_event_versions')}. Sổ vẫn giữ bút toán cũ.</li>
        <li>Kế toán xem trước: "sẽ đảo 1 bút toán, ghi 1 bút toán mới". Bấm định khoản lại.</li>
        <li>Sổ thêm: <b>BT26-0000104</b> = ghi số âm của BT26-0000103 (Nợ 1121 −432.000 / Có 131 −432.000), nối về bút toán gốc ở {t('ledger_links')}; <b>BT26-0000105</b> = Nợ 1111 432.000 / Có 131 432.000.</li>
        <li>Phiếu bán và phiếu hoàn không đổi → bút toán của chúng giữ nguyên (so dấu vân tay <span className="mono">content_hash</span>), không đảo lung tung.</li>
      </ol>
      <p className="kt-muted">
        Sổ không xoá dòng nào: nhìn sổ vẫn thấy lịch sử "đã ghi chuyển khoản, rồi chữa thành tiền mặt". Số dư cuối cùng vẫn đúng: 1121 = 0, 1111 = 432.000, 131 = 0.
        Nếu cửa hàng huỷ phiếu thu: <span className="mono">status = 'cancelled'</span>, ghi số âm bút toán của nó, khoản ghép với phiếu bán được gỡ → khách lại còn nợ 432.000.
      </p>
    </div>
  );
}

function FlowStep({ n, title, tone, children }: { n: string; title: string; tone?: 'in' | 'rule' | 'ledger' | 'out'; children: ReactNode }) {
  return (
    <div className={`kt-step ${tone ? `kt-${tone}` : ''}`}>
      <div className="kt-step-head"><span className="kt-num">{n}</span>{title}</div>
      <div className="kt-step-body">{children}</div>
    </div>
  );
}

function FlowArrow({ label }: { label?: string }) {
  return <div className="kt-arrow">↓{label && <span>{label}</span>}</div>;
}

function Rule({ law, dev, where }: { law: string; dev: string; where: ReactNode }) {
  return <tr><td><b>{law}</b></td><td>{dev}</td><td>{where}</td></tr>;
}

// -----------------------------------------------------------------------------
// Cấu trúc dữ liệu

function SchemaTab({ data, selected, onTable }: { data: SchemaDto; selected: string; onTable: (n: string) => void }) {
  const [filter, setFilter] = useState('');
  const f = filter.trim().toLowerCase();
  const visible = useMemo(
    () => data.tables.filter((t) => !f || t.name.includes(f) || t.label.toLowerCase().includes(f) || (t.term ?? '').toLowerCase().includes(f) || t.columns.some((c) => c.name.includes(f))),
    [data.tables, f],
  );
  const current = data.tables.find((t) => t.name === selected) ?? null;

  return (
    <div className="kt-schema">
      <div className="kt-side">
        <input className="input" placeholder="Tìm bảng, cột, thuật ngữ…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        {data.groups.map((g) => {
          const rows = visible.filter((t) => t.group === g.key);
          if (!rows.length) return null;
          return (
            <div key={g.key} className="kt-group">
              <div className="kt-group-title" title={g.summary}>{g.label}</div>
              {rows.map((t) => (
                <button key={t.name} className={`kt-item ${t.name === selected ? 'active' : ''}`} onClick={() => onTable(t.name)}>
                  <span className="mono">{t.name}</span>
                  <small>{t.label}</small>
                </button>
              ))}
            </div>
          );
        })}
        {!visible.length && <Empty text="Không có bảng nào khớp" />}
      </div>
      <div className="kt-detail">
        {current ? <TableDetail t={current} groups={data.groups} onTable={onTable} /> : <SchemaOverview data={data} onTable={onTable} />}
      </div>
    </div>
  );
}

function SchemaOverview({ data, onTable }: { data: SchemaDto; onTable: (n: string) => void }) {
  return (
    <div>
      <p className="kt-lead">
        Đọc trực tiếp từ cơ sở dữ liệu đang chạy ({data.tables.length} bảng). Quy ước: tên tiếng Anh số nhiều, chữ thường, cách bằng gạch dưới;
        khoá chính <span className="mono">id</span> số tự tăng; khoá ngoại <span className="mono">&lt;bảng số ít&gt;_id</span>; nhóm sổ cái chung tiền tố <span className="mono">ledger_</span>;
        mã của hệ thống khác nằm ở cột đối chiếu (<span className="mono">doc_key</span>, <span className="mono">code</span>, <span className="mono">sku</span>, <span className="mono">external_ref</span>); tiền <span className="mono">numeric(18,2)</span>.
      </p>
      {data.groups.map((g) => {
        const rows = data.tables.filter((t) => t.group === g.key);
        if (!rows.length) return null;
        return (
          <div key={g.key} className="kt-ov-group">
            <h3 className="kt-h">{g.label}</h3>
            <p className="kt-muted">{g.summary}</p>
            <table className="grid">
              <tbody>
                {rows.map((t) => (
                  <tr key={t.name}>
                    <td style={{ width: 230 }}><T name={t.name} onTable={onTable} /></td>
                    <td style={{ width: 220 }}><b>{t.label}</b>{t.term && <div className="kt-muted">{t.term}</div>}</td>
                    <td>{t.purpose ?? t.comment}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

function TableDetail({ t, groups, onTable }: { t: SchemaTable; groups: SchemaGroup[]; onTable: (n: string) => void }) {
  const group = groups.find((g) => g.key === t.group);
  return (
    <div>
      <div className="kt-title">
        <h2>{t.label} <span className="mono kt-name">{t.name}</span></h2>
        <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
          {group && <span className="badge badge-info">{group.label}</span>}
          {t.term && <span className="badge badge-gray">Thuật ngữ: {t.term}</span>}
          <span className="badge badge-gray">≈ {t.rowEstimate.toLocaleString('vi-VN')} dòng</span>
          {t.module && <span className="badge badge-gray mono">modules/{t.module}</span>}
        </div>
      </div>
      {t.purpose && <p className="kt-lead">{t.purpose}</p>}
      {t.comment && t.comment !== t.purpose && <blockquote className="kt-comment">{t.comment}</blockquote>}

      <h3 className="kt-h">Cột ({t.columns.length})</h3>
      <table className="grid kt-cols">
        <thead><tr><th>Cột</th><th>Kiểu</th><th>Bắt buộc</th><th>Mặc định</th><th>Ý nghĩa</th></tr></thead>
        <tbody>
          {t.columns.map((c) => (
            <tr key={c.name}>
              <td className="mono">
                {t.primaryKey.includes(c.name) && <span className="kt-pk" title="Khoá chính">PK</span>}
                {c.name}
              </td>
              <td className="mono kt-muted">{c.type}</td>
              <td>{c.nullable ? '' : '✓'}</td>
              <td className="mono kt-muted kt-def">{c.identity ? 'tự tăng' : c.default ?? ''}</td>
              <td>
                {c.comment ?? <span className="kt-muted">{c.hint}</span>}
                {c.references && <div className="kt-ref">→ <T name={c.references.table} onTable={onTable} />.<span className="mono">{c.references.column}</span></div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="kt-two">
        <div>
          <h3 className="kt-h">Trỏ tới</h3>
          {t.foreignKeys.length ? (
            <ul className="kt-list">
              {t.foreignKeys.map((k) => (
                <li key={k.name}><span className="mono">({k.columns.join(', ')})</span> → <T name={k.refTable} onTable={onTable} /> <span className="mono kt-muted">({k.refColumns.join(', ')})</span></li>
              ))}
            </ul>
          ) : <p className="kt-muted">Không có khoá ngoại.</p>}
        </div>
        <div>
          <h3 className="kt-h">Được trỏ bởi</h3>
          {t.referencedBy.length ? (
            <ul className="kt-list">
              {t.referencedBy.map((k) => (
                <li key={k.name}><T name={k.table} onTable={onTable} /> <span className="mono kt-muted">({k.columns.join(', ')})</span></li>
              ))}
            </ul>
          ) : <p className="kt-muted">Không bảng nào trỏ tới.</p>}
        </div>
      </div>

      {t.triggers.length > 0 && (
        <>
          <h3 className="kt-h">Luật bảo vệ (trigger)</h3>
          <table className="grid">
            <tbody>
              {t.triggers.map((g) => (
                <tr key={g.name}>
                  <td style={{ width: 260 }} className="mono">{g.name}</td>
                  <td>{g.note}<details><summary className="kt-muted">Định nghĩa</summary><pre className="kt-pre">{g.def}</pre></details></td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {t.constraints.length > 0 && (
        <>
          <h3 className="kt-h">Ràng buộc</h3>
          <table className="grid">
            <tbody>
              {t.constraints.map((c) => (
                <tr key={c.name}><td style={{ width: 260 }} className="mono">{c.name}</td><td>{c.kind === 'unique' ? 'Duy nhất' : 'Kiểm tra'}</td><td className="mono kt-def">{c.def}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {t.indexes.length > 0 && (
        <>
          <h3 className="kt-h">Chỉ mục</h3>
          <table className="grid">
            <tbody>
              {t.indexes.map((i) => (
                <tr key={i.name}><td style={{ width: 260 }} className="mono">{i.name}</td><td className="mono kt-def">{i.def.replace(/^CREATE (UNIQUE )?INDEX \S+ ON (public\.)?/, i.unique ? 'DUY NHẤT · ' : '')}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <h3 className="kt-h">Xem dữ liệu (DBeaver / psql)</h3>
      <pre className="kt-pre">{`SELECT * FROM ${t.name}${t.columns.some((c) => c.name === 'tenant_id') ? '\n WHERE tenant_id = 1' : ''}\n ORDER BY ${t.primaryKey[0] ?? t.columns[0]?.name ?? '1'} DESC\n LIMIT 50;`}</pre>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Thuật ngữ ↔ bảng

const TERMS: { term: string; plain: string; dev: string; tables: string[]; code: string }[] = [
  { term: 'Tài khoản', plain: 'Một "cái hộp" có mã số: 111 tiền mặt, 131 khách nợ, 156 hàng hoá, 511 doanh thu', dev: 'Một biến / ví có mã', tables: ['accounts'], code: 'modules/accounts' },
  { term: 'Nợ / Có', plain: 'Cột trái / cột phải khi ghi. Không có nghĩa là "nợ tiền"', dev: 'Quy ước dấu: hộp loại 1, 2, 6, 8 tăng bên Nợ; loại 3, 4, 5, 7 tăng bên Có', tables: ['ledger_lines'], code: 'cột debit, credit' },
  { term: 'Chứng từ', plain: 'Bằng chứng của nghiệp vụ: hoá đơn, phiếu thu, phiếu nhập…', dev: 'Input / request gửi vào', tables: ['accounting_events', 'accounting_event_versions'], code: 'modules/documents' },
  { term: 'Định khoản', plain: 'Quyết định ghi vào hộp nào, bên nào, bao nhiêu', dev: 'Hàm ánh xạ chứng từ → [(tài khoản, bên, số tiền)]', tables: ['posting_reasons', 'product_posting_groups', 'posting_defaults', 'tax_codes', 'payment_methods'], code: 'modules/posting' },
  { term: 'Bút toán', plain: 'Kết quả ghi: phiếu cha (ledger_entries) + ít nhất 2 dòng con (ledger_lines), tổng Nợ = tổng Có', dev: 'Một transaction / commit', tables: ['ledger_entries', 'ledger_lines'], code: 'modules/ledger' },
  { term: 'Hạch toán (ghi sổ)', plain: 'Hành động ghi bút toán vào sổ', dev: 'INSERT vào log (ledgerService.post)', tables: ['ledger_entries', 'ledger_lines'], code: 'ledger.service.ts' },
  { term: 'Tài khoản đối ứng', plain: 'Tài khoản ở phía bên kia của cùng một cặp Nợ / Có', dev: 'Hai dòng cùng pair_no', tables: ['ledger_lines'], code: 'cột pair_no' },
  { term: 'Sổ nhật ký chung', plain: 'Mọi bút toán xếp theo thời gian', dev: 'Log sắp theo posting_date', tables: ['ledger_lines'], code: 'reports/journals.ts' },
  { term: 'Sổ cái (một tài khoản)', plain: 'Mọi dòng của một hộp', dev: 'Log lọc theo account_code', tables: ['ledger_lines'], code: 'phan-he/ke-toan/reports' },
  { term: 'Phát sinh, số dư', plain: 'Trong kỳ tăng / giảm bao nhiêu; trong hộp đang có bao nhiêu', dev: 'SUM theo khoảng thời gian / SUM tới một ngày', tables: ['ledger_balances_daily'], code: 'report.repository.ts' },
  { term: 'Ghi số âm', plain: 'Sửa sai: ghi lại bút toán cũ với số âm, rồi ghi bút toán đúng', dev: 'git revert', tables: ['ledger_entries', 'ledger_links'], code: 'ledger.service.ts → reverse' },
  { term: 'Liên kết bút toán', plain: 'Bút toán đảo, bút toán trả hàng… trỏ về bút toán gốc để truy vết', dev: 'Bảng cạnh (edge table) chỉ thêm: entry_id → target_entry_id, kèm loại liên kết', tables: ['ledger_links'], code: 'ledger.repository.ts → addLink, linksOf' },
  { term: 'Kỳ kế toán, khoá sổ', plain: 'Một tháng; chốt xong thì không ai sửa', dev: 'Gắn tag release rồi khoá nhánh', tables: ['fiscal_periods', 'period_locks'], code: 'modules/periods' },
  { term: 'Kết chuyển', plain: 'Cuối kỳ đổ doanh thu, chi phí về 911 để ra lãi lỗ, lãi lỗ về 421', dev: 'Reset bộ đếm của kỳ, dồn tổng về một chỗ', tables: ['closing_rules'], code: 'modules/closing' },
  { term: 'Đối trừ công nợ', plain: 'Phiếu thu trừ vào phiếu bán nào; đổi trả: phiếu hoàn trừ vào đơn mua mới (cùng cửa hàng)', dev: 'Bảng ghép cặp khoản Nợ ↔ khoản Có, dựng lại được', tables: ['debt_items', 'debt_allocations'], code: 'modules/debts' },
  { term: 'Đối tượng công nợ', plain: 'Khách hàng, nhà cung cấp… mà mình theo dõi nợ từng người', dev: 'Khoá phụ partner_id trên dòng sổ', tables: ['partners'], code: 'modules/partners' },
  { term: 'Chờ định khoản / chờ định khoản lại', plain: 'Phiếu đã nhận nhưng chưa vào sổ / phiếu đã sửa, sổ còn giữ bản cũ', dev: 'Cờ trên dòng sự kiện: posted_version IS NULL / version > posted_version', tables: ['accounting_events'], code: 'modules/documents' },
  { term: 'Nhật ký định khoản', plain: 'Lịch sử nhận, định khoản, định khoản lại từng chứng từ', dev: 'Bảng chỉ ghi thêm, trigger chặn sửa / xoá', tables: ['posting_log'], code: 'logPosting()' },
  { term: 'Sổ hoá đơn, bảng kê thuế', plain: 'Danh sách hoá đơn tách theo thuế suất để kê khai', dev: 'Bảng phụ dựng từ chứng từ, không phải sổ kế toán', tables: ['tax_invoices', 'tax_invoice_lines'], code: 'modules/tax-invoices' },
  { term: 'Bổ sung thông tin thuế, kỳ kê khai', plain: 'Gắn hoá đơn về muộn, sửa ký hiệu / MST, chọn kỳ kê khai, đánh dấu không được khấu trừ', dev: 'Bản vá (patch) lưu riêng, áp lại mỗi lần chứng từ được ghi sổ lại; cột sinh period_date = kỳ xếp hoá đơn', tables: ['tax_info_patches', 'tax_invoices'], code: 'modules/tax-info' },
  { term: 'Khai bổ sung (01/KHBS)', plain: 'Tờ khai đã nộp mà số liệu đổi: lập lần bổ sung, kèm tiền chậm nộp 0,03%/ngày', dev: 'Phiên bản mới của tờ khai (revision), bản cũ giữ nguyên', tables: ['vat_returns'], code: 'statements/vat-return.service.ts → supplement' },
  { term: 'Giá vốn bình quân tháng', plain: 'Giá mua bình quân của hàng trong tháng, dùng để tính giá vốn hàng bán và giá trị tồn kho', dev: 'SUM(giá trị) / SUM(số lượng) theo mặt hàng, nhóm theo đơn vị hạch toán', tables: ['inventory_movements', 'inventory_costs'], code: 'modules/inventory' },
  { term: 'Hàng đang chuyển', plain: 'Hàng kho đã xuất mà cửa hàng nhận chưa xác nhận (tài khoản 1579)', dev: 'Trạng thái trung gian giữa hai bước của một giao dịch', tables: ['inventory_movements'], code: 'posting/rules/stock.rule.ts' },
  { term: 'Chiều phân tích', plain: 'Khoản mục chi phí, bộ phận, hợp đồng, nhân viên, vụ việc, dự án, nguồn vốn', dev: 'Tag JSON gắn vào dòng sổ (dims.costItem, department, contract, employee, case, project, capitalSource); danh sách chiều ở ANALYSIS_DIMS (packages/contracts)', tables: ['dimensions', 'ledger_lines'], code: 'cột dims' },
];

function TermsTab({ onTable }: { onTable: (n: string) => void }) {
  return (
    <div className="card-body">
      <p className="kt-lead">
        Ba chữ dễ lẫn nhất: <b>định khoản</b> là <i>quyết định</i> ghi vào đâu (như viết hàm); <b>bút toán</b> là <i>kết quả</i> được ghi ra (như một commit);
        <b> hạch toán</b> là <i>hành động</i> ghi (như lệnh INSERT).
      </p>
      <table className="grid">
        <thead><tr><th>Thuật ngữ kế toán</th><th>Nghĩa đơn giản</th><th>Giống trong lập trình</th><th>Bảng</th><th>Code</th></tr></thead>
        <tbody>
          {TERMS.map((x) => (
            <tr key={x.term}>
              <td><b>{x.term}</b></td>
              <td>{x.plain}</td>
              <td>{x.dev}</td>
              <td>{x.tables.map((n, i) => <span key={n}>{i > 0 && ', '}<T name={n} onTable={onTable} /></span>)}</td>
              <td className="mono kt-muted">{x.code}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Tài liệu

function DocsTab({ current, onDoc }: { current: string; onDoc: (k: string) => void }) {
  const doc = businessDocs.find((d) => d.key === current) ?? businessDocs[0];
  const html = useMemo(() => (doc ? (marked.parse(doc.content, { async: false }) as string) : ''), [doc]);
  if (!doc) return <Empty text="Chưa có tài liệu trong docs/nghiep-vu" />;
  return (
    <div className="kt-schema">
      <div className="kt-side">
        {businessDocs.map((d) => (
          <button key={d.key} className={`kt-item ${d.key === doc.key ? 'active' : ''}`} onClick={() => onDoc(d.key)}>{d.title}</button>
        ))}
      </div>
      <div className="kt-detail doc" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
