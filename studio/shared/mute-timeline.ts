import type { Clip } from './model';
import { isClipMuted } from './mix';

export class MuteTimeline {
  private versions: { cycle: number; ids: Set<string> }[] = [];
  reset(clips: Clip[], tracks: { id: string; muted: boolean }[], soloTrackId?: string) { this.versions = [{ cycle: 0, ids: this.snapshot(clips, tracks, soloTrackId) }]; }
  private snapshot(clips: Clip[], tracks: { id: string; muted: boolean }[], soloTrackId?: string) {
    return new Set(clips.filter(c => isClipMuted(c, tracks, soloTrackId)).map(c => c.id));
  }
  queue(clips: Clip[], tracks: { id: string; muted: boolean }[], through: number, soloTrackId?: string) {
    const cycle = Math.floor(Math.max(0, through)) + 1;
    this.versions = this.versions.filter(v => v.cycle < cycle);
    this.versions.push({ cycle, ids: this.snapshot(clips, tracks, soloTrackId) }); return cycle;
  }
  isMutedAt(id: string, cycle: number) {
    for (let i = this.versions.length - 1; i >= 0; i--) {
      if (this.versions[i].cycle <= cycle) return this.versions[i].ids.has(id);
    }
    return false;
  }
  segments(id: string, begin: number, end: number): [number, number][] {
    return this.versions.flatMap((v, i) => {
      const a = Math.max(begin, v.cycle), b = Math.min(end, this.versions[i + 1]?.cycle ?? Infinity);
      return a < b && !v.ids.has(id) ? [[a, b] as [number, number]] : [];
    });
  }
  settle(cycle: number) { while (this.versions.length > 1 && this.versions[1].cycle <= cycle) this.versions.shift(); }
}

