'use client';
import { createContext, useCallback, useContext, useState } from 'react';
import { Snackbar, Alert } from '@mui/material';

const Ctx = createContext(() => {});

export function NotifierProvider({ children }) {
  const [msg, setMsg] = useState(null);
  const notify = useCallback((text, severity = 'info') => setMsg({ text, severity, key: Date.now() }), []);
  return (
    <Ctx.Provider value={notify}>
      {children}
      <Snackbar key={msg?.key} open={!!msg} autoHideDuration={4000} onClose={() => setMsg(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        {msg ? <Alert variant="filled" severity={msg.severity} onClose={() => setMsg(null)}>{msg.text}</Alert> : undefined}
      </Snackbar>
    </Ctx.Provider>
  );
}

export const useNotify = () => useContext(Ctx);
