/**
 * Thanh tiến độ cho báo cáo nặng: chạy suốt lúc máy chủ đang tính, đếm giây, có nút Huỷ (cắt yêu cầu qua AbortSignal của
 * react-query). Máy chủ không báo được % nên thanh chạy liên tục — số giây cho biết còn đang làm, không treo.
 * Xong thì hiện "Xong trong x giây · n dòng" để người dùng biết lần tìm vừa rồi tốn bao lâu.
 */
import { useEffect, useRef, useState } from 'react';

export function TienDoTai({ dangTai, soDong, onHuy, chuaTim }: { dangTai: boolean; soDong?: number; onHuy?: () => void; chuaTim?: boolean }) {
  const [giay, setGiay] = useState(0);
  const batDau = useRef<number | null>(null);
  const [xong, setXong] = useState<number | null>(null);
  useEffect(() => {
    if (!dangTai) {
      if (batDau.current !== null) setXong((Date.now() - batDau.current) / 1000);
      batDau.current = null;
      return;
    }
    batDau.current = Date.now();
    setGiay(0);
    setXong(null);
    const t = setInterval(() => setGiay(Math.floor((Date.now() - (batDau.current ?? Date.now())) / 1000)), 500);
    return () => clearInterval(t);
  }, [dangTai]);

  if (chuaTim && !dangTai) return <div className="tdt tdt-hint">Chọn kỳ, chi nhánh, mã kho rồi bấm <b>Tìm kiếm</b> — báo cáo chỉ chạy khi bấm (dữ liệu nhiều chi nhánh có thể mất vài chục giây).</div>;
  if (dangTai) {
    return (
      <div className="tdt">
        <div className="tdt-bar"><span /></div>
        <div className="tdt-row">
          <span>Đang tính… <b>{giay}</b> giây{giay >= 20 ? ' — dữ liệu lớn, vui lòng chờ hoặc thu hẹp chi nhánh / kho / kỳ' : ''}</span>
          {onHuy && <button type="button" className="btn btn-xs" onClick={onHuy}>Huỷ</button>}
        </div>
      </div>
    );
  }
  if (xong === null) return null;
  return <div className="tdt tdt-done">Xong trong {xong.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} giây{soDong !== undefined ? ` · ${soDong.toLocaleString('vi-VN')} dòng` : ''}</div>;
}
