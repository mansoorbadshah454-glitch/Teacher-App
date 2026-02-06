import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { auth, db, storage } from '../firebase';
import { addDoc, collection, serverTimestamp, doc, onSnapshot, query, orderBy } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
    UserCheck,
    FileText,
    BarChart3,
    Clock,
    Send,
    Home,
    BookOpen,
    Bell,
    User,
    ChevronRight,
    Power,
    LogOut,
    Loader2,
    ShieldAlert,
    MoreHorizontal,
    Shield
} from 'lucide-react';
import AttendanceView from '../components/AttendanceView';

const Dashboard = ({ user }) => {
    const [isOnDuty, setIsOnDuty] = useState(true);
    const [activeTab, setActiveTab] = useState('home'); // 'home', 'notif', 'profile'
    const [currentView, setCurrentView] = useState('main'); // 'main', 'attendance', 'feed'
    const [isSuspended, setIsSuspended] = useState(false);
    const [loading, setLoading] = useState(true);
    const [posts, setPosts] = useState([]);

    // Posting State
    const [postText, setPostText] = useState('');
    const [mediaFile, setMediaFile] = useState(null);
    const [mediaType, setMediaType] = useState('image'); // 'image' or 'video'
    const [mediaPreview, setMediaPreview] = useState(null);
    const [posting, setPosting] = useState(false);

    useEffect(() => {
        if (user && user.schoolId) {
            // Check suspension status
            const unsubscribeStatus = onSnapshot(doc(db, "schools", user.schoolId), (docSnap) => {
                if (docSnap.exists() && docSnap.data().status === 'suspended') {
                    setIsSuspended(true);
                } else {
                    setIsSuspended(false);
                }
                setLoading(false);
            });

            // Fetch News Feed
            const q = query(collection(db, `schools/${user.schoolId}/posts`), orderBy('timestamp', 'desc'));
            const unsubscribePosts = onSnapshot(q, (snapshot) => {
                setPosts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            });

            return () => {
                unsubscribeStatus();
                unsubscribePosts();
            };
        } else {
            setLoading(false);
        }
    }, [user]);

    const handleFileChange = (e, type) => {
        const file = e.target.files[0];
        if (file) {
            setMediaFile(file);
            setMediaType(type);
            const reader = new FileReader();
            reader.onloadend = () => {
                setMediaPreview(reader.result);
            };
            reader.readAsDataURL(file);
        }
    };

    const handlePost = async () => {
        if (!postText.trim() && !mediaFile) return;

        setPosting(true);
        try {
            let mediaUrl = '';
            let storagePath = `schools/${user.schoolId}/posts/${Date.now()}_${mediaFile ? mediaFile.name : 'post'}`;

            if (mediaFile) {
                const storageRef = ref(storage, storagePath);
                await uploadBytes(storageRef, mediaFile);
                mediaUrl = await getDownloadURL(storageRef);
            }

            await addDoc(collection(db, `schools/${user.schoolId}/posts`), {
                text: postText,
                mediaUrl: mediaUrl,
                mediaType: mediaFile ? mediaType : 'none',
                imageUrl: mediaType === 'image' ? mediaUrl : '', // Legacy
                timestamp: serverTimestamp(),
                authorName: user.name || 'Teacher',
                authorImage: `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.email}`,
                role: 'Teacher',
                teacherId: user.uid
            });

            setPostText('');
            setMediaFile(null);
            setMediaPreview(null);
            setMediaType('image');
            alert("Posted successfully!");
        } catch (error) {
            console.error("Error creating post:", error);
            alert("Failed to post: " + error.message);
        } finally {
            setPosting(false);
        }
    };

    const stats = [
        { id: 'attendance', title: 'Attendance', icon: UserCheck, color: '#6366f1', description: 'Mark today\'s presence', action: () => setCurrentView('attendance') },
        { id: 'news-feed', title: 'News Feed', icon: FileText, color: '#10b981', description: 'School announcements', action: () => setCurrentView('feed') },
        { id: 'weekly', title: 'Weekly Report', icon: BarChart3, color: '#8b5cf6', description: 'Review progress', action: () => alert("Weekly Report coming soon!") },
        { id: 'next-class', title: 'Next Class', icon: Clock, color: '#f43f5e', description: 'Class 10-A • 10:30 AM', action: () => alert("Class schedule coming soon!") },
    ];

    const handleLogout = () => {
        localStorage.removeItem('teacher_session');
        auth.signOut();
        window.location.href = '/login';
    };

    if (loading) return (
        <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-dark)' }}>
            <Loader2 className="animate-spin" color="var(--primary)" size={48} />
        </div>
    );

    if (isSuspended) {
        return (
            <div style={{ height: '100vh', width: '100vw', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', padding: '2rem' }}>
                <div className="card glass" style={{ maxWidth: '420px', textAlign: 'center', padding: '2.5rem' }}>
                    <div style={{ width: '80px', height: '80px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 2rem' }}>
                        <ShieldAlert size={40} color="#f87171" />
                    </div>
                    <h2 style={{ fontSize: '1.5rem', color: 'white', marginBottom: '1rem' }}>Access Stopped</h2>
                    <p style={{ color: '#94a3b8', marginBottom: '2rem', lineHeight: '1.5', fontSize: '0.9rem' }}>
                        Access to the Teacher Portal has been stopped for your school. Please contact your school administration or principal for more details.
                    </p>
                    <button onClick={handleLogout} className="btn-press" style={{ width: '100%', padding: '1rem', borderRadius: '12px', border: 'none', background: 'rgba(255,255,255,0.05)', color: 'white', fontWeight: 'bold' }}>
                        Logout
                    </button>
                </div>
            </div>
        );
    }

    if (currentView === 'attendance') {
        return (
            <div className="app-container" style={{ padding: '1.5rem' }}>
                <AttendanceView user={user} onBack={() => setCurrentView('main')} />
            </div>
        );
    }

    if (currentView === 'feed') {
        return (
            <div className="app-container" style={{ padding: '1.5rem' }}>
                <button onClick={() => setCurrentView('main')} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', padding: '0.5rem 1rem', borderRadius: '10px', color: 'white', marginBottom: '1rem', cursor: 'pointer' }}>
                    ← Back
                </button>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1.5rem' }}>News Feed</h2>

                {/* Create Post Section */}
                <div className="glass" style={{ padding: '1rem', borderRadius: '16px', marginBottom: '1.5rem' }}>
                    <textarea
                        value={postText}
                        onChange={(e) => setPostText(e.target.value)}
                        placeholder="Share an update with the school..."
                        style={{
                            width: '100%', background: 'rgba(0,0,0,0.2)', border: 'none', borderRadius: '8px',
                            padding: '0.75rem', color: 'white', marginBottom: '1rem', resize: 'none', outline: 'none',
                            fontFamily: 'inherit'
                        }}
                    />

                    {mediaPreview && (
                        <div style={{ marginBottom: '1rem', position: 'relative' }}>
                            {mediaType === 'video' ? (
                                <video src={mediaPreview} controls style={{ maxWidth: '100%', maxHeight: '200px', borderRadius: '8px', background: 'black' }} />
                            ) : (
                                <img src={mediaPreview} style={{ maxWidth: '100%', maxHeight: '200px', borderRadius: '8px', objectFit: 'cover' }} />
                            )}
                            <button
                                onClick={() => { setMediaFile(null); setMediaPreview(null); }}
                                style={{ position: 'absolute', top: 5, right: 5, background: 'rgba(0,0,0,0.5)', borderRadius: '50%', border: 'none', color: 'white', width: 24, height: 24, cursor: 'pointer' }}
                            >
                                ×
                            </button>
                        </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#10b981', cursor: 'pointer', fontSize: '0.9rem' }}>
                                <FileText size={18} /> Photo
                                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleFileChange(e, 'image')} />
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#f43f5e', cursor: 'pointer', fontSize: '0.9rem' }}>
                                <FileText size={18} /> Video
                                <input type="file" accept="video/*" style={{ display: 'none' }} onChange={(e) => handleFileChange(e, 'video')} />
                            </label>
                        </div>
                        <button
                            onClick={handlePost}
                            disabled={!postText && !mediaFile || posting}
                            className="btn-press"
                            style={{
                                background: 'var(--primary)', color: 'white', border: 'none',
                                padding: '0.5rem 1.25rem', borderRadius: '8px', fontWeight: 'bold',
                                opacity: (!postText && !mediaFile || posting) ? 0.5 : 1
                            }}
                        >
                            {posting ? 'Posting...' : 'Post'}
                        </button>
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {posts.length === 0 && <p style={{ textAlign: 'center', color: '#94a3b8' }}>No announcements yet.</p>}
                    {posts.map(post => (
                        <div key={post.id} className="glass" style={{ padding: '0', overflow: 'hidden', borderRadius: '16px' }}>
                            <div style={{ padding: '1rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                                    {post.authorImage ? <img src={post.authorImage} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Shield size={24} style={{ margin: '8px' }} />}
                                </div>
                                <div>
                                    <h3 style={{ fontSize: '1rem', fontWeight: 'bold' }}>{post.authorName || 'Principal'}</h3>
                                    <p style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{post.timestamp ? new Date(post.timestamp.toDate()).toLocaleDateString() : 'Just now'}</p>
                                </div>
                            </div>
                            <div style={{ padding: '0 1rem 1rem' }}>
                                <p style={{ whiteSpace: 'pre-wrap', marginBottom: '1rem', lineHeight: '1.5' }}>{post.text}</p>
                            </div>

                            {post.mediaUrl && post.mediaType === 'video' ? (
                                <video src={post.mediaUrl} controls style={{ width: '100%', maxHeight: '400px', background: 'black' }} />
                            ) : (post.mediaUrl || post.imageUrl) ? (
                                <img src={post.mediaUrl || post.imageUrl} style={{ width: '100%', maxHeight: '400px', objectFit: 'cover' }} />
                            ) : null}

                        </div>
                    ))}
                </div>
            </div>
        )
    }

    return (
        <div className="app-container" style={{ padding: '1.5rem' }}>
            {/* Header */}
            <header style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '2rem',
                marginTop: 'var(--safe-area-inset-top)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{
                        width: '56px',
                        height: '56px',
                        borderRadius: '18px',
                        border: '2px solid var(--primary)',
                        padding: '2px',
                        background: 'rgba(99, 102, 241, 0.1)'
                    }}>
                        <img
                            src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user.email}`}
                            alt="Profile"
                            style={{ width: '100%', height: '100%', borderRadius: '14px' }}
                        />
                    </div>
                    <div>
                        <h1 style={{ fontSize: '1.25rem', fontWeight: '700' }}>Hello, {user.name?.split(' ')[0] || 'Teacher'}!</h1>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Good Morning 👋</p>
                    </div>
                </div>

                <button
                    onClick={() => setIsOnDuty(!isOnDuty)}
                    style={{
                        background: isOnDuty ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                        border: `1px solid ${isOnDuty ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
                        color: isOnDuty ? '#10b981' : '#ef4444',
                        padding: '0.6rem 1rem',
                        borderRadius: '12px',
                        fontSize: '0.8rem',
                        fontWeight: '600',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        cursor: 'pointer',
                        transition: 'all 0.3s ease'
                    }}
                    className="btn-press"
                >
                    <Power size={14} />
                    {isOnDuty ? 'ON DUTY' : 'OFF DUTY'}
                </button>
            </header>

            <AnimatePresence mode="wait">
                <motion.main key="main-content" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    {/* Main Grid branded as Cards */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '1rem',
                        marginBottom: '2rem'
                    }}>
                        {stats.map((stat, idx) => (
                            <motion.div
                                key={stat.id}
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: idx * 0.1 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={stat.action}
                                className="glass"
                                style={{
                                    padding: '1.25rem',
                                    borderRadius: '24px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '0.75rem',
                                    cursor: 'pointer',
                                    position: 'relative',
                                    overflow: 'hidden'
                                }}
                            >
                                <div style={{
                                    width: '40px',
                                    height: '40px',
                                    borderRadius: '12px',
                                    background: `${stat.color}20`,
                                    color: stat.color,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}>
                                    <stat.icon size={22} />
                                </div>
                                <div>
                                    <h3 style={{ fontSize: '0.95rem', fontWeight: '700', marginBottom: '0.25rem' }}>{stat.title}</h3>
                                    <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: '1.2' }}>{stat.description}</p>
                                </div>
                                <ChevronRight style={{ position: 'absolute', right: '1.25rem', top: '1.25rem', opacity: 0.3 }} size={16} />
                            </motion.div>
                        ))}
                    </div>

                    {/* Quick Message Section Removed - Now using News Feed Logic */}

                    {/* Logout Action */}
                    <button
                        onClick={handleLogout}
                        style={{
                            width: '100%',
                            padding: '1rem',
                            borderRadius: '16px',
                            border: '1px solid rgba(239, 68, 68, 0.2)',
                            background: 'rgba(239, 68, 68, 0.05)',
                            color: '#f87171',
                            fontWeight: '600',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.5rem',
                            cursor: 'pointer',
                            marginBottom: '2rem'
                        }}
                        className="btn-press"
                    >
                        <LogOut size={18} /> Logout Session
                    </button>
                </motion.main>
            </AnimatePresence>

            {/* Bottom Navigation */}
            <footer style={{
                position: 'fixed',
                bottom: '1rem',
                left: '1rem',
                right: '1rem',
                height: '75px',
                maxWidth: 'calc(500px - 2rem)',
                margin: '0 auto',
                borderRadius: '24px',
                display: 'flex',
                justifyContent: 'space-around',
                alignItems: 'center',
                padding: '0 0.5rem',
                zIndex: 100,
                boxShadow: '0 20px 40px rgba(0,0,0,0.4)'
            }} className="glass">
                <NavIcon icon={Home} label="Home" active={activeTab === 'home'} onClick={() => setActiveTab('home')} />
                <NavIcon icon={Clock} label="Next Class" active={activeTab === 'next'} onClick={() => setActiveTab('next')} />
                <div style={{
                    marginTop: '-35px',
                    background: 'var(--primary)',
                    width: '60px',
                    height: '60px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 8px 20px var(--primary-glow)',
                    border: '5px solid var(--bg-dark)',
                    cursor: 'pointer'
                }}>
                    <BookOpen color="white" size={26} />
                </div>
                <NavIcon icon={Bell} label="Notifications" active={activeTab === 'notif'} onClick={() => setActiveTab('notif')} />
                <NavIcon icon={User} label="Profile" active={activeTab === 'profile'} onClick={() => setActiveTab('profile')} />
            </footer>
        </div>
    );
};

const NavIcon = ({ icon: Icon, label, active, onClick }) => (
    <motion.div
        whileTap={{ scale: 0.8 }}
        onClick={onClick}
        style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '4px',
            color: active ? 'var(--primary)' : 'var(--text-muted)',
            cursor: 'pointer'
        }}
    >
        <Icon size={24} />
        <span style={{ fontSize: '0.65rem', fontWeight: '600' }}>{label}</span>
    </motion.div>
);

export default Dashboard;
