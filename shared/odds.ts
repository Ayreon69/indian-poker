// Paquet et probabilités : ce qu'un joueur peut déduire de sa propre carte à partir des informations publiques.

export interface CardOdds {
  /** counts[v] = nombre d'exemplaires de la valeur v (1 à 10) qui peuvent encore être ta carte. */
  counts: number[];
  total: number;
  win: number;
  tie: number;
  lose: number;
  /** Risque que ta carte soit un 10 (pénalité si tu te couches). */
  ten: number;
}

export function freshPack(copies: number): number[] {
  const pack: number[] = [];
  for (let v = 1; v <= 10; v++) for (let c = 0; c < copies; c++) pack.push(v);
  return pack;
}

/**
 * @param seen cartes des manches précédentes de ce paquet
 * @param visible cartes des autres joueurs à la manche en cours (couchés compris : elles sont sorties du paquet)
 * @param best meilleure carte à battre parmi les adversaires encore en jeu
 */
export function cardOdds(copies: number, seen: number[], visible: number[], best: number): CardOdds {
  const counts = Array.from({ length: 11 }, (_, v) => (v === 0 ? 0 : copies));
  for (const c of [...seen, ...visible]) if (counts[c] > 0) counts[c]--;
  const total = counts.reduce((a, b) => a + b, 0);
  let win = 0;
  let tie = 0;
  for (let v = 1; v <= 10; v++) {
    if (v > best) win += counts[v];
    else if (v === best) tie += counts[v];
  }
  if (total === 0) return { counts, total, win: 0, tie: 0, lose: 0, ten: 0 };
  return { counts, total, win: win / total, tie: tie / total, lose: (total - win - tie) / total, ten: counts[10] / total };
}
