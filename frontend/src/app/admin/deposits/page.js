'use client';
import { useState } from 'react';
import { Button, MenuItem, Stack, TextField } from '@mui/material';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui';
import { useLiveList } from '@/components/useLiveList';
import { depositColumns } from '@/components/columns';
import LiveGrid from '@/components/LiveGrid';
import { useNotify } from '@/components/Notifier';

const STATUSES = ['', 'confirming', 'confirmed', 'credited', 'credit_failed', 'below_minimum', 'orphaned'];
const ASSETS = ['', 'USDT_TRC20', 'USDT_ERC20', 'USDT_BEP20', 'BTC', 'SOL'];

export default function AdminDeposits() {
  const notify = useNotify();
  const [status, setStatus] = useState('');
  const [asset, setAsset] = useState('');
  const [q, setQ] = useState('');
  const list = useLiveList('/admin/deposits', {
    query: { status, asset, q }, newEvent: 'deposit:new', updateEvent: 'deposit:update',
    matches: (d, f) => (!f.status || d.status === f.status) && (!f.asset || d.asset === f.asset),
  });

  const act = async (fn, msg) => { try { await fn(); notify(msg, 'success'); } catch (e) { notify(e.message, 'error'); } };

  return (
    <>
      <PageHeader title="Deposits" subtitle="All on-chain deposits into client HD addresses" />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
        <TextField select size="small" label="Status" value={status} onChange={(e) => setStatus(e.target.value)} sx={{ minWidth: 170 }}>
          {STATUSES.map((s) => <MenuItem key={s} value={s}>{s || 'All'}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Asset" value={asset} onChange={(e) => setAsset(e.target.value)} sx={{ minWidth: 150 }}>
          {ASSETS.map((s) => <MenuItem key={s} value={s}>{s || 'All'}</MenuItem>)}
        </TextField>
        <TextField size="small" label="Tx hash / address" value={q} onChange={(e) => setQ(e.target.value.trim())} sx={{ flex: 1 }} />
      </Stack>
      <LiveGrid list={list} height={700} columns={depositColumns({
        admin: true,
        actions: {
          field: 'actions', headerName: 'Actions', width: 130, sortable: false,
          renderCell: ({ row }) => (
            row.status === 'credit_failed'
              ? <Button size="small" variant="outlined" color="warning" onClick={() => act(() => api(`/admin/deposits/${row._id}/retry-credit`, { method: 'POST' }), 'Credit re-queued')}>Retry credit</Button>
              : row.status === 'confirming'
                ? <Button size="small" onClick={() => act(() => api(`/dev/deposits/${row._id}/fast-confirm`, { method: 'POST' }), 'Blocks mined')}>Fast-confirm</Button>
                : null
          ),
        },
      })} />
    </>
  );
}
