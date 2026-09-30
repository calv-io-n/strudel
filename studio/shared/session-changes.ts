import type { Project } from './model';
import { normalizeTabTempo } from './tempo';
import { defaultAudioCode } from './audio-input';
import { defaultInstrument } from './midi-instrument';
const stable = (value: unknown): string => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v);
const instrument = (p: Project) => { const { appliedCode, appliedAnchors, ...draft } = (p.midiInstrument ?? defaultInstrument(p.midiSound)) as NonNullable<Project['midiInstrument']>; return draft; };
const input = (p: Project) => { if (!p.audioInput) return undefined; const { appliedCode, appliedAnchors, ...draft } = p.audioInput; if (draft.name === 'Audio input' && draft.trackId === p.tracks[0]?.id && draft.enabled && draft.mode === 'audio' && draft.code === defaultAudioCode && !draft.anchors.length) return undefined; return draft; };
const arrangement = (p: Project) => [p.clips, p.tracks, p.soloTrackId, p.bpm, p.snap];
export function sessionChanges(draft: Project, saved?: Project) {
  const normalizedTabs = (p: Project) => p.tabs.map(tab => normalizeTabTempo(tab, p.bpm));
  const draftTabs = normalizedTabs(draft), savedTabs = saved && normalizedTabs(saved);
  const savedPatterns = new Map(savedTabs?.map(tab => [tab.id, stable(tab)]));
  const patterns = new Set(draftTabs.filter(tab => stable(tab) !== savedPatterns.get(tab.id)).map(t => t.id));
  const midi = stable(instrument(draft)) !== (saved && stable(instrument(saved)));
  const audio = stable(input(draft)) !== (saved && stable(input(saved)));
  const composition = stable(arrangement(draft)) !== (saved && stable(arrangement(saved)));
  const content = (p: Project) => { const { activeTabId, revision, sessionId, tabs, appliedPatterns, appliedPatternAnchors, midiInstrument, audioInput, ...rest } = p; return { ...rest, tabOrder: tabs.map(tab => tab.id), midiInstrument: instrument(p), audioInput: input(p) }; };
  return { patterns, midi, audio, composition, dirty: !saved || patterns.size > 0 || stable(content(draft)) !== stable(content(saved)) };
}
