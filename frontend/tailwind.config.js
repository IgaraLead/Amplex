/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        brand: ['Sansation', 'Space Grotesk', 'sans-serif'],
        body: ['Space Grotesk', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        glass: {
          bg: 'rgba(26, 31, 46, 0.55)',
          'bg-strong': 'rgba(26, 31, 46, 0.75)',
          border: 'rgba(45, 56, 71, 0.5)',
        },
        brand: {
          DEFAULT: '#0070FF',
          hover: '#005cd9',
          'deep-purple': 'hsl(268, 100%, 60%)',
          'electric-blue': 'hsl(213, 100%, 60%)',
        },
        surface: {
          bg: '#0a0e1a',
          card: '#1a1f2e',
          secondary: '#2d3142',
        },
        border: {
          DEFAULT: '#2d3847',
          subtle: '#464f63',
        },
        text: {
          DEFAULT: '#d9d9d9',
          muted: '#a6acbb',
          light: '#787c8b',
        },
        success: '#22c55e',
        warning: '#f59e0b',
        danger: '#ff3333',
      },
      borderRadius: {
        glass: '20px',
        'glass-sm': '12px',
      },
      backdropBlur: {
        glass: '12px',
      },
      boxShadow: {
        glass: '0 8px 32px rgba(0, 0, 0, 0.25)',
        'brand-glow': '0 0 20px hsl(268, 100%, 60%), 0 0 40px rgba(59, 130, 246, 0.3)',
      },
      spacing: {
        sidebar: '260px',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'glass-shine': {
          '0%': { left: '-100%' },
          '100%': { left: '200%' },
        },
        'progress-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.55' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.4s ease-out',
        'glass-shine': 'glass-shine 0.8s ease-in-out forwards',
        'progress-pulse': 'progress-pulse 2s ease-in-out infinite',
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};
