import React, { useState } from 'react';
import { auth, db } from '../firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { Shield, Mail, Lock, ArrowRight, Loader2, Database } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
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

                // Store session for schoolId persistence
                localStorage.setItem('teacher_session', JSON.stringify({
                    uid: user.uid,
                    schoolId: schoolId,
                    role: 'teacher',
                    email: user.email,
                    name: userDoc.data().name || 'Teacher'
                }));

                // Check school status
                const schoolSnap = await getDoc(doc(db, "schools", schoolId));
                if (schoolSnap.exists() && schoolSnap.data().status === 'suspended') {
                    await auth.signOut();
                    setError('Access Denied: School system suspended.');
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

            setError("Invalid credentials. Please verify.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-page" style={{
            height: '100dvh',
            width: '100dvw',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--bg-dark)',
            padding: '2rem'
        }}>
            {/* Background Glow */}
            <div style={{ position: 'absolute', width: '300px', height: '300px', background: 'var(--primary)', filter: 'blur(120px)', opacity: 0.1, top: '10%', right: '10%', pointerEvents: 'none' }}></div>
            <div style={{ position: 'absolute', width: '250px', height: '250px', background: 'var(--secondary)', filter: 'blur(100px)', opacity: 0.08, bottom: '15%', left: '5%', pointerEvents: 'none' }}></div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass"
                style={{
                    width: '100%',
                    maxWidth: '400px',
                    padding: '2.5rem 2rem',
                    borderRadius: '32px',
                    zIndex: 10
                }}
            >
                <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
                    <div className="animate-pulse-glow" style={{ margin: '0 auto 1.5rem', width: '72px', height: '72px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, var(--primary), var(--secondary))', borderRadius: '22px' }}>
                        <Shield color="white" size={32} />
                    </div>
                    <h1 style={{ fontSize: '1.85rem', fontWeight: '800', marginBottom: '0.5rem', letterSpacing: '-0.02em' }}>Teacher App</h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: '500' }}>Staff Management Portal</p>
                </div>

                {error && (
                    <motion.div
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        style={{ background: 'rgba(244, 63, 94, 0.1)', border: '1px solid rgba(244, 63, 94, 0.15)', color: '#fb7185', padding: '0.9rem', borderRadius: '16px', marginBottom: '1.5rem', fontSize: '0.825rem', textAlign: 'center', fontWeight: '600' }}
                    >
                        {error}
                    </motion.div>
                )}

                <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                        <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-muted)', paddingLeft: '0.5rem' }}>Email Address</label>
                        <div style={{ position: 'relative' }}>
                            <Mail style={{ position: 'absolute', left: '1.25rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={18} />
                            <input
                                type="email"
                                style={{ width: '100%', padding: '1rem 1rem 1rem 3.5rem', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--glass-border)', borderRadius: '18px', color: 'white', fontSize: '1rem', outline: 'none' }}
                                placeholder="name@school.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                        <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-muted)', paddingLeft: '0.5rem' }}>Password</label>
                        <div style={{ position: 'relative' }}>
                            <Lock style={{ position: 'absolute', left: '1.25rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={18} />
                            <input
                                type="password"
                                style={{ width: '100%', padding: '1rem 1rem 1rem 3.5rem', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--glass-border)', borderRadius: '18px', color: 'white', fontSize: '1rem', outline: 'none' }}
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
                        style={{ width: '100%', padding: '1.15rem', marginTop: '0.75rem', borderRadius: '18px', fontSize: '1.05rem', fontWeight: '700', border: 'none', color: 'white', background: 'linear-gradient(135deg, var(--primary), #4f46e5)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', boxShadow: '0 10px 20px -5px var(--primary-glow)' }}
                    >
                        {loading ? <Loader2 className="animate-spin" size={24} /> : <>Continue <ArrowRight size={20} /></>}
                    </button>
                </form>

                <div style={{ textAlign: 'center', marginTop: '2.5rem' }}>
                    <button
                        onClick={() => seedTestData()}
                        style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', opacity: 0.5, margin: '0 auto' }}
                    >
                        <Database size={13} /> Demo Account
                    </button>
                </div>
            </motion.div>
        </div>
    );
};

export default Login;
