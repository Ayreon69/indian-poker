// La table : têtes et cartes des adversaires, pot, ta carte cachée, actions et résultat.
import confetti from 'canvas-confetti';
import { AnimatePresence, motion } from 'framer-motion';
import { BookOpen, Flag, MessageCircle, MoreHorizontal, Smile, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { EMOTES, TAUNTS, TEN_PENALTY, type HandResult, type HandView, type LastAction, type MyOptions, type PlayerView, type RoomView } from '../../../shared/protocol';
import { ChatInput, FeedList } from '../components/Feed';
import { Head, type Mood } from '../components/Head';
import { PlayingCard } from '../components/PlayingCard';
import { Button, Chip, Modal } from '../components/Ui';
import { sfx } from '../lib/sound';
import { cls, plural, secondsLeft, useTick, vibrate } from '../lib/util';
import { leaveRoom, send, socket } from '../net';
import { useStore, type Emote } from '../store';

function actionLabel(a: LastAction | null): string | null {
  if (!a) return null;
  if (a.type === 'fold') return 'Couché';
  if (a.type === 'check') return 'Check';
  if (a.type === 'call') return `Suit +${a.amount}`;
  return a.opening ? `Mise ${a.amount}` : `Relance +${a.amount}`;
}

function moodOf(p: PlayerView, h: HandView): Mood {
  const r = h.result;
  if (r) {
    if (r.penalties[p.id] !== undefined) return 'shock';
    if (r.winners.includes(p.id)) return 'happy';
    if (r.bluffed.includes(p.id)) return 'shock';
    return p.inHand ? 'sad' : 'neutral';
  }
  if (p.folded) return 'sad';
  return 'neutral';
}

function Bubble({ emotes, atStart }: { emotes: Emote[]; atStart?: boolean }) {
  const last = emotes[emotes.length - 1];
  // Le centrage passe par framer-motion, qui gère seul la transformation de l'élément.
  const x = atStart ? 0 : '-50%';
  return (
    <AnimatePresence>
      {last && (
        <motion.span key={last.id} className={cls('bubble', last.emoji.length > 3 && 'is-text', atStart && 'is-start')} initial={{ opacity: 0, x, y: 10, scale: 0.7 }} animate={{ opacity: 1, x, y: 0, scale: 1 }} exit={{ opacity: 0, x, y: -8 }}>
          {last.emoji}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

function TurnTimer({ endsAt, think }: { endsAt: number; think: number }) {
  const now = useTick(250);
  if (!endsAt || !think) return null;
  const left = Math.max(0, endsAt - now);
  return (
    <span className="seat-timer" aria-label={`${secondsLeft(endsAt, now)} secondes`}>
      <span style={{ width: `${Math.min(100, (left / (think * 1000)) * 100)}%` }} />
    </span>
  );
}

function Seat({ p, h, index, turnIndex, compact, emotes, think, gain }: { p: PlayerView; h: HandView; index: number; turnIndex: number; compact: boolean; emotes: Emote[]; think: number; gain: number }) {
  const isTurn = h.turnId === p.id;
  const out = !p.inHand;
  const label = actionLabel(p.lastAction);
  const r = h.result;
  const won = !!r && r.winners.includes(p.id);
  // Les yeux suivent le joueur qui parle ; sans orateur, ils regardent vers le bas de la table.
  const lookX = isTurn || turnIndex < 0 ? 0 : Math.sign(turnIndex - index);
  const lookY = turnIndex < 0 ? 1 : isTurn ? -0.6 : 0.2;
  return (
    <div className={cls('seat', compact && 'is-compact', isTurn && 'is-turn', p.folded && 'is-folded', out && 'is-out', won && 'is-won')} data-player={p.id}>
      <Bubble emotes={emotes} />
      <div className="seat-figure">
        {!out && (
          <motion.div key={`${h.number}`} className="seat-card" initial={{ y: -60, rotate: -18, opacity: 0 }} animate={{ y: 0, rotate: (index % 2 ? 1 : -1) * 3, opacity: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 18, delay: index * 0.07 }}>
            <PlayingCard value={p.card} size={compact ? 'sm' : 'lg'} />
          </motion.div>
        )}
        <Head avatar={p.avatar} mood={out ? 'sad' : moodOf(p, h)} lookX={lookX} lookY={lookY} className="seat-head" />
        <AnimatePresence>
          {label && !r && (
            <motion.span key={label} className={cls('seat-action', `is-${p.lastAction?.type}`)} initial={{ scale: 1.6, opacity: 0, rotate: -8 }} animate={{ scale: 1, opacity: 1, rotate: -4 }} exit={{ opacity: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 20 }}>
              {label}
            </motion.span>
          )}
        </AnimatePresence>
        {gain !== 0 && (
          <motion.span className={cls('seat-gain', gain < 0 && 'is-neg')} initial={{ y: 14, opacity: 0, scale: 0.7 }} animate={{ y: 0, opacity: 1, scale: 1 }}>
            {gain > 0 ? `+${gain}` : gain}
          </motion.span>
        )}
      </div>
      <div className="seat-meta">
        <span className="seat-name">{p.name}</span>
        {out ? <span className="seat-out">Éliminé</span> : <Chip n={p.chips} />}
      </div>
      {isTurn && <TurnTimer endsAt={h.turnEndsAt} think={think} />}
      {p.autopilot && <span className="seat-auto">Pilote auto</span>}
    </div>
  );
}

function ActionBar({ opt, pot, currentBet }: { opt: MyOptions; pot: number; currentBet: number }) {
  const [raising, setRaising] = useState(false);
  const [amount, setAmount] = useState(1);
  const [busy, setBusy] = useState(false);
  const max = opt.maxRaise;
  const value = Math.max(1, Math.min(amount, max));

  const act = async (type: 'check' | 'call' | 'fold' | 'raise', raise?: number) => {
    if (busy) return;
    setBusy(true);
    await send('game:action', { type, amount: raise });
    setBusy(false);
    setRaising(false);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || e.ctrlKey || e.metaKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === 'c') void act(opt.canCheck ? 'check' : 'call');
      if (key === 'f' && opt.canFold) void act('fold');
      if (key === 'r' && opt.canRaise) setRaising((x) => !x);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const quick = [
    { label: '+1', v: 1 },
    { label: '+3', v: 3 },
    { label: 'Pot/2', v: Math.ceil(pot / 2) },
    { label: 'Pot', v: pot },
  ].filter((q, i, all) => q.v <= max && all.findIndex((x) => x.v === q.v) === i);

  return (
    <div className="actions">
      <AnimatePresence initial={false}>
        {raising && opt.canRaise && (
          <motion.div className="raise-tray" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
            <div className="raise-quick">
              {quick.map((q) => (
                <button key={q.label} type="button" className={cls('raise-q', value === q.v && 'is-on')} onClick={() => setAmount(q.v)}>
                  {q.label}
                </button>
              ))}
              <button type="button" className={cls('raise-q is-allin', value === max && 'is-on')} onClick={() => setAmount(max)}>
                Tapis {max}
              </button>
            </div>
            <div className="raise-slider">
              <button type="button" className="icon-btn is-solid" aria-label="Moins" disabled={value <= 1} onClick={() => setAmount(value - 1)}>
                −
              </button>
              <input type="range" min={1} max={max} value={value} aria-label="Montant de la mise" onChange={(e) => setAmount(Number(e.target.value))} />
              <button type="button" className="icon-btn is-solid" aria-label="Plus" disabled={value >= max} onClick={() => setAmount(value + 1)}>
                +
              </button>
            </div>
            <Button variant="primary" className="btn-lg btn-wide" disabled={busy} onClick={() => void act('raise', value)}>
              {currentBet === 0 ? `Miser ${value}` : `Relancer de +${value}`}
              {opt.toCall > 0 && <small className="btn-sub">{opt.toCall + value} jetons au total</small>}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="action-row">
        {opt.canFold && (
          <Button variant="danger" className="act-btn" disabled={busy} onClick={() => void act('fold')}>
            Se coucher
            <small className="btn-sub">−{TEN_PENALTY} si tu as un 10</small>
          </Button>
        )}
        <Button variant={raising ? 'default' : 'primary'} className="act-btn" disabled={busy} onClick={() => void act(opt.canCheck ? 'check' : 'call')}>
          {opt.canCheck ? 'Checker' : 'Suivre'}
          {opt.canCall && <small className="btn-sub">{plural(opt.toCall, 'jeton')}</small>}
        </Button>
        {opt.canRaise && (
          <Button variant="default" className={cls('act-btn', raising && 'is-open')} disabled={busy} onClick={() => setRaising((x) => !x)}>
            {raising ? 'Fermer' : currentBet === 0 ? 'Miser' : 'Relancer'}
            {!raising && <small className="btn-sub">jusqu'à {max}</small>}
          </Button>
        )}
      </div>
    </div>
  );
}

/** Le texte du résultat, écrit du point de vue de celui qui regarde. */
function resultHeadline(r: HandResult, view: RoomView): { title: string; line: string; tone: 'win' | 'lose' | 'tie' } {
  const name = (id: string) => view.players.find((p) => p.id === id)?.name ?? '?';
  const me = view.me;
  const myCard = r.cards[me];
  const penalty = r.penalties[me];
  const iWon = r.winners.includes(me);
  if (r.kind === 'carry') {
    return { title: 'Égalité !', line: `${plural(r.carried, 'jeton')} restent sur la table pour la manche suivante.`, tone: 'tie' };
  }
  if (r.kind === 'split') {
    return { title: 'Égalité !', line: `Le pot de ${r.pot} est partagé : ${r.winners.map(name).join(' et ')}.`, tone: 'tie' };
  }
  if (iWon) {
    const victims = r.bluffed.map(name).join(', ');
    return {
      title: `Tu remportes ${r.pot} !`,
      line: r.bluffed.length
        ? `Bluff réussi : tu n'avais qu'un ${myCard}, et ${victims} ${r.bluffed.length > 1 ? 'se sont couchés' : "s'est couché"} avec mieux.`
        : r.kind === 'fold'
          ? 'Tout le monde s’est couché.'
          : `Ton ${myCard} était la meilleure carte.`,
      tone: 'win',
    };
  }
  const winner = name(r.winners[0]);
  const winnerCard = r.cards[r.winners[0]];
  if (penalty !== undefined) return { title: `Tu avais un 10 !`, line: `Tu t'es couché avec la meilleure carte : ${plural(penalty, 'jeton')} de pénalité.`, tone: 'lose' };
  if (r.bluffed.includes(me)) return { title: `Tu t'es fait bluffer !`, line: `Tu avais un ${myCard}, et ${winner} n'avait qu'un ${winnerCard}.`, tone: 'lose' };
  if (myCard !== undefined) return { title: `${winner} remporte ${r.pot}`, line: `Tu avais un ${myCard} face à son ${winnerCard}.`, tone: 'lose' };
  return { title: `${winner} remporte ${r.pot}`, line: r.kind === 'fold' ? 'Tout le monde s’est couché.' : `Avec un ${winnerCard}.`, tone: 'lose' };
}

function ResultPanel({ view, r, h, canReady }: { view: RoomView; r: HandResult; h: HandView; canReady: boolean }) {
  const now = useTick(200);
  const head = resultHeadline(r, view);
  const left = secondsLeft(h.resultEndsAt, now);
  const ready = h.readyIds.includes(view.me);
  return (
    <motion.div className={cls('result', `is-${head.tone}`)} initial={{ y: 40, opacity: 0, rotate: 1 }} animate={{ y: 0, opacity: 1, rotate: -0.6 }} transition={{ type: 'spring', stiffness: 260, damping: 20 }}>
      <h2>{head.title}</h2>
      <p>{head.line}</p>
      {canReady && (
        <Button variant="primary" className="btn-wide" disabled={ready} onClick={() => void send('game:next')}>
          {ready ? `On attend les autres… ${left}` : `Manche suivante · ${left}`}
        </Button>
      )}
    </motion.div>
  );
}

function ReactionTray({ onClose }: { onClose: () => void }) {
  const emit = (emoji: string) => {
    socket.emit('emote', { emoji });
    onClose();
  };
  return (
    <motion.div className="reactions" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}>
      <div className="reaction-emojis">
        {EMOTES.map((e) => (
          <button key={e} type="button" onClick={() => emit(e)} aria-label={`Réaction ${e}`}>
            {e}
          </button>
        ))}
      </div>
      <div className="reaction-taunts">
        {TAUNTS.map((t) => (
          <button key={t} type="button" onClick={() => emit(t)}>
            {t}
          </button>
        ))}
      </div>
    </motion.div>
  );
}

function useHandEffects(view: RoomView, me: PlayerView | undefined) {
  const h = view.hand;
  const prev = useRef<{ number: number; phase: string; turn: string | null; lastActions: Record<string, string> } | null>(null);
  useEffect(() => {
    if (!h) return;
    const last = prev.current;
    const lastActions: Record<string, string> = {};
    for (const p of view.players) lastActions[p.id] = p.lastAction ? `${p.lastAction.type}:${p.lastAction.amount ?? ''}` : '';
    if (!last || last.number !== h.number) {
      sfx.deal();
    } else {
      for (const p of view.players) {
        if (lastActions[p.id] !== last.lastActions[p.id] && p.lastAction) {
          if (p.lastAction.type === 'fold') sfx.fold();
          else if (p.lastAction.type === 'check') sfx.check();
          else sfx.chip();
        }
      }
    }
    if (h.turnId === view.me && last?.turn !== view.me) {
      sfx.turn();
      vibrate(30);
    }
    if (h.phase === 'result' && last?.phase !== 'result' && h.result) {
      const r = h.result;
      sfx.flip();
      if (r.penalties && Object.keys(r.penalties).length) sfx.penalty();
      if (r.winners.includes(view.me)) {
        sfx.win();
        vibrate([40, 40, 80]);
        void confetti({ particleCount: 70, spread: 62, origin: { y: 0.7 }, colors: ['#e4432a', '#f0b429', '#f4e8d3'] });
      } else if (r.kind === 'carry' || r.kind === 'split') sfx.tie();
      else if (me?.inHand) sfx.lose();
    }
    prev.current = { number: h.number, phase: h.phase, turn: h.turnId, lastActions };
  }, [h, view.players, view.me, me?.inHand]);
}

export function Table({ view }: { view: RoomView }) {
  const prefs = useStore((s) => s.prefs);
  const setPrefs = useStore((s) => s.setPrefs);
  const setRulesOpen = useStore((s) => s.setRulesOpen);
  const feedOpen = useStore((s) => s.feedOpen);
  const setFeedOpen = useStore((s) => s.setFeedOpen);
  const unread = useStore((s) => s.unread);
  const emotes = useStore((s) => s.emotes);
  const [menu, setMenu] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const [react, setReact] = useState(false);
  const h = view.hand;
  const me = view.players.find((p) => p.id === view.me);
  useHandEffects(view, me);

  const seats = view.players.filter((p) => p.status !== 'spectator');
  const others = seats.filter((p) => p.id !== view.me);
  const iPlay = !!me && me.inHand;
  const compact = others.length > 3;
  const isHost = view.hostId === view.me;

  if (!h) return null;

  const turnIndex = h.turnId === view.me ? others.length : others.findIndex((p) => p.id === h.turnId);
  const turnPlayer = view.players.find((p) => p.id === h.turnId);
  const r = h.result;
  const gainOf = (id: string) => {
    if (!r) return 0;
    const paid = view.players.find((p) => p.id === id)?.committed ?? 0;
    return (r.gains[id] ?? 0) - (r.kind === 'carry' ? 0 : paid) - (r.penalties[id] ?? 0);
  };
  const myEmotes = emotes.filter((e) => e.playerId === view.me);
  const myGain = me ? gainOf(me.id) : 0;

  return (
    <div className="table-screen">
      <header className="table-top">
        <div className="table-info">
          <span className="table-hand">Manche {h.number}</span>
          <span className="table-sub">
            Base {h.ante} · {h.pack.copies} × chaque carte · {h.pack.left} restantes
          </span>
        </div>
        <div className="table-tools">
          <button type="button" className="icon-btn feed-toggle" aria-label="Journal et chat" onClick={() => setFeedOpen(true)}>
            <MessageCircle size={20} />
            {unread > 0 && <span className="badge">{unread}</span>}
          </button>
          <button type="button" className="icon-btn" aria-label="Menu" onClick={() => setMenu(true)}>
            <MoreHorizontal size={20} />
          </button>
        </div>
      </header>

      <div className="table-main">
        <main className="table-felt">
          <div className={cls('seats', `seats-${Math.min(others.length, 7)}`)}>
            {others.map((p, i) => (
              <Seat key={p.id} p={p} h={h} index={i} turnIndex={turnIndex} compact={compact} think={view.settings.think} gain={gainOf(p.id)} emotes={emotes.filter((e) => e.playerId === p.id)} />
            ))}
          </div>

          <div className="pot-zone">
            <motion.div key={h.pot} className="pot" initial={{ scale: 1.12 }} animate={{ scale: 1 }}>
              <span className="pot-label">Pot</span>
              <span className="pot-n">{h.pot}</span>
            </motion.div>
            {h.carryIn > 0 && !r && <span className="pot-carry">dont {h.carryIn} reportés de l'égalité</span>}
            {h.pack.fresh && h.number > 1 && !r && <span className="pot-carry">Nouveau paquet !</span>}
            {!r && turnPlayer && turnPlayer.id !== view.me && (
              <span className="pot-turn">
                <i className="spinner" /> {turnPlayer.name} réfléchit…
              </span>
            )}
            {!iPlay && !r && me?.status !== 'playing' && <span className="pot-turn">{me?.status === 'spectator' ? 'Tu regardes la partie' : 'Tu es éliminé : profite du spectacle'}</span>}
          </div>
        </main>

        <aside className="side-feed">
          <h3>Journal</h3>
          <FeedList log={view.log} />
          <ChatInput />
        </aside>
      </div>

      <section className={cls('me-zone', h.turnId === view.me && 'is-turn')}>
        {iPlay && me && (
          <div className="me-row">
            <div className="me-figure">
              <Bubble emotes={myEmotes} atStart />
              <motion.div key={h.number} className="me-card" initial={{ y: 60, opacity: 0, rotate: 12 }} animate={{ y: 0, opacity: 1, rotate: -4 }} transition={{ type: 'spring', stiffness: 200, damping: 16, delay: 0.3 }}>
                <PlayingCard value={me.card} size="md" mystery />
              </motion.div>
              <Head avatar={me.avatar} mood={moodOf(me, h)} lookY={-1} className="me-head" />
              {myGain !== 0 && (
                <motion.span className={cls('seat-gain', myGain < 0 && 'is-neg')} initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
                  {myGain > 0 ? `+${myGain}` : myGain}
                </motion.span>
              )}
            </div>
            <div className="me-side">
              <div className="me-stats">
                <div className="me-id">
                  <span className="me-name">{me.name}</span>
                  <Chip n={me.chips} big />
                </div>
                <button type="button" className={cls('react-btn', react && 'is-on')} aria-label="Réagir" aria-expanded={react} onClick={() => setReact((x) => !x)}>
                  <Smile size={22} />
                </button>
              </div>
              {!r && <p className="me-tip">{me.folded ? 'Tu es couché pour cette manche.' : 'Tu vois tout le monde, sauf toi.'}</p>}
            </div>
            <AnimatePresence>{react && <ReactionTray onClose={() => setReact(false)} />}</AnimatePresence>
          </div>
        )}

        {r ? (
          <ResultPanel view={view} r={r} h={h} canReady={me?.status === 'playing'} />
        ) : h.options ? (
          <ActionBar key={h.number} opt={h.options} pot={h.pot} currentBet={h.currentBet} />
        ) : null}
      </section>

      <Modal open={feedOpen} onClose={() => setFeedOpen(false)} title="Journal et chat">
        <div className="feed-modal">
          <FeedList log={view.log} />
          <ChatInput />
        </div>
      </Modal>

      <Modal
        open={menu}
        onClose={() => {
          setMenu(false);
          setConfirmStop(false);
        }}
        title="Menu"
      >
        <div className="menu-list">
          <Button icon={prefs.sound ? <Volume2 size={18} /> : <VolumeX size={18} />} onClick={() => setPrefs({ sound: !prefs.sound })}>
            Son : {prefs.sound ? 'activé' : 'coupé'}
          </Button>
          <Button
            icon={<BookOpen size={18} />}
            onClick={() => {
              setMenu(false);
              setRulesOpen(true);
            }}
          >
            Les règles
          </Button>
          {isHost && (
            <Button
              variant="danger"
              icon={<Flag size={18} />}
              onClick={() => {
                // Deux appuis : un geste malheureux ne doit pas couper la partie de toute la table.
                if (!confirmStop) {
                  setConfirmStop(true);
                  return;
                }
                setConfirmStop(false);
                setMenu(false);
                void send('game:end');
              }}
            >
              {confirmStop ? 'Confirmer : arrêter pour tout le monde' : 'Arrêter la partie'}
            </Button>
          )}
          <Button variant="ghost" onClick={() => void leaveRoom()}>
            Quitter la table
          </Button>
        </div>
      </Modal>
    </div>
  );
}
