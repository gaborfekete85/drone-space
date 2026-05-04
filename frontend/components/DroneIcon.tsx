type Props = {
  className?: string;
};

/** Top-down quadcopter silhouette with spinning propellers. */
export default function DroneIcon({ className }: Props) {
  return (
    <svg
      viewBox="0 0 80 80"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      {/* X-frame arms */}
      <path
        d="M16 16 L64 64 M64 16 L16 64"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* Body */}
      <rect x="30" y="30" width="20" height="20" rx="4" fill="currentColor" />
      {/* Camera lens */}
      <circle cx="40" cy="40" r="3" fill="#0f172a" />

      {/* Propeller hubs (blurred discs) */}
      <circle cx="16" cy="16" r="10" fill="currentColor" opacity="0.18" />
      <circle cx="64" cy="16" r="10" fill="currentColor" opacity="0.18" />
      <circle cx="16" cy="64" r="10" fill="currentColor" opacity="0.18" />
      <circle cx="64" cy="64" r="10" fill="currentColor" opacity="0.18" />

      {/* Propeller rings */}
      <circle cx="16" cy="16" r="10" fill="none" stroke="currentColor" strokeWidth="1" />
      <circle cx="64" cy="16" r="10" fill="none" stroke="currentColor" strokeWidth="1" />
      <circle cx="16" cy="64" r="10" fill="none" stroke="currentColor" strokeWidth="1" />
      <circle cx="64" cy="64" r="10" fill="none" stroke="currentColor" strokeWidth="1" />

      {/* Spinning blades — one <g> per prop with its own transform-origin */}
      <g className="prop-spin" style={{ transformOrigin: "16px 16px" }}>
        <line x1="6" y1="16" x2="26" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </g>
      <g className="prop-spin" style={{ transformOrigin: "64px 16px" }}>
        <line x1="54" y1="16" x2="74" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </g>
      <g className="prop-spin" style={{ transformOrigin: "16px 64px" }}>
        <line x1="6" y1="64" x2="26" y2="64" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </g>
      <g className="prop-spin" style={{ transformOrigin: "64px 64px" }}>
        <line x1="54" y1="64" x2="74" y2="64" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </g>
    </svg>
  );
}
