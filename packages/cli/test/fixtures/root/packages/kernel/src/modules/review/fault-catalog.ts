// Danh mục F22 GIẢ cho test CLI (cùng khuôn tệp sinh bizcity_fault_catalog@1).
export const FAULT_CATALOG: FaultCatalog = {
  "contract": "bizcity_fault_catalog@1",
  "source": "fixture",
  "groups": { "STK": "Kho, giá vốn" },
  "cases": [
    { "id": "F22-STK-01", "group": "STK", "title": "Tồn kho âm", "detectors": ["INVENTORY_NEGATIVE"], "detectText": "", "level": "warn",
      "personas": ["chief_accountant", "tax_inspector"], "primary": ["tax_inspector"], "consequence": "giá vốn sai", "remedyText": "Nhập bù chứng từ", "verifyText": "INVENTORY_NEGATIVE", "status": "done" },
    { "id": "F22-STK-09", "group": "STK", "title": "Lệnh khoá kỳ", "detectors": ["PERIOD_LOCKED"], "detectText": "", "level": "block",
      "personas": ["auditor"], "primary": ["auditor"], "consequence": "không ghi được", "remedyText": "Mở kỳ ở ACC2", "verifyText": "PERIOD_LOCKED", "status": "done" }
  ]
};
