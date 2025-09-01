import { useState, type FormEvent, useMemo, useEffect } from 'react';
import { registerRequest } from '../services/apiClient';
import { useAuth } from '../hooks/useAuth';
import { Navigate, Link as RouterLink } from 'react-router-dom';
import { Box, Paper, Typography, TextField, Button, Stack, Alert, Link } from '@mui/material';

export default function RegisterPage() {
  const { isAuthenticated } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isAuthenticated) return <Navigate to="/" replace />;

  const passwordMismatch = useMemo(
    () => confirmPassword.length > 0 && password !== confirmPassword,
    [password, confirmPassword]
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (passwordMismatch) return; // no continuar si aún no coinciden
    setLoading(true);
    try {
      await registerRequest({ email, password, full_name: fullName });
      setSuccess(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }
  const [success, setSuccess] = useState(false);
  useEffect(() => {
    if (success) {
      const t = setTimeout(() => {
        // redirect to login
        window.location.href = '/login';
      }, 1800);
      return () => clearTimeout(t);
    }
  }, [success]);

  return (
    <Box flex={1} display="flex" justifyContent="center" alignItems={{ xs:'flex-start', md:'center' }} width="100%" pt={{ xs:6, md:0 }} px={2}>
      <Paper sx={{ p: { xs:4, sm:5 }, width: '100%', maxWidth: 440, bgcolor:'background.paper', border:'1px solid', borderColor:'divider', backdropFilter:'blur(12px)', backgroundImage: theme => theme.palette.mode==='dark' ? 'linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0))' : 'linear-gradient(135deg, rgba(255,255,255,0.9), rgba(255,255,255,0.65))' }} elevation={10}>
        <Stack spacing={3}>
          <Box textAlign="center">
            <Box sx={{ width:64, height:64, borderRadius:2, border: '1px solid', borderColor:'divider', display:'flex', alignItems:'center', justifyContent:'center', mx:'auto', fontSize:32, fontWeight:600 }}>N</Box>
            <Typography variant="h5" fontWeight={600} mt={2}>Crea tu cuenta</Typography>
            <Typography variant="body2" color="text.secondary">Empieza tu nuevo espacio de trabajo</Typography>
          </Box>
          <Box component="form" onSubmit={onSubmit} display="flex" flexDirection="column" gap={2}>
            <TextField label="Nombre completo" value={fullName} onChange={(e: React.ChangeEvent<HTMLInputElement>)=>setFullName(e.target.value)} required autoFocus />
            <TextField label="Email" type="email" value={email} onChange={(e: React.ChangeEvent<HTMLInputElement>)=>setEmail(e.target.value)} required />
            <TextField label="Password" type="password" value={password} onChange={(e: React.ChangeEvent<HTMLInputElement>)=>setPassword(e.target.value)} required />
            <TextField label="Confirmar password" type="password" value={confirmPassword} onChange={(e: React.ChangeEvent<HTMLInputElement>)=>setConfirmPassword(e.target.value)} required error={passwordMismatch} helperText={passwordMismatch ? 'No coincide' : ' '} />
            {(error || passwordMismatch) && <Alert severity="error" variant="outlined">{passwordMismatch ? 'Las contraseñas no coinciden' : error}</Alert>}
            {success && <Alert severity="success" variant="outlined">Cuenta creada. Redirigiendo…</Alert>}
            <Button disabled={loading || passwordMismatch || success} type="submit" fullWidth size="large">{loading? 'Creando...' : 'Crear cuenta'}</Button>
          </Box>
          <Typography variant="caption" textAlign="center" color="text.secondary">
            ¿Ya tienes cuenta? <Link component={RouterLink} to="/login">Inicia sesión</Link>
          </Typography>
        </Stack>
      </Paper>
    </Box>
  );
}