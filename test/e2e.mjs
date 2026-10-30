// Test de bout en bout : 2 humains (socket.io) + 2 bots jouent une partie complète sur le serveur compilé.
// Usage : npm run build && npm run e2e
import { spawn } from 'node:child_process';
import { io } from 'socket.io-client';

const PORT = 3900 + Math.floor(Math.random() * 90);
const URL = `http://localhost:${PORT}`;
const server = spawn(process.execPath, ['dist/server/index.mjs'], {
  env: { ...process.env, PORT: String(PORT), IP_FAST: '1' },
  stdio: ['ignore', 'pipe', 'inherit'],
});
const fail = (msg) => {
  console.error(`✗ ${msg}`);
  server.kill();
  process.exit(1);
};
setTimeout(() => fail('délai dépassé (5 min)'), 300_000).unref();

await new Promise((resolve) => server.stdout.on('data', (d) => String(d).includes('prêt') && resolve()));

let leaks = 0;
let totalChips = null;

function client(name) {
  const socket = io(URL, { transports: ['websocket'], forceNew: true });
  const c = { name, socket, view: null, session: null };
  socket.on('state', (v) => {
    c.view = v;
    audit(v);
    play(c);
  });
  c.call = (event, payload = {}) => new Promise((res) => socket.emit(event, payload, res));
  return c;
}

/** Vérifie les invariants sur chaque état reçu : le secret de la carte et le nombre de jetons. */
function audit(v) {
  const h = v.hand;
  if (v.phase !== 'playing' || !h) return;
  if (h.phase === 'betting') {
    if (v.players.find((p) => p.id === v.me)?.card != null) leaks++;
    if (h.result) leaks++;
    return;
  }
  const chips = v.players.reduce((s, p) => s + p.chips, 0) + (h.result?.carried ?? 0);
  if (totalChips === null) totalChips = chips;
  else if (chips !== totalChips) fail(`jetons non conservés : ${chips} au lieu de ${totalChips}`);
}

/** Stratégie agressive pour finir vite : relancer au maximum une fois sur deux, sinon suivre. */
function play(c) {
  const v = c.view;
  if (!v || v.phase !== 'playing' || !v.hand) return;
  const h = v.hand;
  if (h.phase === 'result') {
    if (!h.readyIds.includes(v.me)) c.socket.emit('game:next', {}, () => {});
    return;
  }
  const o = h.options;
  if (!o) return;
  const action = o.canRaise && Math.random() < 0.5 ? { type: 'raise', amount: o.maxRaise } : { type: o.canCheck ? 'check' : 'call' };
  c.socket.emit('game:action', action, () => {});
}

const a = client('Alice');
const b = client('Bob');
await new Promise((r) => a.socket.on('connect', r));
await new Promise((r) => (b.socket.connected ? r() : b.socket.on('connect', r)));

const created = await a.call('room:create', { name: 'Alice', avatar: 'beret' });
if (!created.ok) fail(`création : ${created.error}`);
const code = created.data.code;
const joined = await b.call('room:join', { code: code.toLowerCase(), name: 'Bob', avatar: 'cap' });
if (!joined.ok) fail(`jointure : ${joined.error}`);
b.session = joined.data;
for (let i = 0; i < 2; i++) await a.call('room:addBot');
const denied = await b.call('game:start');
if (denied.ok) fail('un invité ne devrait pas pouvoir lancer la partie');
const started = await a.call('game:start');
if (!started.ok) fail(`lancement : ${started.error}`);
console.log(`✓ table ${code} lancée à 4 joueurs`);

// Bob se déconnecte puis revient avec son jeton : il doit retrouver sa place.
await new Promise((r) => setTimeout(r, 300));
b.socket.disconnect();
await new Promise((r) => setTimeout(r, 300));
const b2 = client('Bob');
await new Promise((r) => b2.socket.on('connect', r));
const resumed = await b2.call('room:join', { code, ...b.session, resumeOnly: true });
if (!resumed.ok || resumed.data.playerId !== b.session.playerId) fail('reprise de session échouée');
console.log('✓ reconnexion de Bob sur sa place');

await new Promise((resolve) => {
  const check = setInterval(() => {
    if (a.view?.phase === 'finished') {
      clearInterval(check);
      resolve();
    }
  }, 100);
});
const final = a.view.final;
if (leaks > 0) fail(`${leaks} fuite(s) : un joueur a reçu sa propre carte pendant la manche`);
console.log('✓ aucune fuite de carte, jetons conservés');
if (final.length !== 4) fail('il doit y avoir 4 joueurs au classement');
if (final.map((f) => f.rank).join() !== '1,2,3,4') fail('classement incohérent');
console.log(`✓ partie terminée — vainqueur : ${final[0].name}`);

const restarted = await a.call('game:restart');
if (!restarted.ok || a.view.phase !== 'lobby') await new Promise((r) => setTimeout(r, 300));
if (a.view.phase !== 'lobby') fail('retour au salon échoué');
console.log('✓ retour au salon pour une revanche');

a.socket.close();
b2.socket.close();
server.kill();
console.log('✓ test de bout en bout réussi');
process.exit(0);
