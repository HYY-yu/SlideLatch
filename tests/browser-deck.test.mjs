import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
// The vendored runtime keeps NodeNext .js specifiers; tsx resolves its TypeScript sources.
test('browser generation integration and shared runtime regression cases',()=>{
  const env={...process.env};
  // A parent node --test worker sets this. Inheriting it makes nested --test silently skip all files.
  delete env.NODE_TEST_CONTEXT;
  const run=spawnSync(process.execPath,['--import','./packages/ppt-dsl/node_modules/tsx/dist/loader.mjs','--test','--test-reporter=tap','tests/browser-deck-cases.ts'],{cwd:new URL('..',import.meta.url),env,encoding:'utf8',timeout:120000,maxBuffer:10*1024*1024});
  const diagnostics=`${run.error?.message??''}\n${run.stdout}\n${run.stderr}`;
  assert.equal(run.status,0,diagnostics);
  assert.doesNotMatch(run.stderr,/skipping running files|called recursively/,diagnostics);
  const count=Number(/^# tests (\d+)$/m.exec(run.stdout)?.[1]);
  const passed=Number(/^# pass (\d+)$/m.exec(run.stdout)?.[1]);
  assert.ok(count>=16,`Expected at least 16 browser cases to actually execute.\n${diagnostics}`);
  assert.equal(passed,count,diagnostics);
  assert.match(run.stdout,/^# skipped 0$/m,diagnostics);
  assert.match(run.stdout,/^# fail 0$/m,diagnostics);
  console.info(`[browser-deck] ${passed}/${count} nested cases executed; 0 skipped`);
});
