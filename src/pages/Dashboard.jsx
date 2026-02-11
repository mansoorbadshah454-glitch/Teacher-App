import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { auth, db, storage } from '../firebase';
import { addDoc, collection, serverTimestamp, doc, onSnapshot, query, orderBy, updateDoc, setDoc, arrayUnion, arrayRemove, increment, getDocs, getDoc } from 'firebase/firestore';
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
    Shield,
    Users,
    ThumbsUp,
    Share2,
    Calendar
} from 'lucide-react';
import AttendanceView from '../components/AttendanceView';
import PerformanceView from '../components/PerformanceView';

const Dashboard = ({ user }) => {
    const navigate = useNavigate();

    const [isOnDuty, setIsOnDuty] = useState(false);
    const [activeTab, setActiveTab] = useState('home'); // 'home', 'notif', 'profile'
    const [currentView, setCurrentView] = useState('main'); // 'main', 'attendance', 'feed'
    const [isSuspended, setIsSuspended] = useState(false);
    const [loading, setLoading] = useState(true);
    const [schoolInfo, setSchoolInfo] = useState({ name: '', logo: '' });
    const [posts, setPosts] = useState([]);

    // Posting State
    const [postText, setPostText] = useState('');
    const [mediaFile, setMediaFile] = useState(null);
    const [mediaType, setMediaType] = useState('image'); // 'image' or 'video'
    const [mediaPreview, setMediaPreview] = useState(null);
    const [posting, setPosting] = useState(false);

    // Audience State
    const [audience, setAudience] = useState('all'); // 'all' or 'class'
    const [selectedClass, setSelectedClass] = useState('');
    const [classes, setClasses] = useState([]);

    // Helper function to check if it's a new day
    const isNewDay = (lastUpdateTimestamp) => {
        if (!lastUpdateTimestamp) return false; // Return false if null (assume safe/recent during pending writes)

        const lastUpdate = lastUpdateTimestamp.toDate ? lastUpdateTimestamp.toDate() : new Date(lastUpdateTimestamp);
        const now = new Date();

        // Compare dates (ignoring time)
        const lastDate = new Date(lastUpdate.getFullYear(), lastUpdate.getMonth(), lastUpdate.getDate());
        const currentDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        return currentDate > lastDate;
    };

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

            // Listen to teacher's duty status
            const teacherDocRef = doc(db, `schools/${user.schoolId}/teachers`, user.uid);
            const unsubscribeDuty = onSnapshot(teacherDocRef, async (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    const dutyStatus = data.isOnDuty || false;
                    const lastDutyUpdate = data.lastDutyUpdate;
                    const hasPendingWrites = docSnap.metadata.hasPendingWrites;

                    // Logic:
                    // 1. If we have pending writes, TRUST the local state (don't auto-reset)
                    // 2. If it's a new day, auto-reset to OFF

                    if (!hasPendingWrites && isNewDay(lastDutyUpdate)) {
                        console.log("New day detected - resetting duty status to OFF");
                        try {
                            // Only update if it's currently ON or doesn't have the timestamp
                            if (dutyStatus === true) {
                                await updateDoc(teacherDocRef, {
                                    isOnDuty: false,
                                    lastDutyUpdate: serverTimestamp()
                                });
                            }
                            setIsOnDuty(false);
                        } catch (error) {
                            console.error("Error resetting duty status:", error);
                            setIsOnDuty(false);
                        }
                    } else {
                        setIsOnDuty(dutyStatus);
                    }
                } else {
                    // Initialize teacher document if it doesn't exist
                    try {
                        await setDoc(teacherDocRef, {
                            isOnDuty: false,
                            lastDutyUpdate: serverTimestamp()
                        }, { merge: true });
                        setIsOnDuty(false);
                    } catch (error) {
                        console.error("Error initializing teacher document:", error);
                    }
                }
            });

            // Fetch School Info (Logo) - Much more robust
            const fetchSchoolInfo = async () => {
                if (!user.schoolId) {
                    console.warn("Dashboard: Missing schoolId in user object");
                    return;
                }

                console.log("Dashboard: Fetching info for school:", user.schoolId);
                try {
                    // Path 1: Root Doc (Newer architecture)
                    const schoolDoc = await getDoc(doc(db, "schools", user.schoolId));
                    let fetchedName = '';
                    let fetchedLogo = '';

                    if (schoolDoc.exists()) {
                        fetchedName = schoolDoc.data().name || '';
                        fetchedLogo = schoolDoc.data().logo || schoolDoc.data().profileImage || '';
                    }

                    // Path 2: Settings/Profile doc (Legacy or specific settings)
                    if (!fetchedLogo) {
                        const settingsSnap = await getDoc(doc(db, `schools/${user.schoolId}/settings`, 'profile'));
                        if (settingsSnap.exists()) {
                            fetchedName = fetchedName || settingsSnap.data().name || '';
                            fetchedLogo = settingsSnap.data().profileImage || '';
                        }
                    }

                    // Path 3: Direct Storage check (Requested fallback)
                    if (!fetchedLogo) {
                        console.log("Dashboard: Trying direct storage fallback...");
                        const extensions = ['png', 'jpg', 'jpeg', 'webp'];
                        for (const ext of extensions) {
                            try {
                                const logoPath = `schools/${user.schoolId}/profile.${ext}`;
                                const logoRef = ref(storage, logoPath);
                                fetchedLogo = await getDownloadURL(logoRef);
                                if (fetchedLogo) {
                                    console.log(`Dashboard: Found storage logo: ${logoPath}`);
                                    break;
                                }
                            } catch (err) { }
                        }
                    }

                    setSchoolInfo({
                        name: fetchedName,
                        logo: fetchedLogo
                    });

                    // Link to teacher profile direct if possible
                    if (fetchedLogo && auth.currentUser && !auth.currentUser.photoURL) {
                        try {
                            const { updateProfile } = await import('firebase/auth');
                            await updateProfile(auth.currentUser, { photoURL: fetchedLogo });
                            console.log("Dashboard: Linked school logo to teacher auth profile");
                        } catch (pErr) {
                            console.warn("Dashboard: Failed to link logo to auth profile", pErr);
                        }
                    }

                    console.log("Dashboard: School Info Loaded:", { name: fetchedName, hasLogo: !!fetchedLogo });
                } catch (e) {
                    console.error("Dashboard: Error fetching school info", e);
                }
            };
            fetchSchoolInfo();

            // Fetch News Feed
            const q = query(collection(db, `schools/${user.schoolId}/posts`), orderBy('timestamp', 'desc'));
            const unsubscribePosts = onSnapshot(q, (snapshot) => {
                setPosts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            });

            // Fetch Classes (Once)
            const fetchClasses = async () => {
                try {
                    const qClasses = query(collection(db, `schools/${user.schoolId}/classes`));
                    const snapshot = await getDocs(qClasses);
                    const classesData = snapshot.docs.map(doc => ({
                        id: doc.id,
                        name: doc.data().name
                    })).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
                    setClasses(classesData);
                } catch (e) {
                    console.error("Error fetching classes", e);
                }
            };
            fetchClasses();

            return () => {
                unsubscribeStatus();
                unsubscribePosts();
                unsubscribeDuty();
            };
        } else {
            setLoading(false);
        }
    }, [user]);

    if (!user) return null;

    const handleDutyToggle = async () => {
        if (!user || !user.schoolId) return;

        const newDutyStatus = !isOnDuty;
        const teacherDocRef = doc(db, `schools/${user.schoolId}/teachers`, user.uid);

        try {
            await setDoc(teacherDocRef, {
                isOnDuty: newDutyStatus,
                lastDutyUpdate: serverTimestamp()
            }, { merge: true });
            // The onSnapshot listener will update the state
        } catch (error) {
            console.error("Detailed Error updating duty status:", {
                code: error.code,
                message: error.message,
                userUid: user?.uid,
                schoolId: user?.schoolId,
                ref: teacherDocRef.path
            });
            alert(`Failed to update: ${error.message} (${error.code})`);
        }
    };

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
        if (audience === 'class' && !selectedClass) {
            alert("Please select a class.");
            return;
        }

        setPosting(true);
        try {
            let mediaUrl = '';
            let storagePath = `schools/${user.schoolId}/posts/${Date.now()}_${mediaFile ? mediaFile.name : 'post'}`;

            if (mediaFile) {
                const storageRef = ref(storage, storagePath);
                await uploadBytes(storageRef, mediaFile);
                mediaUrl = await getDownloadURL(storageRef);
            }

            const targetClassName = audience === 'class'
                ? classes.find(c => c.id === selectedClass)?.name || ''
                : '';

            await addDoc(collection(db, `schools/${user.schoolId}/posts`), {
                text: postText,
                mediaUrl: mediaUrl,
                mediaType: mediaFile ? mediaType : 'none',
                imageUrl: mediaType === 'image' ? mediaUrl : '', // Legacy
                timestamp: serverTimestamp(),
                authorName: user.name || 'Teacher',
                authorImage: schoolInfo.logo || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.email}`,
                role: 'Teacher',
                teacherId: user.uid,
                audience: audience,
                targetClassId: audience === 'class' ? selectedClass : null,
                targetClassName: targetClassName,
                likes: [],
                shares: 0
            });

            setPostText('');
            setMediaFile(null);
            setMediaPreview(null);
            setMediaType('image');
            setAudience('all');
            setSelectedClass('');
            alert("Posted successfully!");
        } catch (error) {
            console.error("Error creating post:", error);
            alert("Failed to post: " + error.message);
        } finally {
            setPosting(false);
        }
    };

    const handleLike = async (post) => {
        if (!user || !user.schoolId) return;

        // Optimistic UI handled by Firestore listener
        const postRef = doc(db, `schools/${user.schoolId}/posts`, post.id);
        const isLiked = post.likes?.includes(user.uid);

        try {
            if (isLiked) {
                await updateDoc(postRef, {
                    likes: arrayRemove(user.uid)
                });
            } else {
                await updateDoc(postRef, {
                    likes: arrayUnion(user.uid)
                });
            }
        } catch (error) {
            console.error("Error liking post:", error);
        }
    };

    const handleShare = async (post) => {
        if (!user || !user.schoolId) return;

        try {
            // Just increment count for now
            const postRef = doc(db, `schools/${user.schoolId}/posts`, post.id);
            await updateDoc(postRef, {
                shares: increment(1)
            });
            alert("Post shared!");
        } catch (error) {
            console.error("Error sharing post:", error);
        }
    };

    const stats = [
        { id: 'attendance', title: 'Attendance', icon: UserCheck, color: '#6366f1', description: 'Mark today\'s presence', action: () => setCurrentView('attendance') },
        { id: 'news-feed', title: 'News Feed', icon: FileText, color: '#10b981', description: 'School announcements', action: () => setCurrentView('feed') },
        { id: 'performance', title: 'Performance', icon: BarChart3, color: '#8b5cf6', description: 'Update student scores', action: () => setCurrentView('performance') },
        { id: 'next-class', title: 'Next Class', icon: Clock, color: '#f43f5e', description: 'Class 10-A • 10:30 AM', action: () => alert("Class schedule coming soon!") },
    ];

    const handleLogout = () => {
        localStorage.removeItem('teacher_session');
        auth.signOut();
        navigate('/login');
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

    if (currentView === 'performance') {
        return (
            <div className="app-container" style={{ padding: '1.5rem' }}>
                <PerformanceView user={user} onBack={() => setCurrentView('main')} />
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

                    {/* Audience Selection */}
                    <div style={{ marginBottom: '1rem', }}>
                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Users size={14} /> To:
                            </span>

                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.8rem', color: 'white' }}>
                                <input
                                    type="radio"
                                    name="audience"
                                    value="all"
                                    checked={audience === 'all'}
                                    onChange={() => setAudience('all')}
                                />
                                All
                            </label>

                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.8rem', color: 'white' }}>
                                <input
                                    type="radio"
                                    name="audience"
                                    value="class"
                                    checked={audience === 'class'}
                                    onChange={() => setAudience('class')}
                                />
                                Specific Class
                            </label>

                            {audience === 'class' && (
                                <select
                                    value={selectedClass}
                                    onChange={(e) => setSelectedClass(e.target.value)}
                                    style={{
                                        padding: '0.3rem', borderRadius: '6px', border: 'none',
                                        fontSize: '0.8rem', outline: 'none', marginLeft: '0.5rem',
                                        background: 'rgba(255,255,255,0.1)', color: 'white'
                                    }}
                                >
                                    <option value="" style={{ color: 'black' }}>Select Class...</option>
                                    {classes.map(cls => (
                                        <option key={cls.id} value={cls.id} style={{ color: 'black' }}>{cls.name}</option>
                                    ))}
                                </select>
                            )}
                        </div>
                    </div>

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
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: '#94a3b8' }}>
                                        <span>{post.timestamp ? new Date(post.timestamp.toDate()).toLocaleDateString() : 'Just now'}</span>
                                        {post.audience === 'class' && (
                                            <>
                                                <span>•</span>
                                                <Users size={12} />
                                                <span>{post.targetClassName || 'Class'}</span>
                                            </>
                                        )}
                                        {post.audience === 'all' && (
                                            <>
                                                <span>•</span>
                                                <Users size={12} />
                                                <span>All</span>
                                            </>
                                        )}
                                    </div>
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

                            {/* Actions */}
                            <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', gap: '1.5rem' }}>
                                    <button
                                        onClick={() => handleLike(post)}
                                        style={{
                                            background: 'transparent', border: 'none', cursor: 'pointer',
                                            display: 'flex', alignItems: 'center', gap: '0.4rem',
                                            color: post.likes?.includes(user?.uid) ? '#f87171' : '#94a3b8',
                                            fontSize: '0.9rem', fontWeight: '600'
                                        }}
                                    >
                                        <ThumbsUp size={18} fill={post.likes?.includes(user?.uid) ? '#f87171' : 'none'} />
                                        <span>{post.likes?.length || 0}</span>
                                    </button>
                                    <button
                                        onClick={() => handleShare(post)}
                                        style={{
                                            background: 'transparent', border: 'none', cursor: 'pointer',
                                            display: 'flex', alignItems: 'center', gap: '0.4rem',
                                            color: '#94a3b8', fontSize: '0.9rem', fontWeight: '600'
                                        }}
                                    >
                                        <Share2 size={18} />
                                        <span>{post.shares || 0}</span>
                                    </button>
                                </div>
                            </div>

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
                            src={schoolInfo.logo || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.email}`}
                            alt="School Logo"
                            style={{ width: '100%', height: '100%', borderRadius: '14px', objectFit: 'cover' }}
                        />
                    </div>
                    <div>
                        <h1 style={{ fontSize: '1.25rem', fontWeight: '700' }}>Hello, {user.name?.split(' ')[0] || 'Teacher'}!</h1>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Good Morning 👋</p>
                    </div>
                </div>

                <button
                    onClick={handleDutyToggle}
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
                <motion.main key={activeTab} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }}>
                    {activeTab === 'home' && (
                        <>
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
                        </>
                    )}

                    {activeTab === 'profile' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '100px' }}>
                            <div className="glass" style={{ padding: '2rem', borderRadius: '32px', textAlign: 'center' }}>
                                <div style={{
                                    width: '100px',
                                    height: '100px',
                                    borderRadius: '30px',
                                    border: '3px solid var(--primary)',
                                    margin: '0 auto 1.5rem',
                                    padding: '5px',
                                    background: 'rgba(99, 102, 241, 0.1)'
                                }}>
                                    <img
                                        src={schoolInfo.logo || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.email}`}
                                        style={{ width: '100%', height: '100%', borderRadius: '22px', objectFit: 'cover' }}
                                        alt="School Logo"
                                    />
                                </div>
                                <h2 style={{ fontSize: '1.5rem', fontWeight: '800', marginBottom: '0.5rem' }}>{user.name || 'Teacher'}</h2>
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>{user.email}</p>
                                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '16px', border: '1px solid var(--glass-border)' }}>
                                    <p style={{ fontSize: '0.8rem', color: 'var(--primary)', fontWeight: '700' }}>{schoolInfo.name || 'School System'}</p>
                                </div>
                            </div>

                            <button onClick={handleLogout} className="btn-press" style={{
                                width: '100%', padding: '1.25rem', borderRadius: '22px', border: 'none',
                                background: 'rgba(239, 68, 68, 0.1)', color: '#f87171', fontWeight: '800'
                            }}>
                                Log Out
                            </button>
                        </div>
                    )}

                    {activeTab === 'notif' && (
                        <div style={{ textAlign: 'center', padding: '4rem 2rem' }}>
                            <div style={{ width: '80px', height: '80px', background: 'rgba(255,255,255,0.03)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
                                <Bell size={32} color="var(--text-muted)" />
                            </div>
                            <h3 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '0.5rem' }}>No new notifications</h3>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>We'll notify you when there's an announcement.</p>
                        </div>
                    )}
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
