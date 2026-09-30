export type MeshTone =
  | 'welcome'
  | 'clearing-forwarding'
  | 'waste-management'
  | 'private-security'
  | 'cleaning-janitorial'
  | 'procurement';

type TonePalette = {
  aurora: string;
  orbs: string[];
};

const TONES: Record<MeshTone, TonePalette> = {
  welcome: {
    aurora: 'bg-[linear-gradient(125deg,#020617_0%,#064e3b_32%,#0f172a_58%,#1e3a8a_82%,#020617_100%)]',
    orbs: [
      'bg-emerald-400/35 -top-24 -right-16 w-80 h-80 animate-orb-a',
      'bg-blue-500/25 -bottom-28 -left-16 w-72 h-72 animate-orb-b',
      'bg-teal-400/20 top-1/2 left-1/3 w-60 h-60 animate-orb-c',
    ],
  },
  'clearing-forwarding': {
    aurora: 'bg-[linear-gradient(125deg,#020617_0%,#155e75_30%,#1e3a8a_58%,#0e7490_82%,#020617_100%)]',
    orbs: [
      'bg-cyan-400/40 -top-20 -right-12 w-72 h-72 animate-orb-a',
      'bg-blue-500/30 -bottom-24 -left-14 w-64 h-64 animate-orb-b',
      'bg-sky-300/25 top-1/3 left-1/2 w-52 h-52 animate-orb-c',
    ],
  },
  'waste-management': {
    aurora: 'bg-[linear-gradient(125deg,#022c22_0%,#047857_32%,#14532d_58%,#0f766e_82%,#022c22_100%)]',
    orbs: [
      'bg-emerald-400/40 -top-20 -right-12 w-72 h-72 animate-orb-a',
      'bg-lime-400/25 -bottom-24 -left-14 w-64 h-64 animate-orb-b',
      'bg-teal-300/25 top-1/3 left-1/2 w-52 h-52 animate-orb-c',
    ],
  },
  'private-security': {
    aurora: 'bg-[linear-gradient(125deg,#020617_0%,#312e81_32%,#1e1b4b_58%,#4c1d95_82%,#020617_100%)]',
    orbs: [
      'bg-indigo-400/40 -top-20 -right-12 w-72 h-72 animate-orb-a',
      'bg-violet-500/25 -bottom-24 -left-14 w-64 h-64 animate-orb-b',
      'bg-slate-300/20 top-1/3 left-1/2 w-52 h-52 animate-orb-c',
    ],
  },
  'cleaning-janitorial': {
    aurora: 'bg-[linear-gradient(125deg,#0c4a6e_0%,#0369a1_32%,#134e4a_58%,#0e7490_82%,#082f49_100%)]',
    orbs: [
      'bg-sky-400/40 -top-20 -right-12 w-72 h-72 animate-orb-a',
      'bg-teal-400/30 -bottom-24 -left-14 w-64 h-64 animate-orb-b',
      'bg-cyan-200/25 top-1/3 left-1/2 w-52 h-52 animate-orb-c',
    ],
  },
  procurement: {
    aurora: 'bg-[linear-gradient(125deg,#431407_0%,#b45309_32%,#7c2d12_58%,#a16207_82%,#1c1917_100%)]',
    orbs: [
      'bg-amber-400/40 -top-20 -right-12 w-72 h-72 animate-orb-a',
      'bg-orange-500/30 -bottom-24 -left-14 w-64 h-64 animate-orb-b',
      'bg-yellow-300/20 top-1/3 left-1/2 w-52 h-52 animate-orb-c',
    ],
  },
};

function resolveTone(tone: string): TonePalette {
  return TONES[tone as MeshTone] ?? TONES.welcome;
}

export function AnimatedMeshBackdrop({
  tone = 'welcome',
  keepPhoto = false,
  variant = 'hero',
}: {
  tone?: string;
  keepPhoto?: boolean;
  variant?: 'hero' | 'subtle';
}) {
  const palette = resolveTone(tone);

  if (variant === 'subtle') {
    return (
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
        {palette.orbs.map((orb) => (
          <div key={orb} className={`absolute rounded-full blur-3xl opacity-40 ${orb}`} />
        ))}
      </div>
    );
  }

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      <div className={`absolute inset-0 animate-aurora ${palette.aurora} ${keepPhoto ? 'opacity-70 mix-blend-multiply' : ''}`} />
      {palette.orbs.map((orb) => (
        <div key={orb} className={`absolute rounded-full blur-3xl ${orb}`} />
      ))}
      {keepPhoto && (
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-black/25" />
      )}
    </div>
  );
}
