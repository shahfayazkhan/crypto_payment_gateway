'use client';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Grid, LinearProgress, Paper, Stack, Typography, ButtonBase } from '@mui/material';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '@/lib/api';
import { crypto } from '@/lib/format';
import { AssetBadge, ConfirmationBar, CopyText, PageHeader, StatusChip } from '@/components/ui';
import { useSocketEvent } from '@/components/RealtimeContext';

export default function DepositPage() {
  const [wallets, setWallets] = useState([]);
  const [meta, setMeta] = useState(null);
  const [sel, setSel] = useState('USDT_TRC20');
  const [recent, setRecent] = useState([]);

  useEffect(() => {
    api('/client/wallets').then(setWallets);
    api('/meta').then(setMeta);
  }, []);
  useEffect(() => { api('/client/deposits', { query: { asset: sel, limit: 6 } }).then((r) => setRecent(r.items)); }, [sel]);
  useSocketEvent(['deposit:new', 'deposit:update'], (d) => {
    if (d.asset !== sel) return;
    setRecent((cur) => { const i = cur.findIndex((x) => x._id === d._id); if (i < 0) return [d, ...cur].slice(0, 6); const n = [...cur]; n[i] = d; return n; });
  });

  const w = wallets.find((x) => x.asset === sel);
  const net = useMemo(() => meta?.networks.find((n) => n.id === w?.network), [meta, w]);

  return (
    <>
      <PageHeader title="Deposit crypto" subtitle="Funds are credited to your MT5 balance in USD automatically after network confirmations." />
      {!wallets.length && <LinearProgress />}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Stack spacing={1}>
            {wallets.map((x) => (
              <ButtonBase key={x.asset} onClick={() => setSel(x.asset)} sx={{ borderRadius: 2.5, textAlign: 'left' }}>
                <Paper sx={{ p: 1.8, width: '100%', borderColor: sel === x.asset ? 'primary.main' : undefined, bgcolor: sel === x.asset ? 'rgba(59,130,246,0.08)' : undefined }}>
                  <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                    <AssetBadge asset={x.asset} />
                    <Typography variant="caption" color="text.secondary">min {x.minDeposit}</Typography>
                  </Stack>
                </Paper>
              </ButtonBase>
            ))}
          </Stack>
        </Grid>
        <Grid size={{ xs: 12, md: 8 }}>
          {w && (
            <Paper sx={{ p: 3 }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} sx={{ alignItems: 'center' }}>
                <Box sx={{ p: 1.5, bgcolor: '#fff', borderRadius: 2, lineHeight: 0 }}>
                  <QRCodeSVG value={w.address} size={168} />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="overline" color="text.secondary">Your {w.label} deposit address</Typography>
                  <Box sx={{ p: 1.2, mt: 0.5, borderRadius: 1.5, bgcolor: 'rgba(148,163,184,0.08)', wordBreak: 'break-all' }}>
                    <CopyText text={w.address} full />
                  </Box>
                  <Stack direction="row" spacing={3} sx={{ mt: 2 }}>
                    <Box><Typography variant="caption" color="text.secondary">Network</Typography><Typography sx={{ fontWeight: 600 }}>{net?.name}</Typography></Box>
                    <Box><Typography variant="caption" color="text.secondary">Confirmations</Typography><Typography sx={{ fontWeight: 600 }}>{net?.confirmations}</Typography></Box>
                    <Box><Typography variant="caption" color="text.secondary">Minimum</Typography><Typography sx={{ fontWeight: 600 }}>{w.minDeposit}</Typography></Box>
                  </Stack>
                </Box>
              </Stack>
              <Alert severity="warning" sx={{ mt: 3 }}>
                Send only <b>{w.label}</b> on <b>{net?.name}</b> to this address. Other assets or networks will be lost. Deposits below the minimum are not credited.
              </Alert>
              <Typography variant="h6" sx={{ mt: 3, mb: 1 }}>Recent {w.label} deposits</Typography>
              {recent.map((d) => (
                <Stack key={d._id} direction="row" spacing={2} sx={{ alignItems: 'center', py: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
                  <Typography sx={{ fontWeight: 700, minWidth: 100 }}>{crypto(d.amount)}</Typography>
                  <Box sx={{ flex: 1 }}><ConfirmationBar value={d.confirmations} required={d.requiredConfirmations} status={d.status} /></Box>
                  <StatusChip status={d.status} />
                </Stack>
              ))}
              {!recent.length && <Typography color="text.secondary">Waiting for your first deposit… it will appear here in realtime.</Typography>}
            </Paper>
          )}
        </Grid>
      </Grid>
    </>
  );
}
