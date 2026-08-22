export function HawkEye({ size = 40 }: { size?: number }) {
  const h = Math.round(size * 0.72);
  return (
    <svg
      width={size}
      height={h}
      viewBox="0 0 48 35"
      fill="none"
      aria-hidden="true"
    >
      {/* Outer eye — hawk yellow */}
      <path
        d="M24 2C10 2 1 17.5 1 17.5C1 17.5 10 33 24 33C38 33 47 17.5 47 17.5C47 17.5 38 2 24 2Z"
        fill="#F5C200"
      />
      {/* Iris — near-black amber */}
      <circle cx="24" cy="17.5" r="10" fill="#1A0800" />
      {/* Vertical slit pupil — hawk characteristic */}
      <path
        d="M22.5 9.5C23.2 9 24.8 9 25.5 9.5C26.2 10 27 13 27 17.5C27 22 26.2 25 25.5 25.5C24.8 26 23.2 26 22.5 25.5C21.8 25 21 22 21 17.5C21 13 21.8 10 22.5 9.5Z"
        fill="#080808"
      />
      {/* Glint */}
      <ellipse
        cx="19.5"
        cy="13.5"
        rx="2.2"
        ry="1.6"
        fill="white"
        opacity="0.9"
        transform="rotate(-15 19.5 13.5)"
      />
    </svg>
  );
}

export function Logo({
  size = 36,
  className = '',
}: {
  size?: number;
  className?: string;
}) {
  return (
    <div className={`logo-wrap ${className}`} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <HawkEye size={size} />
      <span style={{ fontFamily: '"Barlow Condensed", "Arial Black", system-ui, sans-serif', fontWeight: 900, fontSize: size * 0.67 + 'px', letterSpacing: '-0.02em', lineHeight: 1 }}>
        DiffHawk
      </span>
    </div>
  );
}
