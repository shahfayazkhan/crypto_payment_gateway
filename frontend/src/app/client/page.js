'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Box, Button, Grid, LinearProgress, Paper, Stack, Typography } from '@mui/material';
import SouthWestIcon from '@mui/icons-material/SouthWest';
import NorthEastIcon from '@mui/icons-material/NorthEast';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import SavingsIcon from '@mui/icons-material/Savings';
import { api } from '@/lib/api';
import { usd, crypto, ago } from '@/lib/format';
import { AssetBadge, ConfirmationBar, KpiCard, PageHeader, StatusChip } from '@/components/ui';
import { useSocketEvent } from '@/components/RealtimeContext';

export default function ClientOverview() {
  const [acc, setAcc] = useState(null);
  const [deps, setDeps] = useState([]);
  const [wds, setWds] = useState([]);

  const load = useCallback(async () => {
    const [a, d, w] = await Promise.all([api('/client/account'), api('/client/deposits', { query: { limit: 8 } }), api('/client/withdrawals', { query: { limit: 5 } })]);
    setAcc(a); setDeps(d.items); setWds(w.items);
  }, []);
  useEffect(() => { load(); }, [load]);

  useSocketEvent(['deposit:new', 'deposit:update'], (d) => {
    setDeps((cur) => { const i = cur.findIndex((x) => x._id === d._id); if (i < 0) return [d, ...cur].slice(0, 8); const n = [...cur]; n[i] = d; return n; });
  });
  useSocketEvent(['withdrawal:new', 'withdrawal:update'], (w) => {
    setWds((cur) => { const i = cur.findIndex((x) => x._id === w._id); if (i < 0) return [w, ...cur].slice(0, 5); const n = [...cur]; n[i] = w; return n; });
  });
  useSocketEvent('mt5:balance', () => api('/client/account').then(setAcc));

  const a = acc?.account;
  const inflight = deps.filter((d) => ['confirming', 'confirmed', 'crediting'].includes(d.status));

  return (
    <>
      <PageHeader
        title={`Welcome back, ${acc?.user?.name?.split(' ')[0] || ''}`}
        subtitle={a ? `MT5 account ${a.login} · ${a.group} · 1:${a.leverage}` : 'Loading account…'}
        actions={<>
          <Button component={Link} href="/client/deposit" variant="contained" startIcon={<SouthWestIcon />}>Deposit</Button>
          <Button component={Link} href="/client/withdraw" variant="outlined" startIcon={<NorthEastIcon />}>Withdraw</Button>
        </>}
      />
      {!a && <LinearProgress />}
      {a && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid size={{ xs: 12, sm: 4 }}><KpiCard label="Balance" value={usd(a.balance)} sub={a.currency} icon={<AccountBalanceWalletIcon />} /></Grid>
          <Grid size={{ xs: 12, sm: 4 }}><KpiCard label="Equity" value={usd(a.equity)} sub={`Margin ${usd(a.margin)}`} icon={<ShowChartIcon />} color="secondary.main" /></Grid>
          <Grid size={{ xs: 12, sm: 4 }}><KpiCard label="Free margin" value={usd(a.freeMargin)} sub="Available to withdraw" icon={<SavingsIcon />} color="success.main" /></Grid>
        </Grid>
      )}

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 7 }}>
          <Paper sx={{ p: 2.5, height: '100%' }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Deposits</Typography>
            {inflight.length > 0 && (
              <Box sx={{ mb: 2, p: 1.5, borderRadius: 2, bgcolor: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)' }}>
                <Typography variant="overline" color="primary">In progress</Typography>
                {inflight.map((d) => (
                  <Stack key={d._id} direction="row" spacing={2} sx={{ alignItems: 'center', py: 1 }}>
                    <AssetBadge asset={d.asset} size={26} />
                    <Typography sx={{ fontWeight: 700, minWidth: 110 }}>{crypto(d.amount)}</Typography>
                    <Box sx={{ flex: 1 }}><ConfirmationBar value={d.confirmations} required={d.requiredConfirmations} status={d.status} /></Box>
                    <StatusChip status={d.status} />
                  </Stack>
                ))}
              </Box>
            )}
            {deps.filter((d) => !inflight.includes(d)).map((d) => (
              <Stack key={d._id} direction="row" spacing={2} sx={{ alignItems: 'center', py: 1.1, borderBottom: '1px solid', borderColor: 'divider' }}>
                <AssetBadge asset={d.asset} size={26} />
                <Box sx={{ flex: 1 }}>
                  <Typography sx={{ fontWeight: 700 }}>{crypto(d.amount)}</Typography>
                  <Typography variant="caption" color="text.secondary">{ago(d.createdAt)}</Typography>
                </Box>
                <Typography color="success.main" sx={{ fontWeight: 600 }}>{d.status === 'credited' ? `+${usd(d.amountUsd)}` : ''}</Typography>
                <StatusChip status={d.status} />
              </Stack>
            ))}
            {!deps.length && <Typography color="text.secondary">No deposits yet.</Typography>}
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, lg: 5 }}>
          <Paper sx={{ p: 2.5, height: '100%' }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Withdrawals</Typography>
            {wds.map((w) => (
              <Stack key={w._id} direction="row" spacing={2} sx={{ alignItems: 'center', py: 1.1, borderBottom: '1px solid', borderColor: 'divider' }}>
                <AssetBadge asset={w.asset} size={26} />
                <Box sx={{ flex: 1 }}>
                  <Typography sx={{ fontWeight: 700 }}>{crypto(w.amount)}</Typography>
                  <Typography variant="caption" color="text.secondary">{ago(w.createdAt)}</Typography>
                </Box>
                <Typography sx={{ fontWeight: 600 }}>−{usd(w.amountUsd)}</Typography>
                <StatusChip status={w.status} />
              </Stack>
            ))}
            {!wds.length && <Typography color="text.secondary">No withdrawals yet.</Typography>}
          </Paper>
        </Grid>
      </Grid>
    </>
  );
}
