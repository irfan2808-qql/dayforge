/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: { colors: { canvas: 'rgb(var(--canvas) / <alpha-value>)', surface: 'rgb(var(--surface) / <alpha-value>)', edge: 'rgb(var(--edge) / <alpha-value>)', ink: 'rgb(var(--ink) / <alpha-value>)', muted: 'rgb(var(--muted) / <alpha-value>)', accent: 'rgb(var(--accent) / <alpha-value>)' }, fontFamily: { sans: ['Inter','ui-sans-serif','system-ui','sans-serif'] }, boxShadow: { soft:'0 16px 55px -30px rgba(0,0,0,.4)' } } }, plugins: []
}
