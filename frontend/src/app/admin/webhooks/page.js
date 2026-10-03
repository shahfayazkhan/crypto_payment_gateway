'use client';
import { useEffect, useState } from 'react';
import { Box, Paper, Stack, Tab, Tabs, Typography } from '@mui/material';
import { api } from '@/lib/api';
import { ago, dt } from '@/lib/format';
import { PageHeader, StatusChip } from '@/components/ui';
import { useLiveList } from '@/components/useLiveList';
import LiveGrid from '@/components/LiveGrid';
import { useSocketEvent } from '@/components/RealtimeContext';

export default function WebhooksPage() {
  const [tab, setTab] = useState(0);
  const [sink, setSink] = useState([]);
  const deliveries = useLiveList('/admin/webhooks');
  const auditLog = useLiveList('/admin/audit');
  useEffect(() => { api('/dev/webhook-sink').then(setSink).catch(() => {}); }, []);
  useSocketEvent('webhook:received', (e) => setSink((s) => [e, ...s].slice(0, 50)));

  return (
    <>
      <PageHeader title="Webhooks & audit" subtitle="Signed (HMAC-SHA256) events delivered to CRM / RMS, plus the back-office audit trail" />
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Live receiver" /><Tab label="Deliveries" /><Tab label="Audit log" />
      </Tabs>
      {tab === 0 && (
        <Paper sx={{ p: 2, maxHeight: 700, overflow: 'auto' }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Events received by the built-in sink at <code>/api/dev/webhook-sink</code> (the default WEBHOOK_URLS target). Point WEBHOOK_URLS at your CRM/RMS in production.
          </Typography>
          {sink.map((e, i) => (
            <Box key={`${e.receivedAt}-${i}`} className={i === 0 ? 'row-flash' : ''} sx={{ py: 1.2, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 0.5 }}>
                <Typography sx={{ fontFamily: 'monospace', fontWeight: 700, color: 'secondary.main' }}>{e.event}</Typography>
                <Typography variant="caption" color="text.secondary">{ago(e.receivedAt)}</Typography>
              </Stack>
              <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary', display: 'block' }}>x-gateway-signature: {e.signature}</Typography>
              <Box component="pre" sx={{ m: 0, mt: 0.5, fontSize: 11.5, whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: 'text.secondary', maxHeight: 120, overflow: 'auto' }}>
                {JSON.stringify(e.body?.data, null, 0)}
              </Box>
            </Box>
          ))}
          {!sink.length && <Typography color="text.secondary">No events yet.</Typography>}
        </Paper>
      )}
      {tab === 1 && <LiveGrid list={deliveries} columns={[
        { field: 'createdAt', headerName: 'Time', width: 150, renderCell: ({ value }) => ago(value) },
        { field: 'event', headerName: 'Event', width: 200, renderCell: ({ value }) => <code>{value}</code> },
        { field: 'status', headerName: 'Status', width: 110, renderCell: ({ value }) => <StatusChip status={value} /> },
        { field: 'attempts', headerName: 'Attempts', width: 90 },
        { field: 'responseCode', headerName: 'HTTP', width: 80 },
        { field: 'url', headerName: 'URL', width: 320 },
        { field: 'lastError', headerName: 'Last error', width: 220 },
      ]} />}
      {tab === 2 && <LiveGrid list={auditLog} columns={[
        { field: 'createdAt', headerName: 'Time', width: 170, valueFormatter: (v) => dt(v) },
        { field: 'actorEmail', headerName: 'Actor', width: 200 },
        { field: 'action', headerName: 'Action', width: 200, renderCell: ({ value }) => <code>{value}</code> },
        { field: 'entity', headerName: 'Entity', width: 120 },
        { field: 'entityId', headerName: 'ID', width: 220 },
        { field: 'meta', headerName: 'Meta', width: 250, valueFormatter: (v) => (v && Object.keys(v).length ? JSON.stringify(v) : '') },
      ]} />}
    </>
  );
}
