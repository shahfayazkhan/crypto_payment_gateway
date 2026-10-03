'use client';
import { useState } from 'react';
import { Badge, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Tab, Tabs, TextField, Typography } from '@mui/material';
import { api } from '@/lib/api';
import { crypto, usd } from '@/lib/format';
import { AssetBadge, CopyText, PageHeader } from '@/components/ui';
import { useLiveList } from '@/components/useLiveList';
import { withdrawalColumns } from '@/components/columns';
import LiveGrid from '@/components/LiveGrid';
import { useNotify } from '@/components/Notifier';

const TABS = [
  ['pending_review', 'Pending review'], ['awaiting_liquidity', 'Awaiting liquidity'], ['broadcast', 'Broadcast'],
  ['completed', 'Completed'], ['rejected', 'Rejected'], ['failed', 'Failed'], ['', 'All'],
];

export default function AdminWithdrawals() {
  const notify = useNotify();
  const [tab, setTab] = useState('pending_review');
  const [dlg, setDlg] = useState(null); // { row, action }
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const list = useLiveList('/admin/withdrawals', {
    query: { status: tab }, newEvent: 'withdrawal:new', updateEvent: 'withdrawal:update',
    matches: (w, f) => !f.status || w.status === f.status,
  });

  const run = async () => {
    setBusy(true);
    try {
      await api(`/admin/withdrawals/${dlg.row._id}/${dlg.action}`, { method: 'POST', body: { note: note || undefined } });
      notify(dlg.action === 'approve' ? 'Approved — queued for signing' : 'Rejected — MT5 refunded', dlg.action === 'approve' ? 'success' : 'info');
      setDlg(null); setNote('');
    } catch (e) { notify(e.message, 'error'); } finally { setBusy(false); }
  };
  const retry = async (row) => {
    try { await api(`/admin/withdrawals/${row._id}/retry`, { method: 'POST' }); notify('Re-queued', 'success'); } catch (e) { notify(e.message, 'error'); }
  };

  return (
    <>
      <PageHeader title="Withdrawals" subtitle="Review, approve and track client withdrawals. MT5 is debited at request time; rejections are refunded automatically." />
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" sx={{ mb: 2 }}>
        {TABS.map(([v, l]) => <Tab key={v} value={v} label={v === tab && v ? <Badge color="warning" badgeContent={list.total} max={999}><span style={{ paddingRight: 12 }}>{l}</span></Badge> : l} />)}
      </Tabs>
      <LiveGrid list={list} height={680} columns={withdrawalColumns({
        admin: true,
        actions: {
          field: 'actions', headerName: 'Actions', width: 190, sortable: false,
          renderCell: ({ row }) => (
            <Stack direction="row" spacing={1}>
              {row.status === 'pending_review' && <>
                <Button size="small" variant="contained" color="success" onClick={() => setDlg({ row, action: 'approve' })}>Approve</Button>
                <Button size="small" variant="outlined" color="error" onClick={() => setDlg({ row, action: 'reject' })}>Reject</Button>
              </>}
              {['failed', 'awaiting_liquidity'].includes(row.status) && <>
                <Button size="small" variant="outlined" onClick={() => retry(row)}>Retry</Button>
                <Button size="small" color="error" onClick={() => setDlg({ row, action: 'reject' })}>Reject</Button>
              </>}
            </Stack>
          ),
        },
      })} />

      <Dialog open={!!dlg} onClose={() => setDlg(null)} maxWidth="xs" fullWidth>
        {dlg && <>
          <DialogTitle>{dlg.action === 'approve' ? 'Approve withdrawal' : 'Reject withdrawal'}</DialogTitle>
          <DialogContent>
            <Stack spacing={1.5} sx={{ mt: 1 }}>
              <AssetBadge asset={dlg.row.asset} />
              <Typography><b>{crypto(dlg.row.amount)}</b> ({usd(dlg.row.amountUsd)}) · net {crypto(dlg.row.netAmount)}</Typography>
              <Typography variant="body2" color="text.secondary">Client: {dlg.row.user?.name || '—'} · MT5 {dlg.row.mt5Login}</Typography>
              <CopyText text={dlg.row.toAddress} full />
              <TextField label={dlg.action === 'reject' ? 'Reason (shown to client)' : 'Note (optional)'} value={note} onChange={(e) => setNote(e.target.value)} multiline minRows={2} />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDlg(null)}>Cancel</Button>
            <Button variant="contained" color={dlg.action === 'approve' ? 'success' : 'error'} onClick={run} disabled={busy}>
              {dlg.action === 'approve' ? 'Approve & send' : 'Reject & refund'}
            </Button>
          </DialogActions>
        </>}
      </Dialog>
    </>
  );
}
