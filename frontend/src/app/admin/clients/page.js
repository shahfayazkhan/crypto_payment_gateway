'use client';
import { PageHeader, CopyText } from '@/components/ui';
import { useLiveList } from '@/components/useLiveList';
import LiveGrid from '@/components/LiveGrid';
import { usd, dt } from '@/lib/format';

export default function ClientsPage() {
  const list = useLiveList('/admin/clients');
  return (
    <>
      <PageHeader title="Clients" subtitle="Client accounts, linked MT5 logins and lifetime crypto flows" />
      <LiveGrid list={list} columns={[
        { field: 'name', headerName: 'Name', width: 170, renderCell: ({ value }) => <b>{value}</b> },
        { field: 'email', headerName: 'Email', width: 200 },
        { field: 'country', headerName: 'Country', width: 80 },
        { field: 'mt5Login', headerName: 'MT5 login', width: 110 },
        { field: 'balance', headerName: 'MT5 balance', width: 130, valueGetter: (v, r) => r.account?.balance, valueFormatter: (v) => usd(v) },
        { field: 'equity', headerName: 'Equity', width: 120, valueGetter: (v, r) => r.account?.equity, valueFormatter: (v) => usd(v) },
        { field: 'freeMargin', headerName: 'Free margin', width: 120, valueGetter: (v, r) => r.account?.freeMargin, valueFormatter: (v) => usd(v) },
        { field: 'totalDepositedUsd', headerName: 'Deposited', width: 120, valueFormatter: (v) => usd(v, 0) },
        { field: 'totalWithdrawnUsd', headerName: 'Withdrawn', width: 120, valueFormatter: (v) => usd(v, 0) },
        { field: 'derivationIndex', headerName: 'HD index', width: 90 },
        { field: '_id', headerName: 'User ID', width: 150, renderCell: ({ value }) => <CopyText text={value} a={6} b={4} /> },
        { field: 'createdAt', headerName: 'Created', width: 160, valueFormatter: (v) => dt(v) },
      ]} />
    </>
  );
}
