/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Dark theme base colors
        dark: {
          900: '#0A0A0B',
          800: '#111113',
          700: '#18181B',
          600: '#1F1F23',
          500: '#27272A',
          400: '#3F3F46',
        },
        // Neon accent colors
        neon: {
          cyan: '#00FFD1',
          'cyan-dim': '#00CCA8',
          purple: '#A855F7',
          pink: '#F472B6',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'monospace'],
        sans: ['Satoshi', 'General Sans', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'neon-cyan': '0 0 20px rgba(0, 255, 209, 0.3)',
        'neon-cyan-sm': '0 0 10px rgba(0, 255, 209, 0.2)',
        'neon-purple': '0 0 20px rgba(168, 85, 247, 0.3)',
      },
      animation: {
        'shimmer': 'shimmer 2s infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'slide-in': 'slideIn 0.3s ease-out',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(0, 255, 209, 0.2)' },
          '100%': { boxShadow: '0 0 20px rgba(0, 255, 209, 0.4)' },
        },
        slideIn: {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};
