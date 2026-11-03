// Bản dựng GIẢ của kernel cho test CLI: chỉ hình dạng totalsProblems. Không phải luật thật.
export function totalsProblems(doc) {
  const before = (doc.lines ?? []).reduce((s, l) => s + (l.amountBeforeTax ?? 0), 0);
  return before === doc.totals?.beforeTax ? [] : [{ code: 'IN-SUM-001', path: 'totals.beforeTax', message: `Tổng tiền trước thuế ${doc.totals?.beforeTax} ≠ tổng các dòng ${before}` }];
}
