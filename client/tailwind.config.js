/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      // Replaced Duolingo's stock consumer-app palette (bright saturated primaries)
      // with muted, professional tones on the SAME class names used throughout
      // the app — this changes what every existing bg-coral/text-sky/etc.
      // resolves to, without needing to touch the ~90 places that use them.
      colors: {
        lime: { 400: '#16A34A', 500: '#15803D', 600: '#166534' },
        owl: { 50: '#F0FDF4', 100: '#DCFCE7' },
        coral: '#DC2626',
        sky: '#2563EB',
      },
      fontFamily: { display: ['Manrope', 'system-ui', 'sans-serif'], body: ['Inter', 'system-ui', 'sans-serif'] },
      // font-700/800/900 aren't real Tailwind utility names by default (Tailwind
      // uses font-bold/font-extrabold/font-black) — every heading across the app
      // using these numeric classes was silently getting NO font-weight applied
      // at all. This extension makes those classes actually work.
      fontWeight: { 700: '700', 800: '800', 900: '900' },
      animation: { 'bounce-in': 'bounceIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)', 'slide-up': 'slideUp 0.3s ease-out', 'pulse-xp': 'pulseXP 0.6s ease-out', 'shake': 'shake 0.4s ease-in-out' },
      keyframes: {
        bounceIn: { '0%': { transform: 'scale(0.3)', opacity: '0' }, '100%': { transform: 'scale(1)', opacity: '1' } },
        slideUp: { '0%': { transform: 'translateY(20px)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } },
        pulseXP: { '0%': { transform: 'scale(1)' }, '50%': { transform: 'scale(1.3)' }, '100%': { transform: 'scale(1)' } },
        shake: { '0%, 100%': { transform: 'translateX(0)' }, '25%': { transform: 'translateX(-8px)' }, '75%': { transform: 'translateX(8px)' } },
      },
    },
  },
  plugins: [],
};
