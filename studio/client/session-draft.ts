import { read, write } from './storage/database';
import { parseProject, type Project } from '../shared/model';
import { sessionChanges } from '../shared/session-changes';
export type SessionDraft = { version: 1; project: Project; base?: Project; updatedAt?: number };
export function decodeDraft(text: string): SessionDraft {
  const value = JSON.parse(text);
  return value.version === 1 && value.project ? { version: 1, project: parseProject(value.project), base: value.base ? parseProject(value.base) : undefined, updatedAt: value.updatedAt } : { version: 1, project: parseProject(value) };
}
export class SessionDrafts {
  key = '';
  private writes = Promise.resolve();
  storageKey(sessionId?: string) { return `${this.key}:${sessionId ?? 'new'}`; }
  async recover(sessionId?: string) {
    await this.writes.catch(() => {});
    let local: SessionDraft | undefined;
    try { local = this.read(sessionId); } catch { /* Recover from durable storage if the local cache is unavailable or damaged. */ }
    const durable = await read<SessionDraft>('pending', this.storageKey(sessionId));
    return durable && (!local || (durable.updatedAt ?? 0) > (local.updatedAt ?? 0)) ? durable : local;
  }
  async flush() { await this.writes; }
  private release?: () => void;
  async initialize() {
    let id = sessionStorage.getItem('studio.tab') || crypto.randomUUID();
    const claim = (id: string) => new Promise<boolean>((resolve, reject) => {
      void navigator.locks.request(`studio-draft:${id}`, { ifAvailable: true }, lock => {
        if (!lock) { resolve(false); return; }
        return new Promise<void>(release => { this.release = release; resolve(true); });
      }).catch(reject);
    });
    if (!await claim(id)) { id = crypto.randomUUID(); await claim(id); }
    sessionStorage.setItem('studio.tab', id); this.key = `studio.pending-session.${id}`;
    window.addEventListener('pagehide', () => this.release?.(), { once: true });
  }
  read(sessionId?: string) {
    const text = (sessionId ? localStorage.getItem(`${this.key}:${sessionId}`) : null) ?? localStorage.getItem(this.key) ?? localStorage.getItem('studio.pending-session');
    const draft = text ? decodeDraft(text) : undefined;
    return !sessionId || draft?.project.sessionId === sessionId ? draft : undefined;
  }
  cache(project: Project, base?: Project) {
    if (!this.key) return;
    const key = this.storageKey(project.sessionId);
    const draft: SessionDraft = { version: 1, project, base, updatedAt: Date.now() };
    const clean = !!base && !sessionChanges(project, base).dirty;
    this.writes = this.writes.catch(() => {}).then(() => write([{ collection: 'pending', key, ...(clean ? { delete: true } : { value: draft }) }]));
    void this.writes.catch(() => {});
    if (clean) { localStorage.removeItem(key); if (this.read()?.project.sessionId === project.sessionId) localStorage.removeItem(this.key); }
    else { const text = JSON.stringify(draft); localStorage.setItem(key, text); localStorage.setItem(this.key, text); }
  }
  clear(sessionId = this.read()?.project.sessionId) { if (this.key) { this.writes = this.writes.catch(() => {}).then(() => write([{ collection: 'pending', key: this.storageKey(sessionId), delete: true }])); void this.writes.catch(() => {}); localStorage.removeItem(`${this.key}:${sessionId ?? 'new'}`); if (this.read()?.project.sessionId === sessionId) localStorage.removeItem(this.key); } }
}
