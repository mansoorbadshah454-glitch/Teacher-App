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

    if (loading) return (
        <div style={{ padding: '2rem', textAlign: 'center' }}>
            <Loader2 className="animate-spin" color="var(--primary)" size={32} />
        </div>
    );

    return (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
                <button onClick={onBack} style={{ background: 'var(--card-bg)', border: 'none', color: 'white', padding: '0.5rem', borderRadius: '12px' }}>
                    <ChevronLeft />
                </button>
                <h2 style={{ fontSize: '1.25rem', fontWeight: '700' }}>Mark Attendance</h2>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {students.map(student => (
                    <div key={student.id} className="glass" style={{ padding: '1rem', borderRadius: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <p style={{ fontWeight: '600', fontSize: '1rem' }}>{student.name}</p>
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Roll: {student.roll} • Class: {student.class}</p>
                        </div>
                        <button
                            onClick={() => toggleStatus(student.id)}
                            style={{
                                background: attendance[student.id] === 'present' ? '#10b981' : 'rgba(255,255,255,0.05)',
                                color: attendance[student.id] === 'present' ? 'white' : 'var(--text-muted)',
                                border: '1px solid var(--glass-border)',
                                padding: '0.5rem 1rem',
                                borderRadius: '10px',
                                fontSize: '0.85rem',
                                fontWeight: '600'
                            }}
                        >
                            {attendance[student.id] === 'present' ? 'PRESENT' : 'MARK'}
                        </button>
                    </div>
                ))}
            </div>

            <button
                onClick={handleSave}
                disabled={saving}
                style={{
                    position: 'fixed', bottom: '100px', left: '2rem', right: '2rem', maxWidth: '460px', margin: '0 auto',
                    background: 'var(--primary)', color: 'white', border: 'none', padding: '1.25rem', borderRadius: '16px',
                    fontWeight: '700', cursor: 'pointer', boxShadow: '0 10px 30px var(--primary-glow)'
                }}
            >
                {saving ? 'SAVING...' : 'SAVE ATTENDANCE'}
            </button>
        </motion.div>
    );
};

export default AttendanceView;
