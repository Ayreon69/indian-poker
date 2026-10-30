// Fin de partie : podium en papier découpé, récompenses et revanche.
import confetti from 'canvas-confetti';
import { motion } from 'framer-motion';
import { Crown, LogOut, RotateCcw } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { FinalEntry, RoomView } from '../../../shared/protocol';
import { Head } from '../components/Head';
import { Button, Logo } from '../components/Ui';
import { cls, plural } from '../lib/util';
import { sfx } from '../lib/sound';
import { leaveRoom, send } from '../net';

interface Award {
  title: string;
  entry: FinalEntry;
  detail: string;
}

function awards(final: FinalEntry[]): Award[] {
  const best = (score: (f: FinalEntry) => number) => {
    const sorted = [...final].sort((a, b) => score(b) - score(a));
    return score(sorted[0]) > 0 ? sorted[0] : null;
  };
  const list: Award[] = [];
  const pot = best((f) => f.stats.biggestPot);
  if (pot) list.push({ title: 'Le plus gros pot', entry: pot, detail: plural(pot.stats.biggestPot, 'jeton') });
  const bluff = best((f) => f.stats.bluffs);
  if (bluff) list.push({ title: 'Roi du bluff', entry: bluff, detail: `${plural(bluff.stats.bluffs, 'bluff')} ${bluff.stats.bluffs > 1 ? 'réussis' : 'réussi'}` });
  const ten = best((f) => f.stats.tenFolds);
  if (ten) list.push({ title: 'Le 10 maudit', entry: ten, detail: `couché ${ten.stats.tenFolds} fois avec un 10` });
  return list;
}

export function Final({ view }: { view: RoomView }) {
  const final = view.final ?? [];
  const isHost = view.hostId === view.me;
  const iWon = final[0]?.id === view.me;
  const once = useRef(false);

  useEffect(() => {
    if (once.current) return;
    once.current = true;
    sfx.champion();
    if (iWon) void confetti({ particleCount: 140, spread: 80, origin: { y: 0.45 }, colors: ['#e4432a', '#f0b429', '#f4e8d3', '#15110e'] });
  }, [iWon]);

  const list = awards(final);

  return (
    <div className="final">
      <header className="final-top">
        <Logo size="sm" />
        <Button variant="ghost" icon={<LogOut size={18} />} onClick={() => void leaveRoom()}>
          Quitter
        </Button>
      </header>

      {final[0] && (
        <motion.section className="final-winner" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 16 }}>
          <Crown className="final-crown" size={46} />
          <Head avatar={final[0].avatar} mood="happy" className="final-head" />
          <h1>{iWon ? 'Tu as gagné !' : `${final[0].name} gagne !`}</h1>
          <p>Dernier joueur encore en jeu.</p>
        </motion.section>
      )}

      <div className="final-grid">
        <section className="sheet">
          <h3>Classement</h3>
          <ol className="rank-list">
            {final.map((f, i) => (
              <motion.li key={f.id} className={cls('rank-row', f.id === view.me && 'is-me')} initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + i * 0.07 }}>
                <span className="rank-n">{f.rank}</span>
                <Head avatar={f.avatar} mood={f.rank === 1 ? 'happy' : 'sad'} className="player-head" />
                <span className="player-name">
                  {f.name}
                  {f.id === view.me && <span className="muted"> (toi)</span>}
                </span>
                <span className="muted small">
                  {plural(f.stats.won, 'manche')} {f.stats.won > 1 ? 'gagnées' : 'gagnée'}
                </span>
              </motion.li>
            ))}
          </ol>
        </section>

        {list.length > 0 && (
          <section className="sheet">
            <h3>Récompenses</h3>
            <ul className="award-list">
              {list.map((a) => (
                <li key={a.title} className="award">
                  <Head avatar={a.entry.avatar} mood="happy" className="player-head" />
                  <div>
                    <b>{a.title}</b>
                    <span className="muted small">
                      {a.entry.name} : {a.detail}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <div className="lobby-cta">
        {isHost ? (
          <Button variant="primary" className="btn-lg btn-wide" icon={<RotateCcw size={20} />} onClick={() => void send('game:restart')}>
            Revanche
          </Button>
        ) : (
          <div className="waiting">
            <span className="spinner" /> En attente de la revanche…
          </div>
        )}
      </div>
    </div>
  );
}
