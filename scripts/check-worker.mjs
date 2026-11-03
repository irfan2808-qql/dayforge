import {execFileSync} from 'node:child_process';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
const root = resolve(import.meta.dirname, '..');
const out = mkdtempSync(join(tmpdir(), 'df-push-check-'));
try {
  execFileSync(process.execPath, [resolve(root, 'node_modules/typescript/bin/tsc'),'--target', 'ES2022', '--module', 'CommonJS', '--lib', 'ES2022,DOM',
    '--strict', '--skipLibCheck', '--outDir', out,
    resolve(root,'workers/reminder-dispatcher/src/webpush.ts'),
    resolve(root,'workers/reminder-dispatcher/src/index.ts'),
    resolve(root,'workers/reminder-dispatcher/src/cloudflare-types.d.ts')],{stdio:'inherit'});
  execFileSync('node', [resolve(root,'workers/reminder-dispatcher/test/push-test.cjs'),join(out,'webpush.js')],{stdio:'inherit'});
  execFileSync('node', [resolve(root,'workers/reminder-dispatcher/test/dispatch-test.cjs'),join(out,'index.js')],{stdio:'inherit'});
} finally {rmSync(out,{recursive:true,force:true});}
