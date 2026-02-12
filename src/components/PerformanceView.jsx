import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '../firebase';
import { collection, query, onSnapshot, doc, updateDoc, getDocs, where, addDoc, serverTimestamp, orderBy, limit } from 'firebase/firestore';
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
    const [absentCount, setAbsentCount] = useState(0);

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

    const [currentTeacherName, setCurrentTeacherName] = useState(null);

    // 1. Fetch Teacher Profile (Real-time Permissions & Name)
    useEffect(() => {
        if (!user?.schoolId || !user?.email) return;

        setLoading(true);
        const teachersQuery = query(
            collection(db, `schools/${user.schoolId}/teachers`),
            where("email", "==", user.email)
        );

        const unsubscribeTeacher = onSnapshot(teachersQuery, (snapshot) => {
            if (!snapshot.empty) {
                const teacherData = snapshot.docs[0].data();
                // Real-time Permission Sync
                setAssignedSubjects(teacherData.subjects || []);
                // Name Sync (for Class lookup)
                setCurrentTeacherName(teacherData.name);
            } else {
                console.error("Teacher not found");
                setAssignedSubjects([]);
                setCurrentTeacherName(null);
                setLoading(false);
            }
        }, (error) => {
            console.error("Error listening to teacher profile:", error);
            setLoading(false);
        });

        return () => unsubscribeTeacher();
    }, [user.schoolId, user.email]);

    // 2. Fetch Assigned Class (Dependent on Teacher Name)
    useEffect(() => {
        if (!user?.schoolId || !currentTeacherName) return;

        // Keep loading true while switching classes/names
        // But don't reset if we are just updating data within same class

        const classesQuery = query(collection(db, `schools/${user.schoolId}/classes`));

        const unsubscribeClasses = onSnapshot(classesQuery, (snapshot) => {
            let found = null;
            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.teacher === currentTeacherName) {
                    found = { id: doc.id, ...data };
                }
            });

            if (found) {
                setAssignedClass(found);
                // assignedSubjects is handled by Previous Effect
            } else {
                setAssignedClass(null);
            }
            setLoading(false);
        }, (error) => {
            console.error("Error listening to classes:", error);
            setLoading(false);
        });

        return () => unsubscribeClasses();
    }, [user.schoolId, currentTeacherName]);

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

            // [IMPROVEMENT] Get list of currently assigned subjects
            const currentSubjects = assignedClass.subjects || [];

            studentList.forEach(s => {
                // Subject Score Avg - Filtered by Assigned Class Subjects
                const subScoresRaw = s.academicScores || [];
                const subScores = subScoresRaw
                    .filter(i => currentSubjects.includes(i.subject))
                    .map(i => parseInt(i.score) || 0);

                const subAvg = subScores.length ? subScores.reduce((a, b) => a + b, 0) / subScores.length : 0;
                totalSubjectScore += subAvg;

                // Homework Score Avg - Filtered by Assigned Class Subjects
                const hwScoresRaw = s.homeworkScores || [];
                const hwScores = hwScoresRaw
                    .filter(i => currentSubjects.includes(i.subject))
                    .map(i => parseInt(i.score) || 0);

                const hwAvg = hwScores.length ? hwScores.reduce((a, b) => a + b, 0) / hwScores.length : 0;
                totalHomeworkScore += hwAvg;

                // Attendance
                totalAttendance += (parseInt(s.attendance) || 85);
            });

            const avgSubject = studentCount ? (totalSubjectScore / studentCount) : 0;
            const avgHomework = studentCount ? (totalHomeworkScore / studentCount) : 0;
            const avgAttendance = studentCount ? (totalAttendance / studentCount) : 0;

            // Class Score: Weighted Average of Subject, Homework, and Attendance
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

    // 3. Fetch Today's Attendance for Absent Count
    useEffect(() => {
        if (!assignedClass) return;

        const today = new Date().toISOString().split('T')[0];
        const q = query(
            collection(db, `schools/${user.schoolId}/attendance`),
            where('classId', '==', assignedClass.id),
            where('date', '==', today),
            orderBy('timestamp', 'desc'),
            limit(1)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            if (!snapshot.empty) {
                const data = snapshot.docs[0].data();
                const absents = data.records.filter(r => r.status === 'absent').length;
                setAbsentCount(absents);
            } else {
                setAbsentCount(0);
            }
        });

        return () => unsubscribe();
    }, [assignedClass, user.schoolId]);

    // Handlers
    const handleStudentSelect = (student) => {
        setSelectedStudent(student);

        // Dynamic Form Data Construction based on CURRENT Class Subjects
        // This ensures purely those subjects assigned by Principal appear
        const currentSubjects = assignedClass?.subjects || [];

        const constructScores = (existingScores = []) => {
            return currentSubjects.map(subject => {
                const found = existingScores.find(s => s.subject === subject);
                return found || { subject: subject, score: 0 };
            });
        };

        setFormData({
            academicScores: constructScores(student.academicScores),
            homeworkScores: constructScores(student.homeworkScores),
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

            // We overwrite the scores. 
            // Note: This removes data for subjects no longer assigned to the class.
            // This aligns with "if remove subjects it disappear from here".
            await updateDoc(studentRef, {
                academicScores: formData.academicScores,
                homeworkScores: formData.homeworkScores,
                wellness: formData.wellness,
                attendance: formData.attendance
            });

            // --- Notification Logic ---
            try {
                // 1. Analyze Scores
                const highScores = [
                    ...formData.academicScores.filter(s => s.score >= 80),
                    ...formData.homeworkScores.filter(s => s.score >= 80)
                ].map(s => s.subject);

                const lowScores = [
                    ...formData.academicScores.filter(s => s.score < 50),
                    ...formData.homeworkScores.filter(s => s.score < 50)
                ].map(s => s.subject);

                // 2. Construct Message
                let title = "Performance Update";
                let message = "";
                let type = "info";

                if (highScores.length > 0 && lowScores.length === 0) {
                    title = "🌟 Excellent Progress!";
                    message = `Great news! ${selectedStudent.name} is excelling in ${highScores.join(', ')}. Keep up the fantastic work!`;
                    type = "celebration";
                } else if (lowScores.length > 0 && highScores.length === 0) {
                    title = "🌱 Growth Opportunity";
                    message = `We noticed ${selectedStudent.name} is finding ${lowScores.join(', ')} a bit challenging. Let's work together to support their improvement.`;
                    type = "alert";
                } else if (highScores.length > 0 && lowScores.length > 0) {
                    title = "📊 Performance Update";
                    message = `${selectedStudent.name} is doing great in ${highScores.join(', ')}, but could use some extra support in ${lowScores.join(', ')}.`;
                    type = "info";
                } else {
                    title = "📝 Just Updated";
                    message = `A new performance report is available for ${selectedStudent.name}. Please check the app for the latest details.`;
                }

                // 3. Find Parent & Send
                const parentsQuery = query(
                    collection(db, `schools/${user.schoolId}/parents`),
                    where("children", "array-contains", selectedStudent.id)
                );
                const parentsSnap = await getDocs(parentsQuery);

                if (!parentsSnap.empty) {
                    const parentId = parentsSnap.docs[0].id;
                    await addDoc(collection(db, `schools/${user.schoolId}/notifications`), {
                        parentId: parentId,
                        studentId: selectedStudent.id,
                        studentName: selectedStudent.name,
                        title: title,
                        message: message,
                        type: type,
                        read: false,
                        createdAt: serverTimestamp()
                    });
                    console.log("Notification sent to parent:", parentId);
                } else {
                    console.log("No parent account found for this student.");
                }

            } catch (notifyError) {
                console.error("Failed to send notification:", notifyError);
                // Don't block the UI if notification fails
            }

            alert("Performance data saved & parent notified!");
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
                        background: 'var(--back-btn-bg)', border: 'none', color: 'var(--back-btn-text)',
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
                        {assignedClass?.name} • {students.length} Students • {absentCount} Absent Today {viewState === 'edit' && '• Editing'}
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
                            {/* Class Score */}
                            <div className="glass" style={{
                                padding: '1rem', borderRadius: '20px', display: 'flex', flexDirection: 'column',
                                alignItems: 'center', textAlign: 'center', background: 'var(--perf-bg-1)',
                                boxShadow: 'var(--perf-shadow)'
                            }}>
                                <div style={{ marginBottom: '0.5rem', color: 'var(--perf-icon-1)' }}><TrendingUp size={24} /></div>
                                <h3 style={{ fontSize: '1.5rem', fontWeight: '800', marginBottom: '0.1rem', color: 'var(--perf-title)' }}>{metrics.classScore}%</h3>
                                <p style={{ fontSize: '0.7rem', color: 'var(--perf-text)', fontWeight: '600' }}>Class Score</p>
                            </div>

                            {/* Subject Score */}
                            {/* Subject Score */}
                            <div className="glass" style={{
                                padding: '1rem', borderRadius: '20px', display: 'flex', flexDirection: 'column',
                                alignItems: 'center', textAlign: 'center', background: 'var(--perf-bg-2)',
                                boxShadow: 'var(--perf-shadow)'
                            }}>
                                <div style={{ marginBottom: '0.5rem', color: 'var(--perf-icon-2)' }}><BookOpen size={24} /></div>
                                <h3 style={{ fontSize: '1.5rem', fontWeight: '800', marginBottom: '0.1rem', color: 'var(--perf-title)' }}>{metrics.subjectScore}%</h3>
                                <p style={{ fontSize: '0.7rem', color: 'var(--perf-text)', fontWeight: '600' }}>Subject Score</p>
                            </div>

                            {/* Homework Score */}
                            {/* Homework Score */}
                            <div className="glass" style={{
                                padding: '1rem', borderRadius: '20px', display: 'flex', flexDirection: 'column',
                                alignItems: 'center', textAlign: 'center', background: 'var(--perf-bg-3)',
                                boxShadow: 'var(--perf-shadow)'
                            }}>
                                <div style={{ marginBottom: '0.5rem', color: 'var(--perf-icon-3)' }}><ClipboardList size={24} /></div>
                                <h3 style={{ fontSize: '1.5rem', fontWeight: '800', marginBottom: '0.1rem', color: 'var(--perf-title)' }}>{metrics.homeworkScore}%</h3>
                                <p style={{ fontSize: '0.7rem', color: 'var(--perf-text)', fontWeight: '600' }}>Homework Score</p>
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
                                <Trophy size={20} color="#10b981" /> Academic Results
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                {formData.academicScores.map((subj, idx) => {
                                    const isEditable = assignedSubjects.includes(subj.subject);
                                    return (
                                        <div key={idx} style={{ marginBottom: '1rem' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: '600' }}>
                                                <span style={{ color: 'var(--text-main)' }}>{subj.subject}</span>
                                                <span style={{ color: isEditable ? '#10b981' : 'var(--text-muted)' }}>{subj.score}%</span>
                                            </div>
                                            <input
                                                type="range"
                                                min="0" max="100"
                                                value={subj.score}
                                                disabled={!isEditable}
                                                onChange={(e) => {
                                                    const newScores = [...formData.academicScores];
                                                    newScores[idx].score = parseInt(e.target.value) || 0;
                                                    setFormData({ ...formData, academicScores: newScores });
                                                }}
                                                className="custom-slider"
                                                style={{
                                                    '--slider-color': '#10b981',
                                                    '--slider-value': `${subj.score}%`,
                                                    opacity: isEditable ? 1 : 0.4,
                                                    cursor: isEditable ? 'pointer' : 'not-allowed'
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
                                <ClipboardList size={20} color="#f59e0b" /> Homework Scores
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                {formData.homeworkScores.map((subj, idx) => {
                                    const isEditable = assignedSubjects.includes(subj.subject);
                                    return (
                                        <div key={idx} style={{ marginBottom: '1rem' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: '600' }}>
                                                <span style={{ color: 'var(--text-main)' }}>{subj.subject}</span>
                                                <span style={{ color: isEditable ? '#f59e0b' : 'var(--text-muted)' }}>{subj.score}%</span>
                                            </div>
                                            <input
                                                type="range"
                                                min="0" max="100"
                                                value={subj.score}
                                                disabled={!isEditable}
                                                onChange={(e) => {
                                                    const newScores = [...formData.homeworkScores];
                                                    newScores[idx].score = parseInt(e.target.value) || 0;
                                                    setFormData({ ...formData, homeworkScores: newScores });
                                                }}
                                                className="custom-slider"
                                                style={{
                                                    '--slider-color': '#f59e0b',
                                                    '--slider-value': `${subj.score}%`,
                                                    opacity: isEditable ? 1 : 0.4,
                                                    cursor: isEditable ? 'pointer' : 'not-allowed'
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
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '1rem', fontWeight: '700' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Attendance</span>
                                    <span style={{ color: '#34d399' }}>{formData.attendance}%</span>
                                </div>
                                <input
                                    type="range"
                                    min="0" max="100"
                                    value={formData.attendance}
                                    onChange={(e) => setFormData({ ...formData, attendance: parseInt(e.target.value) || 0 })}
                                    className="custom-slider"
                                    style={{
                                        '--slider-color': '#34d399',
                                        '--slider-track-color': '#ef4444',
                                        '--slider-value': `${formData.attendance}%`,
                                        cursor: 'pointer'
                                    }}
                                />
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
