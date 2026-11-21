// Storage Mobile canonical action rules: actions follow the selected object, not the screen.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { itemActions, selectionActions } from '../src/components/storageMobile/actions/storageActions.js';

const keys = (a) => a.map((x) => x.key);
const item = (o = {}) => ({ id: 'e1', size: 2, selected: 2, identified: false, tracked: false, ...o });

test('one unsorted photo: View, Group as Item, Move to Tote', () => {
  const a = selectionActions({ unsorted: 1, groups: [] });
  assert.deepEqual(keys(a), ['view', 'group', 'move']);
  assert.equal(a[2].label, 'Move to Tote');
});

test('several unsorted photos: Group, Separate into Items, Move Selected', () => {
  const a = selectionActions({ unsorted: 3, groups: [] });
  assert.deepEqual(keys(a), ['group', 'individual', 'move']);
  assert.equal(a[2].label, 'Move Selected');
});

test('one documented item (Contents) matches item detail plus View', () => {
  const sel = keys(selectionActions({ unsorted: 0, groups: [item()] }));
  assert.deepEqual(sel, ['open', 'details', 'capture', 'identify', 'separate', 'move']);
  assert.deepEqual(keys(itemActions(item())), sel.slice(1));
});

test('identified item offers Change Part Match', () => {
  assert.equal(itemActions(item({ identified: true })).find((a) => a.key === 'identify').label, 'Change Part Match');
});

test('single-photo item: Separate disabled with a reason', () => {
  const s = itemActions(item({ size: 1, selected: 1 })).find((a) => a.key === 'separate');
  assert.equal(s.disabled, true);
  assert.ok(s.reason);
});

test('tracked inventory: move disabled and explained, no organizing', () => {
  const a = itemActions(item({ tracked: true }));
  assert.deepEqual(keys(a), ['details', 'move']);
  assert.equal(a[1].disabled, true);
});

test('several documented items: Move Selected Contents only', () => {
  const a = selectionActions({ unsorted: 0, groups: [item(), item({ id: 'e2' })] });
  assert.deepEqual(keys(a), ['move']);
  assert.equal(a[0].label, 'Move Selected Contents');
});

test('Photos mode: part of an item selected cannot be moved; separate allowed', () => {
  const a = selectionActions({ unsorted: 0, groups: [item({ size: 3, selected: 1 })] }, { photoLevel: true });
  assert.equal(a.find((x) => x.key === 'move').disabled, true);
  assert.equal(a.find((x) => x.key === 'separate').disabled, false);
  assert.ok(keys(a).includes('group'));
});

test('admin panel (no open/move): organizing only', () => {
  const a = selectionActions({ unsorted: 0, groups: [item()] }, { photoLevel: true, canOpen: false, canMove: false });
  assert.deepEqual(keys(a), ['details', 'identify', 'separate', 'group']);
});