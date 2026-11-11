/** Print CSS for the Shop Review layout. Monochrome-safe: hierarchy uses borders and type, not color. */
const SHOP_REVIEW_STYLES = `
@media print {
  #root { display: none !important; }
  html, body { height: auto !important; overflow: visible !important; background: white !important; }
  #shop-print-portal { display: block !important; position: static !important; inset: auto !important; overflow: visible !important; height: auto !important; background: white !important; }
  .sr-bar { display: none !important; }
  @page { size: letter; margin: 0.4in; }
  #shop-review-root { max-width: none !important; padding: 0 !important; margin: 0 !important; min-height: 0 !important; box-shadow: none !important; }
}
@media screen {
  #shop-print-portal { position: fixed; inset: 0; z-index: 9999; background: #e5e7eb; overflow-y: auto; }
  #shop-review-root { max-width: 860px; margin: 0 auto; padding: 32px 36px 56px; background: white; min-height: 100vh; }
  .sr-bar { position: sticky; top: 0; z-index: 10; background: #1e293b; padding: 10px 20px; display: flex; gap: 8px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
  .sr-btn { padding: 6px 14px; border-radius: 5px; font-size: 13px; cursor: pointer; border: 1px solid #475569; background: #334155; color: #e2e8f0; }
  .sr-btn.on { background: #2563eb; border-color: #2563eb; color: white; font-weight: 600; }
  .sr-btn:disabled { opacity: .6; cursor: wait; }
}
#shop-review-root { font-family: 'Segoe UI', system-ui, Arial, sans-serif; color: #111; font-size: 9.5pt; line-height: 1.35; }
#shop-review-root .sr-cat { border-top: 3px solid #111; border-bottom: 1px solid #111; padding: 5px 0 3px; margin: 16px 0 6px; font-size: 12pt; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; break-after: avoid; page-break-after: avoid; }
#shop-review-root .sr-grp { border-left: 4px solid #111; padding: 2px 0 2px 7px; margin: 10px 0 6px; font-size: 10.5pt; font-weight: 700; break-after: avoid; page-break-after: avoid; }
#shop-review-root .sr-item { border: 1px solid #9ca3af; border-radius: 4px; padding: 8px 10px; margin: 0 0 10px; }
#shop-review-root .sr-item-head { break-inside: avoid; page-break-inside: avoid; break-after: avoid; page-break-after: avoid; }
#shop-review-root .sr-crumb { font-size: 7.5pt; text-transform: uppercase; letter-spacing: .06em; color: #444; }
#shop-review-root .sr-title { font-size: 11pt; font-weight: 700; margin: 1px 0 4px; }
#shop-review-root .sr-chip { display: inline-block; border: 1px solid #111; border-radius: 3px; padding: 0 5px; font-size: 7.5pt; font-weight: 700; text-transform: uppercase; margin-right: 5px; }
#shop-review-root .sr-chip.soft { border-style: dashed; font-weight: 600; }
#shop-review-root .sr-label { font-size: 7.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: #333; margin: 7px 0 2px; }
#shop-review-root .sr-text { white-space: pre-wrap; word-break: break-word; }
#shop-review-root .sr-muted { color: #555; font-style: italic; }
#shop-review-root table { width: 100%; border-collapse: collapse; }
#shop-review-root .sr-labor td { border-bottom: 1px solid #d1d5db; padding: 2px 4px; }
#shop-review-root .sr-labor td:last-child { text-align: right; white-space: nowrap; width: 1%; }
#shop-review-root .sr-labor tr.sr-total td { border-top: 1.5px solid #111; border-bottom: none; font-weight: 700; }
#shop-review-root .sr-imgs { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
#shop-review-root .sr-fig { margin: 0; width: calc(50% - 3px); break-inside: avoid; page-break-inside: avoid; border: 1px solid #d1d5db; display: flex; align-items: center; justify-content: center; min-height: 0.8in; }
#shop-review-root .sr-fig.single { width: 70%; }
#shop-review-root .sr-fig img { display: block; max-width: 100%; max-height: 3.1in; object-fit: contain; }
#shop-review-root .sr-fields { margin-top: 8px; border: 1.5px solid #111; break-inside: avoid; page-break-inside: avoid; }
#shop-review-root .sr-fields td { border: 1px solid #6b7280; padding: 3px 5px; vertical-align: top; height: 0.28in; }
#shop-review-root .sr-fields td.k { width: 1.45in; font-size: 7.5pt; font-weight: 700; text-transform: uppercase; }
#shop-review-root .sr-fields td.tall { height: 0.55in; }
#shop-review-root * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
`;
export default SHOP_REVIEW_STYLES;