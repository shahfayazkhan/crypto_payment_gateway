'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Button, Chip, LinearProgress, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tooltip, Typography } from '@mui/material';
import CallMergeIcon from '@mui/icons-material/CallMerge';
import BoltIcon from '@mui/icons-material/Bolt';
import { api } from '@/lib/api';
import { ago, crypto, usd } from '@/lib/format';
import { AssetBadge, CopyText, PageHeader, StatusChip, TxLink } from '@/components/ui';
import { useLiveList } from '@/components/useLiveList';
import LiveGrid from '@/components/LiveGrid';
import { useNotify } from '@/components/Notifier';
import { useSocketEvent } from '@/components/RealtimeContext';

export default function TreasuryPage() {
  const notify = useNotify();
  const [rows, setRows] = useState([]);
  const timer = useRef(null);
  const load = useCallback(() => api('/admin/treasury').then(setRows), []);
  useEffect(() => { load(); }, [load]);
  useSocketEvent(['sweep:update', 'withdrawal:update', 'deposit:update'], () => {
    if (!timer.current) timer.current = setTimeout(() => { timer.current = null; load(); }, 2000);
  });
  const sweeps = useLiveList('/admin/sweeps', { newEvent: 'sweep:update', updateEvent: 'sweep:update', pageSize: 10 });

  const run = async (force) => {
    try { await api('/admin/sweeps/run', { method: 'POST', body: { force } }); notify(force ? 'Force sweep queued (ignores thresholds)' : 'Sweep cycle queued', 'success'); } catch (e) { notify(e.message, 'error'); }
  };

  const totals = rows.reduce((t, r) => ({ hot: t.hot + r.hotUsd, cold: t.cold + r.coldUsd, unswept: t.unswept + r.unsweptUsd }), { hot: 0, cold: 0, unswept: 0 });

  return (
    <>
      <PageHeader title="Treasury & sweeps" subtitle="Client deposits are swept to the hot wallet until it reaches its target, then to cold storage."
        actions={<>
          <Button variant="outlined" startIcon={<CallMergeIcon />} onClick={() => run(false)}>Run sweep cycle</Button>
          <Button variant="contained" color="warning" startIcon={<BoltIcon />} onClick={() => run(true)}>Force sweep all</Button>
        </>} />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
        {[['Hot wallets', totals.hot, 'warning.main'], ['Cold storage', totals.cold, 'primary.main'], ['Unswept in client addresses', totals.unswept, 'text.secondary']].map(([l, v, c]) => (
          <Paper key={l} sx={{ p: 2, flex: 1 }}>
            <Typography variant="overline" color="text.secondary">{l}</Typography>
            <Typography variant="h5" sx={{ color: c }}>{usd(v, 0)}</Typography>
          </Paper>
        ))}
      </Stack>
      <TableContainer component={Paper} sx={{ mb: 3 }}>
        {!rows.length && <LinearProgress />}
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Asset</TableCell><TableCell align="right">Price</TableCell><TableCell align="right">Hot</TableCell>
              <TableCell sx={{ width: 180 }}>Hot vs target</TableCell><TableCell align="right">Cold</TableCell><TableCell align="right">Unswept</TableCell>
              <TableCell>Hot address</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => {
              const pct = r.hotTargetUsd ? Math.min(100, (r.hotUsd / r.hotTargetUsd) * 100) : null;
              return (
                <TableRow key={r.asset} hover>
                  <TableCell><Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}><AssetBadge asset={r.asset} size={24} />{r.gasOnly && <Chip size="small" label="gas" variant="outlined" />}</Stack></TableCell>
                  <TableCell align="right">{usd(r.price, r.price < 1 ? 4 : 2)}</TableCell>
                  <TableCell align="right"><b>{crypto(r.hot, 6)}</b><Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{usd(r.hotUsd, 0)}</Typography></TableCell>
                  <TableCell>
                    {pct !== null ? (
                      <Tooltip title={`Target ${usd(r.hotTargetUsd, 0)}`}>
                        <Box><LinearProgress variant="determinate" value={pct} color={pct < 30 ? 'error' : pct < 100 ? 'warning' : 'success'} sx={{ height: 6, borderRadius: 3 }} />
                          <Typography variant="caption" color="text.secondary">{pct.toFixed(0)}% of target</Typography></Box>
                      </Tooltip>
                    ) : <Typography variant="caption" color="text.secondary">fee float</Typography>}
                  </TableCell>
                  <TableCell align="right">{crypto(r.cold, 6)}<Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{usd(r.coldUsd, 0)}</Typography></TableCell>
                  <TableCell align="right">{r.gasOnly ? '—' : crypto(r.unswept, 6)}</TableCell>
                  <TableCell><CopyText text={r.hotAddress} /></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
      <Typography variant="h6" sx={{ mb: 1.5 }}>Sweeps</Typography>
      <LiveGrid list={sweeps} height={560} columns={[
        { field: 'createdAt', headerName: 'Time', width: 130, renderCell: ({ value }) => ago(value) },
        { field: 'asset', headerName: 'Asset', width: 130, renderCell: ({ value }) => <AssetBadge asset={value} size={24} /> },
        { field: 'amount', headerName: 'Amount', width: 120, renderCell: ({ value }) => <b>{crypto(value)}</b> },
        { field: 'amountUsd', headerName: 'USD', width: 110, valueFormatter: (v) => usd(v) },
        { field: 'status', headerName: 'Status', width: 120, renderCell: ({ value }) => <StatusChip status={value} /> },
        { field: 'destination', headerName: 'To', width: 80, renderCell: ({ value }) => <Chip size="small" label={value} color={value === 'cold' ? 'primary' : 'warning'} variant="outlined" /> },
        { field: 'fromAddresses', headerName: 'From', width: 170, sortable: false, renderCell: ({ value }) => (value?.length > 1 ? `${value.length} addresses (UTXO batch)` : <CopyText text={value?.[0]} />) },
        { field: 'gasTopupAmount', headerName: 'Gas top-up', width: 100, valueFormatter: (v) => (v ? crypto(v) : '—') },
        { field: 'txHash', headerName: 'Tx', width: 190, sortable: false, renderCell: ({ row }) => <TxLink network={row.network} hash={row.txHash} /> },
        { field: 'trigger', headerName: 'Trigger', width: 100 },
        { field: 'error', headerName: 'Error', width: 200 },
      ]} />
    </>
  );
}
