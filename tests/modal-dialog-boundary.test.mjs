import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('..', import.meta.url));
const owner = 'components/modal-dialog.tsx';

test('application JSX uses ModalDialog for native dialogs', () => {
  const violations = [];

  for (const directory of ['app', 'components', 'lib']) {
    for (const file of ts.sys.readDirectory(resolve(root, directory), ['.tsx', '.jsx'])) {
      const path = relative(root, file);
      if (path === owner) continue;

      const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest);
      function visit(node) {
        if (
          (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
          ts.isIdentifier(node.tagName) &&
          node.tagName.text === 'dialog'
        ) {
          const { line, character } = source.getLineAndCharacterOfPosition(node.getStart(source));
          violations.push(`${path}:${line + 1}:${character + 1} use ModalDialog from @/${owner.slice(0, -4)}`);
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
  }

  assert.equal(violations.join('\n'), '');
});
