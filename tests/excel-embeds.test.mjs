// Excel embed parsing, allow-list, structured storage and body splitting. Pure, no network.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseEmbedInput, isAllowedEmbedUrl, normalizeEmbeds, splitBodySegments, embedToken, openInExcelUrl, stripEmbedTokens } from '../src/lib/excelEmbeds.js';

const OD = 'https://onedrive.live.com/embed?resid=ABC%21123&authkey=%21XYZ&em=2&wdAllowInteractivity=False';
const SP = 'https://achtungkraft.sharepoint.com/:x:/s/ops/EabcDEF?e=1';
const SPDOC = 'https://achtungkraft-my.sharepoint.com/personal/matt/_layouts/15/Doc.aspx?sourcedoc={x}&action=embedview';

test('valid OneDrive iframe code → src extracted and &amp; decoded', () => {
  const r = parseEmbedInput(`<iframe width="402" height="346" frameborder="0" scrolling="no" src="${OD.replace(/&/g, '&amp;')}" title="Budget"></iframe>`);
  assert.equal(r.error, undefined);
  assert.equal(new URL(r.url).searchParams.get('authkey'), '!XYZ');
  assert.equal(r.title, 'Budget');
});
test('valid raw URLs accepted', () => {
  for (const u of [OD, SP, SPDOC, 'https://1drv.ms/x/c/abc/IQabc?em=2', 'https://view.officeapps.live.com/op/embed.aspx?src=x']) assert.ok(parseEmbedInput(u).url, u);
});
test('invalid sources rejected', () => {
  for (const u of [
    'http://onedrive.live.com/embed?x', 'https://evil.com/embed', 'https://onedrive.live.com.evil.com/embed',
    'https://sharepoint.com.evil.com/:x:/a', 'https://evil.com/?u=https://onedrive.live.com/embed', 'javascript:alert(1)',
    'https://user:pw@onedrive.live.com/embed', 'https://onedrive.live.com:8443/embed', 'https://onedrive.live.com/download?x',
    'https://contoso.sharepoint.com/sites/x/Shared%20Documents/a.xlsx', 'data:text/html,<script>1</script>',
    '<iframe src="https://evil.com/x"></iframe>', `<iframe src="${OD}"></iframe><iframe src="${OD}"></iframe>`, '<script>alert(1)</script>', '',
  ]) assert.ok(parseEmbedInput(u).error, u);
});
test('normalize keeps only referenced, valid embeds in body order; clamps height', () => {
  const body = `Intro\n${embedToken('bbbbbbbb')}\nMiddle\n${embedToken('aaaaaaaa')}`;
  const out = normalizeEmbeds(body, [
    { id: 'aaaaaaaa', url: OD, height: 99999 }, { id: 'bbbbbbbb', url: SP }, { id: 'cccccccc', url: OD }, { id: 'dddddddd', url: 'https://evil.com' },
  ]);
  assert.deepEqual(out.map(e => [e.id, e.height]), [['bbbbbbbb', 600], ['aaaaaaaa', 1600]]);
});
test('multiple embeds render between text segments in position', () => {
  const body = `Hello\n${embedToken('aaaaaaaa')}\nBetween\n${embedToken('bbbbbbbb')}\nEnd`;
  const segs = splitBodySegments(body, [{ id: 'aaaaaaaa', url: OD }, { id: 'bbbbbbbb', url: SP }]);
  assert.deepEqual(segs.map(s => s.type === 'embed' ? s.embed.id : s.value.trim()), ['Hello', 'aaaaaaaa', 'Between', 'bbbbbbbb', 'End']);
});
test('existing plain text without embeds → single text segment, unchanged', () => {
  const body = 'Line 1\n\n  indented <b>not html</b>\nhttps://example.com';
  assert.deepEqual(splitBodySegments(body, []), [{ type: 'text', value: body }]);
  assert.deepEqual(normalizeEmbeds(body, undefined), []);
});
test('Open in Excel link: SharePoint embedview → view; invalid → null', () => {
  assert.equal(new URL(openInExcelUrl(SPDOC)).searchParams.get('action'), 'view');
  assert.equal(openInExcelUrl('https://evil.com'), null);
});
test('previews strip tokens', () => assert.equal(stripEmbedTokens(`a ${embedToken('aaaaaaaa')} b`), 'a [Excel workbook] b'));