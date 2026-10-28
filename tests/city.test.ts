import { describe, expect, it } from 'vitest';
import { hasFloorAt } from '../src/systems/physics';
import { TOTAL_DOCS } from '../src/systems/progress';
import { GROUND_Y, buildCity } from '../src/world/city';
import { Tile } from '../src/world/tilemap';

describe('city layout', () => {
  const city = buildCity();

  it('is deterministic', () => {
    const again = buildCity();
    expect(again.guards.length).toBe(city.guards.length);
    expect(Array.from(again.map.data)).toEqual(Array.from(city.map.data));
  });

  it('places every target exactly once', () => {
    for (const t of city.targets) expect(city.guards.filter((g) => g.targetId === t.id)).toHaveLength(1);
    expect(city.targets).toHaveLength(6);
  });

  it('has three hideouts and the full set of documents on rooftops', () => {
    expect(city.hideouts).toHaveLength(3);
    expect(city.docs).toHaveLength(TOTAL_DOCS);
    expect(new Set(city.docs.map((d) => d.id)).size).toBe(TOTAL_DOCS);
    for (const d of city.docs) expect(city.map.at(d.x, d.y + 20)).toBe(Tile.Roof);
  });

  it('puts food on the streets and potions on rooftops in every district', () => {
    const food = city.pickups.filter((p) => p.kind === 'food');
    const potions = city.pickups.filter((p) => p.kind === 'potion');
    expect(food).toHaveLength(18);
    expect(potions).toHaveLength(6);
    for (const f of food) expect(f.y).toBe(GROUND_Y - 12);
    for (const p of potions) expect(city.map.at(p.x, p.y + 16)).toBe(Tile.Roof);
    expect(new Set(city.pickups.map((p) => p.id)).size).toBe(city.pickups.length);
  });

  it('spawns every guard on a floor', () => {
    for (const g of city.guards) expect(hasFloorAt(city.map, g.x, g.y - 1), `${g.kind} at ${g.x},${g.y}`).toBe(true);
  });

  it('keeps patrols away from hideouts so respawns are safe', () => {
    for (const h of city.hideouts) {
      const near = city.guards.filter((g) => g.y === GROUND_Y && g.minX < h.x + 400 && g.maxX > h.x - 400 && g.district === h.district);
      expect(near).toEqual([]);
    }
  });
});
