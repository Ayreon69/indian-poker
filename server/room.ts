// Une table d'Indian Poker : salon, déroulé des manches, paquet, pénalité du 10, égalités et classement.
import crypto from 'node:crypto';
import { cardOdds, freshPack } from '../shared/odds';
import {
  AVATARS,
  CHIP_PRESETS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  TAUNTS,
  TEN_PENALTY,
  THINK_OPTIONS,
  anteFor,
  packCopies,
  type ActionType,
  type ChipPreset,
  type FinalEntry,
  type HandResult,
  type LastAction,
  type LogEntry,
  type LogKind,
  type MyOptions,
  type PlayerStats,
  type PlayerStatus,
  type RoomView,
  type Settings,
  type ThinkTime,
} from '../shared/protocol';
import { botBet, randomPersonality, type Personality } from './bots';

const BOT_NAMES = ['Gaston', 'Odette', 'Marcel', 'Simone', 'Lucien', 'Yvette', 'Raymond', 'Paulette', 'Fernand', 'Colette'];
const MAX_MEMBERS = 16;
/** Délai laissé à un joueur déconnecté avant que le pilote automatique ne prenne le relais. */
const GRACE_MS = 20_000;
/** Mode accéléré pour les tests locaux (IP_FAST=1) : bots et chronos quasi instantanés. */
const FAST = process.env.IP_FAST === '1';
const SHOWDOWN_MS = FAST ? 500 : 9_000;
const FOLD_RESULT_MS = FAST ? 400 : 7_000;
/** Temps minimum d'affichage du résultat avant de pouvoir passer à la suite. */
const RESULT_MIN_MS = FAST ? 0 : 1_500;

export interface Player {
  id: string;
  token: string;
  name: string;
  avatar: string;
  isBot: boolean;
  personality: Personality;
  sockets: Set<string>;
  connected: boolean;
  disconnectedAt: number;
  left: boolean;
  status: PlayerStatus;
  chips: number;
  rank: number | null;
  stats: PlayerStats;
}

export interface Hand {
  number: number;
  order: string[];
  ante: number;
  cards: Map<string, number>;
  startStack: Map<string, number>;
  committed: Map<string, number>;
  penalties: Map<string, number>;
  folded: Set<string>;
  acted: Set<string>;
  lastAction: Map<string, LastAction>;
  raisesBy: Map<string, number>;
  /** Niveau de mise à égaler, hors mise de base. */
  currentBet: number;
  carryIn: number;
  freshPack: boolean;
  phase: 'betting' | 'result';
  turnId: string | null;
  turnEndsAt: number;
  botActAt: number;
  result: HandResult | null;
  resultEndsAt: number;
  resultShownAt: number;
  ready: Set<string>;
}

function uid(): string {
  return crypto.randomBytes(9).toString('base64url');
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n > 1 ? 's' : ''}`;
}

function emptyStats(): PlayerStats {
  return { won: 0, biggestPot: 0, bluffs: 0, tenFolds: 0 };
}

export class Room {
  readonly code: string;
  hostId = '';
  phase: 'lobby' | 'playing' | 'finished' = 'lobby';
  settings: Settings = { preset: 'classic', think: 0 };
  players: Player[] = [];
  startChips = 0;
  hand: Hand | null = null;
  final: FinalEntry[] | null = null;
  lastActive = Date.now();
  onChange: () => void = () => {};
  onEmote: (playerId: string, text: string) => void = () => {};

  /** Cartes restant à distribuer dans le paquet ouvert, et cartes déjà sorties aux manches précédentes. */
  deck: number[] = [];
  seen: number[] = [];
  copies = 2;
  carry = 0;

  private log: LogEntry[] = [];
  private logId = 0;
  private handCount = 0;
  private firstSeat = -1;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(code: string) {
    this.code = code;
  }

  // ───────────────────────────── Membres ─────────────────────────────

  get(id: string | undefined): Player | undefined {
    return id ? this.players.find((p) => p.id === id) : undefined;
  }

  findByToken(playerId: unknown, token: unknown): Player | undefined {
    if (typeof playerId !== 'string' || typeof token !== 'string') return undefined;
    const p = this.get(playerId);
    return p && !p.isBot && p.token === token ? p : undefined;
  }

  get seated(): Player[] {
    return this.players.filter((p) => p.status !== 'spectator');
  }

  get humansOnline(): number {
    return this.players.filter((p) => !p.isBot && p.connected).length;
  }

  touch(): void {
    this.lastActive = Date.now();
  }

  private uniqueName(name: string): string {
    const taken = new Set(this.players.map((p) => p.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let i = 2; i < 99; i++) {
      const candidate = `${name.slice(0, 13)} ${i}`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
    return name;
  }

  private makePlayer(name: string, avatar: string, isBot: boolean, status: PlayerStatus): Player {
    return {
      id: uid(),
      token: uid() + uid(),
      name: this.uniqueName(name),
      avatar,
      isBot,
      personality: randomPersonality(),
      sockets: new Set(),
      connected: isBot,
      disconnectedAt: 0,
      left: false,
      status,
      chips: 0,
      rank: null,
      stats: emptyStats(),
    };
  }

  addHuman(name: string, avatar: string): Player | string {
    if (this.players.length >= MAX_MEMBERS) return 'Cette table est pleine.';
    const seatFree = this.phase === 'lobby' && this.seated.length < MAX_PLAYERS;
    if (this.phase === 'lobby' && !seatFree) return `La table est complète (${MAX_PLAYERS} joueurs maximum).`;
    const p = this.makePlayer(name, avatar, false, seatFree ? 'lobby' : 'spectator');
    this.players.push(p);
    if (!this.hostId) this.hostId = p.id;
    this.addLog('system', p.status === 'spectator' ? `${p.name} regarde la partie.` : `${p.name} rejoint la table.`);
    return p;
  }

  addBot(by: string): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut ajouter des bots.";
    if (this.phase !== 'lobby') return 'On ajoute des bots dans le salon.';
    if (this.seated.length >= MAX_PLAYERS) return `La table est complète (${MAX_PLAYERS} joueurs maximum).`;
    const used = new Set(this.players.map((p) => p.name));
    const name = BOT_NAMES.find((n) => !used.has(n)) ?? `Bot ${this.players.length + 1}`;
    const usedAvatars = new Set(this.players.map((p) => p.avatar));
    const free = AVATARS.filter((a) => !usedAvatars.has(a));
    const pool = free.length ? free : AVATARS;
    const bot = this.makePlayer(name, pool[crypto.randomInt(pool.length)], true, 'lobby');
    this.players.push(bot);
    this.addLog('system', `${bot.name} (bot) rejoint la table.`);
    return undefined;
  }

  kick(by: string, target: string): { sockets: string[] } | string {
    if (by !== this.hostId) return "Seul l'hôte peut retirer un joueur.";
    if (this.phase !== 'lobby') return 'On ne peut retirer un joueur que dans le salon.';
    const p = this.get(target);
    if (!p || p.id === by) return 'Joueur introuvable.';
    this.players = this.players.filter((x) => x.id !== p.id);
    this.addLog('system', `${p.name} a été retiré de la table.`);
    return { sockets: [...p.sockets] };
  }

  leave(id: string): void {
    const p = this.get(id);
    if (!p) return;
    p.sockets.clear();
    p.connected = false;
    p.disconnectedAt = Date.now();
    if (this.phase === 'lobby' || p.status === 'spectator') {
      this.players = this.players.filter((x) => x.id !== id);
      this.addLog('system', `${p.name} a quitté la table.`);
    } else {
      p.left = true;
      if (p.status === 'playing') this.addLog('system', `${p.name} a quitté la partie : le pilote automatique prend le relais.`);
      else this.addLog('system', `${p.name} a quitté la table.`);
    }
    if (this.hostId === id) this.transferHost();
  }

  private transferHost(): void {
    const next = this.players.find((p) => !p.isBot && !p.left && p.connected) ?? this.players.find((p) => !p.isBot && !p.left);
    this.hostId = next?.id ?? '';
    if (next) this.addLog('system', `${next.name} devient l'hôte de la table.`);
  }

  connect(p: Player, socketId: string): void {
    p.sockets.add(socketId);
    p.connected = true;
    if (p.left) {
      p.left = false;
      this.addLog('system', `${p.name} est de retour.`);
    }
    if (!this.hostId || !this.get(this.hostId) || this.get(this.hostId)?.left) this.hostId = p.id;
  }

  disconnect(id: string | undefined, socketId: string): void {
    const p = this.get(id);
    if (!p) return;
    p.sockets.delete(socketId);
    if (p.sockets.size === 0) {
      p.connected = false;
      p.disconnectedAt = Date.now();
    }
  }

  isAuto(p: Player): boolean {
    return p.isBot || p.left || (!p.connected && Date.now() - p.disconnectedAt >= GRACE_MS);
  }

  updateSettings(by: string, payload: Record<string, unknown>): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut changer les réglages.";
    if (this.phase !== 'lobby') return 'Les réglages se changent dans le salon.';
    const { preset, think } = payload;
    if (typeof preset === 'string' && preset in CHIP_PRESETS) this.settings.preset = preset as ChipPreset;
    if ((THINK_OPTIONS as readonly unknown[]).includes(think)) this.settings.think = think as ThinkTime;
    return undefined;
  }

  // ───────────────────────────── Journal ─────────────────────────────

  addLog(kind: LogKind, text: string, playerId?: string): void {
    this.log.push({ id: ++this.logId, at: Date.now(), kind, text, playerId });
    if (this.log.length > 120) this.log.splice(0, this.log.length - 120);
  }

  chat(id: string, text: string): string | undefined {
    const p = this.get(id);
    if (!p) return 'Joueur introuvable.';
    this.addLog('chat', `${p.name} : ${text}`, p.id);
    return undefined;
  }

  // ───────────────────────────── Partie ─────────────────────────────

  start(by: string): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut lancer la partie.";
    if (this.phase !== 'lobby') return 'La partie est déjà lancée.';
    const seated = this.seated;
    if (seated.length < MIN_PLAYERS) return 'Il faut au moins 2 joueurs (ajoute des bots si besoin).';
    this.startChips = CHIP_PRESETS[this.settings.preset].chips;
    const spectators = this.players.filter((p) => p.status === 'spectator');
    this.players = [...shuffle([...seated]), ...spectators];
    for (const p of seated) {
      p.status = 'playing';
      p.chips = this.startChips;
      p.rank = null;
      p.stats = emptyStats();
    }
    this.phase = 'playing';
    this.handCount = 0;
    this.firstSeat = -1;
    this.final = null;
    this.carry = 0;
    this.copies = packCopies(seated.length);
    this.deck = [];
    this.seen = [];
    this.addLog('system', `La partie commence ! ${seated.length} joueurs, ${this.startChips} jetons chacun.`);
    this.startHand();
    return undefined;
  }

  restart(by: string): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut relancer une partie.";
    if (this.phase === 'lobby') return undefined;
    this.clearTimer();
    this.players = this.players.filter((p) => !p.left);
    let seats = 0;
    for (const p of this.players) {
      p.status = seats < MAX_PLAYERS ? 'lobby' : 'spectator';
      if (p.status === 'lobby') seats++;
      p.chips = 0;
      p.rank = null;
    }
    this.phase = 'lobby';
    this.hand = null;
    this.final = null;
    this.carry = 0;
    this.addLog('system', 'Retour au salon : nouvelle partie en préparation.');
    return undefined;
  }

  endEarly(by: string): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut arrêter la partie.";
    if (this.phase !== 'playing') return undefined;
    this.addLog('system', "L'hôte a arrêté la partie.");
    return this.restart(by);
  }

  private playing(): Player[] {
    return this.players.filter((p) => p.status === 'playing');
  }

  private startHand(): void {
    const eligible = this.playing().filter((p) => p.chips > 0);
    if (eligible.length < 2) {
      this.finishGame();
      return;
    }
    const n = this.players.length;
    const eligibleIds = new Set(eligible.map((p) => p.id));
    let first = 0;
    for (let i = 1; i <= n; i++) {
      const s = (((this.firstSeat + i) % n) + n) % n;
      if (eligibleIds.has(this.players[s].id)) {
        first = s;
        break;
      }
    }
    this.firstSeat = first;
    const order: string[] = [];
    for (let i = 0; i < n; i++) {
      const p = this.players[(first + i) % n];
      if (eligibleIds.has(p.id)) order.push(p.id);
    }

    // Le même paquet sert jusqu'à épuisement, comme dans l'émission : compter les cartes paie.
    const fresh = this.deck.length < order.length;
    if (fresh) {
      this.deck = shuffle(freshPack(this.copies));
      this.seen = [];
    }

    const number = ++this.handCount;
    // Tout le monde paie la même mise de base, plafonnée au plus petit tapis.
    const ante = Math.min(anteFor(number), ...eligible.map((p) => p.chips));
    const h: Hand = {
      number,
      order,
      ante,
      cards: new Map(),
      startStack: new Map(),
      committed: new Map(),
      penalties: new Map(),
      folded: new Set(),
      acted: new Set(),
      lastAction: new Map(),
      raisesBy: new Map(),
      currentBet: 0,
      carryIn: this.carry,
      freshPack: fresh,
      phase: 'betting',
      turnId: null,
      turnEndsAt: 0,
      botActAt: 0,
      result: null,
      resultEndsAt: 0,
      resultShownAt: 0,
      ready: new Set(),
    };
    this.carry = 0;
    for (const id of order) {
      const p = this.get(id)!;
      h.cards.set(id, this.deck.pop()!);
      h.startStack.set(id, p.chips);
      p.chips -= ante;
      h.committed.set(id, ante);
    }
    this.hand = h;
    if (fresh && number > 1) this.addLog('hand', 'Le paquet est épuisé : on en ouvre un nouveau.');
    this.addLog('hand', `Manche ${number} — ${this.get(order[0])!.name} parle en premier. Mise de base : ${ante}.`);
    this.advanceBetting(h, 0);
  }

  /** Plafond de mise : le tapis du joueur le plus pauvre encore dans la manche. */
  private maxLevel(h: Hand): number {
    let cap = Infinity;
    for (const id of h.order) if (!h.folded.has(id)) cap = Math.min(cap, h.startStack.get(id) ?? 0);
    return cap === Infinity ? 0 : cap - h.ante;
  }

  private betOf(h: Hand, id: string): number {
    return (h.committed.get(id) ?? 0) - h.ante;
  }

  private options(h: Hand, id: string): MyOptions {
    const toCall = h.currentBet - this.betOf(h, id);
    const maxRaise = Math.max(0, this.maxLevel(h) - h.currentBet);
    return {
      toCall,
      canCheck: toCall === 0,
      canCall: toCall > 0,
      canFold: toCall > 0,
      canRaise: maxRaise >= 1,
      minRaise: 1,
      maxRaise,
    };
  }

  private live(h: Hand): string[] {
    return h.order.filter((id) => !h.folded.has(id));
  }

  /** Cherche le prochain joueur devant parler à partir de l'index donné (en boucle). */
  private advanceBetting(h: Hand, fromIndex: number): void {
    const len = h.order.length;
    for (let i = 0; i < len; i++) {
      const id = h.order[(fromIndex + i) % len];
      if (h.folded.has(id)) continue;
      if (h.acted.has(id) && this.betOf(h, id) === h.currentBet) continue;
      const opt = this.options(h, id);
      if (opt.canCheck && !opt.canRaise) {
        // Plus rien à décider : on « checke » automatiquement.
        h.acted.add(id);
        h.lastAction.set(id, { type: 'check' });
        continue;
      }
      this.setTurn(h, id);
      return;
    }
    this.showdown(h);
  }

  private setTurn(h: Hand, id: string): void {
    const now = Date.now();
    h.turnId = id;
    h.turnEndsAt = FAST ? now + 900 : this.settings.think ? now + this.settings.think * 1000 : 0;
    h.botActAt = FAST ? now + 40 : this.onlyBotsLeft() ? now + 350 : now + 1100 + Math.random() * 2000;
  }

  /** Plus aucun humain en jeu : les bots finissent vite pour ne pas faire attendre les éliminés. */
  private onlyBotsLeft(): boolean {
    return this.playing().every((p) => p.isBot || p.left);
  }

  act(id: string, action: { type: ActionType; amount?: number }): string | undefined {
    const h = this.hand;
    if (this.phase !== 'playing' || !h || h.phase !== 'betting') return "Ce n'est pas le moment de miser.";
    if (h.turnId !== id) return "Ce n'est pas ton tour.";
    const p = this.get(id)!;
    const opt = this.options(h, id);
    const index = h.order.indexOf(id);
    switch (action.type) {
      case 'fold': {
        if (!opt.canFold) return 'Rien à suivre : tu peux checker gratuitement.';
        h.folded.add(id);
        h.lastAction.set(id, { type: 'fold' });
        if (h.cards.get(id) === 10) {
          const penalty = Math.min(TEN_PENALTY, p.chips);
          p.chips -= penalty;
          h.penalties.set(id, penalty);
          p.stats.tenFolds++;
          this.addLog('penalty', `💥 ${p.name} se couche avec un 10 : ${plural(penalty, 'jeton')} de pénalité !`, id);
        } else {
          this.addLog('action', `${p.name} se couche.`, id);
        }
        const live = this.live(h);
        if (live.length === 1) {
          this.endByFold(h, live[0]);
          return undefined;
        }
        break;
      }
      case 'check': {
        if (!opt.canCheck) return `Il faut suivre (${opt.toCall}) ou se coucher.`;
        h.lastAction.set(id, { type: 'check' });
        this.addLog('action', `${p.name} : check.`, id);
        break;
      }
      case 'call': {
        if (!opt.canCall) return 'Rien à suivre : tu peux checker.';
        this.put(h, p, opt.toCall);
        h.lastAction.set(id, { type: 'call', amount: opt.toCall });
        this.addLog('action', `${p.name} suit (+${opt.toCall}).`, id);
        break;
      }
      case 'raise': {
        const amount = Math.floor(Number(action.amount));
        if (!opt.canRaise) return 'Le plafond de mise est atteint.';
        if (!Number.isFinite(amount) || amount < 1 || amount > opt.maxRaise) return `Relance entre 1 et ${opt.maxRaise}.`;
        const opening = h.currentBet === 0;
        h.currentBet += amount;
        this.put(h, p, h.currentBet - this.betOf(h, id));
        h.acted.clear();
        h.raisesBy.set(id, (h.raisesBy.get(id) ?? 0) + 1);
        h.lastAction.set(id, { type: 'raise', amount, opening });
        this.addLog('action', opening ? `${p.name} mise ${amount}.` : `${p.name} relance de +${amount} (total ${h.currentBet}).`, id);
        break;
      }
      default:
        return 'Action inconnue.';
    }
    h.acted.add(id);
    this.advanceBetting(h, index + 1);
    return undefined;
  }

  private put(h: Hand, p: Player, amount: number): void {
    p.chips -= amount;
    h.committed.set(p.id, (h.committed.get(p.id) ?? 0) + amount);
  }

  private pot(h: Hand): number {
    let pot = h.carryIn;
    for (const v of h.committed.values()) pot += v;
    for (const v of h.penalties.values()) pot += v;
    return pot;
  }

  private endByFold(h: Hand, winner: string): void {
    const w = this.get(winner)!;
    const winnerCard = h.cards.get(winner)!;
    const bluffed = h.order.filter((id) => h.folded.has(id) && h.cards.get(id)! > winnerCard);
    if (bluffed.length) w.stats.bluffs++;
    const pot = this.pot(h);
    this.settle(h, { kind: 'fold', winners: [winner], gains: { [winner]: pot }, pot, bluffed, carried: 0 }, FOLD_RESULT_MS);
    this.addLog('win', `${w.name} remporte ${plural(pot, 'jeton')} : tout le monde s'est couché.`, winner);
    if (bluffed.length) this.addLog('win', `🎭 Bluff réussi ! ${w.name} n'avait qu'un ${winnerCard} face à ${bluffed.map((id) => `${this.get(id)!.name} (${h.cards.get(id)})`).join(', ')}.`, winner);
  }

  private showdown(h: Hand): void {
    const live = this.live(h);
    const best = Math.max(...live.map((id) => h.cards.get(id)!));
    const winners = live.filter((id) => h.cards.get(id) === best);
    const pot = this.pot(h);
    if (winners.length === 1) {
      const w = this.get(winners[0])!;
      this.settle(h, { kind: 'showdown', winners, gains: { [w.id]: pot }, pot, bluffed: [], carried: 0 }, SHOWDOWN_MS);
      this.addLog('win', `${w.name} remporte ${plural(pot, 'jeton')} avec un ${best}.`, w.id);
      return;
    }
    // Égalité : le pot reste sur la table, sauf si un ex æquo n'a plus de jetons (il ne serait pas éliminé par une égalité).
    const someoneBroke = winners.some((id) => this.get(id)!.chips === 0);
    const names = winners.map((id) => this.get(id)!.name).join(' et ');
    if (someoneBroke) {
      this.settle(h, { kind: 'split', winners, gains: this.splitPot(h, pot, winners), pot, bluffed: [], carried: 0 }, SHOWDOWN_MS);
      this.addLog('win', `Égalité à ${best} : ${names} partagent ${plural(pot, 'jeton')}.`);
    } else {
      this.carry = pot;
      this.settle(h, { kind: 'carry', winners: [], gains: {}, pot, bluffed: [], carried: pot }, SHOWDOWN_MS);
      this.addLog('win', `Égalité à ${best} entre ${names} : ${plural(pot, 'jeton')} restent sur la table pour la manche suivante.`);
    }
  }

  /** Partage à parts égales ; les jetons restants vont un par un dans l'ordre de parole. */
  private splitPot(h: Hand, pot: number, winners: string[]): Record<string, number> {
    const gains: Record<string, number> = {};
    const base = Math.floor(pot / winners.length);
    let rest = pot - base * winners.length;
    for (const id of h.order) {
      if (!winners.includes(id)) continue;
      gains[id] = base + (rest > 0 ? 1 : 0);
      if (rest > 0) rest--;
    }
    return gains;
  }

  private settle(h: Hand, r: Omit<HandResult, 'cards' | 'penalties'>, ms: number): void {
    for (const [id, gain] of Object.entries(r.gains)) {
      const p = this.get(id)!;
      p.chips += gain;
      p.stats.won++;
      p.stats.biggestPot = Math.max(p.stats.biggestPot, gain);
    }
    for (const c of h.cards.values()) this.seen.push(c);
    h.turnId = null;
    h.phase = 'result';
    h.result = { ...r, cards: Object.fromEntries(h.cards), penalties: Object.fromEntries(h.penalties) };
    const now = Date.now();
    h.resultShownAt = now;
    h.resultEndsAt = now + (this.onlyBotsLeft() ? Math.min(ms, 1_800) : ms);
    h.ready.clear();
  }

  readyNext(id: string): string | undefined {
    const h = this.hand;
    if (this.phase !== 'playing' || !h || h.phase !== 'result') return undefined;
    h.ready.add(id);
    const needed = this.players.filter((p) => !p.isBot && !this.isAuto(p) && p.connected && p.status === 'playing');
    if (needed.every((p) => h.ready.has(p.id)) && Date.now() - h.resultShownAt >= RESULT_MIN_MS) this.afterHand();
    return undefined;
  }

  /** Élimine les joueurs à sec (le plus gros tapis au départ de la manche est le mieux classé), puis enchaîne. */
  afterHand(): void {
    const h = this.hand;
    if (!h) return;
    const busted = this.playing()
      .filter((p) => p.chips === 0)
      .sort((a, b) => (h.startStack.get(b.id) ?? 0) - (h.startStack.get(a.id) ?? 0));
    const remaining = this.playing().length - busted.length;
    busted.forEach((p, i) => {
      p.status = 'eliminated';
      p.rank = remaining + 1 + i;
      this.addLog('eliminate', `☠ ${p.name} n'a plus de jetons : éliminé (${p.rank}e).`, p.id);
    });
    if (remaining <= 1) this.finishGame();
    else this.startHand();
  }

  private finishGame(): void {
    const remaining = this.playing().sort((a, b) => b.chips - a.chips);
    remaining.forEach((p, i) => {
      p.rank = i + 1;
      p.status = 'eliminated';
    });
    if (remaining[0]) this.addLog('win', `🏆 ${remaining[0].name} remporte la partie !`, remaining[0].id);
    this.phase = 'finished';
    this.clearTimer();
    if (this.hand) this.hand.turnId = null;
    this.final = this.players
      .filter((p) => p.rank !== null)
      .map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, rank: p.rank!, stats: { ...p.stats } }))
      .sort((a, b) => a.rank - b.rank);
  }

  // ───────────────────────────── Minuteries & automatismes ─────────────────────────────

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** À appeler après chaque changement : planifie la prochaine échéance puis diffuse l'état. */
  commit(): void {
    this.reschedule();
    this.onChange();
  }

  private at(ms: number, fn: () => void): void {
    this.timer = setTimeout(() => {
      this.timer = null;
      try {
        fn();
      } catch (e) {
        console.error(`[room ${this.code}]`, e);
      }
      this.commit();
    }, Math.max(0, Math.min(ms, 2_147_000_000)));
  }

  /** Quand agir pour un joueur : bot → délai naturel, déconnecté → fin du délai de grâce, sinon à la fin du chrono éventuel. */
  private dueAt(p: Player, deadline: number, botAt: number): number {
    const limit = deadline > 0 ? deadline : Infinity;
    if (this.isAuto(p)) return p.isBot ? botAt : Math.min(botAt, Date.now() + 700);
    if (!p.connected) return Math.min(limit, p.disconnectedAt + GRACE_MS);
    return limit;
  }

  private reschedule(): void {
    this.clearTimer();
    if (this.phase !== 'playing') return;
    const now = Date.now();
    const h = this.hand;
    if (!h) return;
    if (h.phase === 'result') {
      this.at(h.resultEndsAt - now, () => {
        if (this.hand === h && h.phase === 'result') this.afterHand();
      });
      return;
    }
    if (!h.turnId) return;
    const p = this.get(h.turnId);
    if (!p) return;
    const turnId = h.turnId;
    const due = this.dueAt(p, h.turnEndsAt, h.botActAt);
    if (!Number.isFinite(due)) return;
    this.at(due - now, () => {
      if (this.hand !== h || h.turnId !== turnId || h.phase !== 'betting') return;
      if (this.isAuto(p)) this.autoPlay(h, p);
      else if (h.turnEndsAt > 0 && Date.now() >= h.turnEndsAt) {
        const opt = this.options(h, p.id);
        this.act(p.id, { type: opt.canCheck ? 'check' : 'fold' });
      } else if (!p.connected) this.autoPlay(h, p);
    });
  }

  private autoPlay(h: Hand, p: Player): void {
    const live = this.live(h).filter((id) => id !== p.id);
    const visible = h.order.filter((id) => id !== p.id).map((id) => h.cards.get(id)!);
    const best = Math.max(...live.map((id) => h.cards.get(id)!));
    const opt = this.options(h, p.id);
    let raisesAgainst = 0;
    for (const [id, n] of h.raisesBy) if (id !== p.id) raisesAgainst += n;
    const decision = botBet({
      odds: cardOdds(this.copies, this.seen, visible, best),
      pot: this.pot(h),
      chips: p.chips,
      toCall: opt.toCall,
      canCheck: opt.canCheck,
      canRaise: opt.canRaise,
      maxRaise: opt.maxRaise,
      raisesAgainst,
      personality: p.personality,
    });
    const err = this.act(p.id, decision);
    if (err) this.act(p.id, { type: opt.canCheck ? 'check' : 'fold' });
    else if (p.isBot && decision.type === 'raise' && !FAST && Math.random() < 0.22) {
      this.onEmote(p.id, TAUNTS[crypto.randomInt(TAUNTS.length)]);
    }
  }

  dispose(): void {
    this.clearTimer();
  }

  // ───────────────────────────── Vue personnalisée ─────────────────────────────

  viewFor(viewerId: string): RoomView {
    const h = this.hand;
    return {
      code: this.code,
      phase: this.phase,
      me: viewerId,
      hostId: this.hostId,
      settings: { ...this.settings },
      startChips: this.phase === 'lobby' ? CHIP_PRESETS[this.settings.preset].chips : this.startChips,
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        isBot: p.isBot,
        isHost: p.id === this.hostId,
        connected: p.isBot || p.connected,
        autopilot: !p.isBot && p.status === 'playing' && this.isAuto(p),
        status: p.status,
        chips: p.chips,
        rank: p.rank,
        inHand: !!h && h.order.includes(p.id),
        folded: !!h && h.folded.has(p.id),
        committed: h?.committed.get(p.id) ?? 0,
        lastAction: h?.lastAction.get(p.id) ?? null,
        // Le cœur du jeu : ta propre carte ne quitte jamais le serveur avant la fin de la manche.
        card: h && h.cards.has(p.id) && (p.id !== viewerId || h.phase === 'result') ? h.cards.get(p.id)! : null,
      })),
      hand: h
        ? {
            number: h.number,
            order: [...h.order],
            firstId: h.order[0],
            ante: h.ante,
            phase: h.phase,
            pot: h.result ? h.result.pot : this.pot(h),
            carryIn: h.carryIn,
            currentBet: h.currentBet,
            turnId: h.turnId,
            turnEndsAt: h.turnEndsAt,
            options: h.turnId === viewerId && h.phase === 'betting' ? this.options(h, viewerId) : null,
            result: h.result,
            resultEndsAt: h.resultEndsAt,
            readyIds: [...h.ready],
            pack: {
              copies: this.copies,
              size: this.copies * 10,
              seen: [...this.seen],
              left: this.deck.length,
              fresh: h.freshPack,
            },
          }
        : null,
      log: this.log.slice(-80),
      final: this.final,
      serverNow: Date.now(),
    };
  }
}
