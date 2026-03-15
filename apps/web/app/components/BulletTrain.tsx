"use client";

export function BulletTrain({ reverse = false, revealProgress = 1, tunnelProgress = 0 }: { reverse?: boolean; revealProgress?: number; tunnelProgress?: number }) {
  const headColor = reverse ? "#EF4444" : "#fff";
  const tailColor = reverse ? "#fff" : "#EF4444";
  const body = "#e5e5e5";
  const roof = "#d4d4d4";
  const win = "#bbb";
  const coupler = "#ccc";

  const Car = ({ y }: { y: number }) => {
    const h = 52;
    const rows = 5;
    return (
      <g>
        <rect x="3" y={y} width="16" height={h} rx="2" fill={body} />
        <rect x="9" y={y} width="4" height={h} rx="1" fill={roof} />
        {Array.from({ length: rows }, (_, i) => (
          <g key={i}>
            <rect x="4" y={y + 6 + i * 9} width="3" height="4" rx="0.7" fill={win} opacity="0.45" />
            <rect x="15" y={y + 6 + i * 9} width="3" height="4" rx="0.7" fill={win} opacity="0.45" />
          </g>
        ))}
      </g>
    );
  };

  const numCars = 10;
  const carH = 52;
  const gap = 3;
  const stride = carH + gap;
  const locoStart = numCars * stride;
  const locoH = 75;
  const totalH = locoStart + locoH + 5;

  const totalPieces = numCars + 1;
  const pieceOpacity = (index: number) => {
    const inThreshold = index / totalPieces;
    const fadeIn = Math.max(0, Math.min(1, (revealProgress - inThreshold) / (1 / totalPieces)));
    const outThreshold = index / totalPieces;
    const fadeOut = 1 - Math.max(0, Math.min(1, (tunnelProgress - outThreshold) / (1 / totalPieces)));
    return Math.min(fadeIn, fadeOut);
  };
  const locoOpacity = pieceOpacity(0);

  return (
    <svg width="22" height={totalH} viewBox={`0 0 22 ${totalH}`} fill="none">
      {Array.from({ length: numCars }, (_, i) => {
        const y = i * stride;
        const op = pieceOpacity(numCars - i);
        return (
          <g key={i} opacity={op}>
            <Car y={y} />
            {i === 0 && (
              <>
                <circle cx="6" cy={y + 3} r="1.2" fill={tailColor} />
                <circle cx="16" cy={y + 3} r="1.2" fill={tailColor} />
              </>
            )}
            <rect x="9" y={y + carH} width="4" height={gap} rx="1" fill={coupler} />
          </g>
        );
      })}

      <g opacity={locoOpacity}>
      <path
        d={`M3 ${locoStart} L19 ${locoStart} L19 ${locoStart + 42} C19 ${locoStart + 56} 17 ${locoStart + 66} 14 ${locoStart + 71} A4 4 0 0 1 8 ${locoStart + 71} C5 ${locoStart + 66} 3 ${locoStart + 56} 3 ${locoStart + 42} Z`}
        fill={body}
      />
      <path
        d={`M9 ${locoStart} L13 ${locoStart} L13 ${locoStart + 55} C12.5 ${locoStart + 61} 11.5 ${locoStart + 66} 11 ${locoStart + 68} C10.5 ${locoStart + 66} 9.5 ${locoStart + 61} 9 ${locoStart + 55} Z`}
        fill={roof}
      />
      <rect x="6" y={locoStart + 2} width="10" height="5" rx="1.5" fill={win} opacity="0.35" />
      {[12, 20, 28, 36].map((off) => (
        <g key={off}>
          <rect x="4" y={locoStart + off} width="3" height="4" rx="0.7" fill={win} opacity="0.35" />
          <rect x="15" y={locoStart + off} width="3" height="4" rx="0.7" fill={win} opacity="0.35" />
        </g>
      ))}
      <path
        d={`M6 ${locoStart + 46} L16 ${locoStart + 46} C16 ${locoStart + 54} 14 ${locoStart + 62} 11 ${locoStart + 67} C8 ${locoStart + 62} 6 ${locoStart + 54} 6 ${locoStart + 46} Z`}
        fill={win}
        opacity="0.3"
      />
      <circle cx="7" cy={locoStart + 56} r="1.3" fill={headColor} />
      <circle cx="15" cy={locoStart + 56} r="1.3" fill={headColor} />
      <ellipse cx="11" cy={totalH - 3} rx="5" ry="1.5" fill="#000" opacity="0.04" />
      </g>
    </svg>
  );
}
