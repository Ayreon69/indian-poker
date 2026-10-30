// Les personnages : des têtes en papier découpé, chacune avec son accessoire. Leurs yeux suivent le jeu.
import { cls } from '../lib/util';

export type Mood = 'neutral' | 'happy' | 'sad' | 'shock';

interface Style {
  skin: string;
  accent: string;
}

const STYLES: Record<string, Style> = {
  moustache: { skin: '#f0b429', accent: '#15110e' },
  beret: { skin: '#f28c6a', accent: '#b5172f' },
  tophat: { skin: '#8fc9b8', accent: '#15110e' },
  glasses: { skin: '#f4c9a0', accent: '#1d4e6b' },
  spikes: { skin: '#c9a0dc', accent: '#e4432a' },
  cap: { skin: '#7fb2d9', accent: '#f0b429' },
  bun: { skin: '#e8a27c', accent: '#3b2318' },
  bob: { skin: '#b7d36b', accent: '#7a2a4f' },
  bald: { skin: '#e9d9bd', accent: '#b98a5e' },
  curly: { skin: '#d9825b', accent: '#15110e' },
  visor: { skin: '#5fb8ad', accent: '#f4e8d3' },
  bow: { skin: '#f2a6b5', accent: '#e4432a' },
};

function Accessory({ kind, color }: { kind: string; color: string }) {
  switch (kind) {
    case 'moustache':
      return <path d="M30 71c6-7 14-7 20-2 6-5 14-5 20 2-7 5-14 4-20 0-6 4-13 5-20 0z" fill={color} />;
    case 'beret':
      return (
        <>
          <path d="M18 32c2-13 20-20 37-18 14 2 26 9 27 18-14 7-48 8-64 0z" fill={color} />
          <rect x="49" y="7" width="4" height="9" rx="2" fill={color} />
        </>
      );
    case 'tophat':
      return (
        <>
          <rect x="30" y="2" width="40" height="30" rx="2" fill={color} />
          <rect x="30" y="24" width="40" height="5" fill="#e4432a" />
          <rect x="16" y="29" width="68" height="6" rx="3" fill={color} />
        </>
      );
    case 'glasses':
      return (
        <>
          <circle cx="37" cy="52" r="11" fill="none" stroke={color} strokeWidth="4" />
          <circle cx="63" cy="52" r="11" fill="none" stroke={color} strokeWidth="4" />
          <path d="M48 51h4" stroke={color} strokeWidth="4" />
        </>
      );
    case 'spikes':
      return <path d="M21 34l-3-20 13 10 3-18 11 14 7-16 7 16 11-14 3 18 13-10-3 20z" fill={color} />;
    case 'cap':
      return (
        <>
          <path d="M20 34c0-15 13-23 30-23s30 8 30 23z" fill={color} />
          <path d="M50 30h44c2 0 2 6-1 6H50z" fill={color} />
          <circle cx="50" cy="11" r="3" fill="#15110e" />
        </>
      );
    case 'bun':
      return (
        <>
          <circle cx="50" cy="10" r="10" fill={color} />
          <path d="M18 42c-2-17 13-27 32-27s34 10 32 27c-10-8-20-11-32-11s-22 3-32 11z" fill={color} />
        </>
      );
    case 'bob':
      return <path d="M12 74c-5-34 8-60 38-60s43 26 38 60c-4 2-8 2-11 0 3-14 1-30-3-38-14 5-34 5-48 0-4 8-6 24-3 38-3 2-7 2-11 0z" fill={color} />;
    case 'bald':
      return (
        <>
          <path d="M15 58c-5-1-6-13 2-14z" fill={color} />
          <path d="M85 58c5-1 6-13-2-14z" fill={color} />
          <path d="M32 87c6 12 30 12 36 0-11 4-25 4-36 0z" fill={color} />
        </>
      );
    case 'curly':
      return (
        <>
          {[
            [24, 30, 11],
            [36, 19, 12],
            [50, 15, 13],
            [64, 19, 12],
            [76, 30, 11],
            [17, 42, 8],
            [83, 42, 8],
          ].map(([x, y, r]) => (
            <circle key={x} cx={x} cy={y} r={r} fill={color} />
          ))}
        </>
      );
    case 'visor':
      return (
        <>
          <rect x="17" y="42" width="66" height="19" rx="9" fill="#15110e" />
          <rect x="25" y="46" width="50" height="11" rx="5" fill={color} opacity="0.16" />
        </>
      );
    case 'bow':
      return (
        <>
          <path d="M50 18L26 6c-3-1-5 1-5 3v19c0 3 2 4 5 3zM50 18l24-12c3-1 5 1 5 3v19c0 3-2 4-5 3z" fill={color} />
          <circle cx="50" cy="18" r="6" fill="#15110e" />
        </>
      );
    default:
      return null;
  }
}

function Mouth({ mood }: { mood: Mood }) {
  const common = { fill: 'none', stroke: '#15110e', strokeWidth: 4, strokeLinecap: 'round' as const };
  if (mood === 'happy') return <path d="M36 76c8 10 20 10 28 0" {...common} />;
  if (mood === 'sad') return <path d="M38 84c7-8 17-8 24 0" {...common} />;
  if (mood === 'shock') return <ellipse cx="50" cy="80" rx="7" ry="9" fill="#15110e" />;
  return <path d="M41 80h18" {...common} />;
}

interface HeadProps {
  avatar: string;
  mood?: Mood;
  /** Direction du regard, de -1 à 1. */
  lookX?: number;
  lookY?: number;
  className?: string;
}

export function Head({ avatar, mood = 'neutral', lookX = 0, lookY = 0, className }: HeadProps) {
  const style = STYLES[avatar] ?? STYLES.bald;
  const hidesEyes = avatar === 'visor';
  const pupil = { transform: `translate(${lookX * 3.5}px, ${lookY * 3.5}px)` };
  return (
    <svg className={cls('head', className)} viewBox="0 0 100 104" aria-hidden>
      <path d="M17 44C17 24 31 13 50 13s33 11 33 31v25c0 19-14 31-33 31S17 88 17 69z" fill={style.skin} />
      {avatar === 'bob' && <path d="M21 40c15 4 43 4 58 0v8c-15 3-43 3-58 0z" fill={style.accent} opacity="0.001" />}
      {!hidesEyes && (
        <g className="head-eyes">
          <circle cx="37" cy="52" r="8.500" fill="#fffaf0" />
          <circle cx="63" cy="52" r="8.500" fill="#fffaf0" />
          <g className="head-pupils" style={pupil}>
            <circle cx="37" cy="52" r="4" fill="#15110e" />
            <circle cx="63" cy="52" r="4" fill="#15110e" />
          </g>
        </g>
      )}
      <Accessory kind={avatar} color={style.accent} />
      <Mouth mood={mood} />
    </svg>
  );
}

export const AVATAR_LABELS: Record<string, string> = {
  moustache: 'Moustache',
  beret: 'Béret',
  tophat: 'Haut-de-forme',
  glasses: 'Lunettes',
  spikes: 'Piques',
  cap: 'Casquette',
  bun: 'Chignon',
  bob: 'Carré',
  bald: 'Barbe',
  curly: 'Boucles',
  visor: 'Visière',
  bow: 'Nœud',
};
