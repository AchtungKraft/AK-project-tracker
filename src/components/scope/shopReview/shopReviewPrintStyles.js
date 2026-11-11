/** Print CSS for the Shop Review layout. Monochrome-safe: hierarchy uses borders and type, not color. */
const SHOP_REVIEW_STYLES = `
@media print {
  /* Hide the app and any body-level overlays (dialogs, lightboxes, close/remove buttons). */
  #root, body > *:not(#shop-print-portal) { display: none !important; }
  #shop-review-root button, #shop-review-root [role="button"] { display: none !important; }
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
#shop-review-root { font-family: 'Segoe UI', system-ui, Arial, sans-serif; color: #111; font-size: 9pt; line-height: 1.25; }
#shop-review-root .sr-cat { border-top: 2.5px solid #111; border-bottom: 1px solid #111; padding: 3px 0 2px; margin: 10px 0 4px; font-size: 11pt; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; break-after: avoid; page-break-after: avoid; }
#shop-review-root .sr-grp { border-left: 3px solid #111; padding: 1px 0 1px 6px; margin: 6px 0 4px; font-size: 9.5pt; font-weight: 700; break-after: avoid; page-break-after: avoid; }
#shop-review-root .sr-item { border: 1px solid #9ca3af; border-radius: 3px; padding: 5px 7px; margin: 0 0 6px; break-inside: avoid; page-break-inside: avoid; }
#shop-review-root .sr-item-head { break-inside: avoid; page-break-inside: avoid; break-after: avoid; page-break-after: avoid; }
#shop-review-root .sr-crumb { font-size: 6.5pt; text-transform: uppercase; letter-spacing: .06em; color: #555; }
#shop-review-root .sr-title { font-size: 10pt; font-weight: 700; margin: 0 0 2px; }
#shop-review-root .sr-status { font-size: 7pt; color: #444; }
#shop-review-root .sr-chip { display: inline-block; border: 1px solid #111; border-radius: 2px; padding: 0 4px; font-size: 6.5pt; line-height: 1.4; font-weight: 700; text-transform: uppercase; margin-right: 4px; color: #111; }
#shop-review-root .sr-chip.soft { border-style: dashed; font-weight: 600; }
#shop-review-root .sr-label { font-size: 6.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: #333; margin: 4px 0 1px; }
#shop-review-root .sr-text { white-space: pre-wrap; word-break: break-word; }
#shop-review-root .sr-muted { color: #555; font-style: italic; }
#shop-review-root table { width: 100%; border-collapse: collapse; }
#shop-review-root .sr-labor { display: flex; flex-wrap: wrap; gap: 1px 14px; }
#shop-review-root .sr-labor b { font-weight: 700; white-space: nowrap; }
#shop-review-root .sr-labor .sr-total { border-left: 1.5px solid #111; padding-left: 8px; font-weight: 600; }
#shop-review-root .sr-imgs { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 2px; }
#shop-review-root .sr-fig { position: relative; margin: 0; width: calc(50% - 2px); break-inside: avoid; page-break-inside: avoid; border: 1px solid #d1d5db; display: flex; align-items: center; justify-content: center; min-height: 0.6in; }
#shop-review-root .sr-fig.single { width: 60%; }
#shop-review-root .sr-fig img { display: block; max-width: 100%; height: auto; max-height: 2.6in; object-fit: contain; }
#shop-review-root .sr-fields { margin-top: 5px; border: 1.5px solid #111; break-inside: avoid; page-break-inside: avoid; }
#shop-review-root .sr-fields td { border: 1px solid #6b7280; padding: 1px 4px; vertical-align: top; height: 0.24in; }
#shop-review-root .sr-fields td.k { width: 0.95in; font-size: 6.5pt; font-weight: 700; text-transform: uppercase; white-space: nowrap; }
#shop-review-root .sr-fields td.tall { height: 0.36in; }
#shop-review-root * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
`;
export default SHOP_REVIEW_STYLES;