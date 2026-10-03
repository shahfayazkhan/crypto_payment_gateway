'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, Grid, InputAdornment, MenuItem, Paper, Slider, Stack, Switch, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import BoltIcon from '@mui/icons-material/Bolt';
import ViewInArIcon from '@mui/icons-material/ViewInAr';
import SavingsIcon from '@mui/icons-material/Savings';
import { api } from '@/lib/api';
import { ago, crypto, short } from '@/lib/format';
import { AssetBadge, PageHeader } from '@/components/ui';
import { useNotify } from '@/components/Notifier';
import { useRealtime, useSocketEvent } from '@/components/RealtimeContext';

const PRESETS = { USDT_TRC20: [100, 500, 2500], USDT_ERC20: [250, 1000, 5000], USDT_BEP20: [50, 300, 1500], BTC: [0.002, 0.01, 0.05], SOL: [0.5, 5, 25] };

export default function SimulatorPage() {
  const notify = useNotify();
  const { heights } = useRealtime();
  const [clients, setClients] = useState([]);
  const [meta, setMeta] = useState(null);
  const [form, setForm] = useState({ login: '', asset: 'USDT_TRC20', amount: 500 });
  const [traffic, setTraffic] = useState({ enabled: false, intervalMs: 8000 });
  const [chain, setChain] = useState([]);

  const loadChain = useCallback(() => api('/dev/chain').then(setChain).catch(() => {}), []);
  useEffect(() => {
    api('/admin/clients', { query: { limit: 100 } }).then((r) => { setClients(r.items); setForm((f) => ({ ...f, login: r.items[0]?.mt5Login || '' })); });
    api('/meta').then(setMeta);
    api('/dev/traffic').then(setTraffic).catch(() => {});
    loadChain();
    const t = setInterval(loadChain, 5000);
    return () => clearInterval(t);
  }, [loadChain]);
  useSocketEvent('traffic:state', setTraffic);

  const call = async (fn, msg) => { try { const r = await fn(); notify(msg(r), 'success'); loadChain(); } catch (e) { notify(e.message, 'error'); } };
  const send = () => call(() => api('/dev/simulate/deposit', { method: 'POST', body: { mt5Login: Number(form.login), asset: form.asset, amount: Number(form.amount) } }),
    (r) => `Broadcast ${crypto(r.amount)} ${form.asset} → ${short(r.to)} (block #${r.blockNumber})`);
  const setT = (patch) => call(() => api('/dev/traffic', { method: 'POST', body: patch }), (r) => `Auto traffic ${r.enabled ? 'ON' : 'OFF'} · every ${r.intervalMs / 1000}s`);

  const asset = meta?.assets.find((a) => a.code === form.asset);
  const net = meta?.networks.find((n) => n.id === asset?.network);

  return (
    <>
      <PageHeader title="Chain simulator" subtitle="Mock blockchains for realtime testing — every action flows through the real listener → RabbitMQ → MT5 credit pipeline." />
      {meta?.mode.chain !== 'mock' && meta && <Alert severity="warning" sx={{ mb: 2 }}>CHAIN_MODE is “{meta.mode.chain}”. The simulator only works in mock mode.</Alert>}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Simulate an incoming deposit</Typography>
            <Stack spacing={2}>
              <TextField select label="Client" value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })}>
                {clients.map((c) => <MenuItem key={c._id} value={c.mt5Login}>{c.name} · MT5 {c.mt5Login}</MenuItem>)}
              </TextField>
              <TextField select label="Asset" value={form.asset} onChange={(e) => setForm({ ...form, asset: e.target.value, amount: PRESETS[e.target.value][1] })}>
                {meta?.assets.map((a) => <MenuItem key={a.code} value={a.code}><AssetBadge asset={a.code} size={22} /></MenuItem>)}
              </TextField>
              <TextField label="Amount" type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })}
                slotProps={{ htmlInput: { step: 'any' }, input: { endAdornment: <InputAdornment position="end">{asset?.symbol}</InputAdornment> } }}
                helperText={asset && `min deposit ${asset.minDeposit} · ${net?.confirmations} confirmations on ${net?.name}`} />
              <Stack direction="row" spacing={1}>
                {PRESETS[form.asset].map((p) => <Chip key={p} label={p} onClick={() => setForm({ ...form, amount: p })} variant="outlined" />)}
                <Chip label="below min" color="warning" variant="outlined" onClick={() => setForm({ ...form, amount: asset ? asset.minDeposit / 2 : 1 })} />
              </Stack>
              <Button variant="contained" size="large" startIcon={<PlayArrowIcon />} onClick={send} disabled={!form.login}>Broadcast deposit</Button>
              <Button variant="outlined" startIcon={<BoltIcon />} onClick={() => call(() => api('/dev/simulate/burst', { method: 'POST', body: { count: 10 } }), (r) => `${r.length} random deposits broadcast`)}>
                Burst: 10 random deposits
              </Button>
            </Stack>
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Stack spacing={2} sx={{ height: '100%' }}>
            <Paper sx={{ p: 3 }}>
              <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                  <Typography variant="h6">Auto traffic</Typography>
                  <Typography variant="body2" color="text.secondary">Random deposits (~80%) and withdrawal requests (~20%) across all clients.</Typography>
                </Box>
                <Switch checked={traffic.enabled} onChange={(e) => setT({ enabled: e.target.checked })} />
              </Stack>
              <Typography variant="caption" color="text.secondary">Every {traffic.intervalMs / 1000}s</Typography>
              <Slider min={2} max={60} value={traffic.intervalMs / 1000} valueLabelDisplay="auto"
                onChange={(_, v) => setTraffic((t) => ({ ...t, intervalMs: v * 1000 }))} onChangeCommitted={(_, v) => setT({ intervalMs: v * 1000 })} />
            </Paper>
            <Paper sx={{ p: 3, flex: 1 }}>
              <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="h6">Networks</Typography>
                <Button size="small" startIcon={<SavingsIcon />} onClick={() => call(() => api('/dev/fund-hot-wallets', { method: 'POST', body: {} }), () => 'Hot wallets funded from faucet')}>Fund hot wallets</Button>
              </Stack>
              <Table size="small">
                <TableHead><TableRow><TableCell>Network</TableCell><TableCell align="right">Height</TableCell><TableCell align="right">Mine</TableCell></TableRow></TableHead>
                <TableBody>
                  {meta?.networks.map((n) => (
                    <TableRow key={n.id}>
                      <TableCell><b>{n.id}</b> <Typography variant="caption" color="text.secondary">{n.name} · {n.confirmations} conf</Typography></TableCell>
                      <TableCell align="right" sx={{ fontFamily: 'monospace' }}>#{crypto(heights[n.id] ?? chain.find((c) => c.network === n.id)?.height, 0)}</TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end' }}>
                          {[1, n.confirmations].map((b) => (
                            <Button key={b} size="small" variant="outlined" startIcon={<ViewInArIcon />}
                              onClick={() => call(() => api(`/dev/chain/${n.id}/mine`, { method: 'POST', body: { blocks: b } }), (r) => `${n.id} → #${r.height}`)}>+{b}</Button>
                          ))}
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          </Stack>
        </Grid>
        <Grid size={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 1 }}>Mock ledger — latest transactions</Typography>
            <Table size="small">
              <TableHead><TableRow><TableCell>Time</TableCell><TableCell>Network</TableCell><TableCell>Asset</TableCell><TableCell align="right">Amount</TableCell><TableCell>From</TableCell><TableCell>To</TableCell><TableCell>Block</TableCell><TableCell>Kind</TableCell></TableRow></TableHead>
              <TableBody>
                {chain.flatMap((c) => c.recent.map((t) => ({ ...t, height: c.height })))
                  .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 15).map((t) => (
                    <TableRow key={`${t.txHash}-${t.outputIndex}`}>
                      <TableCell>{ago(t.createdAt)}</TableCell>
                      <TableCell>{t.network}</TableCell>
                      <TableCell><AssetBadge asset={t.asset} size={20} showNet={false} /></TableCell>
                      <TableCell align="right"><b>{crypto(t.amount)}</b></TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{short(t.from)}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{short(t.to)}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>
                        #{t.blockNumber} {t.height < t.blockNumber ? <Chip size="small" label="mempool" color="warning" sx={{ height: 18 }} /> : null}
                      </TableCell>
                      <TableCell><Chip size="small" variant="outlined" label={t.memo || 'transfer'} sx={{ height: 20 }} /></TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </Paper>
        </Grid>
      </Grid>
    </>
  );
}
