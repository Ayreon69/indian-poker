import { describe, expect, it } from 'vitest';
import { botBet, randomPersonality } from '../server/bots';
import { Room, type Player } from '../server/room';
import { cardOdds } from '../shared/odds';

function table(players: number, chips?: number): { room: Room; ids: string[] } {
  const room = new Room('TEST');
  const host = room.addHuman('Hôte', 'beret') as Player;
  for (let i = 1; i < players; i++) room.addHuman(`J${i}`, 'cap');
  room.start(host.id);
  if (chips !== undefined) {
    for (const p of room.players) p.chips = chips;
    // On redistribue la première manche avec ces tapis.
    room.hand = null;
    (room as unknown as { handCount: number }).handCount = 0;
    (room as unknown as { startHand: () => void }).startHand();
  }
  return { room, ids: room.hand!.order };
}

function setCards(room: Room, cards: number[]): void {
  room.hand!.order.forEach((id, i) => room.hand!.cards.set(id, cards[i]));
}

const total = (room: Room) => room.players.reduce((s, p) => s + p.chips, 0) + room.carry;

describe('une manche', () => {
  it('prélève la mise de base et donne une carte à chacun', () => {
    const { room, ids } = table(3, 30);
    const h = room.hand!;
    expect(h.ante).toBe(1);
    expect(h.cards.size).toBe(3);
    for (const id of ids) expect(room.get(id)!.chips).toBe(29);
  });

  it('la carte la plus haute gagne le pot', () => {
    const { room, ids } = table(2, 30);
    setCards(room, [9, 4]);
    room.act(ids[0], { type: 'raise', amount: 5 });
    room.act(ids[1], { type: 'call' });
    const r = room.hand!.result!;
    expect(r.kind).toBe('showdown');
    expect(r.winners).toEqual([ids[0]]);
    expect(r.pot).toBe(12);
    expect(room.get(ids[0])!.chips).toBe(36);
    expect(room.get(ids[1])!.chips).toBe(24);
  });

  it('interdit de se coucher quand on peut checker', () => {
    const { room, ids } = table(2, 30);
    expect(room.act(ids[0], { type: 'fold' })).toMatch(/checker/);
  });

  it('plafonne les relances au plus petit tapis', () => {
    const { room, ids } = table(2, 30);
    room.hand = null;
    room.get(ids[0])!.chips = 5;
    (room as unknown as { startHand: () => void }).startHand();
    const first = room.hand!.order[0];
    expect(room.act(first, { type: 'raise', amount: 5 })).toMatch(/Relance entre/);
    expect(room.act(first, { type: 'raise', amount: 4 })).toBeUndefined();
  });

  it('refuse une action hors de son tour', () => {
    const { room, ids } = table(2, 30);
    expect(room.act(ids[1], { type: 'check' })).toMatch(/pas ton tour/);
  });
});

describe('le 10 piégé', () => {
  it('se coucher avec un 10 coûte 10 jetons, versés au gagnant', () => {
    const { room, ids } = table(2, 30);
    setCards(room, [3, 10]);
    room.act(ids[0], { type: 'raise', amount: 2 });
    room.act(ids[1], { type: 'fold' });
    const r = room.hand!.result!;
    expect(r.penalties[ids[1]]).toBe(10);
    expect(r.pot).toBe(14);
    expect(room.get(ids[0])!.chips).toBe(41);
    expect(room.get(ids[1])!.chips).toBe(19);
    expect(r.bluffed).toEqual([ids[1]]);
    expect(room.get(ids[0])!.stats.bluffs).toBe(1);
  });

  it('la pénalité ne dépasse jamais le tapis restant', () => {
    const { room, ids } = table(2, 30);
    room.hand = null;
    room.get(room.players[1].id)!.chips = 4;
    (room as unknown as { startHand: () => void }).startHand();
    const h = room.hand!;
    setCards(room, [5, 10]);
    const [a, b] = h.order;
    room.get(b)!.chips = 3;
    room.act(a, { type: 'raise', amount: 1 });
    room.act(b, { type: 'fold' });
    expect(room.hand!.result!.penalties[b]).toBe(3);
    expect(room.get(b)!.chips).toBe(0);
    expect(ids).toHaveLength(2);
  });

  it('aucune pénalité avec une autre carte', () => {
    const { room, ids } = table(2, 30);
    setCards(room, [3, 9]);
    room.act(ids[0], { type: 'raise', amount: 2 });
    room.act(ids[1], { type: 'fold' });
    expect(room.hand!.result!.penalties).toEqual({});
  });
});

describe('égalités', () => {
  it('le pot reste sur la table pour la manche suivante', () => {
    const { room, ids } = table(2, 30);
    setCards(room, [7, 7]);
    room.act(ids[0], { type: 'check' });
    room.act(ids[1], { type: 'check' });
    expect(room.hand!.result!.kind).toBe('carry');
    expect(room.carry).toBe(2);
    expect(total(room)).toBe(60);
    room.afterHand();
    expect(room.hand!.carryIn).toBe(2);
    expect(room.viewFor(ids[0]).hand!.pot).toBe(4);
  });

  it('le gagnant suivant emporte aussi le report', () => {
    const { room, ids } = table(2, 30);
    setCards(room, [7, 7]);
    room.act(ids[0], { type: 'check' });
    room.act(ids[1], { type: 'check' });
    room.afterHand();
    const [a, b] = room.hand!.order;
    setCards(room, [9, 2]);
    room.act(a, { type: 'check' });
    room.act(b, { type: 'check' });
    expect(room.hand!.result!.pot).toBe(4);
    // 30 − 2 mises de base + le pot de 4.
    expect(room.get(a)!.chips).toBe(32);
    expect(room.carry).toBe(0);
  });

  it('partage le pot si un ex æquo est à sec : une égalité n’élimine personne', () => {
    const { room, ids } = table(2, 30);
    setCards(room, [6, 6]);
    room.act(ids[0], { type: 'raise', amount: 29 });
    room.act(ids[1], { type: 'call' });
    const r = room.hand!.result!;
    expect(r.kind).toBe('split');
    expect(room.get(ids[0])!.chips).toBe(30);
    expect(room.get(ids[1])!.chips).toBe(30);
    expect(room.carry).toBe(0);
  });
});

describe('secret de la carte', () => {
  it('ne révèle jamais sa propre carte avant la fin de la manche', () => {
    const { room, ids } = table(4, 30);
    for (const viewer of ids) {
      const v = room.viewFor(viewer);
      for (const p of v.players) {
        if (p.id === viewer) expect(p.card).toBeNull();
        else expect(p.card).toBeTypeOf('number');
      }
      expect(v.hand!.pack.seen).toHaveLength(0);
      expect(v.hand!.result).toBeNull();
    }
  });

  it('un spectateur voit toutes les cartes', () => {
    const { room } = table(2, 30);
    const s = room.addHuman('Spectateur', 'bob') as Player;
    expect(s.status).toBe('spectator');
    const v = room.viewFor(s.id);
    expect(v.players.filter((p) => p.inHand).every((p) => p.card !== null)).toBe(true);
    expect(v.hand!.options).toBeNull();
  });

  it('révèle tout à la fin de la manche, et les cartes rejoignent le compte', () => {
    const { room, ids } = table(2, 30);
    setCards(room, [4, 8]);
    room.act(ids[0], { type: 'check' });
    room.act(ids[1], { type: 'check' });
    const v = room.viewFor(ids[0]);
    expect(v.players.find((p) => p.id === ids[0])!.card).toBe(4);
    expect(v.hand!.pack.seen).toEqual([4, 8]);
  });
});

describe('paquet', () => {
  it('garde le même paquet puis en ouvre un nouveau quand il est épuisé', () => {
    const { room } = table(2);
    const play = () => {
      const [a, b] = room.hand!.order;
      room.hand!.cards.set(a, 9);
      room.hand!.cards.set(b, 2);
      room.act(a, { type: 'check' });
      room.act(b, { type: 'check' });
      room.afterHand();
    };
    for (let i = 0; i < 9; i++) {
      play();
      expect(room.hand!.freshPack).toBe(false);
    }
    expect(room.deck).toHaveLength(0);
    play();
    expect(room.hand!.freshPack).toBe(true);
    expect(room.seen).toHaveLength(0);
    expect(room.deck).toHaveLength(18);
  });
});

describe('élimination et classement', () => {
  it('classe les joueurs et termine la partie', () => {
    const { room, ids } = table(3, 10);
    const [a, b, c] = ids;
    setCards(room, [10, 5, 2]);
    room.act(a, { type: 'raise', amount: 9 });
    room.act(b, { type: 'call' });
    room.act(c, { type: 'fold' });
    expect(room.get(b)!.chips).toBe(0);
    room.afterHand();
    expect(room.get(b)!.rank).toBe(3);
    expect(room.phase).toBe('playing');
    // Le plus gros tapis gagne : l'autre, à tapis, est éliminé quel que soit l'ordre de parole.
    const [x, y] = room.hand!.order;
    const xIsBig = room.get(x)!.chips > room.get(y)!.chips;
    setCards(room, xIsBig ? [9, 1] : [1, 9]);
    const opt = room.viewFor(x).hand!.options!;
    room.act(x, { type: 'raise', amount: opt.maxRaise });
    room.act(y, { type: 'call' });
    room.afterHand();
    expect(room.phase).toBe('finished');
    expect(room.final!.map((f) => f.rank)).toEqual([1, 2, 3]);
    expect(room.final![0].id).toBe(xIsBig ? x : y);
  });
});

describe('bots', () => {
  const base = { pot: 10, chips: 20, toCall: 5, canCheck: false, canRaise: true, maxRaise: 15, raisesAgainst: 0 };
  const calm = { bluff: 0, looseness: 0, aggression: 0 };

  it('se couche sans espoir et suit avec une carte imbattable', () => {
    expect(botBet({ ...base, odds: cardOdds(2, [10, 10, 9, 9], [8], 8), personality: calm }, () => 0.99).type).toBe('fold');
    expect(botBet({ ...base, odds: cardOdds(2, [], [1, 1], 1), personality: calm }, () => 0.99).type).toBe('call');
  });

  it('préfère suivre quand se coucher risque de coûter la pénalité du 10', () => {
    const odds = cardOdds(2, [], [9], 9);
    const safe = botBet({ ...base, chips: 0, toCall: 8, odds, personality: calm }, () => 0.99).type;
    const risky = botBet({ ...base, chips: 20, toCall: 8, odds, personality: calm }, () => 0.99).type;
    expect(safe).toBe('fold');
    expect(risky).toBe('fold');
    const veryLikelyTen = cardOdds(2, [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9], [9], 9);
    expect(botBet({ ...base, chips: 20, toCall: 8, odds: veryLikelyTen, personality: calm }, () => 0.99).type).toBe('call');
  });
});

describe('parties simulées', () => {
  it('conserve les jetons et se termine toujours avec un seul gagnant', () => {
    for (let game = 0; game < 200; game++) {
      const n = 2 + (game % 7);
      const { room } = table(n);
      const initial = total(room) + room.hand!.order.length * room.hand!.ante;
      let guard = 0;
      while (room.phase === 'playing') {
        if (++guard > 20_000) throw new Error('partie sans fin');
        const h = room.hand!;
        if (h.phase === 'result') {
          expect(total(room)).toBe(initial);
          for (const p of room.players) expect(p.chips).toBeGreaterThanOrEqual(0);
          room.afterHand();
          continue;
        }
        const id = h.turnId!;
        const opt = room.viewFor(id).hand!.options!;
        const p = room.get(id)!;
        const visible = h.order.filter((x) => x !== id).map((x) => h.cards.get(x)!);
        const best = Math.max(...h.order.filter((x) => x !== id && !h.folded.has(x)).map((x) => h.cards.get(x)!));
        const decision = botBet({
          odds: cardOdds(room.copies, room.seen, visible, best),
          pot: room.viewFor(id).hand!.pot,
          chips: p.chips,
          toCall: opt.toCall,
          canCheck: opt.canCheck,
          canRaise: opt.canRaise,
          maxRaise: opt.maxRaise,
          raisesAgainst: 0,
          personality: randomPersonality(),
        });
        expect(room.act(id, decision)).toBeUndefined();
        expect(h.cards.size).toBe(h.order.length);
      }
      const final = room.final!;
      expect(final).toHaveLength(n);
      expect(final.map((f) => f.rank)).toEqual(Array.from({ length: n }, (_, i) => i + 1));
      expect(room.carry).toBe(0);
    }
  });
});
