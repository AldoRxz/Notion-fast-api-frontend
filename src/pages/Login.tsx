import { useState, type FormEvent } from 'react';
import { loginRequest } from '../services/apiClient';
import { useAuth } from '../hooks/useAuth';
import { Navigate, Link as RouterLink } from 'react-router-dom';
import { Box, Paper, Typography, TextField, Button, Stack, Alert, Link } from '@mui/material';

export default function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isAuthenticated) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await loginRequest(email, password);
      login(res.access_token);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Box flex={1} display="flex" justifyContent="center" alignItems={{ xs:'flex-start', md:'center' }} width="100%" pt={{ xs:6, md:0 }} px={2}>
      <Paper sx={{ p: { xs:4, sm:5 }, width: '100%', maxWidth: 420, bgcolor:'background.paper', border:'1px solid', borderColor:'divider', backdropFilter:'blur(12px)', backgroundImage: theme => theme.palette.mode==='dark' ? 'linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0))' : 'linear-gradient(135deg, rgba(255,255,255,0.9), rgba(255,255,255,0.65))' }} elevation={10}>
        <Stack spacing={3}>
          <Box textAlign="center">
            <Box sx={{ width:64, height:64, borderRadius:2, border: '1px solid', borderColor:'divider', display:'flex', alignItems:'center', justifyContent:'center', mx:'auto', fontSize:32, fontWeight:600 }}>N</Box>
            <Typography variant="h5" fontWeight={600} mt={2}>Inicia sesión</Typography>
            <Typography variant="body2" color="text.secondary">Continúa en tu espacio de trabajo</Typography>
          </Box>
          <Box component="form" onSubmit={onSubmit} display="flex" flexDirection="column" gap={2}>
            <TextField label="Email" type="email" value={email} onChange={(e: React.ChangeEvent<HTMLInputElement>)=>setEmail(e.target.value)} required autoFocus />
            <TextField label="Password" type="password" value={password} onChange={(e: React.ChangeEvent<HTMLInputElement>)=>setPassword(e.target.value)} required />
            {error && <Alert severity="error" variant="outlined">{error}</Alert>}
            <Button disabled={loading} type="submit" fullWidth size="large">{loading? 'Entrando…' : 'Entrar'}</Button>
          </Box>
          <Typography variant="caption" textAlign="center" color="text.secondary">
            ¿No tienes cuenta? <Link component={RouterLink} to="/register">Crear cuenta</Link>
          </Typography>
        </Stack>
      </Paper>
    </Box>
  );
}
