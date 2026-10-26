/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        serif: ['var(--font-display)'],
        sans: ['var(--font-ui)'],
        mono: ['var(--font-ui)'],
      },
      colors: {
        // Paleta Ethernity DMs (Legado Digital & Memórias Vivas)
        brand: {
          50: '#FFF5F3',
          100: '#FDECE9',
          200: '#FBD2CC',
          300: '#F7A79B',
          400: '#F27B6B',
          500: '#EE5945', // Coral / Terracota Principal
          600: '#DE432E',
          700: '#C73E2C',
          800: '#A02B1B',
          900: '#7F2215',
        },
        warm: {
          canvas: '#FAF7F2',
          surface: '#FFFFFF',
          subtle: '#F4EFEA',
          border: '#EAE3DA',
          text: '#2D1B18',
          muted: '#6B5E59',
        },
      },
      boxShadow: {
        'soft-sm': '0 1px 3px rgba(45, 27, 24, 0.04), 0 1px 2px rgba(45, 27, 24, 0.02)',
        'soft-md': '0 4px 16px rgba(45, 27, 24, 0.06), 0 2px 6px rgba(45, 27, 24, 0.03)',
        'soft-lg': '0 12px 32px rgba(45, 27, 24, 0.08), 0 4px 12px rgba(45, 27, 24, 0.04)',
      },
      animation: {
        'pulse-radar': 'pulse-ring 2s cubic-bezier(0.215, 0.61, 0.355, 1) infinite',
      },
      keyframes: {
        'pulse-ring': {
          '0%': { transform: 'scale(0.95)', opacity: '0.9' },
          '70%': { transform: 'scale(3.2)', opacity: '0' },
          '100%': { transform: 'scale(3.2)', opacity: '0' },
        },
      },
    },
  },
  plugins: [],
};
