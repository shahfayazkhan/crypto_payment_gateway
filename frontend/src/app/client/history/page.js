'use client';
import { useState } from 'react';
import { Tab, Tabs } from '@mui/material';
import { PageHeader } from '@/components/ui';
import { useLiveList } from '@/components/useLiveList';
import { depositColumns, withdrawalColumns } from '@/components/columns';
import LiveGrid from '@/components/LiveGrid';

export default function HistoryPage() {
  const [tab, setTab] = useState(0);
  const deps = useLiveList('/client/deposits', { newEvent: 'deposit:new', updateEvent: 'deposit:update' });
  const wds = useLiveList('/client/withdrawals', { newEvent: 'withdrawal:new', updateEvent: 'withdrawal:update' });
  return (
    <>
      <PageHeader title="Transaction history" subtitle="Updates live as transactions confirm on-chain." />
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label={`Deposits (${deps.total})`} />
        <Tab label={`Withdrawals (${wds.total})`} />
      </Tabs>
      {tab === 0 ? <LiveGrid list={deps} columns={depositColumns()} /> : <LiveGrid list={wds} columns={withdrawalColumns()} />}
    </>
  );
}
