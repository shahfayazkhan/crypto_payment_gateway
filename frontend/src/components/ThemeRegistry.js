'use client';
import { createTheme, ThemeProvider, CssBaseline, alpha } from '@mui/material';

const brand = '#3B82F6';
const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: brand },
    secondary: { main: '#22D3EE' },
    success: { main: '#22C55E' },
    warning: { main: '#F59E0B' },
    error: { main: '#EF4444' },
    background: { default: '#0B1020', paper: '#111832' },
    divider: 'rgba(148,163,184,0.12)',
    text: { primary: '#E6EAF2', secondary: '#94A3B8' },
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: 'var(--font-inter), system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
    h4: { fontWeight: 700, letterSpacing: -0.5 },
    h5: { fontWeight: 700, letterSpacing: -0.3 },
    h6: { fontWeight: 600 },
    button: { textTransform: 'none', fontWeight: 600 },
    overline: { letterSpacing: 1.2, fontWeight: 600 },
  },
  components: {
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none', border: '1px solid rgba(148,163,184,0.10)' } } },
    MuiAppBar: { styleOverrides: { root: { border: 'none' } } },
    MuiDrawer: { styleOverrides: { paper: { border: 'none', borderRight: '1px solid rgba(148,163,184,0.10)' } } },
    MuiButton: { defaultProps: { disableElevation: true } },
    MuiChip: { styleOverrides: { root: { fontWeight: 600 } } },
    MuiTooltip: { defaultProps: { arrow: true } },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 8, margin: '2px 8px',
          '&.Mui-selected': { backgroundColor: alpha(brand, 0.16), '&:hover': { backgroundColor: alpha(brand, 0.22) } },
        },
      },
    },
  },
});

export default function ThemeRegistry({ children }) {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
