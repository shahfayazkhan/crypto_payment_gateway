'use client';
import { useEffect, useState } from 'react';
import { Alert, Box, Button, Divider, Grid, InputAdornment, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { api } from '@/lib/api';
import { crypto, usd } from '@/lib/format';
import { AssetBadge, PageHeader } from '@/components/ui';
import { useNotify } from '@/components/Notifier';
import { useLiveList } from '@/components/useLiveList';
import { withdrawalColumns } from '@/components/columns';
import LiveGrid from '@/components/LiveGrid';
import { useSocketEvent } from '@/components/RealtimeContext';

export default function WithdrawPage() {
  const notify = useNotify();
  const [meta, setMeta] = useState(null);
  const [acc, setAcc] = useState(null);
  const [asset, setAsset] = useState('USDT_TRC20');
  const [amount, setAmount] = useState('');
  const [toAddress, setTo] = useState('');
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const list = useLiveList('/client/withdrawals', { newEvent: 'withdrawal:new', updateEvent: 'withdrawal:update', pageSize: 10 });

  useEffect(() => { api('/meta').then(setMeta); api('/client/account').then(setAcc); }, []);
  useSocketEvent('mt5:balance', () => api('/client/account').then(setAcc));
  useEffect(() => {
    const n = Number(amount);
    if (!n) { setQuote(null); return undefined; }
    const t = setTimeout(() => api('/client/withdrawals/quote', { query: { asset, amount: n } }).then(setQuote).catch(() => setQuote(null)), 250);
    return () => clearTimeout(t);
  }, [asset, amount]);

  const a = meta?.assets.find((x) => x.code === asset);
  const net = meta?.networks.find((n) => n.id === a?.network);
  const free = acc?.account?.freeMargin ?? 0;
  const overLimit = quote && quote.amountUsd > free;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await api('/client/withdrawals', { method: 'POST', body: { asset, toAddress: toAddress.trim(), amount: Number(amount) } });
      notify('Withdrawal requested — funds held from MT5 pending review', 'success');
      setAmount(''); setTo('');
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const cancel = async (id) => {
    try { await api(`/client/withdrawals/${id}/cancel`, { method: 'POST' }); notify('Withdrawal cancelled and refunded', 'info'); } catch (e) { notify(e.message, 'error'); }
  };

  return (
    <>
      <PageHeader title="Withdraw crypto" subtitle="The USD value is debited from your MT5 balance immediately and refunded if the request is rejected or cancelled." />
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, md: 7 }}>
          <Paper component="form" onSubmit={submit} sx={{ p: 3 }}>
            <Stack spacing={2.2}>
              {error && <Alert severity="error">{error}</Alert>}
              <TextField select label="Asset" value={asset} onChange={(e) => setAsset(e.target.value)}>
                {meta?.assets.map((x) => <MenuItem key={x.code} value={x.code}><AssetBadge asset={x.code} size={22} /></MenuItem>)}
              </TextField>
              <TextField label={`Destination address (${net?.name || ''})`} value={toAddress} onChange={(e) => setTo(e.target.value)} required
                slotProps={{ htmlInput: { style: { fontFamily: 'monospace' } } }} />
              <TextField label="Amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} required
                helperText={a ? `Minimum ${a.minWithdrawal} · network fee ${a.withdrawalFee} ${a.symbol}` : ''}
                slotProps={{ htmlInput: { step: 'any', min: 0 }, input: { endAdornment: <InputAdornment position="end">{a?.symbol}</InputAdornment> } }} />
              <Button type="submit" variant="contained" size="large" disabled={busy || !quote || overLimit}>
                {busy ? 'Submitting…' : 'Request withdrawal'}
              </Button>
            </Stack>
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, md: 5 }}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="overline" color="text.secondary">Summary</Typography>
            <Stack spacing={1.2} sx={{ mt: 1 }}>
              <Row k="Free margin (MT5)" v={usd(free)} />
              <Divider />
              <Row k="You send" v={quote ? `${crypto(quote.amount)} ${a?.symbol}` : '—'} />
              <Row k="Network fee" v={quote ? `${crypto(quote.fee)} ${a?.symbol}` : '—'} />
              <Row k="Recipient gets" v={quote ? `${crypto(quote.netAmount)} ${a?.symbol}` : '—'} bold />
              <Row k={`Rate (${a?.symbol || ''}/USD)`} v={quote ? usd(quote.priceUsd) : '—'} />
              <Divider />
              <Row k="Debited from MT5" v={quote ? usd(quote.amountUsd) : '—'} bold />
              {overLimit && <Alert severity="error">Exceeds your free margin.</Alert>}
            </Stack>
          </Paper>
        </Grid>
      </Grid>
      <Typography variant="h6" sx={{ mb: 1.5 }}>Your withdrawals</Typography>
      <LiveGrid list={list} height={520} columns={withdrawalColumns({
        actions: {
          field: 'actions', headerName: '', width: 100, sortable: false,
          renderCell: ({ row }) => row.status === 'pending_review' && <Button size="small" color="error" onClick={() => cancel(row._id)}>Cancel</Button>,
        },
      })} />
    </>
  );
}

function Row({ k, v, bold }) {
  return (
    <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
      <Typography variant="body2" color="text.secondary">{k}</Typography>
      <Typography variant="body2" sx={{ fontWeight: bold ? 700 : 500 }}>{v}</Typography>
    </Stack>
  );
}
