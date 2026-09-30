import { browserMidi } from './browser-midi';
import type { BridgeStatus } from '../shared/model';

/** The same connection controls live beside recording, the instrument, and settings. */
export class MidiConnections {
  private views: { root: HTMLElement; expanded: boolean }[] = [];
  private busy = false;
  private error = '';
  private waitingForDevice = false;
  private status: BridgeStatus = browserMidi.status;
  private selected: string[] = [];
  constructor(private onScreen: () => void, private changed: () => void) {}
  mount(label: string, onScreen = this.onScreen) {
    const root = document.createElement('section'); root.className = 'midi-connection'; root.setAttribute('aria-label', label);
    const view = { root, expanded: false }; this.views.push(view);
    root.innerHTML = '<div class="midi-connection-row"><span data-midi-status role="status"></span><span data-midi-activity class="hint"></span><button data-midi-enable>Connect controller</button><button data-midi-devices class="bare" aria-expanded="false" hidden>Change device</button><button data-midi-screen class="bare">On-screen keys</button></div><div data-midi-inputs hidden></div>';
    root.querySelector<HTMLButtonElement>('[data-midi-enable]')!.onclick = () => void this.enable();
    root.querySelector<HTMLButtonElement>('[data-midi-devices]')!.onclick = () => { view.expanded = !view.expanded; this.render(); };
    root.querySelector<HTMLButtonElement>('[data-midi-screen]')!.onclick = onScreen;
    root.querySelector('[data-midi-inputs]')!.addEventListener('change', event => {
      const input = event.target as HTMLInputElement;
      if (input.matches('[data-midi-choice]')) void this.connect(input.value, true);
    });
    this.render(); return root;
  }
  private activityTimer?: ReturnType<typeof setTimeout>;
  private activityText = '';
  activity(text: string) { this.activityText = text; if (this.activityTimer) return; this.activityTimer = setTimeout(() => { this.activityTimer = undefined; for (const { root } of this.views) root.querySelector('[data-midi-activity]')!.textContent = this.activityText; }, 100); }
  update(status: BridgeStatus, selected: string[]) {
    this.status = status; this.selected = selected;
    this.render();
    if (this.waitingForDevice && !this.busy && status.ports.length === 1 && !selected.length) {
      this.waitingForDevice = false; void this.connect(status.ports[0], true);
    }
  }
  private name(port: string) { return port.replace(/ \[[^\]]+\]$/, ''); }
  private async enable() {
    this.busy = true; this.error = ''; this.render();
    try {
      const status = await browserMidi.enable();
      if (status.ports.length === 1 && !this.selected.length) await browserMidi.select(status.ports[0]);
      this.waitingForDevice = status.ports.length === 0 && !this.selected.length;
      this.views.forEach(view => { view.expanded = status.ports.length > 1 && !this.selected.length; });
      this.changed();
    } catch (error) { this.error = (error as Error).message; }
    finally { this.busy = false; this.update(this.status, this.selected); }
  }
  private async connect(port: string, connected: boolean) {
    this.busy = true; this.error = ''; this.waitingForDevice = false; this.render();
    try { await browserMidi.select(connected && port ? port : undefined); this.views.forEach(view => { view.expanded = false; }); this.changed(); }
    catch (error) { this.error = (error as Error).message; }
    finally { this.busy = false; this.update(this.status, this.selected); }
  }
  private render() {
    const supported = !!navigator.requestMIDIAccess;
    const connected = this.status.connected;
    const text = this.busy ? 'Connecting MIDI…' : this.error || (connected.length ? `MIDI · ${connected.map(port => this.name(port)).join(', ')}` : !supported ? 'MIDI is unavailable in this browser. On-screen keys are ready.' : !this.status.ready ? 'Connect a MIDI keyboard or use on-screen keys.' : this.selected.length ? `Waiting for ${this.selected.map(port => this.name(port)).join(', ')} to reconnect.` : this.status.ports.length ? 'Choose your MIDI input.' : 'Plug in your MIDI keyboard. It will appear here.');
    for (const view of this.views) {
      const { root } = view;
      root.querySelector('[data-midi-status]')!.textContent = text;
      root.dataset.connected = String(connected.length > 0);
      const enable = root.querySelector<HTMLButtonElement>('[data-midi-enable]')!;
      enable.hidden = this.status.ready && !this.error; enable.disabled = this.busy || !supported; enable.textContent = this.error ? 'Retry MIDI connection' : 'Connect controller';
      const devices = root.querySelector<HTMLButtonElement>('[data-midi-devices]')!;
      devices.hidden = !this.status.ready || !this.status.ports.length && !this.selected.length;
      const expanded = view.expanded || this.status.ready && !connected.length;
      devices.setAttribute('aria-expanded', String(expanded));
      const inputs = root.querySelector<HTMLElement>('[data-midi-inputs]')!; inputs.hidden = !expanded;
      const ports = [...new Set([...this.status.ports, ...this.selected])];
      let choice = inputs.querySelector<HTMLSelectElement>('[data-midi-choice]');
      if (!choice) {
        const label = document.createElement('label'); label.className = 'midi-device-option';
        const name = document.createElement('span'); name.textContent = 'Controller';
        choice = document.createElement('select'); choice.dataset.midiChoice = ''; choice.setAttribute('aria-label', 'MIDI controller');
        label.append(name, choice); inputs.append(label);
      }
      const signature = JSON.stringify([ports, this.status.ports]);
      if (choice.dataset.ports !== signature) {
        choice.replaceChildren(new Option('No controller', ''));
        for (const port of ports) choice.add(new Option(this.name(port) + (this.status.ports.includes(port) ? '' : ' (disconnected)'), port));
        choice.dataset.ports = signature;
      }
      choice.value = this.selected[0] ?? '';
      choice.disabled = this.busy;

    }
  }
}
