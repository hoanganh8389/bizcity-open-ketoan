// [2026-11-11 Nguyễn Văn Thủy] TI14 Nhập dữ liệu từ Excel: một trang cho mọi loại nhập (đóng góp)
/**
 * Trang tập trung các loại dữ liệu nhập được từ Excel (lib/nhapExcel.ts), chia nhóm. Bấm một loại → trình nhập 4 bước.
 * Mỗi thẻ có nút Tải mẫu riêng. ?loai=<id> mở thẳng trình nhập của loại đó (liên kết từ chỗ khác).
 */
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FileSpreadsheet, ShoppingBag } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { NhapExcelWizard } from '@/components/NhapExcelWizard';
import { useAuth } from '@/lib/auth';
import { NHAP_LOAI, nhapLoai, type NhapLoai } from '@/lib/nhapExcel';

export function NhapExcelPage() {
  const { can } = useAuth();
  const canWrite = can('catalog:write');
  const { search } = useLocation();
  const [open, setOpen] = useState<NhapLoai | null>(() => nhapLoai(new URLSearchParams(search).get('loai') ?? '') ?? null);
  const nhoms = [...new Set(NHAP_LOAI.map((l) => l.nhom))];
  return (
    <>
      <PageHeader title="Nhập dữ liệu từ Excel" code="TI14" subtitle="Chọn loại dữ liệu → chọn tệp → ghép cột → kiểm tra từng dòng → nhập dòng hợp lệ" helpKey="nhap-excel" />
      {nhoms.map((n) => (
        <section key={n} className="nx-nhom">
          <h3>{n}</h3>
          <div className="nx-the-list">
            {NHAP_LOAI.filter((l) => l.nhom === n).map((l) => (
              <button key={l.id} type="button" className="card nx-the" disabled={!canWrite} onClick={() => setOpen(l)} title={canWrite ? `Nhập ${l.title.toLowerCase()} từ Excel` : 'Cần quyền ghi danh mục'}>
                <FileSpreadsheet size={26} />
                <span><b>{l.title}</b><small>{l.desc}</small></span>
              </button>
            ))}
          </div>
        </section>
      ))}
      <section className="nx-nhom">
        <h3>Chứng từ</h3>
        <div className="nx-the-list">
          <Link className="card nx-the" to="/mua-hang/tong-hop" title="Ở Tổng hợp mua hàng (MH11): nút Nhập từ Excel lập phiếu nhập mua / đơn đặt từ tệp">
            <ShoppingBag size={26} />
            <span><b>Phiếu nhập mua, đơn đặt hàng</b><small>Mở Tổng hợp mua hàng → Nhập từ Excel</small></span>
          </Link>
        </div>
      </section>
      {open && <NhapExcelWizard loai={open} onClose={() => setOpen(null)} />}
    </>
  );
}
