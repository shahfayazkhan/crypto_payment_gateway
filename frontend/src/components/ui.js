'use client';
import { useState } from 'react';
import { Avatar, Box, Chip, IconButton, LinearProgress, Link, Paper, Stack, Tooltip, Typography } from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { ASSET_META, EXPLORER, short } from '@/lib/format';

export function AssetBadge({ asset, showNet = true, size = 28 }) {
  const m = ASSET_META[asset] || { symbol: asset, color: '#64748B' };
  return (
    <Stack direction="row" spacing={1.2} sx={{ alignItems: 'center' }}>
      <Box sx={{ position: 'relative' }}>
        <Avatar sx={{ width: size, height: size, bgcolor: m.color, fontSize: size * 0.34, fontWeight: 800 }}>{m.symbol.slice(0, 4)}</Avatar>
        {m.networkColor && m.networkColor !== m.color && (
          <Box sx={{ position: 'absolute', right: -2, bottom: -2, width: size * 0.42, height: size * 0.42, borderRadius: '50%', bgcolor: m.networkColor, border: '2px solid', borderColor: 'background.paper' }} />
        )}
      </Box>
      <Box sx={{ lineHeight: 1.1 }}>
        <Typography variant="body2" sx={{ fontWeight: 700 }}>{m.symbol}</Typography>
        {showNet && <Typography variant="caption" color="text.secondary">{m.net}</Typography>}
      </Box>
    </Stack>
  );
}

const STATUS = {
  confirming: ['info', 'Confirming'], confirmed: ['info', 'Confirmed'], crediting: ['info', 'Crediting'],
  credited: ['success', 'Credited'], credit_failed: ['error', 'Credit failed'], below_minimum: ['default', 'Below min'], orphaned: ['error', 'Orphaned'],
  pending_review: ['warning', 'Pending review'], approved: ['info', 'Approved'], processing: ['info', 'Signing'],
  awaiting_liquidity: ['warning', 'Awaiting liquidity'], broadcast: ['info', 'Broadcast'], completed: ['success', 'Completed'],
  rejected: ['error', 'Rejected'], cancelled: ['default', 'Cancelled'], failed: ['error', 'Failed'],
  pending: ['default', 'Pending'], gas_topup: ['warning', 'Gas top-up'], sweeping: ['info', 'Sweeping'],
  delivered: ['success', 'Delivered'],
};
export function StatusChip({ status }) {
  const [color, label] = STATUS[status] || ['default', status];
  return <Chip size="small" color={color} variant={color === 'default' ? 'outlined' : 'filled'} label={label} sx={{ height: 22, fontSize: 11.5 }} />;
}

export function ConfirmationBar({ value = 0, required = 1, status }) {
  const pct = Math.min(100, (value / required) * 100);
  const done = pct >= 100;
  return (
    <Box sx={{ minWidth: 110, width: '100%' }}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', mb: 0.3 }}>
        <Typography variant="caption" color="text.secondary">{Math.min(value, required)}/{required}</Typography>
        {status === 'confirming' && <Typography variant="caption" color="info.main">live</Typography>}
      </Stack>
      <LinearProgress variant="determinate" value={pct} color={done ? 'success' : 'info'} sx={{ height: 5, borderRadius: 3 }} />
    </Box>
  );
}

export function CopyText({ text, a = 8, b = 6, mono = true, full = false }) {
  const [ok, setOk] = useState(false);
  if (!text) return <span>—</span>;
  return (
    <Stack direction="row" spacing={0.3} sx={{ alignItems: 'center', minWidth: 0 }}>
      <Tooltip title={text}>
        <Typography variant="body2" noWrap sx={{ fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : undefined, fontSize: 12.5 }}>
          {full ? text : short(text, a, b)}
        </Typography>
      </Tooltip>
      <IconButton size="small" onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1200); }}>
        {ok ? <CheckIcon sx={{ fontSize: 14 }} color="success" /> : <ContentCopyIcon sx={{ fontSize: 14 }} />}
      </IconButton>
    </Stack>
  );
}

export function TxLink({ network, hash }) {
  if (!hash) return <span>—</span>;
  return (
    <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
      <CopyText text={hash} a={8} b={6} />
      <Link href={`${EXPLORER[network]}${hash}`} target="_blank" rel="noreferrer" sx={{ display: 'flex' }}><OpenInNewIcon sx={{ fontSize: 14 }} /></Link>
    </Stack>
  );
}

export function KpiCard({ label, value, sub, icon, color = 'primary.main', pulse }) {
  return (
    <Paper sx={{ p: 2.2, height: '100%', position: 'relative', overflow: 'hidden' }}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Typography variant="overline" color="text.secondary">{label}</Typography>
          <Typography variant="h5" sx={{ mt: 0.3 }}>{value}</Typography>
          {sub && <Typography variant="caption" color="text.secondary">{sub}</Typography>}
        </Box>
        {icon && (
          <Box sx={{ color, bgcolor: 'action.hover', borderRadius: 2, p: 1, display: 'flex', animation: pulse ? 'pulse 1.6s ease-in-out infinite' : undefined }}>{icon}</Box>
        )}
      </Stack>
    </Paper>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' }, mb: 3 }}>
      <Box>
        <Typography variant="h5">{title}</Typography>
        {subtitle && <Typography variant="body2" color="text.secondary">{subtitle}</Typography>}
      </Box>
      {actions && <Stack direction="row" spacing={1}>{actions}</Stack>}
    </Stack>
  );
}
