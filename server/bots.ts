// Cerveau des bots : ils comptent les cartes, se méfient des relances et bluffent selon leur tempérament.
import type { ActionType } from '../shared/protocol';
import { TEN_PENALTY } from '../shared/protocol';
import type { CardOdds } from '../shared/odds';

export interface Personality {
  /** Fréquence des bluffs (0 à 1). */
  bluff: number;
  /** Tendance à suivre malgré tout (0 à 1). */
  looseness: number;
  /** Tendance à relancer quand la situation est bonne (0 à 1). */
  aggression: number;
}

export function randomPersonality(): Personality {
  const r = () => Math.random();
  return { bluff: 0.1 + r() * 0.3, looseness: 0.1 + r() * 0.5, aggression: 0.3 + r() * 0.6 };
}

export interface BotInput {
  odds: CardOdds;
  pot: number;
  chips: number;
  toCall: number;
  canCheck: boolean;
  canRaise: boolean;
  maxRaise: number;
  /** Relances des adversaires : ils voient ma carte, donc leur assurance m'informe. */
  raisesAgainst: number;
  personality: Personality;
}

export function botBet(input: BotInput, rng: () => number = Math.random): { type: ActionType; amount?: number } {
  const { odds, pot, chips, toCall, canCheck, canRaise, maxRaise, raisesAgainst, personality: me } = input;
  const equity = odds.win + odds.tie / 2;
  const distrust = 1 - 0.22 * Math.min(raisesAgainst, 3) * (1 - me.looseness);
  const belief = equity * distrust;

  const size = (min: number, spread: number) => Math.max(1, Math.min(maxRaise, Math.round(pot * (min + rng() * spread))));
  const raise = (amount: number) => ({ type: 'raise' as const, amount });

  if (canCheck) {
    if (canRaise && belief > 0.62 && rng() < 0.55 + me.aggression * 0.4) return raise(size(0.4, 0.8));
    if (canRaise && belief < 0.3 && rng() < me.bluff) return raise(size(0.5, 0.7));
    return { type: 'check' };
  }

  if (canRaise && belief > 0.72 && rng() < me.aggression * 0.6) return raise(size(0.5, 0.8));
  if (canRaise && belief < 0.3 && rng() < me.bluff * 0.4) return raise(size(0.6, 0.6));

  const callValue = belief * pot - (1 - belief) * toCall;
  const foldValue = -odds.ten * Math.min(TEN_PENALTY, chips);
  return callValue + me.looseness * pot * 0.25 >= foldValue ? { type: 'call' } : { type: 'fold' };
}
