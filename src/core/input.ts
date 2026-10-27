export type Action =
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'jump'
  | 'sprint'
  | 'attack'
  | 'guard'
  | 'dodge'
  | 'knife'
  | 'smoke'
  | 'eagle'
  | 'interact'
  | 'pause'
  | 'mute'
  | 'confirm';

export const KEY_BINDINGS: Record<string, Action[]> = {
  KeyA: ['left'],
  ArrowLeft: ['left'],
  KeyD: ['right'],
  ArrowRight: ['right'],
  KeyW: ['up'],
  ArrowUp: ['up'],
  KeyS: ['down'],
  ArrowDown: ['down'],
  Space: ['jump'],
  ShiftLeft: ['sprint'],
  ShiftRight: ['sprint'],
  KeyJ: ['attack'],
  KeyK: ['guard'],
  KeyL: ['dodge'],
  KeyI: ['knife'],
  KeyO: ['smoke'],
  KeyE: ['eagle'],
  KeyF: ['interact'],
  Escape: ['pause'],
  KeyP: ['pause'],
  KeyM: ['mute'],
  Enter: ['confirm'],
};

/**
 * Keyboard state. `pressed` stays true until the next fixed update tick consumes it,
 * so a tap shorter than one frame is never lost.
 */
export class Input {
  private held = new Set<Action>();
  private pressedSet = new Set<Action>();
  private heldKeys = new Set<string>();
  onFirstInput: (() => void) | null = null;

  attach(target: Window): void {
    target.addEventListener('keydown', (e) => {
      const actions = KEY_BINDINGS[e.code];
      if (actions) e.preventDefault();
      if (this.onFirstInput) {
        this.onFirstInput();
        this.onFirstInput = null;
      }
      if (e.repeat || this.heldKeys.has(e.code)) return;
      this.heldKeys.add(e.code);
      actions?.forEach((a) => this.press(a));
    });
    target.addEventListener('keyup', (e) => {
      this.heldKeys.delete(e.code);
      KEY_BINDINGS[e.code]?.forEach((a) => {
        const stillHeld = [...this.heldKeys].some((k) => KEY_BINDINGS[k]?.includes(a));
        if (!stillHeld) this.held.delete(a);
      });
    });
    target.addEventListener('blur', () => {
      this.held.clear();
      this.heldKeys.clear();
    });
  }

  press(a: Action): void {
    this.held.add(a);
    this.pressedSet.add(a);
  }

  release(a: Action): void {
    this.held.delete(a);
  }

  isHeld(a: Action): boolean {
    return this.held.has(a);
  }

  wasPressed(a: Action): boolean {
    return this.pressedSet.has(a);
  }

  /** Horizontal axis: -1, 0, 1. */
  axisX(): number {
    return (this.isHeld('right') ? 1 : 0) - (this.isHeld('left') ? 1 : 0);
  }

  axisY(): number {
    return (this.isHeld('down') ? 1 : 0) - (this.isHeld('up') ? 1 : 0);
  }

  endTick(): void {
    this.pressedSet.clear();
  }
}
