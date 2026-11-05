// [2026-11-06 12:10 AM Nguyễn Văn Thủy] PHASE-026 — trang đọc cho IT: hàng hoá và giá vốn từ gốc, có mục lục và ô tính thử (đóng góp)
/**
 * HIỂU HÀNG HOÁ VÀ GIÁ VỐN (MH28), mục Nghiệp vụ IT (riêng). Chỉ đọc.
 * Nội dung lấy từ docs/nghiep-vu/11-hang-hoa-gia-von-tu-goc.md, sửa ở đó là trang cập nhật theo.
 */
import { useMemo, useState } from 'react';
import { marked } from 'marked';
import { PageHeader } from '@/components/PageHeader';
import { businessDocs } from '@/help/business-docs';

const DOC_KEY = '11-hang-hoa-gia-von-tu-goc';
const CALC_MARK = '<!-- tinh-thu -->';
const money = (v: number) => (Number.isFinite(v) ? Math.round(v).toLocaleString('vi-VN') : '—');

/** Ô tính thử: cùng một lô tặng, ba cách ghi cho ba đơn giá. */
function TinhThuKhuyenMai() {
  const [v, setV] = useState({ tonSl: 500, tonGt: 50_000_000, muaSl: 100, muaGia: 100_000, tangSl: 10, giaBan: 120_000 });
  const num = (k: keyof typeof v, label: string, hint: string) => (
    <label style={{ display: 'grid', gap: 2, fontSize: 13 }} title={hint}>{label}
      <input className="input" type="number" min={0} value={v[k]} onChange={(e) => setV({ ...v, [k]: Math.max(0, Number(e.target.value)) })} />
    </label>
  );
  const tien = v.muaSl * v.muaGia;
  const cung = (v.tonGt + tien) / (v.tonSl + v.muaSl + v.tangSl);
  const thuong = v.tonSl ? v.tonGt / v.tonSl : 0;
  const k = tien / (v.muaSl + v.tangSl);
  const ntd = (v.tonGt + tien) / (v.tonSl + v.muaSl);
  const rows: { name: string; title: string; don: string; lai: string }[] = [
    { name: 'Chia giá, nhập cùng mã', title: 'Lô mới và hàng đang tồn trộn chung một đơn giá', don: money(cung), lai: money(v.giaBan - cung) },
    { name: 'Chia giá, nhập mã riêng', title: 'Hàng đang tồn giữ đơn giá cũ, lô khuyến mại có đơn giá riêng', don: `${money(thuong)} và ${money(k)}`, lai: `${money(v.giaBan - thuong)} và ${money(v.giaBan - k)}` },
    { name: 'Quà cho người tiêu dùng', title: 'Hàng tặng không vào công thức, nằm ở sổ quà giá 0', don: money(ntd), lai: money(v.giaBan - ntd) },
  ];
  return (
    <div className="card card-body" style={{ margin: '12px 0' }}>
      <b>Tính thử: đổi số để xem đơn giá thay đổi</b>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, margin: '8px 0' }}>
        {num('tonSl', 'Tồn đầu: số lượng', 'Số hộp đang tồn của mã thường')}
        {num('tonGt', 'Tồn đầu: giá trị', 'Giá trị hàng đang tồn (đồng)')}
        {num('muaSl', 'Mua: số lượng', 'Số hộp phải trả tiền')}
        {num('muaGia', 'Mua: đơn giá', 'Giá chưa VAT (đồng)')}
        {num('tangSl', 'Được tặng', 'Số hộp NCC tặng')}
        {num('giaBan', 'Giá bán', 'Giá bán chưa VAT (đồng)')}
      </div>
      <table className="grid">
        <thead><tr><th>Cách ghi</th><th className="num" title="Tổng giá trị chia cho số lượng tính giá vốn">Đơn giá vốn</th><th className="num" title="Giá bán trừ đơn giá vốn">Lãi mỗi hộp</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.name} title={r.title}><td>{r.name}</td><td className="num">{r.don}</td><td className="num">{r.lai}</td></tr>)}</tbody>
      </table>
      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Chỉ để hiểu cách tính, không ghi gì vào sổ.</div>
    </div>
  );
}

export function HieuNghiepVuPage() {
  const doc = businessDocs.find((d) => d.key === DOC_KEY);
  const { parts, toc } = useMemo(() => {
    const md = doc?.content ?? '';
    const toc: { id: string; title: string }[] = [];
    let n = 0;
    const renderer = new marked.Renderer();
    const base = renderer.heading.bind(renderer);
    renderer.heading = (t) => {
      if (t.depth !== 2) return base(t);
      const id = `muc-${++n}`;
      toc.push({ id, title: t.text });
      return `<h2 id="${id}">${t.text}</h2>`;
    };
    const parts = md.split(CALC_MARK).map((s) => marked.parse(s, { async: false, renderer }) as string);
    return { parts, toc };
  }, [doc]);
  return (
    <>
      <PageHeader title="Hiểu hàng hoá và giá vốn" code="MH28" helpKey="mh-hieu-nghiep-vu" subtitle="Từ khai báo, mã hàng, khuyến mại đến giá vốn và luồng kế toán" />
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(190px, 240px) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
        <nav className="card card-body" style={{ position: 'sticky', top: 8, fontSize: 13, display: 'grid', gap: 6 }}>
          <b>Mục lục</b>
          {toc.map((t) => <a key={t.id} href={`#${t.id}`} onClick={(e) => { e.preventDefault(); document.getElementById(t.id)?.scrollIntoView({ behavior: 'smooth' }); }}>{t.title}</a>)}
        </nav>
        <div className="card card-body doc" style={{ minWidth: 0 }}>
          {/* Nội dung lấy từ tài liệu trong mã nguồn (không phải dữ liệu người dùng nhập). */}
          {parts.map((html, i) => (
            <div key={i}>
              <div dangerouslySetInnerHTML={{ __html: html }} />
              {i < parts.length - 1 && <TinhThuKhuyenMai />}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
