import React from 'react';
import { motion } from 'motion/react';

interface CompanyLogoProps {
  className?: string;
  size?: number;
}

export const CompanyLogo: React.FC<CompanyLogoProps> = ({ className = '', size = 120 }) => {
  return (
    <motion.div
      className={`relative flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
      animate={{
        scale: [1, 1.08, 1],
        filter: [
          'drop-shadow(0 4px 10px rgba(124, 58, 237, 0.15))',
          'drop-shadow(0 10px 25px rgba(192, 132, 252, 0.4))',
          'drop-shadow(0 4px 10px rgba(124, 58, 237, 0.15))'
        ]
      }}
      transition={{
        duration: 3,
        repeat: Infinity,
        ease: "easeInOut"
      }}
    >
      <svg
        viewBox="0 0 200 200"
        className="w-full h-full select-none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="logo-gold" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FCE6B1" />
            <stop offset="30%" stopColor="#E2B765" />
            <stop offset="70%" stopColor="#9A691F" />
            <stop offset="100%" stopColor="#E2B765" />
          </linearGradient>
          
          <mask id="center-hole-mask">
            {/* White parts are visible */}
            <rect x="0" y="0" width="200" height="200" fill="#ffffff" />
            {/* Black circle is cut out */}
            <circle cx="100" cy="100" r="7.8" fill="#000000" />
          </mask>
        </defs>

        {/* Arms covered by center mask to keep the inner hole transparent */}
        <g mask="url(#center-hole-mask)">
          {/* Main Long Needle (Top-Right to Bottom-Left) */}
          <path
            d="M 94 94 Q 125 75 176 24 Q 125 75 106 106 Q 75 125 24 176 Q 75 125 94 94 Z"
            fill="url(#logo-gold)"
          />
          {/* Main Shorter Bar with flat horizontal cuts (Top-Left to Bottom-Right) */}
          <path
            d="M 92 108 L 60 70 L 72 70 L 108 92 L 140 130 L 128 130 Z"
            fill="url(#logo-gold)"
          />
        </g>

        {/* Outer Ring overlapping the masked edge */}
        <circle
          cx="100"
          cy="100"
          r="11.4"
          fill="none"
          stroke="url(#logo-gold)"
          strokeWidth="6.4"
        />
      </svg>
    </motion.div>
  );
};
