'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Grid, Paper, Stack, Typography } from '@mui/material';
import { LineChart } from '@mui/x-charts/LineChart';
import { PieChart } from '@mui/x-charts/PieChart';
import { BarChart } from '@mui/x-charts/BarChart';
import SouthWestIcon from '@mui/icons-material/SouthWest';
import NorthEastIcon from '@mui/icons-material/NorthEast';
import GavelIcon from '@mui/icons-material/Gavel';
import HourglassTopIcon from '@mui/icons-material/HourglassTop';
import CallMergeIcon from '@mui/icons-material/CallMerge';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlineOutlined';
import { api } from '@/lib/api';
import { ASSET_META, ago, crypto, usd, usdCompact } from '@/lib/format';
import { AssetBadge, KpiCard, PageHeader, StatusChip } from '@/components/ui';
import { useSocketEvent } from '@/components/RealtimeContext';

const FEED_EVENTS = ['deposit:new', 'deposit:update', 'withdrawal:new', 'withdrawal:update', 'sweep:update'];

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [treasury, setTreasury] = useState([]);
  const [feed, setFeed] = useState([]);
  const pending = useRef(null);

  const load = useCallback(() => {
    api('/admin/stats').then(setStats);
    api('/admin/treasury').then(setTreasury);
  }, []);
  useEffect(() => { load(); }, [load]);

  useSocketEvent(FEED_EVENTS, (item, ev) => {
    setFeed((f) => [{ id: `${item._id}-${item.status}-${item.confirmations ?? ''}-${Date.now()}`, ev, item, at: new Date() }, ...f].slice(0, 40));
    if (!pending.current) pending.current = setTimeout(() => { pending.current = null; load(); }, 2500); // throttle stats refresh
  });

  const s = stats;
  const depositable = treasury.filter((t) => !t.gasOnly);
  return (
    <>
      <PageHeader title="Operations dashboard" subtitle="Live view of deposits, withdrawals, sweeps and treasury balances" />
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 6, md: 4, xl: 2 }}><KpiCard label="Deposits 24h" value={s ? usdCompact(s.deposits24h.usd) : '…'} sub={s && `${s.deposits24h.count} credited`} icon={<SouthWestIcon />} color="success.main" /></Grid>
        <Grid size={{ xs: 6, md: 4, xl: 2 }}><KpiCard label="Withdrawals 24h" value={s ? usdCompact(s.withdrawals24h.usd) : '…'} sub={s && `${s.withdrawals24h.count} requests`} icon={<NorthEastIcon />} color="secondary.main" /></Grid>
        <Grid size={{ xs: 6, md: 4, xl: 2 }}><KpiCard label="Pending review" value={s?.pendingReview ?? '…'} sub="withdrawals" icon={<GavelIcon />} color="warning.main" pulse={s?.pendingReview > 0} /></Grid>
        <Grid size={{ xs: 6, md: 4, xl: 2 }}><KpiCard label="Confirming" value={s?.confirming ?? '…'} sub="deposits on-chain" icon={<HourglassTopIcon />} color="info.main" pulse={s?.confirming > 0} /></Grid>
        <Grid size={{ xs: 6, md: 4, xl: 2 }}><KpiCard label="Active sweeps" value={s?.activeSweeps ?? '…'} sub={s && `${s.awaitingLiquidity} awaiting liquidity`} icon={<CallMergeIcon />} /></Grid>
        <Grid size={{ xs: 6, md: 4, xl: 2 }}><KpiCard label="Credit failures" value={s?.creditFailed ?? '…'} sub="need attention" icon={<ErrorOutlineIcon />} color={s?.creditFailed ? 'error.main' : 'text.secondary'} /></Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Paper sx={{ p: 2.5 }}>
            <Typography variant="h6">Flows — last 14 days (USD)</Typography>
            {s && (
              <LineChart height={300}
                xAxis={[{ scaleType: 'point', data: s.daily.map((d) => d.date.slice(5)) }]}
                yAxis={[{ valueFormatter: (v) => usdCompact(v) }]}
                series={[
                  { data: s.daily.map((d) => d.deposits), label: 'Deposits', color: '#22C55E', area: true, showMark: false },
                  { data: s.daily.map((d) => d.withdrawals), label: 'Withdrawals', color: '#22D3EE', showMark: false },
                ]}
              />
            )}
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, lg: 4 }}>
          <Paper sx={{ p: 2.5, height: '100%' }}>
            <Typography variant="h6">Deposit mix by asset</Typography>
            {s && (
              <PieChart height={300}
                series={[{
                  innerRadius: 60, paddingAngle: 2, cornerRadius: 4,
                  data: s.byAsset.map((b, i) => ({ id: i, value: b.usd, label: b.label, color: ASSET_META[b.asset]?.networkColor })),
                  valueFormatter: (v) => usd(v.value, 0),
                }]}
              />
            )}
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, lg: 7 }}>
          <Paper sx={{ p: 2.5 }}>
            <Typography variant="h6">Treasury — hot vs cold (USD)</Typography>
            {depositable.length > 0 && (
              <BarChart height={300}
                xAxis={[{ scaleType: 'band', data: depositable.map((t) => t.label) }]}
                yAxis={[{ valueFormatter: (v) => usdCompact(v) }]}
                series={[
                  { data: depositable.map((t) => t.hotUsd), label: 'Hot', stack: 'a', color: '#F59E0B' },
                  { data: depositable.map((t) => t.coldUsd), label: 'Cold', stack: 'a', color: '#3B82F6' },
                  { data: depositable.map((t) => t.unsweptUsd), label: 'Unswept (client addrs)', stack: 'a', color: '#94A3B8' },
                ]}
              />
            )}
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, lg: 5 }}>
          <Paper sx={{ p: 2.5, height: 382, display: 'flex', flexDirection: 'column' }}>
            <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="h6">Live activity</Typography>
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'success.main', animation: 'pulse 1.6s infinite' }} />
            </Stack>
            <Box sx={{ overflow: 'auto', flex: 1 }}>
              {feed.map(({ id, ev, item, at }) => (
                <Stack key={id} direction="row" spacing={1.5} className="row-flash" sx={{ alignItems: 'center', py: 0.9, borderBottom: '1px solid', borderColor: 'divider' }}>
                  <AssetBadge asset={item.asset} size={22} showNet={false} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" noWrap>
                      <b>{ev.split(':')[0]}</b> {crypto(item.amount)} {item.mt5Login ? `· MT5 ${item.mt5Login}` : item.destination ? `→ ${item.destination}` : ''}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {item.requiredConfirmations && item.status === 'confirming' ? `${item.confirmations}/${item.requiredConfirmations} conf · ` : ''}{ago(at)}
                    </Typography>
                  </Box>
                  <StatusChip status={item.status} />
                </Stack>
              ))}
              {!feed.length && <Typography color="text.secondary" variant="body2">Waiting for events… try the Simulator.</Typography>}
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </>
  );
}
