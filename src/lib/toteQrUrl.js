/**
 * Browser-opening tote QR codes (Storage Mobile Phase E).
 *
 * A tote's permanent identity stays `AK_CTR:{24-hex id}` in the database. Printing encodes the
 * same opaque id as an HTTPS link so the iPhone camera opens the tote in AK Projects:
 *   https://projects.achtungkraft.com/st/{id}
 * The link carries no tote name, client or contents; the destination requires login and the
 * backend validates the id. Existing printed AK_CTR text labels keep working in the in-app scanner.
 */
export const STORAGE_QR_ORIGIN = 'https://projects.achtungkraft.com';

const CTR = /^AK_CTR:([a-fA-F0-9]{24})$/;
const URL_RX = /^https?:\/\/[^/\s]+\/st\/([a-fA-F0-9]{24})\/?(?:[?#].*)?$/i;

/** What to encode in a printed tote QR. Non-container values are returned unchanged. */
export function toteQrPayload(qrValue) {
  const m = CTR.exec(String(qrValue || '').trim());
  return m ? `${STORAGE_QR_ORIGIN}/st/${m[1].toLowerCase()}` : qrValue;
}

/** The 24-hex id inside a scanned tote link, or null. */
export function toteIdFromUrl(raw) {
  const m = URL_RX.exec(String(raw || '').trim());
  return m ? m[1].toLowerCase() : null;
}