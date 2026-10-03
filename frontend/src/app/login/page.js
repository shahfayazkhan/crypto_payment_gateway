'use client';
import { useEffect, useState } from 'react';
import { Alert, Box, Button, Chip, Divider, Paper, Stack, TextField, Typography } from '@mui/material';
import HubIcon from '@mui/icons-material/Hub';
import { useAuth } from '@/components/AuthContext';
import { api } from '@/lib/api';

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState([]);

  useEffect(() => { api('/auth/demo-accounts').then(setDemo).catch(() => {}); }, []);

  const submit = async (e, creds) => {
    e?.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(creds?.email ?? email, creds?.password ?? password);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 2,
      background: 'radial-gradient(1000px 500px at 10% -10%, rgba(59,130,246,0.25), transparent), radial-gradient(800px 400px at 110% 110%, rgba(34,211,238,0.18), transparent)' }}>
      <Paper sx={{ p: { xs: 3, sm: 4.5 }, width: '100%', maxWidth: 440 }}>
        <Stack spacing={1} sx={{ alignItems: 'center', mb: 3 }}>
          <Box sx={{ width: 48, height: 48, borderRadius: 3, display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg,#3B82F6,#22D3EE)' }}>
            <HubIcon sx={{ color: '#fff' }} />
          </Box>
          <Typography variant="h5">CryptoGate</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
            Crypto deposits & withdrawals for MT5 accounts — USDT (TRC20 / ERC20 / BEP20), BTC, SOL
          </Typography>
        </Stack>
        <form onSubmit={submit}>
          <Stack spacing={2}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} fullWidth required autoFocus />
            <TextField label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} fullWidth required />
            <Button type="submit" variant="contained" size="large" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</Button>
          </Stack>
        </form>
        {demo.length > 0 && (
          <>
            <Divider sx={{ my: 3 }}><Typography variant="caption" color="text.secondary">DEMO ACCOUNTS</Typography></Divider>
            <Stack spacing={1}>
              {demo.map((d) => (
                <Button key={d.email} variant="outlined" color="inherit" onClick={() => submit(null, d)} disabled={busy}
                  sx={{ justifyContent: 'space-between', borderColor: 'divider' }}>
                  <span>{d.name} <Typography component="span" variant="caption" color="text.secondary">· {d.email}</Typography></span>
                  <Chip size="small" label={d.role} color={d.role === 'client' ? 'default' : 'secondary'} />
                </Button>
              ))}
            </Stack>
          </>
        )}
      </Paper>
    </Box>
  );
}
