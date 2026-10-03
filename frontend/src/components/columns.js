'use client';
import { Box, Typography } from '@mui/material';
import { AssetBadge, ConfirmationBar, CopyText, StatusChip, TxLink } from './ui';
import { ago, crypto, dt, usd } from '@/lib/format';

const userCol = {
  field: 'user', headerName: 'Client', width: 170, sortable: false,
  renderCell: ({ row }) => (
    <Box sx={{ lineHeight: 1.2, py: 0.6 }}>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>{typeof row.user === 'object' && row.user ? row.user.name : 'Client'}</Typography>
      <Typography variant="caption" color="text.secondary">MT5 {row.mt5Login}</Typography>
    </Box>
  ),
};
const time = { field: 'createdAt', headerName: 'Time', width: 140, renderCell: ({ value }) => <span title={dt(value)}>{ago(value)}</span> };
const asset = { field: 'asset', headerName: 'Asset', width: 130, renderCell: ({ value }) => <AssetBadge asset={value} size={24} /> };

export const depositColumns = ({ admin = false, actions } = {}) => [
  time,
  ...(admin ? [userCol] : []),
  asset,
  { field: 'amount', headerName: 'Amount', width: 130, type: 'number', renderCell: ({ value }) => <b>{crypto(value)}</b> },
  { field: 'amountUsd', headerName: 'USD', width: 110, type: 'number', valueFormatter: (v) => usd(v) },
  { field: 'status', headerName: 'Status', width: 135, renderCell: ({ value }) => <StatusChip status={value} /> },
  {
    field: 'confirmations', headerName: 'Confirmations', width: 150, sortable: false,
    renderCell: ({ row }) => <Box sx={{ width: '100%', pt: 1.2 }}><ConfirmationBar value={row.confirmations} required={row.requiredConfirmations} status={row.status} /></Box>,
  },
  { field: 'txHash', headerName: 'Tx', width: 190, sortable: false, renderCell: ({ row }) => <TxLink network={row.network} hash={row.txHash} /> },
  ...(admin ? [
    { field: 'address', headerName: 'Deposit address', width: 180, sortable: false, renderCell: ({ value }) => <CopyText text={value} /> },
    { field: 'mt5DealId', headerName: 'MT5 deal', width: 120 },
    { field: 'sweptAt', headerName: 'Swept', width: 100, renderCell: ({ value }) => (value ? ago(value) : '—') },
  ] : [{ field: 'mt5DealId', headerName: 'MT5 deal', width: 120 }]),
  ...(actions ? [actions] : []),
];

export const withdrawalColumns = ({ admin = false, actions } = {}) => [
  time,
  ...(admin ? [userCol] : []),
  asset,
  { field: 'amount', headerName: 'Amount', width: 115, type: 'number', renderCell: ({ value }) => <b>{crypto(value)}</b> },
  { field: 'netAmount', headerName: 'Net sent', width: 110, type: 'number', valueFormatter: (v) => crypto(v) },
  { field: 'amountUsd', headerName: 'USD', width: 105, type: 'number', valueFormatter: (v) => usd(v) },
  { field: 'status', headerName: 'Status', width: 150, renderCell: ({ value }) => <StatusChip status={value} /> },
  {
    field: 'confirmations', headerName: 'Confirmations', width: 140, sortable: false,
    renderCell: ({ row }) => (row.txHash
      ? <Box sx={{ width: '100%', pt: 1.2 }}><ConfirmationBar value={row.confirmations} required={row.requiredConfirmations} /></Box>
      : '—'),
  },
  { field: 'toAddress', headerName: 'Destination', width: 180, sortable: false, renderCell: ({ value }) => <CopyText text={value} /> },
  { field: 'txHash', headerName: 'Tx', width: 190, sortable: false, renderCell: ({ row }) => <TxLink network={row.network} hash={row.txHash} /> },
  ...(admin ? [{ field: 'error', headerName: 'Note', width: 200, valueGetter: (v, row) => row.error || row.reviewNote || '' }] : []),
  ...(actions ? [actions] : []),
];

export const gridSx = {
  border: 'none',
  '& .MuiDataGrid-columnHeaders': { bgcolor: 'rgba(148,163,184,0.06)' },
  '& .MuiDataGrid-cell': { display: 'flex', alignItems: 'center', borderColor: 'divider' },
  '& .MuiDataGrid-cell:focus, & .MuiDataGrid-cell:focus-within': { outline: 'none' },
};
