// Salon : partage de la table, liste des joueurs, réglages de l'hôte et lancement.
import { motion } from 'framer-motion';
import { BookOpen, Bot, Check, Copy, Crown, LogOut, Play, QrCode, Share2, UserX } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';
import { CHIP_PRESETS, MAX_PLAYERS, MIN_PLAYERS, THINK_OPTIONS, packCopies, type ChipPreset, type RoomView, type ThinkTime } from '../../../shared/protocol';
import { Head } from '../components/Head';
import { Button, Logo, Modal, Pill, Segmented } from '../components/Ui';
import { cls, shareUrl } from '../lib/util';
import { leaveRoom, send } from '../net';
import { useStore } from '../store';

export function Lobby({ view }: { view: RoomView }) {
  const setRulesOpen = useStore((s) => s.setRulesOpen);
  const isHost = view.hostId === view.me;
  const seated = view.players.filter((p) => p.status !== 'spectator');
  const spectators = view.players.filter((p) => p.status === 'spectator');
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState(false);
  const url = shareUrl(view.code);
  const host = view.players.find((p) => p.id === view.hostId);
  const cards = packCopies(Math.max(2, seated.length)) * 10;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      useStore.getState().showToast(`Lien : ${url}`, 'info');
    }
  };
  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Indian Poker', text: `Rejoins ma table d'Indian Poker (code ${view.code}) !`, url });
      } catch {
        /* partage annulé */
      }
    } else void copy();
  };

  return (
    <div className="lobby">
      <header className="lobby-top">
        <Logo size="sm" />
        <Button variant="ghost" icon={<LogOut size={18} />} onClick={() => void leaveRoom()}>
          Quitter
        </Button>
      </header>

      <motion.section className="code-panel" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <span className="eyebrow">Code de la table</span>
        <div className="big-code" aria-label={`Code ${view.code}`}>
          {view.code.split('').map((c, i) => (
            <motion.span key={i} initial={{ rotate: -14, y: 14, opacity: 0 }} animate={{ rotate: (i % 2 ? 1 : -1) * 2.5, y: 0, opacity: 1 }} transition={{ delay: i * 0.06, type: 'spring', stiffness: 240, damping: 16 }}>
              {c}
            </motion.span>
          ))}
        </div>
        <div className="share-row">
          <Button variant="primary" icon={<Share2 size={18} />} onClick={share}>
            Inviter des amis
          </Button>
          <Button icon={copied ? <Check size={18} /> : <Copy size={18} />} onClick={copy}>
            {copied ? 'Lien copié !' : 'Copier le lien'}
          </Button>
          <Button icon={<QrCode size={18} />} onClick={() => setQr(true)} aria-label="Afficher le QR code">
            QR
          </Button>
        </div>
      </motion.section>

      <div className="lobby-grid">
        <section className="sheet">
          <div className="sheet-head">
            <h3>
              Joueurs <span className="muted">{seated.length}/{MAX_PLAYERS}</span>
            </h3>
            {isHost && (
              <Button icon={<Bot size={18} />} disabled={seated.length >= MAX_PLAYERS} onClick={() => void send('room:addBot')}>
                Ajouter un bot
              </Button>
            )}
          </div>
          <ul className="player-list">
            {seated.map((p, i) => (
              <motion.li key={p.id} className={cls('player-row', p.id === view.me && 'is-me')} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}>
                <Head avatar={p.avatar} className="player-head" mood={p.id === view.me ? 'happy' : 'neutral'} />
                <span className="player-name">
                  {p.name}
                  {p.id === view.me && <span className="muted"> (toi)</span>}
                </span>
                {p.isHost && (
                  <Pill tone="gold">
                    <Crown size={12} /> Hôte
                  </Pill>
                )}
                {p.isBot && <Pill tone="blue">Bot</Pill>}
                {!p.connected && <Pill>Hors ligne</Pill>}
                {isHost && p.id !== view.me && (
                  <button type="button" className="icon-btn" aria-label={`Retirer ${p.name}`} onClick={() => void send('room:kick', { playerId: p.id })}>
                    <UserX size={18} />
                  </button>
                )}
              </motion.li>
            ))}
            {Array.from({ length: Math.max(0, MIN_PLAYERS - seated.length) }, (_, i) => (
              <li key={`empty${i}`} className="player-row is-empty">
                <span className="player-ghost">?</span>
                <span className="player-name muted">En attente d'un joueur…</span>
              </li>
            ))}
          </ul>
          {spectators.length > 0 && <p className="muted small">Spectateurs : {spectators.map((p) => p.name).join(', ')}</p>}
        </section>

        <section className="sheet">
          <div className="sheet-head">
            <h3>Réglages</h3>
            {!isHost && <span className="muted small">choisis par {host?.name ?? "l'hôte"}</span>}
          </div>
          <span className="field-label">Durée de la partie</span>
          <Segmented<ChipPreset>
            label="Durée de la partie"
            value={view.settings.preset}
            disabled={!isHost}
            onChange={(preset) => void send('room:settings', { preset })}
            options={(Object.keys(CHIP_PRESETS) as ChipPreset[]).map((k) => ({ value: k, label: CHIP_PRESETS[k].label, sub: `${CHIP_PRESETS[k].chips} jetons` }))}
          />
          <span className="field-label">Temps de réflexion</span>
          <Segmented<ThinkTime>
            label="Temps de réflexion"
            value={view.settings.think}
            disabled={!isHost}
            onChange={(think) => void send('room:settings', { think })}
            options={THINK_OPTIONS.map((t) => ({ value: t, label: t === 0 ? 'Sans limite' : `${t} s` }))}
          />
          <p className="muted small lobby-note">
            Paquet de {cards} cartes à {Math.max(2, seated.length)} joueurs. Il n'est remélangé que lorsqu'il est épuisé.
          </p>
        </section>
      </div>

      <div className="lobby-cta">
        {isHost ? (
          <Button variant="primary" className="btn-lg btn-wide" icon={<Play size={20} />} disabled={seated.length < MIN_PLAYERS} onClick={() => void send('game:start')}>
            {seated.length < MIN_PLAYERS ? 'Il faut au moins 2 joueurs' : `Lancer la partie (${seated.length} joueurs)`}
          </Button>
        ) : (
          <div className="waiting">
            <span className="spinner" /> En attente que {host?.name ?? "l'hôte"} lance la partie…
          </div>
        )}
        <Button variant="ghost" icon={<BookOpen size={18} />} onClick={() => setRulesOpen(true)}>
          Nouveau ? Les règles en 1 minute
        </Button>
      </div>

      <Modal open={qr} onClose={() => setQr(false)} title={`Table ${view.code}`}>
        <div className="qr-box">
          <QRCodeSVG value={url} size={220} bgColor="#ffffff" fgColor="#15110e" level="M" includeMargin />
          <p className="muted small">Scanne pour rejoindre la table directement.</p>
          <code className="url-code">{url}</code>
        </div>
      </Modal>
    </div>
  );
}
