export const Theme = {
  colors: {
    cyberpunk: {
      background: '#000000', // Pure OLED Black
      card: '#0D111A',       // Graphite black card
      cardGradStart: '#111827',
      cardGradEnd: '#000000', // Fades into pure black canvas
      text: '#F8FAFC',       // Bright slate text
      muted: '#94A3B8',      // Muted slate
      border: 'rgba(0, 240, 255, 0.18)', // Electric cyan glass border
      primary: '#00F0FF',    // Electric Blue / Cyan
      success: '#00FF66',    // Neon Green
      danger: '#FF0055',     // Cyber Alert Pink
      info: '#38BDF8',       // Cyan Info
      warning: '#FF9F1C',    // Warning Orange
      accentGlow: 'rgba(0, 240, 255, 0.3)',
    },
    dark: {
      background: '#000000', // Pure OLED Black
      card: '#0D111A',       // Graphite black card
      cardGradStart: '#111827',
      cardGradEnd: '#000000',
      text: '#F8FAFC',       // Bright slate text
      muted: '#94A3B8',      // Muted slate
      border: 'rgba(0, 240, 255, 0.18)', // Electric cyan glass border
      primary: '#00F0FF',    // Electric Blue / Cyan
      success: '#00FF66',    // Neon Green
      danger: '#FF0055',     // Cyber Alert Pink
      info: '#38BDF8',       // Cyan Info
      warning: '#FF9F1C',    // Warning Orange
      accentGlow: 'rgba(0, 240, 255, 0.3)',
    },
    steel: {
      background: '#000000', // Pure OLED Black
      card: '#161F2E',       // Dark slate card
      cardGradStart: '#1E293B',
      cardGradEnd: '#000000',
      text: '#F1F5F9',       // Clean slate white
      muted: '#94A3B8',      // Muted slate
      border: 'rgba(245, 158, 11, 0.25)', // Safety Amber border
      primary: '#F59E0B',    // Safety Amber / Orange
      success: '#10B981',    // Emerald Green
      danger: '#EF4444',     // Alert Red
      info: '#38BDF8',       // Light blue
      warning: '#F59E0B',    // Amber warning
      accentGlow: 'rgba(245, 158, 11, 0.3)',
    },
    emerald: {
      background: '#000000', // Pure OLED Black
      card: '#043629',       // Forest tech green card
      cardGradStart: '#064E3B',
      cardGradEnd: '#000000',
      text: '#ECFDF5',       // Bio green light text
      muted: '#6EE7B7',      // Muted light green
      border: 'rgba(16, 185, 129, 0.3)', // Emerald glowing border
      primary: '#10B981',    // Biotech Green
      success: '#34D399',    // Light Green
      danger: '#F43F5E',     // Rose Alert
      info: '#38BDF8',
      warning: '#FBBF24',
      accentGlow: 'rgba(16, 185, 129, 0.35)',
    },
    light: {
      background: '#F8FAFC',
      card: '#FFFFFF',
      cardGradStart: '#FFFFFF',
      cardGradEnd: '#F1F5F9',
      text: '#0F172A',
      muted: '#64748B',
      border: '#E2E8F0',
      primary: '#0284C7',    // Cyan dark
      success: '#16A34A',
      danger: '#DC2626',
      info: '#2563EB',
      warning: '#EA580C',
      accentGlow: 'rgba(2, 132, 199, 0.2)',
    }
  }
};

// Add compatibility alias mapping for 'dark'
(Theme.colors as any).dark = Theme.colors.cyberpunk;

export type ThemeType = 'cyberpunk' | 'steel' | 'emerald' | 'light' | 'dark';


