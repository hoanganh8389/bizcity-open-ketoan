// [2026-11-11 Nguyễn Văn Thủy] Hồ sơ in (HT16) phía giao diện: nạp hồ sơ áp tại chi nhánh đang làm việc (đóng góp)
/**
 * Hồ sơ in: thông tin đơn vị trên bản in, hiện / ẩn, ngày ký, người ký. Khai báo + mặc định ở @ketoan/contracts (print-profile.ts);
 * máy chủ gộp mặc định ← cả đơn vị ← chi nhánh. Chưa nạp được (mất mạng, chưa đăng nhập) thì in theo mặc định.
 */
import { createContext, useContext } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PRINT_PROFILE_DEFAULT, signerRoleOf, type PrintProfile, type PrintProfileInput } from '@ketoan/contracts';
import { api } from '@/lib/api';

export interface PrintProfileRead {
  effective: PrintProfile;
  tenant: PrintProfileInput;
  /** Hồ sơ riêng của chi nhánh đang hỏi; null = theo cả đơn vị. */
  branch: PrintProfileInput | null;
  updatedBy: string | null;
  updatedAt: string | null;
}

export const printProfileKey = (branchCode: string) => ['print-profile', branchCode] as const;

export function usePrintProfile(branchCode = '') {
  return useQuery({
    queryKey: printProfileKey(branchCode),
    queryFn: () => api.get<PrintProfileRead>('/api/v1/print-profile', { branchCode }),
    staleTime: 60_000,
    retry: false,
  });
}

/** Ô ký in sẵn trên mẫu → tiêu đề + tên theo hồ sơ (khớp chức danh theo aliases). Mẫu đã truyền tên thì giữ tên của mẫu. */
export function signFromProfile<S extends { title: string; name?: unknown }>(s: S, profile: PrintProfile = PRINT_PROFILE_DEFAULT): S {
  const role = signerRoleOf(s.title);
  const p = role && profile.signers.find((x) => x.role === role);
  if (!p) return s;
  const def = PRINT_PROFILE_DEFAULT.signers.find((x) => x.role === role)!;
  // Tiêu đề chỉ thay khi người dùng đã đổi khác mặc định (giữ chữ in sẵn của mẫu, vd "Người lập", "Người ghi sổ").
  return { ...s, title: p.title && p.title !== def.title ? p.title : s.title, name: s.name || p.name || undefined };
}

/** Hồ sơ in của lần in đang dựng (PrintJob đặt vào); khối Signs / OrgHead đọc. Ngoài lúc in = mặc định. */
export const PrintProfileCtx = createContext<PrintProfile>(PRINT_PROFILE_DEFAULT);
export const usePrintProfileCtx = () => useContext(PrintProfileCtx);
