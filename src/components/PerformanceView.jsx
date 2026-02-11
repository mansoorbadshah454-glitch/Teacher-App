import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '../firebase';
import { collection, query, onSnapshot, doc, updateDoc, getDocs, where } from 'firebase/firestore';
import { ChevronLeft, User, BookOpen, Activity, Heart, Save, Loader2, Trophy, Calendar, Search, GraduationCap, ClipboardList, TrendingUp } from 'lucide-react';

const PerformanceView = ({ user, onBack }) => {
    // Navigation State
    const [viewState, setViewState] = useState('list'); // 'list', 'edit'

    // Data State
    const [assignedClass, setAssignedClass] = useState(null);
    const [assignedSubjects, setAssignedSubjects] = useState([]);
    const [students, setStudents] = useState([]);
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [search, setSearch] = useState('');

    // Metrics State
    const [metrics, setMetrics] = useState({
        classScore: 0,
        subjectScore: 0,
        homeworkScore: 0
    });

    // Edit Form State
    const [formData, setFormData] = useState({
        academicScores: [], // { subject, score }
        homeworkScores: [], // { subject, score }
        wellness: { behavior: 80, health: 80, hygiene: 80 },
        attendance: 85
    });

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // 1. Fetch Assigned Class on Mount
    useEffect(() => {
        const fetchAssignedClass = async () => {
            setLoading(true);
            try {
                // Get teacher's name
                const teachersQuery = query(
                    collection(db, `schools/${user.schoolId}/teachers`),
                    where("email", "==", user.email)
                );
                const teacherSnap = await getDocs(teachersQuery);

                if (teacherSnap.empty) {
                    console.error("Teacher not found");
                    setLoading(false);
                    return;
                }

                const teacherData = teacherSnap.docs[0].data();
                const teacherName = teacherData.name;
                setAssignedSubjects(teacherData.subjects || []);

                // Find class by teacher name
                const classesSnap = await getDocs(collection(db, `schools/${user.schoolId}/classes`));
                let found = null;
                classesSnap.forEach(doc => {
                    const data = doc.data();
                    if (data.teacher === teacherName) {
                        found = { id: doc.id, ...data };
                    }
                });

                setAssignedClass(found);
            } catch (error) {
                console.error("Error fetching assigned class:", error);
            } finally {
                setLoading(false);
            }
        };

        if (user?.schoolId) {
            fetchAssignedClass();
        }
    }, [user.schoolId, user.email]);

    // 2. Fetch Students & Calculate Metrics
    useEffect(() => {
        if (!assignedClass) return;

        setLoading(true);
        const q = query(collection(db, `schools/${user.schoolId}/classes/${assignedClass.id}/students`));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const studentList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            studentList.sort((a, b) => (a.rollNo || '0').localeCompare(b.rollNo || '0'));
            setStudents(studentList);

            // Calculate Metrics
            let totalSubjectScore = 0;
            let totalHomeworkScore = 0;
            let totalAttendance = 0;
            let studentCount = studentList.length;

            studentList.forEach(s => {
                // Subject Score Avg
                const subScores = s.academicScores?.map(i => parseInt(i.score) || 0) || [];
                const subAvg = subScores.length ? subScores.reduce((a, b) => a + b, 0) / subScores.length : 0;
                totalSubjectScore += subAvg;

                // Homework Score Avg
                const hwScores = s.homeworkScores?.map(i => parseInt(i.score) || 0) || [];
                const hwAvg = hwScores.length ? hwScores.reduce((a, b) => a + b, 0) / hwScores.length : 0;
                totalHomeworkScore += hwAvg;

                // Attendance
                totalAttendance += (parseInt(s.attendance) || 85);
            });

            const avgSubject = studentCount ? (totalSubjectScore / studentCount) : 0;
            const avgHomework = studentCount ? (totalHomeworkScore / studentCount) : 0;
            const avgAttendance = studentCount ? (totalAttendance / studentCount) : 0;

            // Class Score: Weighted Average of Subject, Homework, and Attendance
            // Logic: Subject Score (Academics) + Homework Score + Attendance Score / 3
            // Assuming Attendance is already % (0-100)
            const classScore = (avgSubject + avgHomework + avgAttendance) / 3;

            setMetrics({
                classScore: Math.round(classScore),
                subjectScore: Math.round(avgSubject),
                homeworkScore: Math.round(avgHomework)
            });

            setLoading(false);
        });

        return () => unsubscribe();
    }, [assignedClass, user.schoolId]);

    // Handlers
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
            homeworkScores: student.homeworkScores || [
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
            setViewState('list');
            setSelectedStudent(null);
        } else {
            onBack();
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const studentRef = doc(db, `schools/${user.schoolId}/classes/${assignedClass.id}/students/${selectedStudent.id}`);
            await updateDoc(studentRef, {
                academicScores: formData.academicScores,
                homeworkScores: formData.homeworkScores,
                wellness: formData.wellness,
                attendance: formData.attendance
            });
            alert("Performance data saved!");
            setViewState('list');
            setSelectedStudent(null);
        } catch (error) {
            console.error("Error updating student:", error);
            alert("Failed to save: " + error.message);
        } finally {
            setSaving(false);
        }
    };

    const filteredStudents = students.filter(s =>
        (s.name?.toLowerCase().includes(search.toLowerCase())) ||
        (s.rollNo?.toLowerCase().includes(search.toLowerCase()))
    );

    if (loading && !students.length) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
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
                        {viewState === 'edit' ? selectedStudent?.name : 'Performance'}
                    </h2>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: '500' }}>
                        {assignedClass?.name} {viewState === 'edit' && '• Editing'}
                    </p>
                </div>
            </div>

            <AnimatePresence mode="wait">
                {viewState === 'list' && (
                    <motion.div
                        key="view-list"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}
                    >
                        {/* Summary Cards */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
                            {/* Class Score */}
                            <div className="glass" style={{ padding: '1rem', borderRadius: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                                <div style={{ marginBottom: '0.5rem', color: '#8b5cf6' }}><TrendingUp size={24} /></div>
                                <h3 style={{ fontSize: '1.5rem', fontWeight: '800', marginBottom: '0.1rem' }}>{metrics.classScore}%</h3>
                                <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: '600' }}>Class Score</p>
                            </div>

                            {/* Subject Score */}
                            <div className="glass" style={{ padding: '1rem', borderRadius: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                                <div style={{ marginBottom: '0.5rem', color: '#f59e0b' }}><BookOpen size={24} /></div>
                                <h3 style={{ fontSize: '1.5rem', fontWeight: '800', marginBottom: '0.1rem' }}>{metrics.subjectScore}%</h3>
                                <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: '600' }}>Subject Score</p>
                            </div>

                            {/* Homework Score */}
                            <div className="glass" style={{ padding: '1rem', borderRadius: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                                <div style={{ marginBottom: '0.5rem', color: '#10b981' }}><ClipboardList size={24} /></div>
                                <h3 style={{ fontSize: '1.5rem', fontWeight: '800', marginBottom: '0.1rem' }}>{metrics.homeworkScore}%</h3>
                                <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: '600' }}>Homework Score</p>
                            </div>
                        </div>

                        {/* Search Bar */}
                        <div className="glass" style={{ borderRadius: '18px', display: 'flex', alignItems: 'center', padding: '0.2rem 1rem' }}>
                            <Search size={18} color="var(--text-muted)" />
                            <input
                                type="text"
                                placeholder="Search students..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                style={{ background: 'none', border: 'none', color: 'white', padding: '1rem', outline: 'none', width: '100%', fontSize: '0.95rem' }}
                            />
                        </div>

                        {/* Student List */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <h3 style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>All Students</h3>
                            {filteredStudents.map((student, idx) => (
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
                                            src={student.avatar || student.profilePic || `https://api.dicebear.com/7.x/avataaars/svg?seed=${student.id}`}
                                            alt={student.name}
                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                        />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <h4 style={{ fontWeight: '700', fontSize: '1.05rem' }}>{student.name}</h4>
                                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: '500' }}>Roll No: {student.rollNo || '-'}</p>
                                    </div>
                                    <GraduationCap size={20} color="var(--primary)" style={{ opacity: 0.6 }} />
                                </motion.div>
                            ))}
                            {filteredStudents.length === 0 && (
                                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                                    No students found.
                                </div>
                            )}
                        </div>
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
                                {formData.academicScores.map((subj, idx) => {
                                    const isEditable = assignedSubjects.includes(subj.subject);
                                    return (
                                        <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <span style={{ color: 'var(--text-main)', fontSize: '0.95rem', fontWeight: '500' }}>{subj.subject}</span>
                                            <input
                                                type="number"
                                                min="0" max="100"
                                                value={subj.score}
                                                disabled={!isEditable}
                                                onChange={(e) => {
                                                    const newScores = [...formData.academicScores];
                                                    newScores[idx].score = parseInt(e.target.value) || 0;
                                                    setFormData({ ...formData, academicScores: newScores });
                                                }}
                                                style={{
                                                    background: isEditable ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.01)', // Visual cue
                                                    border: '1px solid var(--glass-border)',
                                                    color: isEditable ? 'white' : 'rgba(255,255,255,0.3)', // Dim text if disabled
                                                    padding: '0.6rem', borderRadius: '12px', width: '80px', textAlign: 'center',
                                                    fontWeight: '700', fontSize: '1rem', outline: 'none',
                                                    opacity: isEditable ? 1 : 0.5,
                                                    cursor: isEditable ? 'text' : 'not-allowed'
                                                }}
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* 2. Homework Scores (NEW) */}
                        <div className="glass" style={{ padding: '1.5rem', borderRadius: '28px' }}>
                            <h3 style={{ fontSize: '1.1rem', fontWeight: '800', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <ClipboardList size={20} color="#10b981" /> Homework Scores
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                {formData.homeworkScores.map((subj, idx) => {
                                    const isEditable = assignedSubjects.includes(subj.subject);
                                    return (
                                        <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <span style={{ color: 'var(--text-main)', fontSize: '0.95rem', fontWeight: '500' }}>{subj.subject}</span>
                                            <input
                                                type="number"
                                                min="0" max="100"
                                                value={subj.score}
                                                disabled={!isEditable}
                                                onChange={(e) => {
                                                    const newScores = [...formData.homeworkScores];
                                                    newScores[idx].score = parseInt(e.target.value) || 0;
                                                    setFormData({ ...formData, homeworkScores: newScores });
                                                }}
                                                style={{
                                                    background: isEditable ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.01)',
                                                    border: '1px solid var(--glass-border)',
                                                    color: isEditable ? 'white' : 'rgba(255,255,255,0.3)',
                                                    padding: '0.6rem', borderRadius: '12px', width: '80px', textAlign: 'center',
                                                    fontWeight: '700', fontSize: '1rem', outline: 'none',
                                                    opacity: isEditable ? 1 : 0.5,
                                                    cursor: isEditable ? 'text' : 'not-allowed'
                                                }}
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* 3. Wellness Metrics */}
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

                        {/* 4. Attendance Percentage */}
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
        </motion.div>
    );
};

export default PerformanceView;
