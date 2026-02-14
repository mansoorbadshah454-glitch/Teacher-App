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
    Calendar,
    Sun,
    Moon
} from 'lucide-react';
import AttendanceView from '../components/AttendanceView';
import PerformanceView from '../components/PerformanceView';
import NextClassView from '../components/NextClassView';
import AttendanceReport from '../components/AttendanceReport';
import BottomNav from '../components/BottomNav';

const Dashboard = ({ user }) => {
    const navigate = useNavigate();

    const [isOnDuty, setIsOnDuty] = useState(false);
    const [activeTab, setActiveTab] = useState('home'); // 'home', 'notif', 'profile'
    const [currentView, setCurrentView] = useState('main'); // 'main', 'attendance', 'feed'
    const [isSuspended, setIsSuspended] = useState(false);
    const [loading, setLoading] = useState(true);
    const [schoolInfo, setSchoolInfo] = useState({ name: '', logo: '' });
    const [posts, setPosts] = useState([]);
    const [teacherProfile, setTeacherProfile] = useState({ assignedClasses: [], subjects: [] });
    const [theme, setTheme] = useState('dark');

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
    const [backgroundStyle, setBackgroundStyle] = useState('default'); // 'default', 'gradient-blue', 'gradient-pink', 'gradient-green', 'gradient-orange'

    const getBackgroundCss = (styleId) => {
        switch (styleId) {
            case 'gradient-blue': return 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)';
            case 'gradient-pink': return 'linear-gradient(135deg, #f43f5e 0%, #fb7185 100%)';
            case 'gradient-green': return 'linear-gradient(135deg, #10b981 0%, #34d399 100%)';
            case 'gradient-orange': return 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)';
            default: return 'var(--card-bg)';
        }
    };

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

    // Theme Logic
    useEffect(() => {
        const savedTheme = localStorage.getItem('teacher_theme') || 'dark';
        setTheme(savedTheme);
        document.documentElement.setAttribute('data-theme', savedTheme);
    }, []);

    const toggleTheme = () => {
        const newTheme = theme === 'dark' ? 'light' : 'dark';
        setTheme(newTheme);
        localStorage.setItem('teacher_theme', newTheme);
        document.documentElement.setAttribute('data-theme', newTheme);
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

                    // Update profile data in real-time
                    setTeacherProfile({
                        assignedClasses: Array.isArray(data.assignedClasses) ? data.assignedClasses : (data.assignedClass ? [data.assignedClass] : []),
                        subjects: Array.isArray(data.subjects) ? data.subjects : (data.subject ? [data.subject] : [])
                    });

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
                backgroundStyle: backgroundStyle || 'default',
                likes: [],
                shares: 0
            });

            setPostText('');
            setMediaFile(null);
            setMediaPreview(null);
            setMediaType('image');
            setAudience('all');
            setSelectedClass('');
            setBackgroundStyle('default');
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
        { id: 'next-class', title: 'Next Class', icon: Clock, color: '#f43f5e', description: 'Class 10-A • 10:30 AM', action: () => setCurrentView('next-class') },
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

    const handleNavigation = (tab) => {
        if (tab === 'home') {
            setCurrentView('main');
            setActiveTab('home');
        } else if (tab === 'classes') {
            setCurrentView('main');
            setActiveTab('next');
        } else if (tab === 'performance') {
            setCurrentView('performance');
        } else if (tab === 'profile') {
            setCurrentView('main');
            setActiveTab('profile');
        } else if (tab === 'new-task') {
            setCurrentView('feed');
        }
    };

    if (currentView === 'attendance') {
        return (
            <div className="app-container" style={{ padding: '1.5rem' }}>
                <AttendanceView user={user} onBack={() => setCurrentView('main')} onReport={() => setCurrentView('attendance-report')} />
            </div>
        );
    }

    if (currentView === 'attendance-report') {
        return (
            <div className="app-container" style={{ padding: '0rem' }}>
                <AttendanceReport user={user} onBack={() => setCurrentView('attendance')} />
            </div>
        );
    }

    if (currentView === 'performance') {
        return (
            <div className="app-container" style={{ padding: '1.5rem', paddingBottom: '100px' }}>
                <PerformanceView user={user} onBack={() => setCurrentView('main')} />
                <BottomNav activeTab="performance" setActiveTab={handleNavigation} />
            </div>
        );
    }

    if (currentView === 'feed') {
        return (
            <div className="app-container" style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <button
                        onClick={() => setCurrentView('main')}
                        style={{
                            background: 'var(--card-bg)', // Use theme-aware background
                            border: '1px solid var(--glass-border)',
                            padding: '0.6rem 1rem',
                            borderRadius: '12px',
                            color: 'var(--text-main)', // Use theme-aware text color
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            fontSize: '0.9rem',
                            fontWeight: '600',
                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                        }}>
                        ← Back
                    </button>

                    {/* Feed Filter */}
                    <div style={{ position: 'relative' }}>
                        <select
                            value={selectedClass} // Reusing selectedClass for filter when NOT posting? No, need separate state or clear logic.
                            // Actually, let's keep it simple: The feed shows ALL posts by default. 
                            // The user asked for "check it... it doesnt show specific class posting".
                            // Let's add a purely visual filter for the feed list.
                            onChange={(e) => {
                                // This is a temporary local filter for viewing
                                const val = e.target.value;
                                // We'll handle filtering in the map below
                                // For now, let's just use a local state or derived variable if we were doing complex filtering.
                                // But wait, 'selectedClass' is currently used for *posting* content. 
                                // We shouldn't mix "Viewing Filter" with "Posting Target" unless they are the same UI context.
                                // Given the UI, let's add a specific filter state just for the list if needed, 
                                // OR just show everything since "Admins/Teachers can see all". 
                                // The user said "it doesnt show specific class posting", which might mean the *label* was missing.
                                // I will add a small filter dropdown for "View: All / Class X"
                            }}
                            style={{
                                display: 'none' // Hiding for now to focus on the Posting Logic first as per primary request
                            }}
                        >
                            {/* ... */}
                        </select>
                    </div>
                </div>

                <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1.5rem', color: 'var(--text-main)' }}>News Feed</h2>

                {/* Create Post Section */}
                <div className="glass" style={{ padding: '1.25rem', borderRadius: '20px', marginBottom: '2rem' }}>

                    {/* Background Options */}
                    {!mediaFile && (
                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
                            {[
                                { id: 'default', bg: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)' },
                                { id: 'gradient-blue', bg: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', border: 'none' },
                                { id: 'gradient-pink', bg: 'linear-gradient(135deg, #f43f5e 0%, #fb7185 100%)', border: 'none' },
                                { id: 'gradient-green', bg: 'linear-gradient(135deg, #10b981 0%, #34d399 100%)', border: 'none' },
                                { id: 'gradient-orange', bg: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)', border: 'none' },
                            ].map((style) => (
                                <button
                                    key={style.id}
                                    onClick={() => setBackgroundStyle(style.id)} // Need to add this state
                                    style={{
                                        width: '32px',
                                        height: '32px',
                                        borderRadius: '50%',
                                        background: style.bg,
                                        border: backgroundStyle === style.id ? '2px solid white' : style.border,
                                        cursor: 'pointer',
                                        flexShrink: 0,
                                        boxShadow: backgroundStyle === style.id ? '0 0 0 2px var(--primary)' : 'none',
                                        transition: 'all 0.2s ease'
                                    }}
                                />
                            ))}
                        </div>
                    )}

                    <textarea
                        value={postText}
                        onChange={(e) => setPostText(e.target.value)}
                        placeholder="Share an update with the school..."
                        style={{
                            width: '100%',
                            background: backgroundStyle && backgroundStyle !== 'default' && !mediaFile
                                ? getBackgroundCss(backgroundStyle)
                                : 'rgba(0,0,0,0.2)',
                            border: 'none',
                            borderRadius: '12px',
                            padding: '1rem',
                            color: backgroundStyle && backgroundStyle !== 'default' && !mediaFile ? 'white' : 'var(--text-main)',
                            marginBottom: '1rem',
                            resize: 'none',
                            outline: 'none',
                            fontFamily: 'inherit',
                            minHeight: backgroundStyle && backgroundStyle !== 'default' && !mediaFile ? '150px' : '100px',
                            fontSize: backgroundStyle && backgroundStyle !== 'default' && !mediaFile ? '1.1rem' : '1rem',
                            fontWeight: backgroundStyle && backgroundStyle !== 'default' && !mediaFile ? '600' : '400',
                            textAlign: backgroundStyle && backgroundStyle !== 'default' && !mediaFile ? 'center' : 'left',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'center',
                            transition: 'all 0.3s ease',
                            '::placeholder': { color: 'rgba(255,255,255,0.6)' }
                        }}
                    />

                    {mediaPreview && (
                        <div style={{ marginBottom: '1rem', position: 'relative' }}>
                            {mediaType === 'video' ? (
                                <video src={mediaPreview} controls style={{ maxWidth: '100%', maxHeight: '200px', borderRadius: '12px', background: 'black' }} />
                            ) : (
                                <img src={mediaPreview} style={{ maxWidth: '100%', maxHeight: '200px', borderRadius: '12px', objectFit: 'cover' }} />
                            )}
                            <button
                                onClick={() => { setMediaFile(null); setMediaPreview(null); }}
                                style={{ position: 'absolute', top: 5, right: 5, background: 'rgba(0,0,0,0.5)', borderRadius: '50%', border: 'none', color: 'white', width: 28, height: 28, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                                ×
                            </button>
                        </div>
                    )}

                    {/* Unified Target Selection */}
                    <div style={{ marginBottom: '1.25rem' }}>
                        <div style={{
                            background: 'rgba(255,255,255,0.05)',
                            borderRadius: '12px',
                            padding: '0.5rem',
                            display: 'flex',
                            alignItems: 'center',
                            border: '1px solid var(--glass-border)'
                        }}>
                            <div style={{
                                padding: '0.5rem',
                                color: 'var(--text-muted)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                fontSize: '0.9rem',
                                fontWeight: '600'
                            }}>
                                <Users size={16} />
                                <span>Post to:</span>
                            </div>

                            <div style={{ flex: 1, position: 'relative' }}>
                                <select
                                    value={audience === 'all' ? 'all' : selectedClass}
                                    onChange={(e) => {
                                        if (e.target.value === 'all') {
                                            setAudience('all');
                                            setSelectedClass('');
                                        } else {
                                            setAudience('class');
                                            setSelectedClass(e.target.value);
                                        }
                                    }}
                                    style={{
                                        width: '100%',
                                        background: 'transparent',
                                        border: 'none',
                                        color: 'var(--text-main)',
                                        fontSize: '0.9rem',
                                        fontWeight: '500',
                                        padding: '0.5rem',
                                        outline: 'none',
                                        cursor: 'pointer',
                                        appearance: 'none' // Remove default arrow to style commonly? Or keep for native feel
                                    }}
                                >
                                    <option value="all" style={{ color: 'black' }}>Everyone (All Classes)</option>
                                    <optgroup label="Specific Class" style={{ color: 'black' }}>
                                        {classes.map(cls => (
                                            <option key={cls.id} value={cls.id} style={{ color: 'black' }}>{cls.name}</option>
                                        ))}
                                    </optgroup>
                                </select>
                                <ChevronRight
                                    size={14}
                                    style={{
                                        position: 'absolute',
                                        right: '10px',
                                        top: '50%',
                                        transform: 'translateY(-50%) rotate(90deg)',
                                        pointerEvents: 'none',
                                        color: 'var(--text-muted)'
                                    }}
                                />
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#10b981', cursor: 'pointer', fontSize: '0.9rem', padding: '0.4rem 0.8rem', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.1)' }}>
                                <FileText size={18} />
                                <span style={{ fontSize: '0.8rem', fontWeight: '600' }}>Photo</span>
                                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleFileChange(e, 'image')} />
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#f43f5e', cursor: 'pointer', fontSize: '0.9rem', padding: '0.4rem 0.8rem', borderRadius: '8px', background: 'rgba(244, 63, 94, 0.1)' }}>
                                <FileText size={18} />
                                <span style={{ fontSize: '0.8rem', fontWeight: '600' }}>Video</span>
                                <input type="file" accept="video/*" style={{ display: 'none' }} onChange={(e) => handleFileChange(e, 'video')} />
                            </label>
                        </div>
                        <button
                            onClick={handlePost}
                            disabled={!postText && !mediaFile || posting}
                            className="btn-press"
                            style={{
                                background: 'var(--primary)',
                                color: 'white',
                                border: 'none',
                                padding: '0.6rem 1.5rem',
                                borderRadius: '10px',
                                fontWeight: 'bold',
                                opacity: (!postText && !mediaFile || posting) ? 0.5 : 1,
                                boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)'
                            }}
                        >
                            {posting ? <Loader2 className="animate-spin" size={20} /> : <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><span>Post</span><Send size={16} /></div>}
                        </button>
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '100px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>Recent Updates</h3>
                        {/* Optional Filter Visual Indicator */}
                    </div>

                    {posts.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                            <div style={{ background: 'rgba(255,255,255,0.05)', width: '60px', height: '60px', borderRadius: '50%', margin: '0 auto 1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <FileText size={24} opacity={0.5} />
                            </div>
                            <p>No announcements yet.</p>
                        </div>
                    )}

                    {posts.map(post => (
                        <div key={post.id} className="glass" style={{ padding: '0', overflow: 'hidden', borderRadius: '20px' }}>
                            <div style={{ padding: '1rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                <div style={{ width: '45px', height: '45px', borderRadius: '14px', background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                                    {post.authorImage ? <img src={post.authorImage} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Shield size={24} style={{ margin: '10px' }} />}
                                </div>
                                <div>
                                    <h3 style={{ fontSize: '1rem', fontWeight: 'bold', color: 'var(--text-main)' }}>{post.authorName || 'Principal'}</h3>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                        {post.role === 'Teacher' && (
                                            <>
                                                <span style={{
                                                    background: 'rgba(99, 102, 241, 0.15)',
                                                    color: 'var(--primary)',
                                                    padding: '2px 8px',
                                                    borderRadius: '6px',
                                                    fontWeight: '700',
                                                    fontSize: '0.7rem'
                                                }}>
                                                    Teacher
                                                </span>
                                                <span style={{ opacity: 0.5 }}>•</span>
                                            </>
                                        )}
                                        <span>{post.timestamp ? new Date(post.timestamp.toDate()).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Just now'}</span>
                                        <span style={{ opacity: 0.5 }}>•</span>

                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.3rem',
                                            background: post.audience === 'class' ? 'rgba(99, 102, 241, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                                            padding: '2px 8px',
                                            borderRadius: '6px',
                                            color: post.audience === 'class' ? 'var(--primary)' : '#10b981',
                                            fontWeight: '600'
                                        }}>
                                            <Users size={10} />
                                            <span>{post.audience === 'class' ? (post.targetClassName || 'Class') : 'Everyone'}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Post Content */}
                            {post.backgroundStyle && post.backgroundStyle !== 'default' && !post.mediaUrl && !post.imageUrl ? (
                                // Styled Text Post
                                <div style={{
                                    background: getBackgroundCss(post.backgroundStyle),
                                    padding: '2.5rem 1.5rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    textAlign: 'center',
                                    minHeight: '200px'
                                }}>
                                    <p style={{
                                        color: 'white',
                                        fontSize: '1.25rem',
                                        fontWeight: '600',
                                        whiteSpace: 'pre-wrap',
                                        lineHeight: '1.6',
                                        textShadow: '0 2px 4px rgba(0,0,0,0.1)'
                                    }}>
                                        {post.text}
                                    </p>
                                </div>
                            ) : (
                                // Standard Post
                                <>
                                    <div style={{ padding: '0 1rem 1rem' }}>
                                        <p style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6', color: 'var(--text-main)', fontSize: '0.95rem' }}>{post.text}</p>
                                    </div>

                                    {post.mediaUrl && post.mediaType === 'video' ? (
                                        <video src={post.mediaUrl} controls style={{ width: '100%', maxHeight: '400px', background: 'black' }} />
                                    ) : (post.mediaUrl || post.imageUrl) ? (
                                        <img src={post.mediaUrl || post.imageUrl} style={{ width: '100%', maxHeight: '400px', objectFit: 'cover' }} />
                                    ) : null}
                                </>
                            )}

                            {/* Actions */}
                            <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.02)' }}>
                                <div style={{ display: 'flex', gap: '1.5rem' }}>
                                    <button
                                        onClick={() => handleLike(post)}
                                        style={{
                                            background: 'transparent', border: 'none', cursor: 'pointer',
                                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                                            color: post.likes?.includes(user?.uid) ? '#3b82f6' : 'var(--text-muted)',
                                            fontSize: '0.9rem', fontWeight: '600',
                                            transition: 'transform 0.1s'
                                        }}
                                        className="btn-press"
                                    >
                                        <ThumbsUp size={18} fill={post.likes?.includes(user?.uid) ? '#3b82f6' : 'none'} />
                                        <span>{post.likes?.length || 0}</span>
                                    </button>
                                    <button
                                        onClick={() => handleShare(post)}
                                        style={{
                                            background: 'transparent', border: 'none', cursor: 'pointer',
                                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                                            color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: '600'
                                        }}
                                        className="btn-press"
                                    >
                                        <Share2 size={18} />
                                        <span>{post.shares || 0}</span>
                                    </button>
                                </div>
                            </div>

                        </div>
                    ))}
                </div>
                <BottomNav activeTab="new-task" setActiveTab={handleNavigation} />
            </div>
        )
    }

    if (currentView === 'next-class') {
        return (
            <div className="app-container" style={{ padding: '1.5rem', paddingBottom: '120px' }}>
                <NextClassView user={user} onBack={() => setCurrentView('main')} />
                <BottomNav activeTab="next" setActiveTab={handleNavigation} />
            </div>
        );
    }

    return (
        <div className="app-container" style={{ padding: '1.5rem' }}>
            {/* Header */}
            <header style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: 'var(--safe-area-inset-top)',
                background: 'var(--header-bg)',
                color: 'var(--header-text)',
                padding: '1rem',
                borderRadius: '24px',
                transition: 'all 0.3s ease'
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
                        <p style={{ fontSize: '0.85rem', color: 'var(--header-subtext)' }}>Good Morning 👋</p>
                    </div>
                </div>

                <button
                    onClick={handleDutyToggle}
                    style={{
                        background: isOnDuty ? 'var(--duty-bg-on)' : 'var(--duty-bg-off)',
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
                                            overflow: 'hidden',
                                            boxShadow: 'var(--card-shadow)'
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

                                {/* Assigned Data */}
                                <div style={{ textAlign: 'left', width: '100%', marginBottom: '1.5rem' }}>

                                    <h3 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <BookOpen size={18} color="var(--primary)" /> Academic Details
                                    </h3>

                                    <div style={{ display: 'grid', gap: '1rem' }}>
                                        <div className="glass" style={{ padding: '1rem', borderRadius: '16px' }}>
                                            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Assigned Classes</p>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                                {teacherProfile.assignedClasses.length > 0 ? (
                                                    teacherProfile.assignedClasses.map((cls, idx) => (
                                                        <span key={idx} style={{
                                                            fontSize: '0.85rem', fontWeight: '600',
                                                            background: 'rgba(99, 102, 241, 0.15)', color: 'var(--primary)',
                                                            padding: '0.3rem 0.8rem', borderRadius: '8px'
                                                        }}>
                                                            {cls}
                                                        </span>
                                                    ))
                                                ) : (
                                                    <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>No classes assigned</span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="glass" style={{ padding: '1rem', borderRadius: '16px' }}>
                                            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Subject Specialization</p>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                                {teacherProfile.subjects.length > 0 ? (
                                                    teacherProfile.subjects.map((subj, idx) => (
                                                        <span key={idx} style={{
                                                            fontSize: '0.85rem', fontWeight: '600',
                                                            background: 'rgba(6, 182, 212, 0.15)', color: 'var(--secondary)',
                                                            padding: '0.3rem 0.8rem', borderRadius: '8px'
                                                        }}>
                                                            {subj}
                                                        </span>
                                                    ))
                                                ) : (
                                                    <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>No subjects assigned</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Theme Toggle */}
                                <div className="glass" style={{
                                    padding: '1rem', borderRadius: '16px', marginBottom: '1.5rem',
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                                        <div style={{
                                            width: '36px', height: '36px', borderRadius: '10px',
                                            background: theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                                        }}>
                                            {theme === 'dark' ? <Moon size={20} /> : <Sun size={20} color="orange" />}
                                        </div>
                                        <span style={{ fontWeight: '600', fontSize: '0.95rem' }}>Dark Mode</span>
                                    </div>
                                    <button
                                        onClick={toggleTheme}
                                        style={{
                                            width: '50px', height: '28px', borderRadius: '20px',
                                            background: theme === 'dark' ? 'var(--primary)' : '#cbd5e1',
                                            position: 'relative', cursor: 'pointer', border: 'none',
                                            transition: 'background 0.3s'
                                        }}
                                    >
                                        <div style={{
                                            width: '22px', height: '22px', borderRadius: '50%',
                                            background: 'white', position: 'absolute', top: '3px',
                                            left: theme === 'dark' ? '25px' : '3px',
                                            transition: 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                            boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                                        }} />
                                    </button>
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

            <BottomNav activeTab={activeTab === 'home' || activeTab === 'next' || activeTab === 'notif' || activeTab === 'profile' ? activeTab : 'home'} setActiveTab={setActiveTab} />
        </div>
    );
};

export default Dashboard;
