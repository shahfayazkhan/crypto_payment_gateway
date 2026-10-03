'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  AppBar, Avatar, Box, Chip, CircularProgress, Divider, Drawer, IconButton, List, ListItemButton, ListItemIcon,
  ListItemText, Menu, MenuItem, Stack, Toolbar, Tooltip, Typography, useMediaQuery,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import HubIcon from '@mui/icons-material/Hub';
import { useAuth } from './AuthContext';
import { useRealtime, useSocketEvent } from './RealtimeContext';
import { useNotify } from './Notifier';
import { crypto, usd } from '@/lib/format';

const DRAWER = 248;

function LiveTicker({ showHeights }) {
  const { heights, prices, connected } = useRealtime();
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', overflow: 'hidden', flex: 1, minWidth: 0 }}>
      <Tooltip title={connected ? 'Realtime connected' : 'Reconnecting…'}>
        <Chip size="small" variant="outlined" label={connected ? 'LIVE' : 'OFFLINE'}
          icon={<Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: connected ? 'success.main' : 'error.main', ml: '8px !important', animation: connected ? 'pulse 1.6s infinite' : 'none' }} />} />
      </Tooltip>
      <Stack direction="row" spacing={1} sx={{ display: { xs: 'none', md: 'flex' }, overflow: 'hidden' }}>
        {['BTC', 'ETH', 'SOL', 'BNB', 'TRX'].filter((k) => prices[k]).map((k) => (
          <Chip key={k} size="small" label={`${k} ${usd(prices[k], prices[k] < 1 ? 4 : 2)}`} sx={{ bgcolor: 'action.hover' }} />
        ))}
        {showHeights && Object.entries(heights).map(([n, h]) => (
          <Tooltip key={n} title={`${n} block height`}>
            <Chip size="small" variant="outlined" label={`${n} #${crypto(h, 0)}`} sx={{ fontFamily: 'monospace', fontSize: 11 }} />
          </Tooltip>
        ))}
      </Stack>
    </Stack>
  );
}

export default function AppShell({ nav, area, children }) {
  const { user, ready, logout } = useAuth();
  const router = useRouter();
  const path = usePathname();
  const notify = useNotify();
  const desktop = useMediaQuery((t) => t.breakpoints.up('md'));
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState(null);
  const isBackoffice = area === 'admin';

  useEffect(() => {
    if (!ready) return;
    if (!user) router.replace('/login');
    else if (isBackoffice && user.role === 'client') router.replace('/client');
    else if (!isBackoffice && user.role !== 'client') router.replace('/admin');
  }, [ready, user, isBackoffice, router]);

  useSocketEvent(['deposit:new', 'deposit:update', 'withdrawal:new', 'withdrawal:update'], (d, ev) => {
    const label = `${crypto(d.amount)} ${d.asset?.replace('_', ' ')}`;
    if (ev === 'deposit:new') notify(`Deposit detected: ${label}`, 'info');
    if (ev === 'deposit:update' && d.status === 'credited') notify(`Deposit credited to MT5 ${d.mt5Login}: ${usd(d.amountUsd)}`, 'success');
    if (ev === 'withdrawal:new' && isBackoffice) notify(`New withdrawal request: ${label}`, 'warning');
    if (ev === 'withdrawal:update' && d.status === 'completed') notify(`Withdrawal completed: ${label}`, 'success');
  });

  if (!ready || !user) {
    return <Box sx={{ display: 'grid', placeItems: 'center', height: '100vh' }}><CircularProgress /></Box>;
  }

  const drawer = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Stack direction="row" spacing={1.2} sx={{ alignItems: 'center', px: 2.5, py: 2.2 }}>
        <Box sx={{ width: 34, height: 34, borderRadius: 2, display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg,#3B82F6,#22D3EE)' }}>
          <HubIcon sx={{ color: '#fff', fontSize: 20 }} />
        </Box>
        <Box>
          <Typography sx={{ fontWeight: 800, lineHeight: 1.1 }}>CryptoGate</Typography>
          <Typography variant="caption" color="text.secondary">{isBackoffice ? 'Back office' : 'Client portal'}</Typography>
        </Box>
      </Stack>
      <Divider />
      <List sx={{ py: 1, flex: 1 }}>
        {nav.map((item) => {
          const selected = item.href === path || (item.href !== `/${area}` && path.startsWith(item.href));
          return (
            <ListItemButton key={item.href} component={Link} href={item.href} selected={selected} onClick={() => setOpen(false)}>
              <ListItemIcon sx={{ minWidth: 36, color: selected ? 'primary.main' : 'text.secondary' }}>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} slotProps={{ primary: { fontSize: 14, fontWeight: selected ? 700 : 500 } }} />
            </ListItemButton>
          );
        })}
      </List>
      <Box sx={{ p: 2 }}>
        <Typography variant="caption" color="text.secondary">Testnet / simulator build</Typography>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar position="fixed" color="inherit" elevation={0}
        sx={{ width: { md: `calc(100% - ${DRAWER}px)` }, ml: { md: `${DRAWER}px` }, bgcolor: 'rgba(11,16,32,0.8)', backdropFilter: 'blur(8px)', borderBottom: '1px solid', borderColor: 'divider' }}>
        <Toolbar sx={{ gap: 1.5 }}>
          {!desktop && <IconButton onClick={() => setOpen(true)}><MenuIcon /></IconButton>}
          <LiveTicker showHeights={isBackoffice} />
          <Chip size="small" label={user.role.toUpperCase()} color={user.role === 'client' ? 'default' : 'secondary'} variant="outlined" />
          <IconButton onClick={(e) => setAnchor(e.currentTarget)} size="small">
            <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main', fontSize: 14 }}>{user.name?.[0]}</Avatar>
          </IconButton>
          <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
            <Box sx={{ px: 2, py: 1 }}>
              <Typography sx={{ fontWeight: 700 }}>{user.name}</Typography>
              <Typography variant="caption" color="text.secondary">{user.email}{user.mt5Login ? ` · MT5 ${user.mt5Login}` : ''}</Typography>
            </Box>
            <Divider />
            <MenuItem onClick={logout}>Sign out</MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>
      <Box component="nav" sx={{ width: { md: DRAWER }, flexShrink: { md: 0 } }}>
        {desktop
          ? <Drawer variant="permanent" open sx={{ '& .MuiDrawer-paper': { width: DRAWER } }}>{drawer}</Drawer>
          : <Drawer variant="temporary" open={open} onClose={() => setOpen(false)} sx={{ '& .MuiDrawer-paper': { width: DRAWER } }}>{drawer}</Drawer>}
      </Box>
      <Box component="main" sx={{ flex: 1, minWidth: 0, p: { xs: 2, md: 3.5 }, mt: 8 }}>{children}</Box>
    </Box>
  );
}
