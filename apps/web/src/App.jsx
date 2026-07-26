import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import { AuthProvider } from './context/AuthContext';
import { isConfigured } from './config/env.js';
import { RequireAuth, ConfigError } from './components/auth/SessionGate.jsx';

import AppShell from './components/layout/AppShell';
import Login from './pages/Login';
import Farm from './pages/Farm';
import MyAssets from './pages/MyAssets';
import Minigames from './pages/Minigames';
import Wallet from './pages/Wallet';
import Profile from './pages/Profile';
import Storage from './pages/Storage';

export default function App() {
  /**
   * Bail out before mounting AuthProvider when the Firebase config is
   * incomplete: `firebase.js` deliberately leaves `auth` as null in that case,
   * and every downstream call would throw.
   */
  if (!isConfigured) {
    return <ConfigError />;
  }

  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<Login />} />

          {/* Everything else requires a fully provisioned session */}
          <Route element={<RequireAuth />}>
            <Route element={<AppShell />}>
              <Route index element={<Farm />} />
              <Route path="shop" element={<MyAssets />} />
              <Route path="minigames" element={<Minigames />} />
              <Route path="wallet" element={<Wallet />} />
              <Route path="profile" element={<Profile />} />
              <Route path="storage" element={<Storage />} />
            </Route>
          </Route>

          {/* Unknown paths go home rather than rendering a blank screen */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
