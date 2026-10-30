# Indian Poker

**Tout le monde voit ta carte. Sauf toi.**

👉 **Jouer : https://indian-poker-usrn.onrender.com** (la première ouverture peut prendre jusqu'à une minute, le temps que le serveur gratuit se réveille)

Jeu multijoueur en ligne de bluff et de déduction, à jouer entre amis depuis un navigateur, sur téléphone ou ordinateur, sans compte ni installation.
Inspiré de l'épreuve *Indian Poker* de l'émission coréenne *The Genius* (projet de fans, non officiel).

## Règles en bref

- Une seule carte par joueur, de 1 à 10, posée sur le front : tu vois celles des autres, jamais la tienne.
- Mise de base, puis un seul tour de mise. Personne ne peut miser plus que le tapis du joueur le plus pauvre encore dans la manche.
- La carte la plus haute remporte le pot.
- **Le 10 piégé :** se coucher avec un 10 coûte 10 jetons de pénalité, versés au pot.
- **Égalité :** le pot reste sur la table pour la manche suivante. Si un joueur à égalité n'a plus de jetons, le pot est partagé.
- **Comptage :** le paquet n'est remélangé que lorsqu'il est épuisé.
- Sans jetons, tu es éliminé. Le dernier joueur en jeu gagne. La mise de base augmente de 1 toutes les 10 manches.

### Adaptations par rapport à l'émission

L'émission se joue à 2, avec un paquet de 20 cartes et une pénalité versée à l'adversaire. Pour jouer jusqu'à 8 :

- le paquet passe à 30 cartes à partir de 4 joueurs, puis à 40 à partir de 6 ;
- la pénalité va au pot, puisqu'on ne connaît pas encore le gagnant ;
- le plafond de mise remplace les pots annexes ;
- la mise de base augmente pour garantir la fin de la partie.

## Fonctionnalités

- Tables privées avec code à 4 lettres, lien d'invitation, partage natif et QR code
- 2 à 8 joueurs, bots qui comptent les cartes et bluffent, partie d'entraînement en un clic
- Aucune aide au calcul : ni probabilités, ni historique des cartes, on compte de tête
- Réactions et petites phrases pour déstabiliser les autres, chat, journal de partie
- Reprise automatique après une coupure, pilote automatique si un joueur s'absente, spectateurs
- Temps de réflexion réglable, trois durées de partie
- Révélation des bluffs à la fin de la manche, récompenses de fin de partie
- Sons synthétisés, vibrations, raccourcis clavier (`C` checker/suivre, `R` miser/relancer, `F` se coucher)

## Développement

```bash
npm install
npm run dev:server   # serveur temps réel sur http://localhost:3010
npm run dev:client   # interface sur http://localhost:5173
npm test             # moteur de jeu + centaines de parties simulées
npm run build && npm run e2e   # partie complète avec de vrais clients connectés
```

`IP_FAST=1` accélère les bots et les chronos (tests locaux uniquement).

## Architecture

- `shared/` : contrat client/serveur, paquet et probabilités (utilisées uniquement par les bots)
- `server/` : Express + Socket.IO, moteur de table (`room.ts`), bots (`bots.ts`). Le serveur fait autorité : ta carte ne quitte jamais le serveur avant la fin de la manche
- `client/` : React + Vite + Framer Motion
- Déploiement : un seul service Node (`npm ci && npm run build`, puis `npm start`)
