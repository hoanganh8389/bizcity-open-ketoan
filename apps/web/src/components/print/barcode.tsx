/**
 * Mã vạch SVG cho mẫu in (tem hàng, báo giá dạng thẻ), không cần thư viện ngoài.
 *   <Barcode value="8934563138165" />            13 số đúng chữ số kiểm tra → EAN-13; còn lại → Code 128 (bộ B / C tự chọn)
 *   <Barcode value={sku} height={8} width="100%" />  co giãn theo ô tem (vạch giãn đều theo chiều ngang, vẫn quét được)
 * Mã hoá ở barcodeEncode.ts.
 */
import { useMemo } from 'react';
import { code128Widths, ean13Widths, isEan13 } from './barcodeEncode';

/** Vùng lặng hai bên (module): Code 128 cần ≥ 10, EAN-13 trái 11 / phải 7 — lấy 10 cho gọn. */
const QUIET = 10;

export function Barcode({ value, height = 10, moduleWidth = 0.33, width, showText = true, className }: {
  value: string;
  /** Chiều cao vạch (mm). */
  height?: number;
  /** Độ rộng một module (mm) khi không truyền width. */
  moduleWidth?: number;
  /** Độ rộng cả mã (CSS, vd "100%", "40mm"); có thì bỏ qua moduleWidth. */
  width?: string;
  showText?: boolean;
  className?: string;
}) {
  const v = value.trim();
  const { d, total } = useMemo(() => {
    if (!v) return { d: '', total: 0 };
    const w = isEan13(v) ? ean13Widths(v) : code128Widths(v);
    let x = QUIET, path = '';
    w.forEach((n, i) => { if (i % 2 === 0) path += `M${x} 0h${n}v1h-${n}z`; x += n; });
    return { d: path, total: x + QUIET };
  }, [v]);
  if (!v) return null;
  return (
    <div className={`pd-barcode${className ? ` ${className}` : ''}`} style={{ width: width ?? `${total * moduleWidth}mm`, maxWidth: '100%', margin: '0 auto', textAlign: 'center', lineHeight: 1 }}>
      <svg viewBox={`0 0 ${total} 1`} preserveAspectRatio="none" width="100%" style={{ height: `${height}mm`, display: 'block' }} shapeRendering="crispEdges" aria-label={v}>
        <path d={d} fill="#000" />
      </svg>
      {showText && <div style={{ fontSize: '0.85em', letterSpacing: isEan13(v) ? '0.12em' : undefined, marginTop: '0.3mm' }}>{v}</div>}
    </div>
  );
}
