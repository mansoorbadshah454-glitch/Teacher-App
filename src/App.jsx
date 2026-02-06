import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';

function App() {
  const [user, setUser] = useState(() => {
    const session = localStorage.getItem('teacher_session');
    return session ? JSON.parse(session) : null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
      } else {
        const session = localStorage.getItem('teacher_session');
        if (session) {
          setUser(JSON.parse(session));
        } else {
          setUser(null);
        }
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a' }}>
        <div style={{ width: '60px', height: '60px', borderRadius: '15px', background: 'linear-gradient(135deg, #6366f1, #06b6d4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="animate-pulse" style={{ width: '30px', height: '30px', border: '3px solid white', borderTopColor: 'transparent', borderRadius: '50%' }}></div>
        </div>
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        <Route path="/login" element={!user ? <Login /> : <Navigate to="/" />} />
        <Route path="/" element={user ? <Dashboard user={user} /> : <Navigate to="/login" />} />
      </Routes>
    </Router>
  );
}

export default App;
