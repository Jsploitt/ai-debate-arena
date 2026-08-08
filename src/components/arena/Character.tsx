import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { Character as CharacterModel, CharacterState } from "@/lib/arena/characters";

/**
 * Illustrated character, drawn flat and geometric so it holds at booth
 * distance. Every state changes the pose, the brow and the mouth — not just
 * the opacity:
 *
 *   idle      — level brow, closed mouth, slow chest rise
 *   thinking  — one brow raised, eyes cast up and aside, kufic thought blocks
 *   speaking  — open animated mouth, lifted brows, emphasis on the beat
 *   reacting  — wide eyes, raised brows, short recoil played once
 */
export function Character({
  character,
  state,
  still = false,
  className,
}: {
  character: CharacterModel;
  state: CharacterState;
  /** Hold the pose: used while another element owns the motion budget. */
  still?: boolean;
  className?: string;
}) {
  const isAlpha = character.side === "alpha";
  const accent = character.color;
  const accentDeep = character.colorDeep;
  const shemagh = character.headdress === "shemagh";

  // The recoil is a one-shot; remount the group so it replays each time the
  // character reacts rather than firing only on first mount.
  const [recoilKey, setRecoilKey] = useState(0);
  useEffect(() => {
    if (state === "reacting") setRecoilKey((k) => k + 1);
  }, [state]);

  const poseClass = still
    ? undefined
    : state === "idle"
      ? "arena-breathe"
      : state === "thinking"
        ? "arena-ponder"
        : state === "speaking"
          ? "arena-emphasis"
          : "arena-recoil";

  const clothId = `cloth-${character.side}`;
  const checkId = `check-${character.side}`;

  return (
    <svg
      viewBox="0 0 200 252"
      className={cn("h-full w-full overflow-visible", className)}
      role="img"
      aria-label={`${character.name}, ${state}`}
    >
      <defs>
        <linearGradient id={clothId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F4F8FC" />
          <stop offset="100%" stopColor="#C3D2E4" />
        </linearGradient>

        {/* Red-checked shemagh, built on the same square module as the
            background lattice so the two ornaments agree. */}
        <pattern id={checkId} width="22" height="22" patternUnits="userSpaceOnUse">
          <rect width="22" height="22" fill="#F7FAFD" />
          <path d="M0 0h22M0 11h22M0 0v22M11 0v22" stroke="#C0392B" strokeWidth="3.2" />
          <path
            d="M0 5.5h22M0 16.5h22M5.5 0v22M16.5 0v22"
            stroke="#C0392B"
            strokeWidth="1"
            opacity="0.5"
          />
        </pattern>
      </defs>

      <g key={recoilKey} className={poseClass} style={{ transformOrigin: "100px 200px" }}>
        {/* ---- thobe / shoulders ---- */}
        <path
          d="M10 252 C10 210 46 186 100 186 C154 186 190 210 190 252 Z"
          style={{ fill: `url(#${clothId})` }}
        />
        {/* bisht trim — the only place a side colour touches the garment */}
        <path
          d="M10 252 C10 210 46 186 100 186 C154 186 190 210 190 252"
          fill="none"
          stroke={accentDeep}
          strokeWidth="8"
          strokeLinecap="round"
        />

        {/* ---- neck ---- */}
        <path d="M84 150 L84 190 L116 190 L116 150 Z" fill="#C1854F" />

        {/* ---- headdress: the two falls, outside the face ---- */}
        <path
          d="M60 96 C52 136 46 176 41 216 L70 216 C71 176 70 136 72 100 Z"
          style={{ fill: shemagh ? `url(#${checkId})` : `url(#${clothId})` }}
        />
        <path
          d="M140 96 C148 136 154 176 159 216 L130 216 C129 176 130 136 128 100 Z"
          style={{ fill: shemagh ? `url(#${checkId})` : `url(#${clothId})` }}
        />

        {/* ---- face ---- */}
        <ellipse cx="100" cy="112" rx="34" ry="41" fill="#E0AC79" />
        {/* ears */}
        <ellipse cx="66" cy="114" rx="5" ry="8" fill="#CE9765" />
        <ellipse cx="134" cy="114" rx="5" ry="8" fill="#CE9765" />

        {/* ---- crown: cloth over the skull, meeting the brow ---- */}
        <path
          d="M58 110 C58 60 76 38 100 38 C124 38 142 60 142 110 C142 96 138 86 128 84 C118 90 82 90 72 84 C62 86 58 96 58 110 Z"
          style={{ fill: shemagh ? `url(#${checkId})` : `url(#${clothId})` }}
        />
        {/* cloth shadow where it meets the forehead */}
        <path
          d="M70 86 C82 92 118 92 130 86 L130 92 C118 98 82 98 70 92 Z"
          fill="#0B1220"
          opacity="0.22"
        />

        {/* ---- agal ---- */}
        <path
          d="M62 62 C74 48 126 48 138 62"
          fill="none"
          stroke="#12161D"
          strokeWidth="8"
          strokeLinecap="round"
        />
        <path
          d="M62 74 C74 60 126 60 138 74"
          fill="none"
          stroke="#12161D"
          strokeWidth="8"
          strokeLinecap="round"
        />

        {/* ---- beard, cut along the jaw ---- */}
        {character.beard === "full" ? (
          <path
            d="M67 108 C67 118 70 140 80 152 C88 161 112 161 120 152 C130 140 133 118 133 108 C133 128 126 138 114 141 C109 133 91 133 86 141 C74 138 67 128 67 108 Z"
            fill="#1C222E"
          />
        ) : (
          <path
            d="M72 116 C74 132 80 146 88 152 C95 157 105 157 112 152 C120 146 126 132 128 116 C126 132 120 140 111 142 C107 135 93 135 89 142 C80 140 74 132 72 116 Z"
            fill="#20293A"
          />
        )}
        {/* moustache */}
        <path d="M86 130 C93 125 107 125 114 130 C107 134 93 134 86 130 Z" fill="#1C222E" />

        {/* ---- eyes ---- */}
        <g>
          <ellipse
            cx="86"
            cy="108"
            rx={state === "reacting" ? 9.5 : 8}
            ry={state === "reacting" ? 9 : 6.4}
            fill="#F8FBFF"
          />
          <ellipse
            cx="114"
            cy="108"
            rx={state === "reacting" ? 9.5 : 8}
            ry={state === "reacting" ? 9 : 6.4}
            fill="#F8FBFF"
          />
          {/* pupils — thinking casts the gaze up and aside */}
          <circle
            cx={state === "thinking" ? (isAlpha ? 82 : 90) : 86}
            cy={state === "thinking" ? 105 : 108}
            r="3.8"
            fill="#151B26"
          />
          <circle
            cx={state === "thinking" ? (isAlpha ? 110 : 118) : 114}
            cy={state === "thinking" ? 105 : 108}
            r="3.8"
            fill="#151B26"
          />
        </g>

        {/* ---- brows: the main expression carrier ---- */}
        <g stroke="#1C222E" strokeWidth="5" strokeLinecap="round" fill="none">
          {state === "thinking" ? (
            <>
              <path d="M76 98 L95 95" />
              <path d="M105 89 L124 96" />
            </>
          ) : state === "speaking" ? (
            <>
              <path d="M76 94 L95 91" />
              <path d="M105 91 L124 94" />
            </>
          ) : state === "reacting" ? (
            <>
              <path d="M76 90 L95 85" />
              <path d="M105 85 L124 90" />
            </>
          ) : (
            <>
              <path d="M77 98 L95 97" />
              <path d="M105 97 L123 98" />
            </>
          )}
        </g>

        {/* ---- nose ---- */}
        <path
          d="M100 110 L96 124 L104 124"
          fill="none"
          stroke="#C1854F"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* ---- glasses ---- */}
        {character.wearsGlasses && (
          <g fill="none" stroke={accent} strokeWidth="3.2">
            <rect x="72" y="99" width="26" height="19" rx="6" />
            <rect x="102" y="99" width="26" height="19" rx="6" />
            <path d="M98 107 L102 107" />
            <path d="M72 105 L62 103" />
            <path d="M128 105 L138 103" />
          </g>
        )}

        {/* ---- mouth ---- */}
        {state === "speaking" ? (
          <ellipse
            cx="100"
            cy="139"
            rx="10"
            ry="7.5"
            fill="#40232A"
            stroke="#E0AC79"
            strokeWidth="2"
            className="arena-mouth"
            style={{ transformOrigin: "100px 139px" }}
          />
        ) : state === "reacting" ? (
          <ellipse
            cx="100"
            cy="140"
            rx="6.5"
            ry="8"
            fill="#40232A"
            stroke="#E0AC79"
            strokeWidth="2"
          />
        ) : state === "thinking" ? (
          <path
            d="M91 139 C96 136 105 136 109 140"
            stroke="#E0AC79"
            strokeWidth="3.6"
            fill="none"
            strokeLinecap="round"
          />
        ) : (
          <path d="M90 139 L110 139" stroke="#E0AC79" strokeWidth="3.6" strokeLinecap="round" />
        )}
      </g>

      {/* ---- kufic thought blocks: only while thinking ---- */}
      {state === "thinking" && (
        <g fill={accent}>
          <rect x={isAlpha ? 150 : 34} y="52" width="9" height="9" opacity="0.9">
            <animate
              attributeName="opacity"
              values="0.15;1;0.15"
              dur="1.6s"
              repeatCount="indefinite"
            />
          </rect>
          <rect x={isAlpha ? 164 : 20} y="34" width="12" height="12" opacity="0.6">
            <animate
              attributeName="opacity"
              values="0.15;1;0.15"
              dur="1.6s"
              begin="0.35s"
              repeatCount="indefinite"
            />
          </rect>
          <rect x={isAlpha ? 181 : 3} y="12" width="15" height="15" opacity="0.35">
            <animate
              attributeName="opacity"
              values="0.15;1;0.15"
              dur="1.6s"
              begin="0.7s"
              repeatCount="indefinite"
            />
          </rect>
        </g>
      )}
    </svg>
  );
}
