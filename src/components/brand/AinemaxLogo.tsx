import React from 'react';

interface AinemaxLogoProps {
  showWordmark?: boolean;
  size?: 'sm' | 'md' | 'lg';
  inverted?: boolean;
}

export function AinemaxLogo({
  showWordmark = true,
  size = 'md',
  inverted = false,
}: AinemaxLogoProps) {
  const iconDimension = size === 'sm' ? 28 : size === 'lg' ? 40 : 32;
  const wordmarkClass =
    size === 'sm'
      ? 'text-base font-bold tracking-tight'
      : size === 'lg'
        ? 'text-2xl font-extrabold tracking-tight'
        : 'text-lg font-extrabold tracking-tight';

  return (
    <span className="inline-flex items-center gap-2.5 select-none whitespace-nowrap shrink-0">
      <svg
        width={iconDimension}
        height={iconDimension}
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect
          width="36"
          height="36"
          rx="10"
          fill={inverted ? '#FFFFFF' : '#2563EB'}
        />
        <path
          d="M18 7.5L27.5 26.5H23.1L21.05 22.1H14.95L12.9 26.5H8.5L18 7.5ZM18 13.7L16.35 18.6H19.65L18 13.7Z"
          fill={inverted ? '#2563EB' : '#FFFFFF'}
        />
        <circle
          cx="18"
          cy="10.2"
          r="1.35"
          fill={inverted ? '#60A5FA' : '#93C5FD'}
        />
      </svg>
      {showWordmark && (
        <span
          className={`font-display ${wordmarkClass} ${
            inverted ? 'text-white' : 'text-slate-900 dark:text-white'
          }`}
        >
          AINEMAX
        </span>
      )}
    </span>
  );
}
