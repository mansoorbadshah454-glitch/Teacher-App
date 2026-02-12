import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '../firebase';
import { collection, query, onSnapshot, doc, updateDoc, writeBatch, orderBy, getDocs, where, limit } from 'firebase/firestore';
import { ChevronLeft, Users, BookOpen, Save, Loader2, Search, Sliders, ChevronRight } from 'lucide-react';

const NextClassView = ({ user, onBack }) => {
    // Navigation State
    const [viewState, setViewState] = useState('classes'); // 'classes', 'subjects', 'students'

    // Data State
    const [classes, setClasses] = useState([]);
    const [selectedClass, setSelectedClass] = useState(null);
    const [selectedSubject, setSelectedSubject] = useState(null);
    const [students, setStudents] = useState([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [absentCount, setAbsentCount] = useState(0);

    // Score State: Map of studentId -> { academicScore, homeworkScore }
    // We only track CHANGED scores to save bandwidth/reads
    const [scoreUpdates, setScoreUpdates] = useState({});

    // 1. Fetch All Classes
    useEffect(() => {
        if (!user?.schoolId) return;

        setLoading(true);
        const q = query(collection(db, `schools/${user.schoolId}/classes`));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const classesData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            // Sort classes numerically/alphabetically
            const getClassOrder = (name) => {
                if (!name) return 0;
                if (name.toLowerCase().includes('nursery')) return -2;
                if (name.toLowerCase().includes('prep')) return -1;
                return parseInt(name.replace(/\D/g, '')) || 0;
            };
            classesData.sort((a, b) => getClassOrder(a.name) - getClassOrder(b.name));
            setClasses(classesData);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user?.schoolId]);

    // 2. Fetch Students when Class & Subject Selected
    useEffect(() => {
        if (!selectedClass || !selectedSubject || !user?.schoolId) return;

        setLoading(true);
        const q = query(collection(db, `schools/${user.schoolId}/classes/${selectedClass.id}/students`));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const studentsData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            studentsData.sort((a, b) => (a.rollNo || '0').localeCompare(b.rollNo || '0'));
            setStudents(studentsData);
            setLoading(false);
            // Reset updates on new fetch to avoid staleness
            setScoreUpdates({});
        });

        return () => unsubscribe();
    }, [selectedClass, selectedSubject, user?.schoolId]);

    // 3. Fetch Today's Absent Count
    useEffect(() => {
        if (!selectedClass || !user?.schoolId) return;

        const today = new Date().toISOString().split('T')[0];
        const q = query(
            collection(db, `schools/${user.schoolId}/attendance`),
            where('classId', '==', selectedClass.id),
            where('date', '==', today),
            orderBy('timestamp', 'desc'),
            limit(1)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            if (!snapshot.empty) {
                const data = snapshot.docs[0].data();
                const absentDetails = data.records?.filter(r => r.status === 'absent') || [];
                setAbsentCount(absentDetails.length);
            } else {
                setAbsentCount(0);
            }
        });

        return () => unsubscribe();
    }, [selectedClass, user?.schoolId]);

    // Handlers
    const handleClassSelect = (cls) => {
        setSelectedClass(cls);
        setViewState('subjects');
    };

    const handleSubjectSelect = (subject) => {
        setSelectedSubject(subject);
        setViewState('students');
    };

    const handleBack = () => {
        if (viewState === 'students') {
            setViewState('subjects');
            setSelectedSubject(null);
            setScoreUpdates({});
        } else if (viewState === 'subjects') {
            setViewState('classes');
            setSelectedClass(null);
            setAbsentCount(0);
        } else {
            onBack();
        }
    };

    const getStudentScore = (student, type) => {
        // type: 'academic' or 'homework'
        // Check updates first, then fallback to DB data
        if (scoreUpdates[student.id]?.[type] !== undefined) {
            return scoreUpdates[student.id][type];
        }

        const scoresArray = type === 'academic' ? student.academicScores : student.homeworkScores;
        const subjectScore = scoresArray?.find(s => s.subject === selectedSubject);
        return subjectScore ? parseInt(subjectScore.score) || 0 : 0;
    };

    const handleScoreChange = (studentId, type, val) => {
        const value = parseInt(val) || 0;
        setScoreUpdates(prev => ({
            ...prev,
            [studentId]: {
                ...prev[studentId],
                [type]: value
            }
        }));
    };

    const handleSaveAll = async () => {
        if (Object.keys(scoreUpdates).length === 0) return;
        setSaving(true);

        try {
            const batch = writeBatch(db);

            // Iterate over all updates
            Object.entries(scoreUpdates).forEach(([studentId, updates]) => {
                const student = students.find(s => s.id === studentId);
                if (!student) return;

                const studentRef = doc(db, `schools/${user.schoolId}/classes/${selectedClass.id}/students/${studentId}`);

                // Construct new arrays based on EXISTING data + UPDATES
                // We must be careful not to wipe other subjects

                let newAcademicScores = [...(student.academicScores || [])];
                let newHomeworkScores = [...(student.homeworkScores || [])];

                // Update Academic
                if (updates.academic !== undefined) {
                    const idx = newAcademicScores.findIndex(s => s.subject === selectedSubject);
                    if (idx >= 0) {
                        newAcademicScores[idx] = { ...newAcademicScores[idx], score: updates.academic };
                    } else {
                        newAcademicScores.push({ subject: selectedSubject, score: updates.academic });
                    }
                }

                // Update Homework
                if (updates.homework !== undefined) {
                    const idx = newHomeworkScores.findIndex(s => s.subject === selectedSubject);
                    if (idx >= 0) {
                        newHomeworkScores[idx] = { ...newHomeworkScores[idx], score: updates.homework };
                    } else {
                        newHomeworkScores.push({ subject: selectedSubject, score: updates.homework });
                    }
                }

                batch.update(studentRef, {
                    academicScores: newAcademicScores,
                    homeworkScores: newHomeworkScores
                });
            });

            await batch.commit();
            alert("All scores updated successfully!");
            setScoreUpdates({}); // Clear updates
        } catch (error) {
            console.error("Error saving batch scores:", error);
            alert("Failed to save scores: " + error.message);
        } finally {
            setSaving(false);
        }
    };

    // Helper for gradient color based on score
    const getScoreColor = (score) => {
        if (score >= 80) return '#10b981'; // Green
        if (score >= 50) return '#f59e0b'; // Orange
        return '#ef4444'; // Red
    };

    // Filter students
    const filteredStudents = students.filter(s =>
        s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.rollNo || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', paddingBottom: '160px' }}
        >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', paddingTop: '1rem' }}>
                <button
                    onClick={handleBack}
                    className="btn-press"
                    style={{
                        background: 'var(--back-btn-bg)', border: 'none', color: 'var(--back-btn-text)',
                        width: '44px', height: '44px', borderRadius: '14px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}
                >
                    <ChevronLeft size={24} />
                </button>
                <div>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: '800' }}>
                        {viewState === 'classes' ? 'All Classes' :
                            viewState === 'subjects' ? selectedClass?.name :
                                selectedSubject}
                    </h2>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: '500' }}>
                        {viewState === 'classes' ? 'Select a class to manage' :
                            viewState === 'subjects' ? 'Select a subject' :
                                `${selectedClass?.name} • ${students.length} Students • ${absentCount} Absent Today`}
                    </p>
                </div>
            </div>

            <AnimatePresence mode="wait">
                {/* VIEW 1: CLASS SELECTION */}
                {viewState === 'classes' && (
                    <motion.div
                        key="classes"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}
                    >
                        {loading && <Loader2 className="animate-spin" style={{ margin: '2rem auto', gridColumn: 'span 2' }} color="var(--primary)" />}

                        {!loading && classes.map(cls => (
                            <div
                                key={cls.id}
                                onClick={() => handleClassSelect(cls)}
                                className="btn-press"
                                style={{
                                    padding: '1.5rem',
                                    borderRadius: '24px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '0.5rem',
                                    background: 'var(--card-bg)',
                                    border: '1px solid var(--glass-border)',
                                    boxShadow: '0 10px 30px -5px rgba(0, 0, 0, 0.3)', // Darker, Prime 2D shadow
                                    position: 'relative',
                                    overflow: 'hidden'
                                }}
                            >
                                <div style={{
                                    width: '40px', height: '40px', borderRadius: '12px',
                                    background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}>
                                    <Users size={20} />
                                </div>
                                <h3 style={{ fontSize: '1.1rem', fontWeight: '700' }}>{cls.name}</h3>
                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' }}>
                                        {cls.subjects?.length || 0} Subjects
                                    </span>
                                </div>
                            </div>
                        ))}
                    </motion.div>
                )}

                {/* VIEW 2: SUBJECT SELECTION */}
                {viewState === 'subjects' && (
                    <motion.div
                        key="subjects"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
                    >
                        {selectedClass?.subjects?.length > 0 ? (
                            selectedClass.subjects.map(subj => (
                                <div
                                    key={subj}
                                    onClick={() => handleSubjectSelect(subj)}
                                    className="glass btn-press"
                                    style={{
                                        padding: '1.25rem', borderRadius: '16px', cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                        <div style={{
                                            width: '36px', height: '36px', borderRadius: '10px',
                                            background: 'rgba(244, 63, 94, 0.1)', color: '#f43f5e',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                                        }}>
                                            <BookOpen size={18} />
                                        </div>
                                        <span style={{ fontSize: '1rem', fontWeight: '600' }}>{subj}</span>
                                    </div>
                                    <ChevronRight size={20} color="var(--text-muted)" />
                                </div>
                            ))
                        ) : (
                            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                                No subjects assigned to this class.
                            </div>
                        )}
                    </motion.div>
                )}

                {/* VIEW 3: STUDENTS & SCORING */}
                {viewState === 'students' && (
                    <motion.div
                        key="students"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
                    >
                        {/* Search */}
                        <div className="glass" style={{ borderRadius: '12px', padding: '0.5rem 1rem', display: 'flex', alignItems: 'center' }}>
                            <Search size={16} color="var(--text-muted)" />
                            <input
                                type="text"
                                placeholder="Search student..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                style={{
                                    background: 'transparent', border: 'none', outline: 'none',
                                    color: 'white', marginLeft: '0.5rem', width: '100%'
                                }}
                            />
                        </div>

                        {/* List */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {loading && <Loader2 className="animate-spin" style={{ margin: '0 auto' }} color="var(--primary)" />}

                            {!loading && filteredStudents.map(student => {
                                const acScore = getStudentScore(student, 'academic');
                                const hwScore = getStudentScore(student, 'homework');

                                return (
                                    <div key={student.id} className="glass" style={{ padding: '1rem', borderRadius: '16px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                                            <div style={{ width: '40px', height: '40px', borderRadius: '50%', overflow: 'hidden', background: '#334155' }}>
                                                <img
                                                    src={student.profilePic || `https://api.dicebear.com/7.x/avataaars/svg?seed=${student.id}`}
                                                    alt={student.name}
                                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                />
                                            </div>
                                            <div>
                                                <h4 style={{ fontWeight: '700', fontSize: '1rem' }}>{student.name}</h4>
                                                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Roll No: {student.rollNo || 'N/A'}</p>
                                            </div>
                                        </div>

                                        {/* Sliders */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                            {/* Subject Score Slider */}
                                            <div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem', fontSize: '0.8rem', fontWeight: '600' }}>
                                                    <span style={{ color: 'var(--text-muted)' }}>Subject Score</span>
                                                    <span style={{ color: 'var(--subject-score-accent, ' + getScoreColor(acScore) + ')' }}>{acScore}%</span>
                                                </div>
                                                <input
                                                    type="range" min="0" max="100"
                                                    value={acScore}
                                                    onChange={(e) => handleScoreChange(student.id, 'academic', e.target.value)}
                                                    className="custom-slider"
                                                    style={{
                                                        '--slider-color': 'var(--subject-score-accent, ' + getScoreColor(acScore) + ')',
                                                        '--slider-value': acScore + '%'
                                                    }}
                                                />
                                            </div>

                                            {/* Homework Score Slider */}
                                            <div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem', fontSize: '0.8rem', fontWeight: '600' }}>
                                                    <span style={{ color: 'var(--text-muted)' }}>Homework Score</span>
                                                    <span style={{ color: 'var(--homework-score-accent, ' + getScoreColor(hwScore) + ')' }}>{hwScore}%</span>
                                                </div>
                                                <input
                                                    type="range" min="0" max="100"
                                                    value={hwScore}
                                                    onChange={(e) => handleScoreChange(student.id, 'homework', e.target.value)}
                                                    className="custom-slider"
                                                    style={{
                                                        '--slider-color': 'var(--homework-score-accent, ' + getScoreColor(hwScore) + ')',
                                                        '--slider-value': hwScore + '%'
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div style={{ height: '120px', flexShrink: 0 }}></div>

            {/* Floating Save Button */}
            <AnimatePresence>
                {Object.keys(scoreUpdates).length > 0 && (
                    <motion.div
                        initial={{ y: 100 }}
                        animate={{ y: 0 }}
                        exit={{ y: 100 }}
                        style={{
                            position: 'fixed', bottom: '90px', left: '1.5rem', right: '1.5rem',
                            zIndex: 50
                        }}
                    >
                        <button
                            onClick={handleSaveAll}
                            disabled={saving}
                            className="btn-press"
                            style={{
                                width: '100%', padding: '1rem', borderRadius: '16px',
                                background: 'var(--primary)', color: 'white',
                                border: 'none', fontSize: '1rem', fontWeight: '700',
                                boxShadow: '0 10px 25px -5px rgba(99, 102, 241, 0.5)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem'
                            }}
                        >
                            {saving ? <Loader2 className="animate-spin" /> : <Save size={20} />}
                            {saving ? 'Saving...' : `Save Changes (${Object.keys(scoreUpdates).length})`}
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

export default NextClassView;
