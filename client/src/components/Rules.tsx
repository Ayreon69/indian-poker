// Règles illustrées, lisibles en une minute.
import { CHIP_PRESETS, TEN_PENALTY, ANTE_STEP_HANDS } from '../../../shared/protocol';
import { useStore } from '../store';
import { Head } from './Head';
import { PlayingCard } from './PlayingCard';
import { Modal } from './Ui';

export function RulesModal() {
  const open = useStore((s) => s.rulesOpen);
  const setOpen = useStore((s) => s.setRulesOpen);
  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Les règles en 1 minute" wide>
      <div className="rules">
        <section className="rule-hero">
          <div className="rule-demo">
            <div className="rule-seat">
              <PlayingCard value={8} size="sm" />
              <Head avatar="beret" lookX={1} />
              <small>Odette</small>
            </div>
            <div className="rule-seat">
              <PlayingCard value={3} size="sm" />
              <Head avatar="tophat" lookX={-1} />
              <small>Marcel</small>
            </div>
            <div className="rule-seat is-me">
              <PlayingCard value={null} size="sm" mystery />
              <Head avatar="cap" lookY={-1} />
              <small>Toi</small>
            </div>
          </div>
          <p>
            Chacun a <b>une seule carte, posée sur le front</b>. Tu vois celles des autres, jamais la tienne. La plus haute remporte le pot.
          </p>
        </section>

        <section>
          <h3>Une manche</h3>
          <ol>
            <li>Tout le monde paie la <b>mise de base</b> et reçoit une carte de 1 à 10.</li>
            <li>À tour de rôle : <b>checker</b>, <b>miser</b>, <b>suivre</b>, <b>relancer</b> ou <b>se coucher</b>. Il n'y a qu'un seul tour de mise.</li>
            <li>Personne ne peut miser plus que le tapis du joueur le plus pauvre encore dans la manche.</li>
            <li>On révèle : <b>la carte la plus haute gagne tout</b>.</li>
          </ol>
        </section>

        <section className="rule-ten">
          <PlayingCard value={10} size="sm" />
          <div>
            <h3>Le 10 piégé</h3>
            <p>
              Si tu te couches alors que tu avais un 10, tu paies <b>{TEN_PENALTY} jetons de pénalité</b>, versés au pot. Tout le monde voit ton 10 : ils vont essayer de te faire peur.
            </p>
          </div>
        </section>

        <section>
          <h3>Égalité</h3>
          <p>
            Le pot <b>reste sur la table</b> et s'ajoute à la manche suivante. Exception : si un joueur à égalité n'a plus de jetons, le pot est partagé, pour qu'une égalité n'élimine personne.
          </p>
        </section>

        <section>
          <h3>Compter les cartes</h3>
          <p>
            Le paquet n'est pas remélangé à chaque manche : on le garde jusqu'à ce qu'il soit épuisé. Chaque carte sortie change tes chances. L'aide au calcul (réglable dans le menu) tient le compte pour toi.
          </p>
        </section>

        <section>
          <h3>Fin de partie</h3>
          <p>
            Sans jetons, tu es éliminé. <b>Le dernier joueur en jeu gagne.</b> La mise de base augmente de 1 toutes les {ANTE_STEP_HANDS} manches, pour que la partie se termine. Départ : {CHIP_PRESETS.quick.chips}, {CHIP_PRESETS.classic.chips} ou {CHIP_PRESETS.long.chips} jetons selon le réglage.
          </p>
        </section>

        <section className="rule-tips">
          <h3>Pour bien jouer</h3>
          <ul>
            <li><b>Écoute les mises :</b> les autres voient ta carte. Si tout le monde mise fort, la tienne est peut-être mauvaise… ou ils bluffent.</li>
            <li><b>Bluffe :</b> en face d'une belle carte, mise fort. Son propriétaire ne sait pas qu'il est bien placé.</li>
            <li><b>Parle :</b> les petites phrases font partie du jeu. Personne n'est obligé de dire la vérité.</li>
          </ul>
        </section>

        <p className="rule-foot">
          Règles reprises de l'Indian Poker de l'émission <i>The Genius</i>, adaptées de 2 à 8 joueurs (paquet plus grand, plafond de mise, pénalité versée au pot). Jeu de fans, non officiel.
        </p>
      </div>
    </Modal>
  );
}
