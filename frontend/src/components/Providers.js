'use client';
import { AuthProvider } from './AuthContext';
import { RealtimeProvider } from './RealtimeContext';
import { NotifierProvider } from './Notifier';

export default function Providers({ children }) {
  return (
    <AuthProvider>
      <RealtimeProvider>
        <NotifierProvider>{children}</NotifierProvider>
      </RealtimeProvider>
    </AuthProvider>
  );
}
