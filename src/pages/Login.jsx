import React, { useState } from 'react';
import { auth, db } from '../firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { Shield, Mail, Lock, ArrowRight, Loader2, Database } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { seedTestData } from '../utils/seedData';

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const normalizedEmail = email.toLowerCase().trim();
            const userCredential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
            const user = userCredential.user;

            const userDoc = await getDoc(doc(db, "global_users", user.uid));
            if (userDoc.exists() && userDoc.data().role === 'teacher') {
                const schoolId = userDoc.data().schoolId;

                // Check school status
                const schoolSnap = await getDoc(doc(db, "schools", schoolId));
                if (schoolSnap.exists() && schoolSnap.data().status === 'suspended') {
                    await auth.signOut();
                    setError('System Access Denied: Your school system has been stopped by the Super Admin.');
                    return;
                }

                navigate('/');
                return;
            } else {
                await auth.signOut();
                setError('Access Denied: Not a Teacher account.');
                return;
            }
        } catch (authErr) {
            console.log("Auth failed, checking for manual bypass...");
            const normalizedEmail = email.toLowerCase().trim();

            try {
                const q = query(collection(db, "global_users"), where("email", "==", normalizedEmail), where("role", "==", "teacher"));
                const querySnapshot = await getDocs(q);

                if (!querySnapshot.empty) {
                    const userData = querySnapshot.docs[0].data();
                    const schoolId = userData.schoolId;
                    const uid = userData.uid;

                    const schoolUserRef = doc(db, `schools/${schoolId}/users`, uid);
                    const schoolUserDoc = await getDoc(schoolUserRef);

                    if (schoolUserDoc.exists()) {
                        const storedManualPassword = schoolUserDoc.data().manualPassword;

                        if (storedManualPassword && storedManualPassword === password) {
                            // Check school status before allowing manual bypass
                            const schoolSnap = await getDoc(doc(db, "schools", schoolId));
                            if (schoolSnap.exists() && schoolSnap.data().status === 'suspended') {
                                setError('System Access Denied: Your school system has been stopped by the Super Admin.');
                                return;
                            }

                            localStorage.setItem('teacher_session', JSON.stringify({
                                uid: uid,
                                schoolId: schoolId,
                                role: 'teacher',
                                email: normalizedEmail,
                                name: userData.name || 'Teacher'
                            }));
                            window.location.href = '/';
                            return;
                        }
                    }
                }
            } catch (fallbackErr) {
                console.error("Fallback check failed:", fallbackErr);
            }

            setError("Invalid credentials. Please verify your email and password.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-page" style={{
            height: '100vh',
            width: '100vw',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#0f172a',
            fontFamily: "'Outfit', sans-serif"
        }}>
            <div style={{ position: 'absolute', width: '400px', height: '400px', background: '#6366f1', filter: 'blur(150px)', opacity: 0.15, top: '5%', left: '5%' }}></div>

            <div className="card glass animate-fade" style={{
                width: '90%',
                maxWidth: '400px',
                padding: '2.5rem',
                borderRadius: '24px',
                zIndex: 10
            }}>
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <div style={{ margin: '0 auto 1.25rem', width: '64px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #6366f1, #06b6d4)', borderRadius: '16px' }}>
                        <Shield color="white" size={32} />
                    </div>
                    <h1 style={{ fontSize: '1.75rem', fontWeight: '700', marginBottom: '0.5rem', color: 'white' }}>Teacher Portal</h1>
                    <p style={{ color: '#94a3b8', fontSize: '0.95rem' }}>Secure Login for School Staff</p>
                </div>

                {error && (
                    <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#f87171', padding: '0.875rem', borderRadius: '12px', marginBottom: '1.5rem', fontSize: '0.85rem', textAlign: 'center' }}>
                        {error}
                    </div>
                )}

                <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <label style={{ fontSize: '0.875rem', fontWeight: '500', color: '#94a3b8' }}>Email Address</label>
                        <div style={{ position: 'relative' }}>
                            <Mail style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} size={18} />
                            <input
                                type="email"
                                style={{ width: '100%', padding: '0.8rem 1rem 0.8rem 3rem', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: 'white' }}
                                placeholder="teacher@school.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <label style={{ fontSize: '0.875rem', fontWeight: '500', color: '#94a3b8' }}>Password</label>
                        <div style={{ position: 'relative' }}>
                            <Lock style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} size={18} />
                            <input
                                type="password"
                                style={{ width: '100%', padding: '0.8rem 1rem 0.8rem 3rem', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: 'white' }}
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="btn-press"
                        style={{ width: '100%', padding: '1rem', marginTop: '0.5rem', borderRadius: '12px', fontSize: '1rem', fontWeight: '600', border: 'none', color: 'white', background: 'linear-gradient(135deg, #6366f1, #4338ca)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem' }}
                    >
                        {loading ? <Loader2 className="animate-spin" size={20} /> : <>Sign In <ArrowRight size={20} /></>}
                    </button>
                </form>
                <div style={{ textAlign: 'center', marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <p style={{ color: '#64748b', fontSize: '0.875rem' }}>
                        Forgot password? <a href="#" style={{ color: '#6366f1', textDecoration: 'none', fontWeight: '600' }}>Contact Support</a>
                    </p>
                    <button
                        onClick={() => seedTestData()}
                        style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.2)', fontSize: '0.7rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                    >
                        <Database size={12} /> Seed Test Account (teacher@test.com)
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Login;
