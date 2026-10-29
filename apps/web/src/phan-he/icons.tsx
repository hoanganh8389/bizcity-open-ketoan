/** Biểu tượng phân hệ theo tên (ModuleMeta.icon). Thêm biểu tượng mới: import từ lucide-react và thêm vào ICONS. */
import { BookMarked, Braces, Building2, Calculator, Landmark, LayoutGrid, Settings, ShoppingCart, Truck, Wallet, Warehouse, type LucideIcon } from 'lucide-react';

const ICONS: Record<string, LucideIcon> = { BookMarked, Braces, Building2, Calculator, Landmark, LayoutGrid, Settings, ShoppingCart, Truck, Wallet, Warehouse };

export function ModuleIcon({ name, size = 20, color }: { name: string; size?: number; color?: string }) {
  const I = ICONS[name] ?? LayoutGrid;
  return <I size={size} color={color} />;
}
