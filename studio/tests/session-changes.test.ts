import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newProject } from '../shared/model';
import { sessionChanges } from '../shared/session-changes';
import { soundBindings } from '../shared/sound-bindings';
test('viewing another tab and storage metadata do not dirty a session', () => {
  const base = newProject(), draft = structuredClone(base);
  draft.activeTabId = 'another'; draft.revision = 42; draft.appliedPatterns = {};
  assert.equal(sessionChanges(draft, base).dirty, false);
});
test('staged edits are attributed to their source and undo clears them', () => {
  const base = newProject(), draft = structuredClone(base);
  draft.tabs[0].code += '\n// draft';
  let changes = sessionChanges(draft, base);
  assert.equal(changes.dirty, true); assert.deepEqual([...changes.patterns], [draft.tabs[0].id]); assert.equal(changes.composition, false);
  draft.tabs[0].code = base.tabs[0].code;
  assert.equal(sessionChanges(draft, base).dirty, false);
  draft.tracks[0].muted = true;
  changes = sessionChanges(draft, base); assert.equal(changes.composition, true); assert.equal(changes.patterns.size, 0);
});
test('named parts have useful display labels without changing replacement identity', () => {
  const bindings = soundBindings('$lead: note("c3").s("sawtooth");\n$chords: note("e3").s("sawtooth");\ns("bd")');
  assert.deepEqual(bindings.map(b => b.label), ['Lead', 'Chords', 'Sound 3']);
  assert.deepEqual(bindings.map(b => b.id), ['literal:0', 'literal:1', 'literal:2']);
});

test('removing or reordering tabs remains dirty without changing their music', () => {
  const base = newProject();
  base.tabs.push({ ...base.tabs[0], id: 'second', name: 'Second' });
  const reordered = structuredClone(base); reordered.tabs.reverse();
  assert.equal(sessionChanges(reordered, base).dirty, true);
  assert.equal(sessionChanges(reordered, base).patterns.size, 0);
  const removed = structuredClone(base); removed.tabs.pop();
  assert.equal(sessionChanges(removed, base).dirty, true);
});
