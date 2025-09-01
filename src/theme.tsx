import { createTheme } from '@mui/material/styles';
import type { ThemeOptions } from '@mui/material/styles';

const base: ThemeOptions = {
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Ubuntu, sans-serif'
  },
  components: {
    MuiButton: { styleOverrides: { root: { textTransform: 'none', fontWeight: 600 } } },
    MuiPaper: { styleOverrides: { root: { backdropFilter: 'blur(18px)' } } },
    MuiTextField: { defaultProps: { size: 'small', fullWidth: true } },
  }
};

export const buildTheme = (mode: 'light' | 'dark') => createTheme({
  ...base,
  palette: {
    mode,
    primary: { main: mode === 'light' ? '#3b5bdb' : '#5973ff' },
    background: {
      default: mode === 'light' ? '#f5f7fb' : '#0e0f11',
      paper: mode === 'light' ? 'rgba(255,255,255,0.85)' : 'rgba(32,34,37,0.72)'
    }
  }
});
