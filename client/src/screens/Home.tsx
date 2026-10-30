// Accueil : l'affiche du jeu, pseudo + personnage, créer / rejoindre une table, partie d'entraînement, règles.
import { motion } from 'framer-motion';
import { BookOpen, Bot, LogIn, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AVATARS } from '../../../shared/protocol';
import { AVATAR_LABELS, Head } from '../components/Head';
import { PlayingCard } from '../components/PlayingCard';
import { Button, Logo } from '../components/Ui';
import { cls } from '../lib/util';
import { codeFromUrl, createRoom, joinRoom } from '../net';
import { useStore } from '../store';

function Poster() {
  return (
    <div className="poster" aria-hidden>
      <svg className="poster-profile" viewBox="0 0 300 340">
        <path
          d="M110 340L108 292C96 294 72 296 62 288C54 282 52 272 56 264C50 260 50 252 56 248C48 244 48 236 56 232C52 226 54 220 50 214C40 212 22 206 24 198C26 188 50 160 56 140C58 130 52 118 56 100C66 52 116 30 170 34C246 38 296 96 296 170C296 230 270 270 262 340Z"
          fill="#15110e"
        />
        <circle cx="94" cy="148" r="14" fill="#f4e8d3" />
        <circle cx="87" cy="147" r="6.500" fill="#15110e" />
      </svg>
      <motion.div
        className="poster-card"
        initial={{ y: -70, rotate: -22, opacity: 0 }}
        animate={{ y: 0, rotate: -7, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 160, damping: 13, delay: 0.25 }}
      >
        <PlayingCard value={null} size="md" mystery />
      </motion.div>
    </div>
  );
}

export function Home() {
  const profile = useStore((s) => s.profile);
  const setProfile = useStore((s) => s.setProfile);
  const setRulesOpen = useStore((s) => s.setRulesOpen);
  const conn = useStore((s) => s.conn);
  const [invited, setInvited] = useState(codeFromUrl);
  const [code, setCode] = useState('');
  useEffect(() => {
    const sync = () => setInvited(codeFromUrl());
    window.addEventListener('ip:url', sync);
    return () => window.removeEventListener('ip:url', sync);
  }, []);
  const [busy, setBusy] = useState<string | null>(null);
  const nameOk = profile.name.trim().length > 0;

  const run = async (key: string, fn: () => Promise<boolean>) => {
    if (busy) return;
    if (!nameOk) {
      useStore.getState().showToast('Choisis d’abord un pseudo.', 'info');
      document.getElementById('pseudo')?.focus();
      return;
    }
    setBusy(key);
    await fn();
    setBusy(null);
  };

  const cleanCode = code.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 4);

  return (
    <div className="home">
      <header className="home-hero">
        <Poster />
        <motion.div className="home-title" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5 }}>
          <Logo size="lg" />
          <p className="tagline">
            Tout le monde voit ta carte.
            <br />
            <em>Sauf toi.</em>
          </p>
        </motion.div>
      </header>

      <motion.section className="sheet home-panel" initial={{ opacity: 0, y: 26 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12, duration: 0.5 }}>
        {invited && (
          <div className="invite-banner">
            Tu es invité à la table <b>{invited}</b> : choisis ton pseudo et rejoins !
          </div>
        )}
        <label className="field-label" htmlFor="pseudo">
          Ton pseudo
        </label>
        <input
          id="pseudo"
          className="input input-lg"
          placeholder="Ex. Le Sphinx"
          value={profile.name}
          maxLength={16}
          autoComplete="nickname"
          onChange={(e) => setProfile({ name: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && invited) void run('join', () => joinRoom(invited));
          }}
        />
        <span className="field-label">Ta tête</span>
        <div className="avatar-picker" role="radiogroup" aria-label="Ta tête">
          {AVATARS.map((a) => (
            <button
              key={a}
              type="button"
              role="radio"
              aria-checked={profile.avatar === a}
              aria-label={AVATAR_LABELS[a]}
              className={cls('avatar-opt', profile.avatar === a && 'is-on')}
              onClick={() => setProfile({ avatar: a })}
            >
              <Head avatar={a} mood={profile.avatar === a ? 'happy' : 'neutral'} />
            </button>
          ))}
        </div>

        {invited ? (
          <div className="home-actions">
            <Button variant="primary" className="btn-lg" icon={<LogIn size={20} />} disabled={!!busy} onClick={() => run('join', () => joinRoom(invited))}>
              {busy === 'join' ? 'Connexion…' : `Rejoindre la table ${invited}`}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                window.history.replaceState(null, '', '/');
                setInvited(null);
              }}
            >
              Créer ma propre table à la place
            </Button>
          </div>
        ) : (
          <div className="home-actions">
            <Button variant="primary" className="btn-lg" icon={<Plus size={20} />} disabled={!!busy} onClick={() => run('create', () => createRoom())}>
              {busy === 'create' ? 'Création…' : 'Créer une table'}
            </Button>
            <div className="join-row">
              <input
                className="input code-input"
                placeholder="CODE"
                value={cleanCode}
                maxLength={4}
                aria-label="Code de la table"
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && cleanCode.length === 4) void run('join', () => joinRoom(cleanCode));
                }}
              />
              <Button icon={<LogIn size={18} />} disabled={cleanCode.length !== 4 || !!busy} onClick={() => run('join', () => joinRoom(cleanCode))}>
                Rejoindre
              </Button>
            </div>
            <Button icon={<Bot size={18} />} disabled={!!busy} onClick={() => run('bots', () => createRoom({ bots: 3, autostart: true }))}>
              {busy === 'bots' ? 'Préparation…' : "S'entraîner contre 3 bots"}
            </Button>
          </div>
        )}
        <Button variant="ghost" className="rules-link" icon={<BookOpen size={18} />} onClick={() => setRulesOpen(true)}>
          Les règles en 1 minute
        </Button>
        {conn !== 'online' && (
          <p className="wake-note">
            <span className="spinner" /> Réveil du serveur… (jusqu'à une minute la première fois)
          </p>
        )}
      </motion.section>

      <footer className="home-foot">
        D'après l'Indian Poker de l'émission <i>The Genius</i>. Jeu de fans, non officiel.
      </footer>
    </div>
  );
}
