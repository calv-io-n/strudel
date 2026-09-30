/** Reproducible production-browser CPU/MIDI profile. Run against scripts/serve-static.mjs. */
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { newProject } from '../studio/shared/model';
import { normalizeProjectTempo } from '../studio/shared/tempo';
import { installAudioCapture } from '../studio/tests/audio-capture';
const require = createRequire(import.meta.url), { SourceMapConsumer } = require('source-map-js');
const output = resolve(process.argv[2] ?? '/tmp/studio-profile'); await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'], ...(process.env.STUDIO_CHROMIUM ? { executablePath: process.env.STUDIO_CHROMIUM } : {}) });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(15000);
const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
await page.addInitScript('globalThis.__name = (value) => value');
await installAudioCapture(page);
await page.addInitScript(() => {
  localStorage.setItem('studio.quick-start.opt-out', 'true'); localStorage.setItem('studio.count-in', 'off');
  const input = { id: 'profile', name: 'Profile controller', state: 'connected', onmidimessage: null as any };
  Object.defineProperty(navigator, 'requestMIDIAccess', { value: async () => ({ inputs: new Map([['profile', input]]), onstatechange: null }) });
  const w = window as any; w.profileInput = input;
  w.profileStats = { frames: [], longTasks: [], midiLatency: [], midiDispatch: [], pending: [], startedNotes: 0, mutations: 0 };
  new PerformanceObserver(list => { for (const entry of list.getEntries()) w.profileStats.longTasks.push(entry.duration); }).observe({ entryTypes: ['longtask'] });
  new MutationObserver(list => w.profileStats.mutations += list.length).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  let previous = performance.now(); const frame = (now: number) => { w.profileStats.frames.push(now - previous); previous = now; requestAnimationFrame(frame); }; requestAnimationFrame(frame);
  const start = OscillatorNode.prototype.start;
  OscillatorNode.prototype.start = function (when = 0) {
    if (this.type === 'triangle' && w.profileStats.pending.length) {
      const event = w.profileStats.pending.shift();
      w.profileStats.midiLatency.push(performance.now() - event);
      w.profileStats.startedNotes++;
    }
    return start.call(this, when);
  };
  w.profileSend = (bytes: number[], timestamp = performance.now()) => {
    if (bytes[0] === 0x90 && bytes[2]) w.profileStats.pending.push(timestamp);
    input.onmidimessage?.({ data: new Uint8Array(bytes), timeStamp: timestamp });
  };
});
const cdp = await page.context().newCDPSession(page); await cdp.send('Performance.enable'); await cdp.send('Profiler.enable');
const summaries: any[] = [], maps = new Map<string, any>();
const percentile = (values: number[], p: number) => values.length ? [...values].sort((a,b) => a-b)[Math.min(values.length - 1, Math.floor(values.length * p))] : 0;
async function profile(label: string, work: () => Promise<void>) {
  await page.evaluate(() => { const s = (window as any).profileStats; for (const key of ['frames', 'longTasks', 'midiLatency', 'midiDispatch', 'pending']) s[key] = []; s.startedNotes = 0; s.mutations = 0; });
  const before = (await cdp.send('Performance.getMetrics')).metrics;
  await cdp.send('Profiler.start'); const start = performance.now(); await work(); const duration = performance.now() - start;
  const cpu = (await cdp.send('Profiler.stop')).profile;
  await writeFile(resolve(output, label + '.cpuprofile'), JSON.stringify(cpu));
  const after = (await cdp.send('Performance.getMetrics')).metrics;
  const delta = (name: string) => (after.find(m=>m.name === name)?.value ?? 0) - (before.find(m=>m.name === name)?.value ?? 0);
  const stats = await page.evaluate(() => (window as any).profileStats);
  const times = new Map<number, number>(); cpu.samples?.forEach((id, index) => times.set(id, (times.get(id) ?? 0) + (cpu.timeDeltas?.[index] ?? 0) / 1000));
  const nodes = new Map(cpu.nodes.map(n => [n.id, n]));
  const sources = new Map<string, number>();
  for (const [id, ms] of times) {
    const n = nodes.get(id)!, frame = n.callFrame; let source = frame.url || frame.functionName;
    if (frame.url.startsWith('http://127.0.0.1:5185/assets/')) {
      try { if (!maps.has(frame.url)) maps.set(frame.url, new SourceMapConsumer(JSON.parse(await readFile(resolve('studio/dist', new URL(frame.url).pathname.slice(1) + '.map'), 'utf8'))));
        const original = maps.get(frame.url).originalPositionFor({ line: frame.lineNumber + 1, column: frame.columnNumber });
        source = `${original.source}:${original.line} ${original.name ?? frame.functionName}`;
      } catch { source += `:${frame.lineNumber + 1}:${frame.columnNumber} ${frame.functionName}`; }
    }
    sources.set(source, (sources.get(source) ?? 0) + ms);
  }
  const summary = { label, durationMs: duration, taskMs: delta('TaskDuration') * 1000, scriptMs: delta('ScriptDuration') * 1000, layoutMs: delta('LayoutDuration') * 1000,
    heapMB: after.find(m => m.name === 'JSHeapUsedSize')!.value / 1e6, mutations: stats.mutations, longTasks: stats.longTasks.length, longTaskMaxMs: Math.max(0, ...stats.longTasks),
    frameP95Ms: percentile(stats.frames,.95), frameMaxMs: Math.max(0,...stats.frames), midiNotes: stats.startedNotes, midiDispatchP95Ms: percentile(stats.midiDispatch,.95), midiToOscillatorP95Ms: percentile(stats.midiLatency,.95), midiToOscillatorMaxMs: Math.max(0,...stats.midiLatency),
    topCpu: [...sources].sort((a,b)=>b[1]-a[1]).slice(0,20) };
  summaries.push(summary); await writeFile(resolve(output,'summary.json'),JSON.stringify(summaries,null,2)); console.log(JSON.stringify(summary));
}
try {
  const start = performance.now(); await page.goto('http://127.0.0.1:5185'); await page.locator('#saved-projects').selectOption('Neon-Drive');
  await page.waitForFunction(() => document.querySelector('#composition-content') && !(document.querySelector('#composition-content') as HTMLElement).hidden);
  summaries.push({ label: 'startup', readyMs: performance.now() - start });
  await profile('demo-idle', () => page.waitForTimeout(5000));
  await page.locator('#composition-play').click(); await page.waitForTimeout(500);
  await profile('demo-playback', () => page.waitForTimeout(5000)); await page.locator('#composition-stop').click();
  const project = newProject(); project.name = 'Performance workload'; project.sessionId = 'performance-workload'; project.revision = 1;
  project.tabs = Array.from({ length: 24 }, (_, i) => ({ id: 'p'+i, name: 'Part '+i, color: 'blue' as const, anchors: [], code: `note("<c3 e3 g3 b3>*4").s("sine").gain(slider(0.015,0,0.1,0.001)).decay(0.08).sustain(0)\n` + '// score notes\n'.repeat(150) }));
  project.tracks = Array.from({length:8}, (_, i)=>({id:'track-'+i,name:'Track '+i,muted:false}));
  project.clips = Array.from({length:240},(_,i)=>({id:'c'+i,tabId:'p'+(i%24),trackId:'track-'+(i%8),start:Math.floor(i/8)*4,length:4,muted:false})); project.activeTabId = 'p0';
  project.midiInstrument = { enabled:true,mode:'midi',code:'MIDI.s("triangle").gain(0.1)',appliedCode:'MIDI.s("triangle").gain(0.1)',anchors:[] };
  normalizeProjectTempo(project);
  await page.evaluate(async project => {
    const db = await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('strudel-studio');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    await new Promise<void>((resolve,reject)=>{ const t=db.transaction('projects','readwrite');t.objectStore('projects').put(project,project.sessionId);t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error); }); db.close(); sessionStorage.setItem('studio.session',project.sessionId!);
  }, project);
  await page.reload(); await page.waitForFunction(() => (document.querySelector('#saved-projects') as HTMLSelectElement)?.value === 'performance-workload');
  await profile('heavy-idle', () => page.waitForTimeout(5000));
  await page.locator('#palette-open').click(); await page.locator('#command-palette input').fill('MIDI & on-screen controller'); await page.keyboard.press('Enter'); await page.keyboard.press('Escape');
  await page.locator('#tab-midi-instrument').click(); await page.locator('#midi-editor-connection [data-midi-enable]').click();
  await page.evaluate(() => (window as any).profileSend([0x90,60,100])); await page.waitForTimeout(500); await page.evaluate(() => (window as any).profileSend([0x80,60,0]));
  await page.locator('#composition-play').click(); await page.waitForTimeout(500);
  await page.evaluate(()=>window.neonCapture.start());
  await profile('heavy-playback-midi', async () => {
    await page.evaluate(async () => {
      const w = window as any, start = performance.now();
      for (let i = 0; i < 100; i++) {
        const due = start + i * 60; await new Promise(r=>setTimeout(r,Math.max(0,due-performance.now())));
        w.profileStats.midiDispatch.push(performance.now() - due);
        const pitch = 60 + i % 12; w.profileSend([0x90,pitch,40+i%88]);
        setTimeout(()=>w.profileSend([0x80,pitch,0]),100);
      }
      await new Promise(r=>setTimeout(r,400));
    });
  });
  const sound = await page.evaluate(()=>{const c=window.neonCapture.finish();return {peak:c.peak,seconds:c.seconds,clipped:c.clipped};});
  assert.ok(sound.peak > .001, 'The MIDI/playback workload must generate audio');
  assert.equal(summaries.find(s=>s.label === 'heavy-playback-midi').midiNotes,100);
  summaries.push({label:'audio-output',...sound});
  await page.locator('#tab-p0').click();
  await profile('editing-during-playback', async () => {
    await page.locator('#editor .cm-content:visible').click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.insertText('\n// ');
    await page.keyboard.type('performance profile draft edit', { delay: 40 });
    await page.waitForTimeout(500);
  });
  await page.keyboard.press('ControlOrMeta+Home');
  await page.locator('.tab-editor:not([hidden]) [data-input-function=slider]').first().click();
  await page.getByRole('menuitem', { name: 'Bind MIDI control', exact: true }).click();
  await page.evaluate(() => (window as any).profileSend([176,20,80]));
  await page.waitForFunction(() => Number(document.querySelector('#mapping-count')?.textContent) > 0);
  await profile('mapped-midi-controls', async () => {
    await page.evaluate(async () => {
      for (let i = 0; i < 150; i++) {
        (window as any).profileSend([176,20,i%128]);
        await new Promise(r=>setTimeout(r,20));
      }
      await new Promise(r=>setTimeout(r,500));
    });
  });
  await page.waitForFunction(() => document.querySelector('#saved-state')?.textContent === 'Staged changes autosaved');
  const controllerDraft = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>(resolve=>{const r=indexedDB.open('strudel-studio');r.onsuccess=()=>resolve(r.result);});
    const values = await new Promise<any[]>(resolve=>{const r=db.transaction('pending').objectStore('pending').getAll();r.onsuccess=()=>resolve(r.result);});
    db.close(); return values.find(v=>v?.project?.sessionId === 'performance-workload')?.project.tabs.find((t:any)=>t.id === 'p0')?.code;
  });
  assert.ok(controllerDraft?.includes('slider(0.017,'), 'The final controller value must reach durable staged recovery');
  summaries.push({label:'controller-recovery', finalGain:0.017, durable:true});
  await page.locator('#composition-stop').click();
  await page.locator('#tab-midi-instrument').click();
  await page.locator('#record-toggle').click();
  if (await page.locator('[data-capture=audio]').getAttribute('aria-pressed') === 'true') await page.locator('[data-capture=audio]').click();
  if (await page.locator('[data-capture=midi]').getAttribute('aria-pressed') !== 'true') await page.locator('[data-capture=midi]').click();
  await page.locator('#record-start').click();
  await page.waitForFunction(() => document.querySelector('#record-start')?.textContent === 'Stop recording');
  await profile('live-midi-recording', async () => {
    await page.evaluate(async () => {
      const w = window as any;
      for (let i = 0; i < 50; i++) {
        w.profileSend([0x90,60+i%12,40+i]);
        await new Promise(r=>setTimeout(r,30));
        w.profileSend([0x80,60+i%12,0]);
        await new Promise(r=>setTimeout(r,30));
      }
    });
  });
  await page.locator('#composition-stop').click();
  await page.waitForTimeout(700);
  const recoveredNotes = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>(resolve=>{const r=indexedDB.open('strudel-studio');r.onsuccess=()=>resolve(r.result);});
    const values = await new Promise<any[]>(resolve=>{const r=db.transaction('pending').objectStore('pending').getAll();r.onsuccess=()=>resolve(r.result);});
    db.close(); return values.filter(v=>v?.note?.pitch !== undefined).map(v=>v.note);
  });
  assert.equal(recoveredNotes.length,50);
  assert.deepEqual(recoveredNotes.map(n=>n.velocity),Array.from({length:50},(_,i)=>40+i));
  assert.ok(recoveredNotes.every(n=>n.end >= n.start));
  summaries.push({label:'recorded-midi',count:recoveredNotes.length,velocities:[...new Set(recoveredNotes.map(n=>n.velocity))],first:recoveredNotes[0],last:recoveredNotes.at(-1)});
  await page.screenshot({path:resolve(output,'recording-review.png')});
  await page.waitForTimeout(800); await cdp.send('HeapProfiler.collectGarbage');
  summaries.push({label:'after-stop',metrics:(await cdp.send('Performance.getMetrics')).metrics.filter(m=>['JSHeapUsedSize','Nodes','Documents'].includes(m.name)),errors});
  await writeFile(resolve(output,'summary.json'),JSON.stringify(summaries,null,2));
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
