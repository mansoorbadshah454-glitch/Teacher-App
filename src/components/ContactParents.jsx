import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '../firebase';
import { collection, query, onSnapshot, where, addDoc, serverTimestamp, getDocs, orderBy, limit } from 'firebase/firestore';
import { ChevronLeft, Search, Send, X, MessageCircle, User, Users, GraduationCap, Loader2 } from 'lucide-react';

const ContactParents = ({ user, onBack }) => {
    // Data State
    const [assignedClass, setAssignedClass] = useState(null);
    const [students, setStudents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    // Message State
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [messageText, setMessageText] = useState('');
    const [sending, setSending] = useState(false);
    const [parentData, setParentData] = useState(null); // { id, name, ... }
    const [parentMap, setParentMap] = useState({}); // StudentID -> ParentObj

    // 1. Fetch Teacher's Assigned Class
    useEffect(() => {
        if (!user?.schoolId || !user?.email) return;

        console.log("ContactParents: Fetching teacher data for", user.email);

        // First get teacher doc to find their name/assignments
        const teachersQuery = query(
            collection(db, `schools/${user.schoolId}/teachers`),
            where("email", "==", user.email)
        );

        const unsubscribeTeacher = onSnapshot(teachersQuery, (snapshot) => {
            if (!snapshot.empty) {
                const teacherData = snapshot.docs[0].data();
                const teacherName = teacherData.name;

                // Then find class assigned to this teacher
                // We could use assignedClasses array, but for now let's match by teacher name string 
                // as per existing patterns in PerformanceView
                const classesQuery = query(collection(db, `schools/${user.schoolId}/classes`));

                getDocs(classesQuery).then((classSnap) => {
                    let found = null;
                    classSnap.forEach(doc => {
                        const data = doc.data();
                        if (data.teacher === teacherName) { // strict match
                            found = { id: doc.id, ...data };
                        }
                    });

                    if (found) {
                        setAssignedClass(found);
                    } else {
                        console.log("ContactParents: No class found for teacher", teacherName);
                        setLoading(false);
                    }
                });

            } else {
                setLoading(false);
            }
        });

        return () => unsubscribeTeacher();
    }, [user]);

    // 2. Fetch Students when class is found
    useEffect(() => {
        if (!assignedClass) return;

        console.log("ContactParents: Fetching students for class", assignedClass.name);
        setLoading(true);

        const q = query(collection(db, `schools/${user.schoolId}/classes/${assignedClass.id}/students`));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const studentList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            // Sort by roll no
            studentList.sort((a, b) => (a.rollNo || '0').localeCompare(b.rollNo || '0', undefined, { numeric: true }));
            setStudents(studentList);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [assignedClass, user.schoolId]);

    // 3. Fetch All Parents and Map to Students (Fix for array-of-objects structure)
    // We fetch all parents once to build a lookup table since 'linkedStudents' is an array of objects
    // and we cannot use array-contains on it easily for just an ID.
    useEffect(() => {
        if (!user?.schoolId) return;

        const fetchParents = async () => {
            try {
                // Determine if we should filter? For now fetch all is safest given the structure.
                const q = query(collection(db, `schools/${user.schoolId}/parents`));
                const snapshot = await getDocs(q);

                const mapping = {};
                snapshot.docs.forEach(doc => {
                    const pData = { id: doc.id, ...doc.data() };
                    if (pData.linkedStudents && Array.isArray(pData.linkedStudents)) {
                        pData.linkedStudents.forEach(link => {
                            if (link.studentId) {
                                mapping[link.studentId] = pData;
                            }
                        });
                    }
                });
                console.log("ContactParents: Mapped", Object.keys(mapping).length, "student links");
                setParentMap(mapping);
            } catch (err) {
                console.error("Error fetching parents map:", err);
            }
        };

        fetchParents();
    }, [user.schoolId]);

    // 4. Sync Parent Data on Selection
    useEffect(() => {
        if (selectedStudent && parentMap[selectedStudent.id]) {
            setParentData(parentMap[selectedStudent.id]);
        } else {
            setParentData(null);
        }
    }, [selectedStudent, parentMap]);

    const handleSendMessage = async () => {
        if (!messageText.trim() || !selectedStudent || !parentData) return;

        setSending(true);
        try {
            // 1. Create Message Record
            await addDoc(collection(db, `schools/${user.schoolId}/messages`), {
                teacherId: user.uid,
                teacherName: user.name || 'Teacher',
                parentId: parentData.id,
                parentName: parentData.name || 'Parent',
                studentId: selectedStudent.id,
                studentName: selectedStudent.name,
                message: messageText.trim(),
                timestamp: serverTimestamp(),
                read: false,
                schoolId: user.schoolId,
                type: 'direct'
            });

            // 2. Send Notification to Parent
            await addDoc(collection(db, `schools/${user.schoolId}/notifications`), {
                parentId: parentData.id,
                studentId: selectedStudent.id,
                studentName: selectedStudent.name,
                title: "New Message from Teacher",
                message: messageText.trim(),
                type: "message",
                read: false,
                createdAt: serverTimestamp()
            });

            alert("Message sent successfully!");
            setMessageText('');
            setSelectedStudent(null); // Close expand
        } catch (error) {
            console.error("Error sending message:", error);
            alert("Failed to send message: " + error.message);
        } finally {
            setSending(false);
        }
    };

    // Filter Students
    const filteredStudents = students.filter(s =>
        s.name?.toLowerCase().includes(search.toLowerCase()) ||
        s.rollNo?.toLowerCase().includes(search.toLowerCase())
    );

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <Loader2 className="animate-spin" color="var(--primary)" size={48} />
        </div>
    );

    if (!assignedClass) return (
        <div className="app-container" style={{ padding: '2rem', textAlign: 'center' }}>
            <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '2rem', borderRadius: '24px' }}>
                <h3 style={{ color: '#ef4444' }}>No Class Assigned</h3>
                <p style={{ color: 'var(--text-muted)' }}>You need an assigned class to contact parents.</p>
                <button onClick={onBack} className="btn-press" style={{ marginTop: '1rem', padding: '0.8rem 1.5rem', borderRadius: '12px', background: 'var(--primary)', color: 'white', border: 'none' }}>Go Back</button>
            </div>
        </div>
    );

    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            style={{ display: 'flex', flexDirection: 'column', height: '100%', paddingBottom: '120px' }}
        >
            {/* Beautiful Header */}
            <div style={{
                background: 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)',
                padding: '1.5rem',
                borderRadius: '0 0 24px 24px',
                marginBottom: '1.5rem',
                boxShadow: '0 10px 20px rgba(236, 72, 153, 0.2)',
                color: 'white',
                position: 'relative'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <button
                        onClick={onBack}
                        style={{
                            background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white',
                            width: '40px', height: '40px', borderRadius: '12px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer'
                        }}
                    >
                        <ChevronLeft size={24} />
                    </button>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: '800' }}>Contact Parents</h2>
                        <p style={{ margin: 0, opacity: 0.9, fontSize: '0.9rem' }}>{assignedClass.name} • {students.length} Students</p>
                    </div>
                </div>
            </div>

            <div style={{ padding: '0 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                {/* Search Bar */}
                <div className="glass" style={{
                    borderRadius: '16px', display: 'flex', alignItems: 'center', padding: '0.8rem 1rem',
                    background: 'var(--card-bg)', border: '1px solid var(--glass-border)'
                }}>
                    <Search size={20} color="var(--text-muted)" />
                    <input
                        type="text"
                        placeholder="Search by name or roll no..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        style={{
                            background: 'none', border: 'none', color: 'var(--text-main)',
                            padding: '0 0.8rem', outline: 'none', width: '100%', fontSize: '1rem'
                        }}
                    />
                    {search && <X size={18} color="var(--text-muted)" onClick={() => setSearch('')} style={{ cursor: 'pointer' }} />}
                </div>

                {/* Student List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {filteredStudents.map((student, idx) => {
                        const isExpanded = selectedStudent?.id === student.id;

                        return (
                            <motion.div
                                key={student.id}
                                layout
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.2, delay: idx * 0.05 }}
                                className="glass"
                                style={{
                                    padding: '0',
                                    borderRadius: '20px',
                                    overflow: 'hidden',
                                    border: isExpanded ? '1px solid #ec4899' : '1px solid var(--glass-border)',
                                    background: isExpanded ? 'rgba(236, 72, 153, 0.05)' : 'var(--card-bg)'
                                }}
                            >
                                {/* Card Header / Summary */}
                                <div
                                    style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer' }}
                                    onClick={() => setSelectedStudent(isExpanded ? null : student)}
                                >
                                    <div style={{
                                        width: '50px', height: '50px', borderRadius: '14px',
                                        background: 'var(--glass-border)', overflow: 'hidden', flexShrink: 0
                                    }}>
                                        <img
                                            src={student.profilePic || student.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${student.id}`}
                                            alt={student.name}
                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                        />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <h3 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '0.2rem' }}>{student.name}</h3>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                            <span style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '6px' }}>#{student.rollNo || '-'}</span>
                                            {/* We don't have parent name immediately without fetch, so generic label or fetch in item? 
                                                Fetching for all might be expensive. Let's just show "Click to Message" */}
                                            <span>• Tap to Message</span>
                                        </div>
                                    </div>
                                    <div style={{
                                        width: '36px', height: '36px', borderRadius: '50%',
                                        background: isExpanded ? '#ec4899' : 'rgba(236, 72, 153, 0.1)',
                                        color: isExpanded ? 'white' : '#ec4899',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        transition: 'all 0.3s'
                                    }}>
                                        <MessageCircle size={18} />
                                    </div>
                                </div>

                                {/* Expanded Message Area */}
                                <AnimatePresence>
                                    {isExpanded && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            style={{ borderTop: '1px solid var(--glass-border)', background: 'var(--bg-dark-lighter)' }}
                                        >
                                            <div style={{ padding: '1.25rem' }}>
                                                {parentData ? (
                                                    <>
                                                        <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                            <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#ec4899', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                                <User size={14} color="white" />
                                                            </div>
                                                            <span style={{ fontSize: '0.9rem', fontWeight: '600', color: '#ec4899' }}>
                                                                To: {parentData.name} (Parent)
                                                            </span>
                                                        </div>

                                                        <textarea
                                                            value={messageText}
                                                            onChange={(e) => setMessageText(e.target.value)}
                                                            placeholder={`Write a specific message about ${student.name.split(' ')[0]}...`}
                                                            autoFocus
                                                            style={{
                                                                width: '100%', minHeight: '100px', borderRadius: '12px',
                                                                background: 'var(--input-bg)', border: '1px solid var(--glass-border)',
                                                                padding: '1rem', color: 'var(--text-main)', fontSize: '0.95rem',
                                                                marginBottom: '1rem', resize: 'none', outline: 'none'
                                                            }}
                                                        />

                                                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                                                            <button
                                                                onClick={() => { setSelectedStudent(null); setMessageText(''); }}
                                                                style={{
                                                                    flex: 1, padding: '0.8rem', borderRadius: '12px',
                                                                    background: 'transparent', border: '1px solid var(--text-muted)',
                                                                    color: 'var(--text-muted)', fontWeight: '600', cursor: 'pointer'
                                                                }}
                                                            >
                                                                Cancel
                                                            </button>
                                                            <button
                                                                onClick={handleSendMessage}
                                                                disabled={sending || !messageText.trim()}
                                                                style={{
                                                                    flex: 2, padding: '0.8rem', borderRadius: '12px',
                                                                    background: 'linear-gradient(135deg, #ec4899 0%, #be185d 100%)',
                                                                    border: 'none', color: 'white', fontWeight: 'bold',
                                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                                                                    cursor: (sending || !messageText.trim()) ? 'not-allowed' : 'pointer',
                                                                    opacity: (sending || !messageText.trim()) ? 0.7 : 1
                                                                }}
                                                            >
                                                                {sending ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
                                                                Send Message
                                                            </button>
                                                        </div>
                                                    </>
                                                ) : (
                                                    <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)' }}>
                                                        {loading ? <Loader2 className="animate-spin" size={24} style={{ margin: '0 auto' }} /> : (
                                                            <>
                                                                <p>No parent account linked to this student.</p>
                                                                <p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>Please contact admin to link a parent.</p>
                                                            </>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </motion.div>
                        );
                    })}

                    {filteredStudents.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                            <p>No students found matching "{search}"</p>
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
};

export default ContactParents;
