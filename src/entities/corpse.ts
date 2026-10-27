export interface Corpse {
  x: number;
  y: number;
  /** Already noticed by a guard (or hidden in hay) so it raises no further alarm. */
  discovered: boolean;
}
