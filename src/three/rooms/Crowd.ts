import * as THREE from 'three';
import type { CustomerView } from '../../engine/types';
import type { ModelId } from '../assets';
import { Character } from '../Character';

/** Keeps one Character per customer id in a scene; creates and removes them as the snapshot changes. */
export class Crowd {
  private chars = new Map<string, Character>();
  private pending = new Set<string>();
  constructor(private scene: THREE.Scene, private spawn: (c: Character, v: CustomerView) => void) {}

  sync(visible: CustomerView[]) {
    const keep = new Set(visible.map((v) => v.id));
    for (const v of visible) {
      if (this.chars.has(v.id) || this.pending.has(v.id)) continue;
      this.pending.add(v.id);
      const model = (['customer_suki', 'customer_student', 'customer_tita', 'customer_driver'].includes(v.model) ? v.model : 'customer_suki') as ModelId;
      Character.create(model, { bubble: true }).then((c) => {
        this.pending.delete(v.id);
        this.chars.set(v.id, c);
        this.scene.add(c.root);
        this.spawn(c, v);
      });
    }
    for (const [id, c] of this.chars) if (!keep.has(id)) { c.dispose(); this.chars.delete(id); }
  }

  get(id: string) { return this.chars.get(id); }
  update(dt: number, t: number) { for (const c of this.chars.values()) c.update(dt, t); }
}
