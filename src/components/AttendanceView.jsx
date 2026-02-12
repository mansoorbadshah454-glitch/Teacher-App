import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db, storage } from '../firebase';
import { collection, query, getDocs, where, orderBy, serverTimestamp, writeBatch, doc, addDoc } from 'firebase/firestore';
import { ref, getDownloadURL } from 'firebase/storage';
import { ChevronLeft, UserCheck, Search, Loader2, User } from 'lucide-react';

// Component to fetch and display student profile image
const StudentAvatar = ({ studentId, schoolId, profilePic, size = 48 }) => {
    const [imageUrl, setImageUrl] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchImage = async () => {
            try {
                // First try to get from Firebase Storage
                const storagePath = `schools/${schoolId}/students/${studentId}/profile.jpg`;
                const imageRef = ref(storage, storagePath);
                const url = await getDownloadURL(imageRef);
                setImageUrl(url);
            } catch (error) {
                // If Storage fails, try base64 from profilePic field
                if (profilePic && profilePic.startsWith('data:image')) {
                    setImageUrl(profilePic);
                } else {
                    // No image available
                    setImageUrl(null);
                }
            } finally {
                setLoading(false);
            }
        };

        if (studentId && schoolId) {
            fetchImage();
        } else {
            setLoading(false);
        }
    }, [studentId, schoolId, profilePic]);

    if (loading) {
        return (
            <div style={{
                width: `${size}px`,
                height: `${size}px`,
                borderRadius: '14px',
                background: 'rgba(255,255,255,0.05)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            }}>
                <Loader2 size={size * 0.4} className="animate-spin" color="var(--text-muted)" />
            </div>
        );
    }

    if (imageUrl) {
        return (
            <img
                src={imageUrl}
                alt="Student"
                style={{
                    width: `${size}px`,
                    height: `${size}px`,
                    borderRadius: '14px',
                    objectFit: 'cover',
                    border: '2px solid rgba(255,255,255,0.1)'
                }}
            />
        );
    }

    // Fallback: Show user icon
    return (
        <div style={{
            width: `${size}px`,
            height: `${size}px`,
            borderRadius: '14px',
            background: 'rgba(255,255,255,0.05)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '2px solid rgba(255,255,255,0.1)'
        }}>
            <User size={size * 0.5} color="var(--text-muted)" />
        </div>
    );
};

const AttendanceView = ({ user, onBack }) => {
    const [students, setStudents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [attendance, setAttendance] = useState({}); // { studentId: 'present' | 'absent' }
    const [saving, setSaving] = useState(false);
    const [search, setSearch] = useState('');

    const [assignedClass, setAssignedClass] = useState(null); // { id, name }
    const [statsFilter, setStatsFilter] = useState('all'); // 'all', 'present', 'absent'

    useEffect(() => {
        const fetchTeacherClassAndStudents = async () => {
            try {
                setLoading(true);
                console.log("Searching for class assigned to:", user.email);

                // Get teacher's name from teachers collection
                const teachersQuery = query(
                    collection(db, `schools/${user.schoolId}/teachers`),
                    where("email", "==", user.email)
                );
                const teacherSnap = await getDocs(teachersQuery);

                if (teacherSnap.empty) {
                    console.error("Teacher not found in teachers collection");
                    setLoading(false);
                    return;
                }

                const teacherName = teacherSnap.docs[0].data().name;
                console.log("Teacher name:", teacherName);

                // Find class by teacher name
                const allClassesSnap = await getDocs(collection(db, `schools/${user.schoolId}/classes`));
                let foundClass = null;

                allClassesSnap.forEach(classDoc => {
                    const data = classDoc.data();
                    console.log(`Class "${data.name}" assigned to: "${data.teacher}"`);

                    if (data.teacher === teacherName) {
                        foundClass = { id: classDoc.id, ...data };
                        console.log("✓ Found assigned class:", data.name);
                    }
                });

                if (!foundClass) {
                    console.error("No class assigned to this teacher");
                    setLoading(false);
                    return;
                }

                setAssignedClass(foundClass);

                // Fetch students from this class
                const studentsRef = collection(db, `schools/${user.schoolId}/classes/${foundClass.id}/students`);
                const q = query(studentsRef, orderBy('rollNo'));
                const querySnapshot = await getDocs(q);

                const list = [];
                querySnapshot.forEach((studentDoc) => {
                    const data = studentDoc.data();
                    list.push({ id: studentDoc.id, ...data });
                });

                console.log(`Found ${list.length} students in ${foundClass.name}`);

                // Initialize attendance from current student status
                const initialAttendance = {};
                list.forEach(s => {
                    if (s.status === 'present') initialAttendance[s.id] = 'present';
                    else if (s.status === 'absent') initialAttendance[s.id] = 'absent';
                });

                setStudents(list);
                setAttendance(initialAttendance);
            } catch (error) {
                console.error("Error fetching class/students:", error);
            } finally {
                setLoading(false);
            }
        };

        if (user?.schoolId && user?.email) {
            fetchTeacherClassAndStudents();
        }
    }, [user.schoolId, user.email]);

    const toggleStatus = (id) => {
        setAttendance(prev => ({
            ...prev,
            [id]: prev[id] === 'present' ? 'absent' : 'present'
        }));
    };

    const handleSave = async () => {
        if (!assignedClass) return;
        setSaving(true);
        try {
            const batch = writeBatch(db);
            const today = new Date().toISOString().split('T')[0];

            // 1. Create historical record
            const historyRef = doc(collection(db, `schools/${user.schoolId}/attendance`));
            batch.set(historyRef, {
                teacherId: user.uid,
                teacherName: user.name || user.email,
                classId: assignedClass.id,
                className: assignedClass.name,
                date: today,
                records: Object.entries(attendance).map(([id, status]) => ({
                    id,
                    name: students.find(s => s.id === id)?.name || 'Unknown',
                    status
                })),
                timestamp: serverTimestamp()
            });

            // 2. Sync to individual student docs in class sub-collection
            students.forEach(student => {
                const sRef = doc(db, `schools/${user.schoolId}/classes/${assignedClass.id}/students`, student.id);
                batch.update(sRef, {
                    status: attendance[student.id] || 'absent',
                    updatedAt: serverTimestamp()
                });
            });

            await batch.commit();

            // 3. Create notifications for parents
            console.log("Creating parent notifications...");
            const notificationPromises = students.map(async (student) => {
                try {
                    // Find parent for this student
                    const parentsQuery = query(
                        collection(db, `schools/${user.schoolId}/parents`),
                        where("children", "array-contains", student.id)
                    );
                    const parentsSnap = await getDocs(parentsQuery);

                    if (!parentsSnap.empty) {
                        const parentDoc = parentsSnap.docs[0];
                        const parentData = parentDoc.data();
                        const status = attendance[student.id] || 'absent';

                        // Create notification for parent
                        await addDoc(collection(db, `schools/${user.schoolId}/notifications`), {
                            parentId: parentDoc.id,
                            studentId: student.id,
                            studentName: student.name,
                            type: 'attendance',
                            status: status,
                            className: assignedClass.name,
                            date: today,
                            message: `${student.name} was marked ${status} in ${assignedClass.name} today.`,
                            read: false,
                            createdAt: serverTimestamp()
                        });
                        console.log(`✓ Notification created for ${student.name}'s parent`);
                    } else {
                        console.log(`No parent found for student: ${student.name}`);
                    }
                } catch (err) {
                    console.error(`Error creating notification for ${student.name}:`, err);
                }
            });

            await Promise.all(notificationPromises);
            console.log("All notifications created successfully!");

            alert("Attendance marked and parents notified successfully!");
            onBack();
        } catch (error) {
            console.error("Save error:", error);
            alert("Error saving attendance: " + error.message);
        } finally {
            setSaving(false);
        }
    };

    const presentCount = Object.values(attendance).filter(v => v === 'present').length;
    const absentCount = students.length - presentCount;

    const filteredStudents = students.filter(s => {
        const matchesSearch = (
            s.name?.toLowerCase().includes(search.toLowerCase()) ||
            s.rollNo?.toLowerCase().includes(search.toLowerCase()) ||
            s.roll?.toLowerCase().includes(search.toLowerCase())
        );

        const status = attendance[s.id] || 'absent';
        if (statsFilter === 'present') return matchesSearch && status === 'present';
        if (statsFilter === 'absent') return matchesSearch && status === 'absent';
        return matchesSearch;
    });

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100dvh' }}>
            <Loader2 className="animate-spin" color="var(--primary)" size={48} />
        </div>
    );

    if (!assignedClass && !loading) return (
        <div className="app-container" style={{ padding: '2rem', textAlign: 'center' }}>
            <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '2rem', borderRadius: '24px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                <h3 style={{ color: '#ef4444', marginBottom: '1rem' }}>No Class Assigned</h3>
                <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>You are not assigned to any specific class. Please contact the Principal to assign you a class.</p>
                <button onClick={onBack} className="btn-press" style={{ marginTop: '1.5rem', padding: '0.75rem 1.5rem', borderRadius: '12px', border: 'none', background: 'var(--primary)', color: 'white' }}>Go Back</button>
            </div>
        </div>
    );

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            style={{ display: 'flex', flexDirection: 'column', height: '100%', paddingBottom: '120px' }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', paddingTop: '1rem' }}>
                <button
                    onClick={onBack}
                    className="btn-press"
                    style={{ background: 'var(--back-btn-bg)', border: 'none', color: 'var(--back-btn-text)', width: '44px', height: '44px', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ChevronLeft size={24} />
                </button>
                <div>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: '800' }}>Mark Attendance</h2>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{assignedClass.name} • {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
                </div>
            </div>

            {/* Attendance Stats Cards */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '1rem',
                marginBottom: '1.5rem'
            }}>
                <motion.div
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setStatsFilter(statsFilter === 'present' ? 'all' : 'present')}
                    className="glass"
                    style={{
                        padding: '1.25rem',
                        borderRadius: '24px',
                        cursor: 'pointer',
                        border: statsFilter === 'present' ? '2px solid #10b981' : '1px solid var(--glass-border)',
                        background: statsFilter === 'present' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255,255,255,0.03)'
                    }}
                >
                    <p style={{ fontSize: '0.75rem', fontWeight: '600', color: '#10b981', marginBottom: '4px' }}>TOTAL PRESENTS</p>
                    <p style={{ fontSize: '1.75rem', fontWeight: '800' }}>{presentCount}</p>
                </motion.div>

                <motion.div
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setStatsFilter(statsFilter === 'absent' ? 'all' : 'absent')}
                    className="glass"
                    style={{
                        padding: '1.25rem',
                        borderRadius: '24px',
                        cursor: 'pointer',
                        border: statsFilter === 'absent' ? '2px solid #f43f5e' : '1px solid var(--glass-border)',
                        background: statsFilter === 'absent' ? 'rgba(244, 63, 94, 0.1)' : 'rgba(255,255,255,0.03)'
                    }}
                >
                    <p style={{ fontSize: '0.75rem', fontWeight: '600', color: '#f43f5e', marginBottom: '4px' }}>TOTAL ABSENTS</p>
                    <p style={{ fontSize: '1.75rem', fontWeight: '800' }}>{absentCount}</p>
                </motion.div>
            </div>

            {/* Search Bar */}
            <div className="glass" style={{ marginBottom: '1.5rem', borderRadius: '18px', display: 'flex', alignItems: 'center', padding: '0.2rem 1rem' }}>
                <Search size={18} color="var(--text-muted)" />
                <input
                    type="text"
                    placeholder="Search by Name or Roll No..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    style={{ background: 'none', border: 'none', color: 'white', padding: '1rem', outline: 'none', width: '100%', fontSize: '0.95rem' }}
                />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', overflowY: 'auto' }}>
                <AnimatePresence>
                    {filteredStudents.map((student, idx) => (
                        <motion.div
                            key={student.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ delay: idx * 0.05 }}
                            className="glass"
                            style={{
                                padding: '1.15rem',
                                borderRadius: '22px',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                border: attendance[student.id] === 'present' ? '1px solid var(--primary)' : '1px solid var(--glass-border)'
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1 }}>
                                <StudentAvatar
                                    studentId={student.id}
                                    schoolId={user.schoolId}
                                    profilePic={student.profilePic || student.avatar}
                                    size={52}
                                />
                                <div>
                                    <p style={{ fontWeight: '700', fontSize: '1.05rem', marginBottom: '0.2rem' }}>{student.name}</p>
                                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: '500' }}>Roll: {student.rollNo || student.roll || '-'} • Class: {assignedClass.name}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => toggleStatus(student.id)}
                                className="btn-press"
                                style={{
                                    width: '100px',
                                    background: attendance[student.id] === 'present' ? 'var(--primary)' : 'rgba(255,255,255,0.03)',
                                    color: attendance[student.id] === 'present' ? 'white' : 'var(--text-muted)',
                                    border: attendance[student.id] === 'present' ? 'none' : '1px solid var(--glass-border)',
                                    padding: '0.75rem',
                                    borderRadius: '14px',
                                    fontSize: '0.85rem',
                                    fontWeight: '700',
                                    boxShadow: attendance[student.id] === 'present' ? '0 4px 12px var(--primary-glow)' : 'none'
                                }}
                            >
                                {attendance[student.id] === 'present' ? 'PRESENT' : 'MARK'}
                            </button>
                        </motion.div>
                    ))}
                </AnimatePresence>
                {filteredStudents.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                        No records found.
                    </div>
                )}
            </div>

            <button
                onClick={handleSave}
                disabled={saving}
                className="btn-press animate-pulse-glow"
                style={{
                    position: 'fixed', bottom: 'calc(var(--safe-bottom) + 10px)', left: '1.5rem', right: '1.5rem', maxWidth: '460px', margin: '0 auto',
                    background: 'var(--primary)', color: 'white', border: 'none', padding: '1.25rem', borderRadius: '20px',
                    fontWeight: '800', cursor: 'pointer', fontSize: '1.1rem', zIndex: 100,
                    boxShadow: '0 10px 30px var(--primary-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem'
                }}
            >
                {saving ? <Loader2 className="animate-spin" size={24} /> : <UserCheck size={22} />}
                {saving ? 'SAVING...' : 'CONFIRM ATTENDANCE'}
            </button>
        </motion.div>
    );
};

export default AttendanceView;
