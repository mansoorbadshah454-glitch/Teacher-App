import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '../firebase';
import { collection, query, onSnapshot, doc, updateDoc, getDocs } from 'firebase/firestore';
import { ChevronLeft, User, BookOpen, Activity, Heart, Save, Loader2, Trophy, Calendar } from 'lucide-react';

const PerformanceView = ({ user, onBack }) => {
    // Navigation State
    const [viewState, setViewState] = useState('classes'); // 'classes', 'students', 'edit'

    // Data State
    const [classes, setClasses] = useState([]);
    const [selectedClass, setSelectedClass] = useState(null);
    const [students, setStudents] = useState([]);
    const [selectedStudent, setSelectedStudent] = useState(null);

    // Edit Form State
    const [formData, setFormData] = useState({
        academicScores: [], // { subject, score }
        wellness: { behavior: 80, health: 80, hygiene: 80 },
        attendance: 85
    });

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    // 1. Fetch Classes on Mount
    useEffect(() => {
        const fetchClasses = async () => {
            setLoading(true);
            try {
                const q = query(collection(db, `schools/${user.schoolId}/classes`));
                const snapshot = await getDocs(q);
                const classList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setClasses(classList.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true })));
            } catch (error) {
                console.error("Error fetching classes:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchClasses();
    }, [user.schoolId]);

    // 2. Fetch Students when Class Selected
    useEffect(() => {
        if (!selectedClass) return;

        setLoading(true);
        const q = query(collection(db, `schools/${user.schoolId}/classes/${selectedClass.id}/students`));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const studentList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            studentList.sort((a, b) => (a.rollNo || '0').localeCompare(b.rollNo || '0'));
            setStudents(studentList);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [selectedClass, user.schoolId]);

    // Handlers
    const handleClassSelect = (cls) => {
        setSelectedClass(cls);
        setViewState('students');
    };

    const handleStudentSelect = (student) => {
        setSelectedStudent(student);
        setFormData({
            academicScores: student.academicScores || [
                { subject: 'Math', score: 0 },
                { subject: 'Science', score: 0 },
                { subject: 'English', score: 0 },
                { subject: 'Urdu', score: 0 },
                { subject: 'Art', score: 0 }
            ],
            wellness: student.wellness || { behavior: 80, health: 80, hygiene: 80 },
            attendance: student.attendance?.percentage || student.attendance || 85
        });
        setViewState('edit');
    };

    const handleBack = () => {
        if (viewState === 'edit') {
            setViewState('students');
            setSelectedStudent(null);
        } else if (viewState === 'students') {
            setViewState('classes');
            setSelectedClass(null);
        } else {
            onBack();
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const studentRef = doc(db, `schools/${user.schoolId}/classes/${selectedClass.id}/students/${selectedStudent.id}`);
            await updateDoc(studentRef, {
                academicScores: formData.academicScores,
                wellness: formData.wellness,
                attendance: formData.attendance
            });
            alert("Performance data saved!");
            setViewState('students');
            setSelectedStudent(null);
        } catch (error) {
            console.error("Error updating student:", error);
            alert("Failed to save: " + error.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            style={{ display: 'flex', flexDirection: 'column', height: '100%', paddingBottom: '20px' }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', paddingTop: '1rem' }}>
                <button
                    onClick={handleBack}
                    className="btn-press"
                    style={{
                        background: 'var(--card-bg)', border: 'none', color: 'white',
                        width: '44px', height: '44px', borderRadius: '14px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}
                >
                    <ChevronLeft size={24} />
                </button>
                <div>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: '800' }}>
                        {viewState === 'classes' ? 'Classes' :
                            viewState === 'students' ? selectedClass?.name :
                                'Performance'}
                    </h2>
                    {selectedStudent && <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: '500' }}>Editing: {selectedStudent.name}</p>}
                </div>
            </div>

            <AnimatePresence mode="wait">
                {viewState === 'classes' && (
                    <motion.div
                        key="view-classes"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}
                    >
                        {classes.map((cls, idx) => (
                            <motion.div
                                key={cls.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.05 }}
                                onClick={() => handleClassSelect(cls)}
                                className="glass btn-press"
                                style={{
                                    padding: '1.5rem', borderRadius: '24px', cursor: 'pointer',
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem',
                                    textAlign: 'center'
                                }}
                            >
                                <div style={{ padding: '12px', borderRadius: '50%', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary)', marginBottom: '0.2rem' }}>
                                    <BookOpen size={28} />
                                </div>
                                <h3 style={{ fontWeight: '700', fontSize: '1.1rem' }}>{cls.name}</h3>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: '600' }}>{cls.students || 0} Students</span>
                            </motion.div>
                        ))}
                        {classes.length === 0 && !loading && (
                            <div style={{ textAlign: 'center', color: 'var(--text-muted)', gridColumn: '1/-1', padding: '3rem' }}>No classes found.</div>
                        )}
                    </motion.div>
                )}

                {viewState === 'students' && (
                    <motion.div
                        key="view-students"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
                    >
                        {students.map((student, idx) => (
                            <motion.div
                                key={student.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.05 }}
                                onClick={() => handleStudentSelect(student)}
                                className="glass btn-press"
                                style={{
                                    padding: '1rem', borderRadius: '22px', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', gap: '1rem'
                                }}
                            >
                                <div style={{
                                    width: '48px', height: '48px', borderRadius: '16px', overflow: 'hidden',
                                    border: '2px solid var(--glass-border)'
                                }}>
                                    <img
                                        src={student.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${student.id}`}
                                        alt={student.name}
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <h4 style={{ fontWeight: '700', fontSize: '1.05rem' }}>{student.name}</h4>
                                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: '500' }}>Roll No: {student.rollNo}</p>
                                </div>
                                <Activity size={20} color="#10b981" style={{ opacity: 0.6 }} />
                            </motion.div>
                        ))}
                    </motion.div>
                )}

                {viewState === 'edit' && selectedStudent && (
                    <motion.div
                        key="view-edit"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '100px' }}
                    >
                        {/* 1. Academic Scores */}
                        <div className="glass" style={{ padding: '1.5rem', borderRadius: '28px' }}>
                            <h3 style={{ fontSize: '1.1rem', fontWeight: '800', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <Trophy size={20} color="#fbbf24" /> Academic Results
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                {formData.academicScores.map((subj, idx) => (
                                    <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <span style={{ color: 'var(--text-main)', fontSize: '0.95rem', fontWeight: '500' }}>{subj.subject}</span>
                                        <input
                                            type="number"
                                            min="0" max="100"
                                            value={subj.score}
                                            onChange={(e) => {
                                                const newScores = [...formData.academicScores];
                                                newScores[idx].score = parseInt(e.target.value) || 0;
                                                setFormData({ ...formData, academicScores: newScores });
                                            }}
                                            style={{
                                                background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)',
                                                color: 'white', padding: '0.6rem', borderRadius: '12px', width: '80px', textAlign: 'center',
                                                fontWeight: '700', fontSize: '1rem', outline: 'none'
                                            }}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* 2. Wellness Metrics */}
                        <div className="glass" style={{ padding: '1.5rem', borderRadius: '28px' }}>
                            <h3 style={{ fontSize: '1.1rem', fontWeight: '800', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <Heart size={20} color="#f472b6" /> Wellness Profile
                            </h3>
                            {['behavior', 'health', 'hygiene'].map((metric) => (
                                <div key={metric} style={{ marginBottom: '1.5rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', fontSize: '0.9rem', fontWeight: '600' }}>
                                        <span style={{ textTransform: 'capitalize', color: 'var(--text-muted)' }}>{metric}</span>
                                        <span style={{ color: 'var(--primary)' }}>{formData.wellness[metric]}%</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0" max="100"
                                        value={formData.wellness[metric]}
                                        onChange={(e) => setFormData({
                                            ...formData,
                                            wellness: { ...formData.wellness, [metric]: parseInt(e.target.value) }
                                        })}
                                        style={{ width: '100%', accentColor: 'var(--primary)', height: '6px' }}
                                    />
                                </div>
                            ))}
                        </div>

                        {/* 3. Attendance */}
                        <div className="glass" style={{ padding: '1.5rem', borderRadius: '28px' }}>
                            <h3 style={{ fontSize: '1.1rem', fontWeight: '800', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <Calendar size={20} color="#34d399" /> Attendance Percentage
                            </h3>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <input
                                    type="number"
                                    min="0" max="100"
                                    value={formData.attendance}
                                    onChange={(e) => setFormData({ ...formData, attendance: parseInt(e.target.value) || 0 })}
                                    style={{
                                        flex: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)',
                                        color: 'white', padding: '1rem', borderRadius: '16px', textAlign: 'center', fontSize: '1.25rem',
                                        fontWeight: '800', outline: 'none'
                                    }}
                                />
                                <span style={{ fontSize: '1.25rem', fontWeight: '800', color: 'var(--text-muted)' }}>%</span>
                            </div>
                        </div>

                        {/* Save Button */}
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="btn-press animate-pulse-glow"
                            style={{
                                width: '100%', padding: '1.25rem', borderRadius: '22px', border: 'none',
                                background: 'var(--primary)', color: 'white', fontWeight: '800', fontSize: '1.1rem',
                                cursor: 'pointer', boxShadow: '0 10px 25px var(--primary-glow)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem'
                            }}
                        >
                            {saving ? <Loader2 className="animate-spin" /> : <Save size={22} />}
                            {saving ? 'UPDATING...' : 'SAVE CHANGES'}
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {loading && <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}><Loader2 className="animate-spin" size={48} color="var(--primary)" /></div>}
        </motion.div>
    );
};

export default PerformanceView;
