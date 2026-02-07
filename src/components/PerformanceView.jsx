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
                // Assuming classes are at schools/{schoolId}/classes
                const q = query(collection(db, `schools/${user.schoolId}/classes`));
                const snapshot = await getDocs(q);
                const classList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setClasses(classList);
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
        // Initialize Form Data with existing or default
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
                attendance: formData.attendance // Save as number for simplicity or object if preferred
                // If using object: { percentage: formData.attendance, ... }
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

    // --- Render Helpers ---

    if (loading && viewState === 'classes') return (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
            <Loader2 className="animate-spin" color="var(--primary)" />
        </div>
    );

    return (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                <button
                    onClick={handleBack}
                    style={{
                        background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white',
                        width: '40px', height: '40px', borderRadius: '12px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
                    }}
                >
                    <ChevronLeft size={24} />
                </button>
                <div>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: '700' }}>
                        {viewState === 'classes' ? 'Select Class' :
                            viewState === 'students' ? selectedClass?.name :
                                'Update Performance'}
                    </h2>
                    {selectedStudent && <p style={{ fontSize: '0.85rem', color: '#94a3b8' }}>{selectedStudent.name}</p>}
                </div>
            </div>

            {/* View: Classes List */}
            {viewState === 'classes' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    {classes.map(cls => (
                        <div
                            key={cls.id}
                            onClick={() => handleClassSelect(cls)}
                            className="glass"
                            style={{
                                padding: '1.5rem', borderRadius: '20px', cursor: 'pointer',
                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem',
                                border: '1px solid rgba(255,255,255,0.1)'
                            }}
                        >
                            <div style={{ padding: '12px', borderRadius: '50%', background: 'rgba(99, 102, 241, 0.2)', color: '#818cf8', marginBottom: '0.5rem' }}>
                                <BookOpen size={24} />
                            </div>
                            <h3 style={{ fontWeight: '600' }}>{cls.name}</h3>
                            <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{cls.students || 0} Students</span>
                        </div>
                    ))}
                    {classes.length === 0 && <p style={{ color: '#94a3b8', gridColumn: '1/-1', textAlign: 'center' }}>No classes found.</p>}
                </div>
            )}

            {/* View: Students List */}
            {viewState === 'students' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {students.map(student => (
                        <div
                            key={student.id}
                            onClick={() => handleStudentSelect(student)}
                            className="glass"
                            style={{
                                padding: '1rem', borderRadius: '16px', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '1rem'
                            }}
                        >
                            <div style={{
                                width: '40px', height: '40px', borderRadius: '50%', overflow: 'hidden',
                                background: '#334155', border: '2px solid rgba(255,255,255,0.1)'
                            }}>
                                <img
                                    src={student.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${student.id}`}
                                    alt={student.name}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                            </div>
                            <div style={{ flex: 1 }}>
                                <h4 style={{ fontWeight: '600', fontSize: '1rem' }}>{student.name}</h4>
                                <p style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Roll No: {student.rollNo}</p>
                            </div>
                            <div style={{ padding: '0.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '10px' }}>
                                <Activity size={20} color="#10b981" />
                            </div>
                        </div>
                    ))}
                    {loading && <div style={{ textAlign: 'center', padding: '2rem' }}><Loader2 className="animate-spin" /></div>}
                </div>
            )}

            {/* View: Edit Form */}
            {viewState === 'edit' && selectedStudent && (
                <div style={{ paddingBottom: '100px' }}>

                    {/* 1. Academic Scores */}
                    <div className="glass" style={{ padding: '1.25rem', borderRadius: '20px', marginBottom: '1.5rem' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Trophy size={18} color="#fbbf24" /> Academic Scores
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {formData.academicScores.map((subj, idx) => (
                                <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <span style={{ color: '#cbd5e1', fontSize: '0.9rem' }}>{subj.subject}</span>
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
                                            background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
                                            color: 'white', padding: '0.5rem', borderRadius: '8px', width: '80px', textAlign: 'center'
                                        }}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 2. Wellness Metrics */}
                    <div className="glass" style={{ padding: '1.25rem', borderRadius: '20px', marginBottom: '1.5rem' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Heart size={18} color="#f472b6" /> Wellness
                        </h3>
                        {['behavior', 'health', 'hygiene'].map((metric) => (
                            <div key={metric} style={{ marginBottom: '1rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
                                    <span style={{ textTransform: 'capitalize', color: '#cbd5e1' }}>{metric}</span>
                                    <span style={{ fontWeight: 'bold' }}>{formData.wellness[metric]}%</span>
                                </div>
                                <input
                                    type="range"
                                    min="0" max="100"
                                    value={formData.wellness[metric]}
                                    onChange={(e) => setFormData({
                                        ...formData,
                                        wellness: { ...formData.wellness, [metric]: parseInt(e.target.value) }
                                    })}
                                    style={{ width: '100%', accentColor: '#6366f1' }}
                                />
                            </div>
                        ))}
                    </div>

                    {/* 3. Attendance */}
                    <div className="glass" style={{ padding: '1.25rem', borderRadius: '20px', marginBottom: '1.5rem' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Calendar size={18} color="#34d399" /> Attendance %
                        </h3>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <input
                                type="number"
                                min="0" max="100"
                                value={formData.attendance}
                                onChange={(e) => setFormData({ ...formData, attendance: parseInt(e.target.value) || 0 })}
                                style={{
                                    flex: 1, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
                                    color: 'white', padding: '0.75rem', borderRadius: '12px', textAlign: 'center', fontSize: '1.1rem'
                                }}
                            />
                            <span style={{ fontSize: '1rem', color: '#94a3b8' }}>%</span>
                        </div>
                    </div>

                    {/* Save Button */}
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="btn-press"
                        style={{
                            width: '100%', padding: '1rem', borderRadius: '16px', border: 'none',
                            background: 'var(--primary)', color: 'white', fontWeight: '700', fontSize: '1rem',
                            cursor: 'pointer', boxShadow: '0 8px 20px -4px var(--primary-glow)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem'
                        }}
                    >
                        {saving ? <Loader2 className="animate-spin" /> : <Save size={20} />}
                        {saving ? 'Saving...' : 'Save Updates'}
                    </button>

                </div>
            )}
        </motion.div>
    );
};

export default PerformanceView;
