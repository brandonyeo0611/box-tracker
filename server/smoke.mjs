// Runs an isolated server; never uses the application's real demo database.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
const dir = mkdtempSync(join(tmpdir(), 'box-tracker-http-'));
const port = '5188';
const child = spawn(process.execPath, ['server/index.ts'], { env: { ...process.env, DATA_DIR: dir, PORT: port }, stdio: ['ignore', 'pipe', 'pipe'] });
const exited = once(child, 'exit');
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Test server did not start')), 10000);
    child.stdout.on('data', data => { if (String(data).includes('Box Tracker:')) { clearTimeout(timer); resolve(); } });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Test server exited: ${code}`)); });
    child.stderr.on('data', data => process.stderr.write(data));
  });
  const base = `http://127.0.0.1:${port}`;
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const post = async (path, body) => {
    const r = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: r.status, data: await r.json() };
  };
  const boxes = async () => (await (await fetch(base + '/api/boxes')).json());
  check((await fetch(base)).status === 200, 'dashboard served');
  check((await fetch(base + '/?view=checkpoint')).status === 200, 'checkpoint served');
  check((await post('/api/tags', { tag: 'smoke-tag', boxId: 'BOX-01' })).status === 200, 'register');
  check((await post('/api/scans', { tag: 'smoke-tag', location: 'Ward A' })).status === 200, 'ward scan');
  const first = (await boxes()).find(b => b.id === 'BOX-01');
  await post('/api/scans', { tag: 'smoke-tag', location: 'Ward A' });
  const repeat = (await boxes()).find(b => b.id === 'BOX-01');
  check(first.deliveredAt === repeat.deliveredAt && repeat.state === 'AT_WARD', 'idempotent repeat');
  check((await post('/api/scans', { tag: 'unknown', location: 'Ward A' })).status === 400, 'unknown tag rejected');
  check((await post('/api/scans', { boxId: 'BOX-01', location: 'Invalid' })).status === 400, 'invalid checkpoint rejected');
  await post('/api/scans', { tag: 'smoke-tag', location: 'Blood Bank' });
  check((await boxes()).find(b => b.id === 'BOX-01').state === 'AT_BLOOD_BANK', 'direct return');
  check((await post('/api/reset', {})).status === 200, 'reset');
  check((await boxes()).every(b => b.location === 'Blood Bank'), 'reset boxes');
  check((await post('/api/scans', { tag: 'smoke-tag', location: 'Ward A' })).status === 400, 'reset mappings');
  console.log('HTTP smoke passed: pages, tag setup, shared reads, repeated scans, validation, return.');
} finally {
  child.kill(); await exited;
  rmSync(dir, { recursive: true, force: true });
}

