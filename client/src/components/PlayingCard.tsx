// La carte du jeu : un énorme chiffre lisible de loin, et un retournement en 3D pour la révélation.
import { cls } from '../lib/util';

function tier(value: number): string {
  if (value === 10) return 'is-ten';
  if (value >= 7) return 'is-high';
  return value >= 4 ? 'is-mid' : 'is-low';
}

interface PlayingCardProps {
  /** null : la carte reste de dos (c'est la tienne). */
  value: number | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  mystery?: boolean;
}

export function PlayingCard({ value, size = 'md', className, mystery = false }: PlayingCardProps) {
  const shown = value !== null;
  return (
    <div
      className={cls('pcard', `pcard-${size}`, shown && 'is-shown', className)}
      role="img"
      aria-label={shown ? `Carte ${value}` : 'Carte cachée'}
    >
      <div className="pcard-inner">
        <div className="pcard-face pcard-back">
          <span className="pcard-q">{mystery ? '?' : ''}</span>
        </div>
        <div className={cls('pcard-face pcard-front', shown && tier(value))}>
          {shown && (
            <>
              <span className="pcard-band" />
              <span className="pcard-corner">{value}</span>
              <span className="pcard-num">{value}</span>
              <span className="pcard-corner is-flip">{value}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
