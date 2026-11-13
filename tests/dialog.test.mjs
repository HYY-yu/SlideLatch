import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dismissDialogOnBackdrop } from '../lib/dialog.ts';

function clickDialog({ native = false, child = false, x = 10, y = 10 } = {}) {
  let closed = false;
  const dialog = {
    getBoundingClientRect: () => ({ left: 10, right: 110, top: 10, bottom: 110 }),
    close: () => { closed = true; },
    ...(native ? { closedBy: 'any' } : {}),
  };
  dismissDialogOnBackdrop({
    currentTarget: dialog,
    target: child ? {} : dialog,
    clientX: x,
    clientY: y,
  });
  return closed;
}

test('fallback dismisses the dialog only on the backdrop', () => {
  assert.equal(clickDialog({ x: 9 }), true);
  assert.equal(clickDialog({ y: 111 }), true);
  assert.equal(clickDialog({ x: 50, y: 50 }), false);
  assert.equal(clickDialog({ x: 9, child: true }), false);
});

test('native light dismiss owns backdrop clicks when supported', () => {
  assert.equal(clickDialog({ native: true, x: 9 }), false);
});
