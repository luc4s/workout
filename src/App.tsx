import { HashRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { IconBook, IconHistory, IconProgress, IconRules, IconSettings, IconToday } from './components/icons';
import Home from './screens/Home';
import SessionSetup from './screens/SessionSetup';
import Runner from './screens/runner/Runner';
import Summary from './screens/Summary';
import History from './screens/History';
import SessionDetail from './screens/SessionDetail';
import Progress from './screens/Progress';
import Library from './screens/Library';
import ExerciseDetail from './screens/ExerciseDetail';
import Reference from './screens/Reference';
import SettingsScreen from './screens/Settings';

const NAV = [
  { to: '/', label: 'Today', icon: IconToday, end: true },
  { to: '/history', label: 'History', icon: IconHistory },
  { to: '/progress', label: 'Progress', icon: IconProgress },
  { to: '/exercises', label: 'Exercises', icon: IconBook },
  { to: '/rules', label: 'Program', icon: IconRules },
  { to: '/settings', label: 'Settings', icon: IconSettings },
];

function Shell() {
  const location = useLocation();
  if (location.pathname.startsWith('/run')) {
    return (
      <Routes>
        <Route path="/run" element={<Runner />} />
      </Routes>
    );
  }
  return (
    <div className="app">
      <nav className="nav" aria-label="Main">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'active' : '')}>
            <Icon />
            {label}
          </NavLink>
        ))}
      </nav>
      <main className="main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/setup/:templateId" element={<SessionSetup />} />
          <Route path="/summary/:id" element={<Summary />} />
          <Route path="/history" element={<History />} />
          <Route path="/history/:id" element={<SessionDetail />} />
          <Route path="/progress" element={<Progress />} />
          <Route path="/exercises" element={<Library />} />
          <Route path="/exercises/:id" element={<ExerciseDetail />} />
          <Route path="/rules" element={<Reference />} />
          <Route path="/settings" element={<SettingsScreen />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  );
}
