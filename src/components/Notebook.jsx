import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, Save, X, Calendar, Clock, Loader2, StickyNote } from 'lucide-react';
import { db } from '../firebase';
import { collection, addDoc, query, where, orderBy, onSnapshot, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';

const Notebook = ({ user, onBack }) => {
    console.log("Notebook Render: user =", user?.uid);
    const [notes, setNotes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [newNote, setNewNote] = useState({ title: '', description: '' });
    const [saving, setSaving] = useState(false);

    // Auto-delete logic: 7 days in milliseconds
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

    useEffect(() => {
        if (!user || !user.schoolId || !user.uid) {
            console.warn("Notebook: Missing user data", user);
            setLoading(false);
            return;
        }

        const q = query(
            collection(db, `schools/${user.schoolId}/teachers/${user.uid}/notes`),
            orderBy('timestamp', 'desc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedNotes = [];
            const now = Date.now();

            snapshot.docs.forEach(async (docSnapshot) => {
                const data = docSnapshot.data();
                const noteTime = data.timestamp ? data.timestamp.toMillis() : now; // Handle pending writes or missing timestamps safely

                // Check if older than 7 days
                if (now - noteTime > SEVEN_DAYS_MS) {
                    // Auto-delete
                    try {
                        await deleteDoc(doc(db, `schools/${user.schoolId}/teachers/${user.uid}/notes`, docSnapshot.id));
                        console.log(`Auto-deleted old note: ${docSnapshot.id}`);
                    } catch (err) {
                        console.error("Failed to auto-delete note:", err);
                    }
                } else {
                    fetchedNotes.push({ id: docSnapshot.id, ...data });
                }
            });

            setNotes(fetchedNotes);
            setLoading(false);
        }, (error) => {
            console.error("Notebook: Snapshot error", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user]);

    const handleSave = async () => {
        if (!newNote.title.trim() || !newNote.description.trim()) return;

        setSaving(true);
        try {
            const path = `schools/${user.schoolId}/teachers/${user.uid}/notes`;
            console.log("Attempting to save note to:", path);
            await addDoc(collection(db, path), {
                title: newNote.title,
                description: newNote.description,
                timestamp: serverTimestamp(),
                color: getRandomColor()
            });
            setNewNote({ title: '', description: '' });
            setIsCreating(false);
        } catch (error) {
            console.error("Error saving note:", error);
            alert("Failed to save note. Please try again.");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (noteId) => {
        if (!window.confirm("Delete this note?")) return;
        try {
            await deleteDoc(doc(db, `schools/${user.schoolId}/teachers/${user.uid}/notes`, noteId));
        } catch (error) {
            console.error("Error deleting note:", error);
            alert("Failed to delete note.");
        }
    };

    const getRandomColor = () => {
        const colors = [
            'linear-gradient(135deg, #fbc2eb 0%, #a6c1ee 100%)', // Soft Pink-Blue
            'linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)', // Purple-Blue
            'linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)', // Green-Blue
            'linear-gradient(135deg, #fccb90 0%, #d57eeb 100%)', // Orange-Purple
            'linear-gradient(135deg, #e2ebf0 0%, #cfd9df 100%)'  // Silver
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    };

    return (
        <div style={{ paddingBottom: '100px', minHeight: '100vh' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <button
                        onClick={onBack}
                        style={{
                            background: 'var(--card-bg)',
                            border: '1px solid var(--glass-border)',
                            width: '40px',
                            height: '40px',
                            borderRadius: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--text-main)',
                            cursor: 'pointer'
                        }}
                    >
                        <X size={20} />
                    </button>
                    <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 'bold' }}>My Notebook</h2>
                </div>

                <button
                    onClick={() => setIsCreating(true)}
                    className="btn-press"
                    style={{
                        background: 'var(--primary)',
                        color: 'white',
                        border: 'none',
                        width: '45px',
                        height: '45px',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 4px 12px rgba(99, 102, 241, 0.4)',
                        cursor: 'pointer'
                    }}
                >
                    <Plus size={24} />
                </button>
            </div>

            {/* Create Note Modal/Overlay */}
            <AnimatePresence>
                {isCreating && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="glass"
                        style={{
                            padding: '1.5rem',
                            borderRadius: '24px',
                            marginBottom: '2rem',
                            border: '1px solid var(--primary)',
                            boxShadow: '0 10px 40px -10px rgba(99, 102, 241, 0.2)'
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <StickyNote size={18} color="var(--primary)" /> New Note
                            </h3>
                            <button onClick={() => setIsCreating(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                                <X size={20} />
                            </button>
                        </div>

                        <input
                            type="text"
                            placeholder="Title (e.g., Lesson Plan 5A)"
                            value={newNote.title}
                            onChange={(e) => setNewNote({ ...newNote, title: e.target.value })}
                            style={{
                                width: '100%',
                                padding: '1rem',
                                borderRadius: '12px',
                                border: '1px solid var(--glass-border)',
                                background: 'rgba(255,255,255,0.05)',
                                color: 'var(--text-main)',
                                marginBottom: '1rem',
                                fontSize: '1rem',
                                outline: 'none',
                                fontWeight: '600'
                            }}
                        />

                        <textarea
                            placeholder="Write your note here..."
                            value={newNote.description}
                            onChange={(e) => setNewNote({ ...newNote, description: e.target.value })}
                            style={{
                                width: '100%',
                                minHeight: '120px',
                                padding: '1rem',
                                borderRadius: '12px',
                                border: '1px solid var(--glass-border)',
                                background: 'rgba(255,255,255,0.05)',
                                color: 'var(--text-main)',
                                marginBottom: '1rem',
                                fontSize: '0.95rem',
                                outline: 'none',
                                resize: 'none',
                                fontFamily: 'inherit',
                                lineHeight: '1.6'
                            }}
                        />

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                            <button
                                onClick={() => setIsCreating(false)}
                                style={{
                                    padding: '0.8rem 1.5rem',
                                    borderRadius: '12px',
                                    background: 'transparent',
                                    border: '1px solid var(--glass-border)',
                                    color: 'var(--text-muted)',
                                    cursor: 'pointer',
                                    fontWeight: '600'
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={saving || !newNote.title || !newNote.description}
                                className="btn-press"
                                style={{
                                    padding: '0.8rem 2rem',
                                    borderRadius: '12px',
                                    background: 'var(--primary)',
                                    border: 'none',
                                    color: 'white',
                                    cursor: 'pointer',
                                    fontWeight: 'bold',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    opacity: (saving || !newNote.title || !newNote.description) ? 0.5 : 1
                                }}
                            >
                                {saving ? <Loader2 className="animate-spin" size={18} /> : <><Save size={18} /> Save Note</>}
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Notes Grid */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '3rem' }}>
                    <Loader2 className="animate-spin" color="var(--primary)" size={32} style={{ margin: '0 auto' }} />
                </div>
            ) : notes.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '4rem 2rem', opacity: 0.6 }}>
                    <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
                        <StickyNote size={32} />
                    </div>
                    <h3>No notes yet</h3>
                    <p style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>Tap the + button to create a new note.</p>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem' }}>
                    <AnimatePresence>
                        {notes.map((note) => (
                            <motion.div
                                key={note.id}
                                layout
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                className="glass"
                                style={{
                                    padding: '0',
                                    borderRadius: '20px',
                                    overflow: 'hidden',
                                    position: 'relative',
                                    display: 'flex',
                                    flexDirection: 'column'
                                }}
                            >
                                {/* Color Header */}
                                <div style={{ height: '6px', background: note.color || 'var(--primary)', width: '100%' }} />

                                <div style={{ padding: '1.5rem', flex: 1, display: 'flex', flexDirection: 'column' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.8rem' }}>
                                        <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', lineHeight: '1.3', color: 'var(--text-main)' }}>{note.title}</h3>
                                        <button
                                            onClick={() => handleDelete(note.id)}
                                            style={{
                                                background: 'rgba(239, 68, 68, 0.1)',
                                                border: 'none',
                                                borderRadius: '8px',
                                                padding: '6px',
                                                cursor: 'pointer',
                                                color: '#ef4444',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center'
                                            }}
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>

                                    <p style={{
                                        fontSize: '0.9rem',
                                        lineHeight: '1.6',
                                        color: 'var(--text-muted)',
                                        whiteSpace: 'pre-wrap',
                                        flex: 1,
                                        marginBottom: '1.5rem'
                                    }}>
                                        {note.description}
                                    </p>

                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        fontSize: '0.75rem',
                                        color: 'var(--text-muted)',
                                        marginTop: 'auto',
                                        paddingTop: '1rem',
                                        borderTop: '1px solid var(--glass-border)'
                                    }}>
                                        <Clock size={12} />
                                        <span>
                                            {note.timestamp ? new Date(note.timestamp.toDate()).toLocaleDateString() : 'Just now'}
                                            {' • '}
                                            {note.timestamp ? new Date(note.timestamp.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                        </span>
                                        <span style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px' }}>
                                            Auto-delete in 7d
                                        </span>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            )}
        </div>
    );
};

export default Notebook;
