import { AssetSchema, type Asset, type Project } from '../../shared/model';
import { placeRecordedTake, type TakeIdentity } from '../../shared/recorded-take';
import { wavInfo } from '../../shared/wav';
import { read, exclusive, all, write, type Write } from './database';
import { hash } from './workspace';
import { prepareSessionSave, sessionSaveEntries, type SaveOutcome } from './session-save';
export async function takeAsset(id: string, label: string, recording: NonNullable<Asset['recording']>, blob: Blob): Promise<Asset> {
  const { info, contentHash } = await inspectTake(blob);
  return AssetSchema.parse({ id, label, provider: 'recording', personal: true, createdAt: new Date().toISOString(), format: 'wav', duration: info.frames / info.rate, contentHash, precision: { rate: info.rate, channels: info.channels, bits: info.bits, working: 'float32', originalAvailable: true }, recording: { ...recording, duration: info.frames / info.rate, trimStart: 0, trimEnd: info.frames / info.rate, rate: info.rate, frames: info.frames } });
}
export async function commitRecordedTake(project: Project, identity: TakeIdentity, audio: { asset: Asset; blob: Blob }[], pendingMeta: string, base: Project = project, stagedKey?: string): Promise<SaveOutcome> {
  return exclusive(async () => {
    if (!project.sessionId) throw new Error('Save this session before recording.');
    const staged = stagedKey ? await read<{ project: Project }>('pending', stagedKey) : undefined;
    if (staged?.project.assetIds.includes(identity.assetId)) return { kind: 'unchanged', project: staged.project };
    const existing = (await all<Project>('projects')).find(p => identity.target ? p.assetIds.includes(identity.assetId) : p.tabs.some(t => t.id === identity.tabId));
    if (existing) return { kind: 'unchanged', project: existing };
    const result: SaveOutcome = stagedKey ? { kind: 'unchanged', project: placeRecordedTake(project, audio[0].asset, identity) } : await prepareSessionSave(placeRecordedTake(project, audio[0].asset, identity), base);
    const entries: Write[] = audio.flatMap(({ asset, blob }) => [{ collection: 'assets' as const, key: asset.id, value: asset }, { collection: 'audio' as const, key: asset.id, value: blob }, { collection: 'originals' as const, key: asset.id, value: blob }]);
    entries.push(...(stagedKey ? [{ collection: 'pending' as const, key: stagedKey, value: { version: 1, project: result.project, base, updatedAt: Date.now() } }] : sessionSaveEntries(result)), { collection: 'pending', key: pendingMeta, delete: true });
    await write(entries); return result;
  });
}

async function inspectTake(blob: Blob): Promise<{ info: ReturnType<typeof wavInfo>; contentHash: string }> {
  if (typeof Worker === 'undefined' || blob.size < 16_000_000) { const bytes = await blob.arrayBuffer(); return { info: wavInfo(new Uint8Array(bytes)), contentHash: await hash(bytes) }; }
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../take-info-worker.ts', import.meta.url), { type: 'module' });
    worker.onerror = event => { worker.terminate(); reject(new Error(event.message)); };
    worker.onmessage = ({ data }) => { worker.terminate(); if (data.error) reject(new Error(data.error)); else resolve(data); };
    worker.postMessage(blob);
  });
}
