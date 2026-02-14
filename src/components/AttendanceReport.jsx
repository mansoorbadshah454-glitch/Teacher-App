import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { db } from '../firebase';
import { collection, query, getDocs, where, orderBy } from 'firebase/firestore';
import { ChevronLeft, Download, FileText, Loader2, Calendar } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const AttendanceReport = ({ user, onBack }) => {
    const [loading, setLoading] = useState(false);
    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
    const [assignedClass, setAssignedClass] = useState(null);
    const [teacherName, setTeacherName] = useState('');

    // Fetch Class & Teacher Info
    useEffect(() => {
        const fetchClass = async () => {
            try {
                // 1. Get Teacher Name
                const teachersQuery = query(
                    collection(db, `schools/${user.schoolId}/teachers`),
                    where("email", "==", user.email)
                );
                const teacherSnap = await getDocs(teachersQuery);
                let currentTeacherName = '';

                if (!teacherSnap.empty) {
                    currentTeacherName = teacherSnap.docs[0].data().name;
                    setTeacherName(currentTeacherName);
                }

                // 2. Get Assigned Class
                const classesQuery = query(collection(db, `schools/${user.schoolId}/classes`));
                const classSnap = await getDocs(classesQuery);
                let foundClass = null;

                classSnap.forEach(doc => {
                    const data = doc.data();
                    if (data.teacher === currentTeacherName) {
                        foundClass = { id: doc.id, ...data };
                    }
                });

                if (foundClass) {
                    setAssignedClass(foundClass);
                }
            } catch (err) {
                console.error("Error fetching class info:", err);
            }
        };
        fetchClass();
    }, [user]);

    const handleDownloadPDF = async () => {
        if (!assignedClass) return;
        setLoading(true);

        try {
            // 1. Fetch Students
            const studentsRef = collection(db, `schools/${user.schoolId}/classes/${assignedClass.id}/students`);
            const qStudents = query(studentsRef, orderBy('rollNo'));
            const studentSnap = await getDocs(qStudents);

            const students = studentSnap.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                absentCount: 0
            }));

            // 2. Fetch Attendance for Selected Month
            // OPTIMIZATION: Fetch all class attendance and filter in memory to avoid "Composite Index" requirement
            // valid for typical class sizes (30-50 students * 200 days = ~10k docs max, typically much less per session)
            const attendanceRef = collection(db, `schools/${user.schoolId}/attendance`);
            const qAttendance = query(
                attendanceRef,
                where('classId', '==', assignedClass.id)
            );

            const attendanceSnap = await getDocs(qAttendance);
            const [year, month] = selectedMonth.split('-');

            // 3. Calculate Absent Counts
            attendanceSnap.forEach(doc => {
                const data = doc.data();

                // Client-side Date Filter
                if (!data.date.startsWith(selectedMonth)) return;

                if (data.records && Array.isArray(data.records)) {
                    data.records.forEach(record => {
                        if (record.status === 'absent') {
                            const student = students.find(s => s.id === record.id);
                            if (student) {
                                student.absentCount += 1;
                            }
                        }
                    });
                }
            });

            // 4. Sort by Absent Count (Low to High)
            students.sort((a, b) => a.absentCount - b.absentCount);

            // 5. Generate PDF
            const doc = new jsPDF();

            // -- Header Visualization --
            // Clean "Prime" Header Background
            doc.setFillColor(67, 56, 202); // Deep Indigo (Professional)
            doc.rect(0, 0, 210, 35, 'F'); // Slightly shorter, cleaner header

            // -- Header Text --
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(20);
            doc.setFont('helvetica', 'bold');
            doc.text("Attendance Report", 105, 18, { align: 'center' });

            doc.setFontSize(11);
            doc.setFont('helvetica', 'normal');
            const dateObj = new Date(selectedMonth + '-01');
            const monthName = dateObj.toLocaleString('default', { month: 'long', year: 'numeric' });
            doc.text(`${monthName}`, 105, 26, { align: 'center' });

            // -- Meta Info Box --
            doc.setTextColor(50, 50, 50);
            doc.setFontSize(10);

            // Left Side
            doc.setFont('helvetica', 'bold');
            doc.text(`Class: ${assignedClass.name}`, 14, 50);

            doc.setFont('helvetica', 'normal');
            doc.text(`Total Students: ${students.length}`, 14, 56);
            doc.text(`Teacher: ${teacherName}`, 14, 62);

            // Right Side
            doc.text(`Generated: ${new Date().toLocaleDateString()}`, 196, 50, { align: 'right' });

            // -- Table --
            autoTable(doc, {
                startY: 70,
                head: [['Roll No', 'Student Name', 'Total Absent Days']],
                body: students.map(s => [
                    s.rollNo || '-',
                    s.name,
                    s.absentCount
                ]),
                theme: 'grid',
                headStyles: {
                    fillColor: [99, 102, 241],
                    textColor: 255,
                    fontStyle: 'bold',
                    halign: 'center'
                },
                styles: {
                    fontSize: 10,
                    cellPadding: 3,
                    valign: 'middle'
                },
                columnStyles: {
                    0: { halign: 'center', cellWidth: 30 },
                    2: { halign: 'center', cellWidth: 40, textColor: [239, 68, 68], fontStyle: 'bold' }
                },
                alternateRowStyles: {
                    fillColor: [249, 250, 251]
                }
            });

            // Footer
            const pageCount = doc.internal.getNumberOfPages();
            doc.setFontSize(8);
            doc.setTextColor(150);
            for (let i = 1; i <= pageCount; i++) {
                doc.setPage(i);
                doc.text('Generated by School Management System', 14, 285);
                doc.text(`Page ${i} of ${pageCount}`, 180, 285);
            }

            doc.save(`Attendance_Report_${assignedClass.name}_${monthName}.pdf`);

            alert("PDF Downloaded Successfully!");

        } catch (error) {
            console.error("Error generating PDF:", error);
            alert("Failed to generate PDF: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    if (!assignedClass) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', flexDirection: 'column', gap: '1rem' }}>
            <Loader2 className="animate-spin" color="var(--primary)" size={32} />
            <p style={{ color: 'var(--text-muted)' }}>Loading Class Info...</p>
        </div>
    );

    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            style={{ padding: '1.5rem', height: '100%', display: 'flex', flexDirection: 'column' }}
        >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
                <button
                    onClick={onBack}
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
                    <h2 style={{ fontSize: '1.5rem', fontWeight: '800' }}>Attendance Report</h2>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Download monthly summary</p>
                </div>
            </div>

            {/* Main Card */}
            <div className="glass" style={{
                padding: '3rem 2rem',
                borderRadius: '32px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '2rem',
                textAlign: 'center',
                maxWidth: '500px',
                margin: 'auto',
                width: '100%'
            }}>
                <div style={{
                    width: '100px',
                    height: '100px',
                    borderRadius: '50%',
                    background: 'rgba(99, 102, 241, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: '1rem'
                }}>
                    <FileText size={48} color="var(--primary)" />
                </div>

                <div style={{ width: '100%' }}>
                    <label style={{ display: 'block', textAlign: 'left', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: '600' }}>
                        Select Month
                    </label>
                    <div style={{ position: 'relative' }}>
                        <input
                            type="month"
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '1rem',
                                borderRadius: '16px',
                                border: '2px solid rgba(99, 102, 241, 0.2)', // Light Indigo Border
                                background: '#ffffff', // White Background
                                color: '#4f46e5', // Indigo Text
                                fontSize: '1.1rem',
                                fontWeight: '600',
                                outline: 'none',
                                cursor: 'pointer',
                                colorScheme: 'light', // Force Light Theme for Picker
                                transition: 'all 0.2s ease',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
                            }}
                        />
                        <Calendar size={20} style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#6366f1' }} />
                    </div>
                </div>

                <button
                    onClick={handleDownloadPDF}
                    disabled={loading}
                    className="btn-press animate-pulse-glow"
                    style={{
                        width: '100%',
                        padding: '1.25rem',
                        borderRadius: '20px',
                        border: 'none',
                        background: 'var(--primary)',
                        color: 'white',
                        fontSize: '1.1rem',
                        fontWeight: '800',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.75rem',
                        cursor: loading ? 'wait' : 'pointer',
                        marginTop: '1rem',
                        boxShadow: '0 10px 30px var(--primary-glow)'
                    }}
                >
                    {loading ? <Loader2 className="animate-spin" size={24} /> : <Download size={24} />}
                    {loading ? 'GENERATING PDF...' : 'DOWNLOAD REPORT'}
                </button>

                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                    This will generate a PDF report for <strong>{assignedClass.name}</strong> containing absence records sorted from lowest to highest.
                </p>
            </div>

        </motion.div>
    );
};

export default AttendanceReport;
