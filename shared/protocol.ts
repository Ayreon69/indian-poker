// Contrat partagé entre le serveur et le client : vues de table, réglages, constantes.

export const MAX_PLAYERS = 8;
export const MIN_PLAYERS = 2;
/** Pénalité pour s'être couché avec un 10, payée au pot. */
export const TEN_PENALTY = 10;
/** La mise de base augmente de 1 toutes les N manches : la partie finit toujours. */
export const ANTE_STEP_HANDS = 10;

export const AVATARS = ['moustache', 'beret', 'tophat', 'glasses', 'spikes', 'cap', 'bun', 'bob', 'bald', 'curly', 'visor', 'bow'] as const;
export const EMOTES = ['😂', '😏', '😱', '🤔', '🔥', '💀', '👏', '🤫'] as const;
export const TAUNTS = ['Couche-toi, crois-moi', 'Belle carte !', 'Aïe, ta carte…', 'Tu devrais suivre', 'Tu bluffes.', 'Je dis ça, je dis rien', 'Même pas peur'] as const;

export type ChipPreset = 'quick' | 'classic' | 'long';
export const CHIP_PRESETS: Record<ChipPreset, { label: string; chips: number }> = {
  quick: { label: 'Rapide', chips: 15 },
  classic: { label: 'Classique', chips: 30 },
  long: { label: 'Longue', chips: 50 },
};

export const THINK_OPTIONS = [0, 30, 60] as const;
export type ThinkTime = (typeof THINK_OPTIONS)[number];

export interface Settings {
  preset: ChipPreset;
  think: ThinkTime;
}

/** Nombre d'exemplaires de chaque carte : assez pour plusieurs manches, même à 8. */
export function packCopies(players: number): number {
  if (players <= 3) return 2;
  return players <= 5 ? 3 : 4;
}

/** Mise de base de la manche n (1, puis +1 toutes les ANTE_STEP_HANDS manches). */
export function anteFor(handNumber: number): number {
  return 1 + Math.floor((handNumber - 1) / ANTE_STEP_HANDS);
}

export type PlayerStatus = 'lobby' | 'playing' | 'eliminated' | 'spectator';
export type ActionType = 'check' | 'call' | 'raise' | 'fold';

export interface LastAction {
  type: ActionType;
  amount?: number;
  /** Première mise de la manche (« Mise 3 ») plutôt qu'une relance. */
  opening?: boolean;
}

export interface PlayerStats {
  won: number;
  biggestPot: number;
  bluffs: number;
  tenFolds: number;
}

export interface PlayerView {
  id: string;
  name: string;
  avatar: string;
  isBot: boolean;
  isHost: boolean;
  connected: boolean;
  autopilot: boolean;
  status: PlayerStatus;
  chips: number;
  rank: number | null;
  inHand: boolean;
  folded: boolean;
  /** Jetons engagés dans la manche, mise de base comprise. */
  committed: number;
  lastAction: LastAction | null;
  /** Carte visible : jamais la sienne avant la fin de la manche (null dans ce cas). */
  card: number | null;
}

export interface MyOptions {
  toCall: number;
  canCheck: boolean;
  canCall: boolean;
  canFold: boolean;
  canRaise: boolean;
  minRaise: number;
  maxRaise: number;
}

export type ResultKind = 'fold' | 'showdown' | 'carry' | 'split';

export interface HandResult {
  kind: ResultKind;
  winners: string[];
  gains: Record<string, number>;
  pot: number;
  /** Toutes les cartes de la manche, révélées à la fin. */
  cards: Record<string, number>;
  penalties: Record<string, number>;
  /** Joueurs couchés qui avaient une meilleure carte que le gagnant : ils se sont fait bluffer. */
  bluffed: string[];
  /** Jetons reportés sur la manche suivante en cas d'égalité. */
  carried: number;
}

export interface PackView {
  copies: number;
  left: number;
  fresh: boolean;
}

export interface HandView {
  number: number;
  order: string[];
  firstId: string;
  ante: number;
  phase: 'betting' | 'result';
  pot: number;
  carryIn: number;
  currentBet: number;
  turnId: string | null;
  turnEndsAt: number;
  options: MyOptions | null;
  result: HandResult | null;
  resultEndsAt: number;
  readyIds: string[];
  pack: PackView;
}

export type LogKind = 'system' | 'hand' | 'action' | 'win' | 'penalty' | 'eliminate' | 'chat';
export interface LogEntry {
  id: number;
  at: number;
  kind: LogKind;
  text: string;
  playerId?: string;
}

export interface FinalEntry {
  id: string;
  name: string;
  avatar: string;
  rank: number;
  stats: PlayerStats;
}

export interface RoomView {
  code: string;
  phase: 'lobby' | 'playing' | 'finished';
  me: string;
  hostId: string;
  settings: Settings;
  startChips: number;
  players: PlayerView[];
  hand: HandView | null;
  log: LogEntry[];
  final: FinalEntry[] | null;
  serverNow: number;
}

export type Ack<T = unknown> = (res: { ok: boolean; error?: string; data?: T }) => void;
