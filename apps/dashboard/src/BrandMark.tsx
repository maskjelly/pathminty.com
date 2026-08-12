/** Compact PathMinty mark used in the rail and auth screen. */
export function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <span
      className="brand-mark-glyph"
      aria-hidden="true"
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 40 40"
        width={size}
        height={size}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="40" height="40" rx="8" fill="#0a1f17" />
        <rect
          x="0.75"
          y="0.75"
          width="38.5"
          height="38.5"
          rx="7.25"
          stroke="#00ba7c"
          strokeOpacity="0.45"
        />
        <path
          d="M9 27c4.5-1 7-5.5 8.5-10.5C19 11 22 8 27 9"
          stroke="#00ba7c"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M27 9c2.2 1.2 3.8 3.4 4 6.1-2.5-.4-4.5-1.8-5.5-3.8.4-1 .9-1.7 1.5-2.3Z"
          fill="#00ba7c"
        />
        <circle cx="17.5" cy="16.5" r="2.2" fill="#1d9bf0" />
        <circle cx="17.5" cy="16.5" r="3.6" stroke="#1d9bf0" strokeOpacity="0.35" />
      </svg>
    </span>
  );
}
