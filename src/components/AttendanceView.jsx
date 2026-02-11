import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { db } from '../firebase';
import { collection, query, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { ChevronLeft, UserCheck, Search, Loader2 } from 'lucide-react';

const AttendanceView = ({ user, onBack }) => {
    const [students, setStudents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [attendance, setAttendance] = useState({}); // { studentId: 'present' | 'absent' }
    const [saving, setSaving] = useState(false);
    const [search, setSearch] = useState('');

    useEffect(() => {
        const fetchStudents = async () => {
            try {
                const q = query(collection(db, `schools/${user.schoolId}/students`));
                const querySnapshot = await getDocs(q);
                const list = [];
                querySnapshot.forEach((doc) => {
                    list.push({ id: doc.id, ...doc.data() });
                });
                setStudents(list);
            } catch (error) {
                console.error("Error fetching students:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchStudents();
    }, [user.schoolId]);

    const toggleStatus = (id) => {
        setAttendance(prev => ({
            ...prev,
            [id]: prev[id] === 'present' ? 'absent' : 'present'
        }));
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await addDoc(collection(db, `schools/${user.schoolId}/attendance`), {
                teacherId: user.uid,
                teacherName: user.name || user.email,
                date: new Date().toISOString().split('T')[0],
                records: attendance,
                timestamp: serverTimestamp()
            });
            alert("Attendance marked successfully!");
            onBack();
        } catch (error) {
            alert("Error saving attendance: " + error.message);
        } finally {
            setSaving(false);
        }
    };

    const filteredStudents = students.filter(s =>
        s.name?.toLowerCase().includes(search.toLowerCase()) ||
        s.roll?.toLowerCase().includes(search.toLowerCase())
    );

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100dvh' }}>
            <Loader2 className="animate-spin" color="var(--primary)" size={48} />
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
                    style={{ background: 'var(--card-bg)', border: 'none', color: 'white', width: '44px', height: '44px', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ChevronLeft size={24} />
                </button>
                <div>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: '800' }}>Mark Attendance</h2>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
                </div>
            </div>

            {/* Search Bar */}
            <div className="glass" style={{ marginBottom: '1.5rem', borderRadius: '18px', display: 'flex', alignItems: 'center', padding: '0.2rem 1rem' }}>
                <Search size={18} color="var(--text-muted)" />
                <input
                    type="text"
                    placeholder="Search entry..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    style={{ background: 'none', border: 'none', color: 'white', padding: '1rem', outline: 'none', width: '100%', fontSize: '0.95rem' }}
                />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', overflowY: 'auto' }}>
                {filteredStudents.map((student, idx) => (
                    <motion.div
                        key={student.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
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
                        <div>
                            <p style={{ fontWeight: '700', fontSize: '1.05rem', marginBottom: '0.2rem' }}>{student.name}</p>
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: '500' }}>Roll: {student.roll} • Class: {student.class}</p>
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
