'use client';
import DashboardIcon from '@mui/icons-material/SpaceDashboard';
import SouthWestIcon from '@mui/icons-material/SouthWest';
import NorthEastIcon from '@mui/icons-material/NorthEast';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import PeopleIcon from '@mui/icons-material/People';
import ScienceIcon from '@mui/icons-material/Science';
import WebhookIcon from '@mui/icons-material/Webhook';
import AppShell from '@/components/AppShell';

const NAV = [
  { href: '/admin', label: 'Dashboard', icon: <DashboardIcon fontSize="small" /> },
  { href: '/admin/deposits', label: 'Deposits', icon: <SouthWestIcon fontSize="small" /> },
  { href: '/admin/withdrawals', label: 'Withdrawals', icon: <NorthEastIcon fontSize="small" /> },
  { href: '/admin/treasury', label: 'Treasury & Sweeps', icon: <AccountBalanceIcon fontSize="small" /> },
  { href: '/admin/clients', label: 'Clients', icon: <PeopleIcon fontSize="small" /> },
  { href: '/admin/webhooks', label: 'Webhooks & Audit', icon: <WebhookIcon fontSize="small" /> },
  { href: '/admin/simulator', label: 'Simulator', icon: <ScienceIcon fontSize="small" /> },
];

export default function AdminLayout({ children }) {
  return <AppShell nav={NAV} area="admin">{children}</AppShell>;
}
