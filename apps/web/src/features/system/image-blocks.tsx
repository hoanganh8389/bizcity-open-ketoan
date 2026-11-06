// [2026-11-06 02:40 AM Nguyễn Văn Thủy] MENU — khối ảnh thay được: danh sách khối, hook đọc, thành phần hiển thị theo máy tính / điện thoại (đóng góp)
/**
 * KHỐI ẢNH: chỗ đặt ảnh trên giao diện mà đơn vị tự thay được ở màn Khối ảnh (HT11), như logo.
 * Thêm khối mới: thêm một dòng vào IMAGE_BLOCKS rồi đặt <KhoiAnh blockKey="…" /> vào chỗ cần hiện. Không cần sửa máy chủ.
 * Thứ tự lấy ảnh: màn nhỏ dùng ảnh điện thoại, không có thì dùng ảnh máy tính; ảnh máy tính không có thì dùng ảnh mặc định.
 */
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface ImageBlockDef {
  key: string;
  label: string;
  /** Khối này hiện ở đâu. */
  where: string;
  /** Ảnh có sẵn khi đơn vị chưa cài (đặt trong apps/web/public). */
  defaultSrc: string;
  alt: string;
  desktopHint: string;
  mobileHint: string;
}

export const IMAGE_BLOCKS: ImageBlockDef[] = [
  {
    key: 'tong-quan-banner', label: 'Banner Tổng quan', where: 'Cột phải trang Tổng quan', defaultSrc: '/tong-quan-banner.jpg',
    alt: 'BTsoft ERP: giải pháp quản trị doanh nghiệp toàn diện, linh hoạt và hiện đại',
    desktopHint: 'Nên dùng ảnh ngang 16:9, rộng 1000 điểm ảnh trở lên', mobileHint: 'Nên dùng ảnh ngang 16:9, rộng 800 điểm ảnh',
  },
];

export type BlockImages = Record<string, { desktop?: string; mobile?: string }>;
export const IMAGE_BLOCKS_URL = '/api/v1/tenant/image-blocks';
export const IMAGE_BLOCKS_KEY = ['image-blocks'];
/** Màn nhỏ hơn mức này dùng ảnh điện thoại, trùng mốc giao diện điện thoại của phần mềm. */
const MOBILE_MEDIA = '(max-width: 900px)';

export const useImageBlocks = () => useQuery({ queryKey: IMAGE_BLOCKS_KEY, queryFn: () => api.get<BlockImages>(IMAGE_BLOCKS_URL), staleTime: 300_000, retry: false });

/** Hiện một khối ảnh. Chưa tải xong hoặc lỗi thì dùng ảnh mặc định, không để trống. */
export function KhoiAnh({ blockKey, className }: { blockKey: string; className?: string }) {
  const def = IMAGE_BLOCKS.find((b) => b.key === blockKey);
  const set = useImageBlocks().data?.[blockKey];
  if (!def) return null;
  return (
    <picture>
      {set?.mobile && <source media={MOBILE_MEDIA} srcSet={set.mobile} />}
      <img className={className} src={set?.desktop ?? def.defaultSrc} alt={def.alt} />
    </picture>
  );
}
