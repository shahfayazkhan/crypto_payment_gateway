'use client';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { API_URL, getToken } from '@/lib/api';
import { useAuth } from './AuthContext';

const RtCtx = createContext({ socket: null, connected: false, heights: {}, prices: {} });

export function RealtimeProvider({ children }) {
  const { user } = useAuth();
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [heights, setHeights] = useState({});
  const [prices, setPrices] = useState({});

  useEffect(() => {
    if (!user) return undefined;
    const s = io(API_URL, { auth: { token: getToken() }, transports: ['websocket'] });
    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    s.on('chain:block', ({ network, height }) => setHeights((h) => ({ ...h, [network]: height })));
    s.on('price:update', setPrices);
    setSocket(s);
    return () => { s.disconnect(); setSocket(null); setConnected(false); };
  }, [user]);

  return <RtCtx.Provider value={{ socket, connected, heights, prices }}>{children}</RtCtx.Provider>;
}

export const useRealtime = () => useContext(RtCtx);

/** Subscribe to one or more socket events; handler always sees latest closure. */
export function useSocketEvent(events, handler) {
  const { socket } = useRealtime();
  const ref = useRef(handler);
  useEffect(() => { ref.current = handler; });
  const key = [].concat(events).join('|');
  useEffect(() => {
    if (!socket) return undefined;
    const list = key.split('|');
    const fns = list.map((ev) => { const fn = (p) => ref.current(p, ev); socket.on(ev, fn); return [ev, fn]; });
    return () => fns.forEach(([ev, fn]) => socket.off(ev, fn));
  }, [socket, key]);
}
