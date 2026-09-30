import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTabTempo, reconcileTempo } from '../shared/tempo';
import { newProject } from '../shared/model';

test('tempo reconciliation stays correct across edits, BPM changes, overrides and different anchors', () => {
  const code = 'note("c3").gain(slider(.5, 0, 1))';
  const first = reconcileTempo(code, 120);
  assert.equal(reconcileTempo(code, 140).code.includes('setcpm(140 / 4)'), true);
  assert.equal(reconcileTempo(code, 120, 80).code.includes('Pattern: 80 BPM'), true);
  assert.equal(reconcileTempo(code + '\n// changed', 120).code.endsWith('// changed'), true);
  assert.equal(reconcileTempo(code, 120).code, first.code);
  const tab = { ...newProject().tabs[0], code, anchors: [{ id: 'gain', from: 15, fingerprint: 'slider' }] };
  const other = { ...tab, anchors: [{ id: 'other', from: 20, fingerprint: 'slider' }] };
  assert.equal(normalizeTabTempo(other, 120).anchors[0].from - normalizeTabTempo(tab, 120).anchors[0].from, 5);
  assert.equal(normalizeTabTempo(other, 120).anchors[0].id, 'other');
});
