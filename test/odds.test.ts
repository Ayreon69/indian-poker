import { describe, expect, it } from 'vitest';
import { cardOdds, freshPack } from '../shared/odds';
import { anteFor, packCopies } from '../shared/protocol';

describe('paquet', () => {
  it('contient chaque valeur en autant d’exemplaires que demandé', () => {
    const pack = freshPack(2);
    expect(pack).toHaveLength(20);
    for (let v = 1; v <= 10; v++) expect(pack.filter((c) => c === v)).toHaveLength(2);
  });

  it('grossit avec le nombre de joueurs', () => {
    expect(packCopies(2)).toBe(2);
    expect(packCopies(4)).toBe(3);
    expect(packCopies(8)).toBe(4);
  });
});

describe('probabilités', () => {
  it('compte les cartes visibles et déjà sorties', () => {
    const o = cardOdds(2, [10, 9], [8], 8);
    expect(o.total).toBe(17);
    expect(o.counts[10]).toBe(1);
    expect(o.counts[9]).toBe(1);
    expect(o.counts[8]).toBe(1);
    expect(o.win).toBeCloseTo(2 / 17);
    expect(o.tie).toBeCloseTo(1 / 17);
    expect(o.lose).toBeCloseTo(14 / 17);
    expect(o.ten).toBeCloseTo(1 / 17);
  });

  it('sait quand il est impossible de perdre', () => {
    const o = cardOdds(2, [], [1, 1], 1);
    expect(o.win).toBe(1);
    expect(o.lose).toBe(0);
  });

  it('sait quand un 10 est impossible', () => {
    expect(cardOdds(2, [10], [10], 10).ten).toBe(0);
  });
});

describe('mise de base', () => {
  it('augmente de 1 toutes les 10 manches', () => {
    expect(anteFor(1)).toBe(1);
    expect(anteFor(10)).toBe(1);
    expect(anteFor(11)).toBe(2);
    expect(anteFor(21)).toBe(3);
  });
});
