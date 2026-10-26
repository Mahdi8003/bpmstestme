import { cn } from './ui';

export function BrandMark({
  size = 38,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('shrink-0', className)}
      aria-hidden
    >
      <rect x="1" y="1" width="38" height="38" rx="10" stroke="currentColor" strokeOpacity="0.32" />
      <path
        d="M9 13.5H21.5C25.6421 13.5 29 16.8579 29 21C29 25.1421 25.6421 28.5 21.5 28.5H16"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
      <circle cx="11.5" cy="28.5" r="3.2" fill="currentColor" />
      <circle cx="30" cy="10.5" r="2.2" fill="currentColor" fillOpacity="0.55" />
    </svg>
  );
}
