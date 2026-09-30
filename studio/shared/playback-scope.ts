import type { Clip } from './model';
import { isClipMuted } from './mix';

export type PlaybackTransport = { position: number; begin: number; end: number; loop: boolean };

/** The same effective start used by the Play action, without moving the playhead. */
export function playbackStart(transport: PlaybackTransport, length: number, fromBeginning = false) {
  let position = transport.position;
  if (!fromBeginning && transport.loop && (position < transport.begin || position >= transport.end)) position = transport.begin;
  if (position >= length) position = transport.loop ? transport.begin : 0;
  return position;
}

export function includedClips(clips: Clip[], transport: PlaybackTransport, length: number, muted: (clip: Clip) => boolean) {
  // A loop eventually reaches its entire range, even when starting in the middle.
  const begin = transport.loop ? transport.begin : playbackStart(transport, length);
  const end = transport.loop ? transport.end : length;
  return new Set(clips.filter(c => !muted(c) && c.start < end && c.start + c.length > begin).map(c => c.id));
}

export function compositionScope(project: { clips: Clip[]; tracks: { id: string; muted: boolean }[]; soloTrackId?: string }, transport: PlaybackTransport, length: number) {
  return includedClips(project.clips, transport, length, c => isClipMuted(c, project.tracks, project.soloTrackId));
}

export function activeClips(clips: Clip[], position: number, included: ReadonlySet<string>) {
  return new Set(clips.filter(c => included.has(c.id) && c.start <= position && position < c.start + c.length).map(c => c.id));
}
