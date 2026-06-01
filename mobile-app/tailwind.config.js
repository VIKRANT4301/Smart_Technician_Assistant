/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./App.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        industrial: {
          DEFAULT: '#F59E0B', // Amber Accent
          dark: '#0F172A',     // Dark slate
          card: '#1E293B',     // Dark card background
          text: '#F1F5F9',     // Light text
          muted: '#94A3B8',    // Muted slate
          border: '#334155',   // Border slate
          success: '#10B981',  // Emerald green
          warning: '#F59E0B',  // Amber yellow
          danger: '#EF4444',   // Red alert
          info: '#3B82F6',     // Blue tag
        }
      }
    },
  },
  plugins: [],
}
