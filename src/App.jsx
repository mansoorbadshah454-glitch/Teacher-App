import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';

function App() {
  console.log("App: Component Rendering");
  const [user, setUser] = useState(() => {
    try {
      const session = localStorage.getItem('teacher_session');
      console.log("App: Initializing user from session:", session);
      return session ? JSON.parse(session) : null;
    } catch (e) {
      console.error("App: Failed to parse session", e);
      localStorage.removeItem('teacher_session');
      return null;
    }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log("App: Setting up auth listener");
    try {
      const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
        console.log("App: Auth state changed:", currentUser?.email);

        const session = localStorage.getItem('teacher_session');
        let sessionData = null;
        if (session) {
          try {
            sessionData = JSON.parse(session);
          } catch (e) {
            console.error("App: Session parse error", e);
          }
        }

        if (currentUser) {
          // If we have a Firebase user, merge with session data if it belongs to the same user
          if (sessionData && sessionData.uid === currentUser.uid) {
            console.log("App: Session found, merging with Auth user");
            setUser({ ...currentUser, ...sessionData });
            setLoading(false);
          } else {
            // CRITICAL: If no session or different user, we MUST recover the profile to get schoolId
            console.log("App: No session found, recovering profile from Firestore...");
            import('./firebase').then(async ({ db }) => {
              const { doc, getDoc } = await import('firebase/firestore');
              try {
                const userDoc = await getDoc(doc(db, "global_users", currentUser.uid));
                if (userDoc.exists()) {
                  const userData = userDoc.data();
                  console.log("App: Profile recovered:", userData);

                  // Try to get school logo while we are at it
                  let schoolLogo = '';
                  try {
                    const schoolSnap = await getDoc(doc(db, `schools/${userData.schoolId}/settings`, 'profile'));
                    if (schoolSnap.exists()) {
                      schoolLogo = schoolSnap.data().profileImage || '';
                    }
                  } catch (logoErr) {
                    console.warn("App: Could not fetch school logo during recovery", logoErr);
                  }

                  const fullUser = { ...currentUser, ...userData, schoolLogo };
                  setUser(fullUser);

                  // Restore session for next refresh
                  localStorage.setItem('teacher_session', JSON.stringify({
                    uid: currentUser.uid,
                    schoolId: userData.schoolId,
                    role: userData.role || 'teacher',
                    email: currentUser.email,
                    name: userData.name || 'Teacher',
                    schoolLogo: schoolLogo
                  }));
                } else {
                  console.warn("App: User profile not found in global_users");
                  setUser(currentUser);
                }
              } catch (e) {
                console.error("App: Profile recovery failed", e);
                setUser(currentUser);
              } finally {
                setLoading(false);
              }
            });
          }
        } else {
          // No current Firebase user, use session if it exists (manual bypass path)
          if (sessionData) {
            setUser(sessionData);
          } else {
            setUser(null);
          }
        }
        setLoading(false);
      }, (error) => {
        console.error("App: Firebase Auth Error:", error);
        setLoading(false);
      });
      return () => unsubscribe();
    } catch (err) {
      console.error("App: Effect Initialization Error:", err);
      setLoading(false);
    }
  }, []);

  console.log("App: Current State - Loading:", loading, "User:", user?.email || user?.uid || 'None');

  if (loading) {
    console.log("App: Rendering Loading View");
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: 'white' }}>
        <div style={{ width: '60px', height: '60px', borderRadius: '15px', background: 'linear-gradient(135deg, #6366f1, #06b6d4)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
          <div className="animate-pulse" style={{ width: '30px', height: '30px', border: '3px solid white', borderTopColor: 'transparent', borderRadius: '50%' }}></div>
        </div>
        <p style={{ opacity: 0.5, fontSize: '0.8rem' }}>Loading Teacher Portal...</p>
      </div>
    );
  }

  console.log("App: Rendering Router with user:", user?.email);
  return (
    <Router>
      <Routes>
        <Route path="/login" element={!user ? <Login /> : <Navigate to="/" replace />} />
        <Route path="/" element={user ? <Dashboard user={user} /> : <Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
