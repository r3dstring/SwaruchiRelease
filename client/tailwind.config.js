/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: { lime: { 400: '#58CC02', 500: '#46A302', 600: '#3A8A01' }, owl: { 50: '#F7FFF0', 100: '#E5FFD0' }, golden: '#FFC800', coral: '#FF4B4B', sky: '#1CB0F6', grape: '#CE82FF' },
      fontFamily: { display: ['Nunito', 'system-ui', 'sans-serif'], body: ['Inter', 'system-ui', 'sans-serif'] },
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
