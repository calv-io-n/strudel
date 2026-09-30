import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playbackStart, compositionScope, activeClips } from '../shared/playback-scope';
import { MuteTimeline } from '../shared/mute-timeline';
import type { Clip } from '../shared/model';
const clip = (id: string, start: number, length = 4, trackId = 'a'): Clip => ({ id, tabId: 'p', trackId, start, length, muted: false });
const transport = { position: 4, begin: 2, end: 8, loop: false };
const project = { clips: [clip('past', 0), clip('overlap', 2), clip('future', 6), clip('end', 10)], tracks: [{ id: 'a', muted: false }, { id: 'b', muted: false }] };
test('ready scope includes overlaps and future clips but excludes clips ending at start', () => {
  assert.deepEqual([...compositionScope(project, transport, 14)], ['overlap', 'future', 'end']);
  assert.equal(playbackStart({ ...transport, position: 14 }, 14), 0);
  assert.equal(compositionScope(project, { ...transport, position: 14 }, 14).size, 4);
});
test('loop scope includes the full eventual loop, with exclusive end boundaries', () => {
  const loop = { position: 6, begin: 2, end: 8, loop: true };
  assert.deepEqual([...compositionScope(project, loop, 14)], ['past', 'overlap', 'future']);
  assert.equal(playbackStart({ ...loop, position: 0 }, 14), 2);
  assert.equal(playbackStart({ ...loop, position: 8 }, 14), 2);
  assert.equal(playbackStart(loop, 14), 6);
});
test('clip and track mutes override solo', () => {
  const clips = [clip('a', 0), clip('b', 0, 4, 'b'), { ...clip('muted', 0, 4, 'b'), muted: true }];
  assert.deepEqual([...compositionScope({ ...project, clips, soloTrackId: 'b' }, { ...transport, position: 0 }, 4)], ['b']);
  assert.equal(compositionScope({ clips, tracks: [{ id: 'a', muted: true }, { id: 'b', muted: true }] }, { ...transport, position: 0 }, 4).size, 0);
});
test('active spans handle simultaneous clips and exclusive right edges', () => {
  const included = new Set(project.clips.map(c => c.id));
  assert.deepEqual([...activeClips(project.clips, 2, included)], ['past', 'overlap']);
  assert.deepEqual([...activeClips(project.clips, 4, included)], ['overlap']);
  assert.equal(activeClips(project.clips, 14, included).size, 0);
});
test('queued mute and solo scope follows the effective playback boundary', () => {
  const mutes = new MuteTimeline(), clips = [clip('a', 0), clip('b', 0, 4, 'b')];
  mutes.reset(clips, project.tracks);
  assert.equal(mutes.queue(clips, project.tracks, 1.2, 'b'), 2);
  assert.equal(mutes.isMutedAt('a', 1.99), false);
  assert.equal(mutes.isMutedAt('a', 2), true);
  assert.equal(mutes.isMutedAt('b', 2), false);
  mutes.settle(2);
  assert.equal(mutes.isMutedAt('a', 2.1), true);
});
test('empty compositions have no scope', () => {
  assert.equal(compositionScope({ clips: [], tracks: [] }, transport, 0).size, 0);
});
