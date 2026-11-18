import React from "react";

// Official User Stitched 'S' Denim Logo Emblem
export function StreetIdLogo({
  className = "",
  size = 40,
  variant = "horizontal",
}: {
  className?: string;
  size?: number;
  variant?: "horizontal" | "stacked";
}) {
  if (variant === "stacked") {
    return (
      <div className={`flex items-center gap-2 select-none ${className}`}>
        <img
          src="/themes/dark-jeans/logo.jpg"
          alt="street.id Jeans"
          className="object-contain rounded-md transition-transform duration-200 group-hover:scale-105"
          style={{ height: size, width: "auto" }}
        />
      </div>
    );
  }

  // Horizontal Header/Footer Brand Layout matching mockup
  return (
    <div className={`flex items-center gap-3 select-none ${className}`}>
      {/* Denim Stitched S Ribbon Icon */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0 transition-transform duration-200 group-hover:scale-105"
      >
        <defs>
          <linearGradient id="denimTwilH" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
            <stop stopColor="#1E2838" />
            <stop offset="0.5" stopColor="#162030" />
            <stop offset="1" stopColor="#0F1722" />
          </linearGradient>
          <linearGradient id="goldStitchH" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FBD38D" />
            <stop offset="0.5" stopColor="#E5A93C" />
            <stop offset="1" stopColor="#B7791F" />
          </linearGradient>
        </defs>
        {/* S ribbon geometry */}
        <polygon
          points="8,4 40,4 44,18 24,44 4,18"
          fill="url(#denimTwilH)"
          stroke="#2A394E"
          strokeWidth="1.5"
        />
        <polygon
          points="10,6 38,6 41,17 24,41 7,17"
          fill="none"
          stroke="url(#goldStitchH)"
          strokeWidth="1"
          strokeDasharray="2.5 2"
        />
        <path
          d="M32 12 H18 C15 12 14 14 14 16 C14 19 16 20 21 21 L27 22 C33 23 35 25 35 29 C35 33 32 36 26 36 H14"
          stroke="url(#goldStitchH)"
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      <div className="flex flex-col leading-none">
        <span className="font-black italic tracking-wide text-white text-lg md:text-xl font-display">
          street<span className="text-[#E5A93C]">.id</span>
        </span>
        <span className="text-[8px] md:text-[9px] tracking-[0.3em] text-[#9E9E9E] uppercase font-bold mt-0.5">
          — JEANS —
        </span>
      </div>
    </div>
  );
}

// 5 Denim Category Silhouettes matching mockup
export function BaggyJeansIcon({ className = "w-6 h-6", color = "currentColor" }: { className?: string; color?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path
        d="M13 5H27L28 10L31 35H24L21 16H19L16 35H9L12 10L13 5Z"
        stroke={color}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M13 10H27" stroke={color} strokeWidth="1.2" strokeDasharray="2 1.5" />
      <path d="M20 10V16" stroke={color} strokeWidth="1.2" />
    </svg>
  );
}

export function LooseJeansIcon({ className = "w-6 h-6", color = "currentColor" }: { className?: string; color?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path
        d="M14 5H26L27 10L29.5 35H23.5L20.8 17H19.2L16.5 35H10.5L13 10L14 5Z"
        stroke={color}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M14 10H26" stroke={color} strokeWidth="1.2" strokeDasharray="2 1.5" />
      <path d="M20 10V17" stroke={color} strokeWidth="1.2" />
    </svg>
  );
}

export function WideLegJeansIcon({ className = "w-6 h-6", color = "currentColor" }: { className?: string; color?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path
        d="M14 5H26L26.5 10L32 35H24.5L20.5 17H19.5L15.5 35H8L13.5 10L14 5Z"
        stroke={color}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M14 10H26" stroke={color} strokeWidth="1.2" strokeDasharray="2 1.5" />
      <path d="M20 10V17" stroke={color} strokeWidth="1.2" />
    </svg>
  );
}

export function StraightJeansIcon({ className = "w-6 h-6", color = "currentColor" }: { className?: string; color?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path
        d="M14 5H26L26.5 10L27.5 35H22.5L20.5 17H19.5L17.5 35H12.5L13.5 10L14 5Z"
        stroke={color}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M14 10H26" stroke={color} strokeWidth="1.2" strokeDasharray="2 1.5" />
      <path d="M20 10V17" stroke={color} strokeWidth="1.2" />
    </svg>
  );
}

export function DenimCollectionIcon({ className = "w-6 h-6", color = "currentColor" }: { className?: string; color?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      {/* Coat hanger & denim jacket contour */}
      <path d="M20 7C20 5.5 21 4.5 22.5 4.5C23.5 4.5 24.5 5.5 24.5 6.5C24.5 7.5 23.5 8.5 22 9L20 10" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M7 16L20 10L33 16L30 34H10L7 16Z" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M16 11.5L20 20L24 11.5" stroke={color} strokeWidth="1.4" />
      <path d="M20 20V34" stroke={color} strokeWidth="1.4" strokeDasharray="2 1.5" />
      <path d="M12 21H16V26H12V21Z" stroke={color} strokeWidth="1.2" />
      <path d="M24 21H28V26H24V21Z" stroke={color} strokeWidth="1.2" />
    </svg>
  );
}

// Trust Proposition Icons
export function DiamondQualityIcon({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M6 3H18L22 9L12 21L2 9L6 3Z" stroke="#E5A93C" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 9H22" stroke="#E5A93C" strokeWidth="1.3" />
      <path d="M12 21L8 9L10 3" stroke="#E5A93C" strokeWidth="1.3" />
      <path d="M12 21L16 9L14 3" stroke="#E5A93C" strokeWidth="1.3" />
    </svg>
  );
}

export function ShieldSecurityIcon({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M12 22S20 18 20 12V5L12 2L4 5V12C4 18 12 22 12 22Z" stroke="#E5A93C" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 12L11 14L15 10" stroke="#E5A93C" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function FastDeliveryIcon({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M1 3H15V17H1V3Z" stroke="#E5A93C" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15 8H19L23 12V17H15V8Z" stroke="#E5A93C" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="5.5" cy="18.5" r="2.5" stroke="#E5A93C" strokeWidth="1.7" />
      <circle cx="18.5" cy="18.5" r="2.5" stroke="#E5A93C" strokeWidth="1.7" />
    </svg>
  );
}

export function SupportHeadsetIcon({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M3 18V12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12V18" stroke="#E5A93C" strokeWidth="1.7" strokeLinecap="round" />
      <rect x="2" y="14" width="4" height="6" rx="2" stroke="#E5A93C" strokeWidth="1.7" />
      <rect x="18" y="14" width="4" height="6" rx="2" stroke="#E5A93C" strokeWidth="1.7" />
      <path d="M19 19C19 20.6569 17.6569 22 16 22H13" stroke="#E5A93C" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

// Social Media Icons
export function TikTokIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.29 0 .58.04.86.12V9.32a6.33 6.33 0 0 0-.86-.06A6.34 6.34 0 0 0 3 15.6a6.34 6.34 0 0 0 10.82 4.48c.32-.32.6-.68.82-1.07V9.78a8.28 8.28 0 0 0 4.95 1.62v-3.45c-.34 0-.68-.09-1-.26z" />
    </svg>
  );
}

export function InstagramIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}

export function YouTubeIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.5 12 3.5 12 3.5s-7.505 0-9.377.55a3.016 3.016 0 0 0-2.122 2.136C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.55 9.376.55 9.376.55s7.505 0 9.377-.55a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

export function StoreFrontIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}
