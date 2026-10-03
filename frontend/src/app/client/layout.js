'use client';
import DashboardIcon from '@mui/icons-material/SpaceDashboard';
import SouthWestIcon from '@mui/icons-material/SouthWest';
import NorthEastIcon from '@mui/icons-material/NorthEast';
import HistoryIcon from '@mui/icons-material/History';
import AppShell from '@/components/AppShell';

const NAV = [
  { href: '/client', label: 'Overview', icon: <DashboardIcon fontSize="small" /> },
  { href: '/client/deposit', label: 'Deposit', icon: <SouthWestIcon fontSize="small" /> },
  { href: '/client/withdraw', label: 'Withdraw', icon: <NorthEastIcon fontSize="small" /> },
  { href: '/client/history', label: 'History', icon: <HistoryIcon fontSize="small" /> },
];

export default function ClientLayout({ children }) {
  return <AppShell nav={NAV} area="client">{children}</AppShell>;
}
