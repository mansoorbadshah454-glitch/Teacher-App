import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db, storage } from '../firebase';
import { collection, query, onSnapshot, where, addDoc, serverTimestamp, updateDoc, doc, deleteDoc, limit } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { ChevronLeft, Search, Send, X, MessageCircle, User, Shield, Loader2, Reply, Trash2, CheckCircle2, Paperclip, FileText, Image as ImageIcon } from 'lucide-react';

const AdminMessages = ({ user, onBack }) => {
    // Data State
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    // Reply State
    const [replyingTo, setReplyingTo] = useState(null); // Message Object
    const [replyText, setReplyText] = useState('');
    const [sending, setSending] = useState(false);

    // Attachment State
    const [selectedFile, setSelectedFile] = useState(null);
    const fileInputRef = useRef(null);

    // 1. Fetch Messages (Dual Query: ID and Name)
    useEffect(() => {
        if (!user?.schoolId) return;

        setLoading(true);
        const schoolId = user.schoolId;
        const messagesMap = new Map();

        const updateMessages = () => {
            const list = Array.from(messagesMap.values());
            // Sort Newest First
            list.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
            setMessages(list);
            setLoading(false);
        };

        // Query 1: By ID (Preferred)
        let q1 = null;
        if (user.uid) {
            q1 = query(
                collection(db, `schools/${schoolId}/messages`),
                where("toId", "==", user.uid)
            );
        }

        // Query 2: By Name (Fallback)
        let q2 = null;
        if (user.name) {
            q2 = query(
                collection(db, `schools/${schoolId}/messages`),
                where("to", "==", user.name)
            );
        }

        const unsubscribers = [];

        if (q1) {
            const unsub1 = onSnapshot(q1, (snapshot) => {
                snapshot.docs.forEach(doc => {
                    messagesMap.set(doc.id, { id: doc.id, ...doc.data() });
                });
                updateMessages();
            });
            unsubscribers.push(unsub1);
        }

        if (q2) {
            const unsub2 = onSnapshot(q2, (snapshot) => {
                snapshot.docs.forEach(doc => {
                    messagesMap.set(doc.id, { id: doc.id, ...doc.data() });
                });
                updateMessages();
            });
            unsubscribers.push(unsub2);
        }

        return () => unsubscribers.forEach(unsub => unsub());
    }, [user]);

    // 2. Mark as Read when opening
    const handleMarkAsRead = async (msg) => {
        if (msg.read) return;
        try {
            const msgRef = doc(db, `schools/${user.schoolId}/messages`, msg.id);
            await updateDoc(msgRef, { read: true });
        } catch (err) {
            console.error("Error marking read:", err);
        }
    };

    // 3. Delete Message
    const handleDeleteMessage = async (msgId) => {
        console.log("Attempting to delete message:", msgId);
        if (!window.confirm("Are you sure you want to delete this message?")) return;

        // Optimistic Update: Remove from UI immediately
        setMessages(prevMessages => prevMessages.filter(msg => msg.id !== msgId));

        try {
            console.log("Deleting from path:", `schools/${user.schoolId}/messages/${msgId}`);
            await deleteDoc(doc(db, `schools/${user.schoolId}/messages`, msgId));
            console.log("Delete successful");
        } catch (error) {
            console.error("Error deleting message:", error);
            alert("Failed to delete message: " + error.message);
        }
    };

    // 4. Handle File Selection
    const handleFileSelect = (e) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            // Simple validation: check size < 5MB
            if (file.size > 5 * 1024 * 1024) {
                alert("File is too large. Max 5MB allowed.");
                return;
            }
            setSelectedFile(file);
        }
    };

    const handleSendReply = async () => {
        if ((!replyText.trim() && !selectedFile) || !replyingTo) return;

        setSending(true);
        try {
            let attachmentData = null;

            // Upload File if selected
            if (selectedFile) {
                const storageRef = ref(storage, `schools/${user.schoolId}/attachments/${Date.now()}_${selectedFile.name}`);
                const snapshot = await uploadBytes(storageRef, selectedFile);
                const downloadURL = await getDownloadURL(snapshot.ref);

                attachmentData = {
                    url: downloadURL,
                    name: selectedFile.name,
                    type: selectedFile.type,
                    size: selectedFile.size
                };
            }

            // Send Reply to Principal
            await addDoc(collection(db, `schools/${user.schoolId}/messages`), {
                to: 'principal',
                from: user.uid,
                fromName: user.name || 'Teacher',
                originalMessageId: replyingTo.id,
                originalMessageText: replyingTo.text || replyingTo.message || '',
                text: replyText.trim(),
                message: replyText.trim(),
                attachment: attachmentData, // Save attachment info
                timestamp: serverTimestamp(),
                read: false,
                type: 'teacher-reply'
            });

            // Update original message
            const originalRef = doc(db, `schools/${user.schoolId}/messages`, replyingTo.id);
            await updateDoc(originalRef, { hasReplied: true, lastReplyAt: serverTimestamp() });

            alert("Reply sent to Principal!");
            setReplyText('');
            setSelectedFile(null);
            setReplyingTo(null);
        } catch (error) {
            console.error("Error sending reply:", error);
            alert("Failed to send reply: " + error.message);
        } finally {
            setSending(false);
        }
    };

    // Filter Messages
    const filteredMessages = messages.filter(m =>
        m.text?.toLowerCase().includes(search.toLowerCase()) ||
        m.fromName?.toLowerCase().includes(search.toLowerCase())
    );

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <Loader2 className="animate-spin" color="var(--primary)" size={48} />
        </div>
    );

    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            style={{ display: 'flex', flexDirection: 'column', height: '100%', paddingBottom: '120px' }}
        >
            {/* Header */}
            <div style={{
                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', // Amber/Orange for Admin Msgs
                padding: '1.5rem',
                borderRadius: '0 0 24px 24px',
                marginBottom: '1.5rem',
                boxShadow: '0 10px 20px rgba(245, 158, 11, 0.2)',
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
                        <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: '800' }}>Admin Messages</h2>
                        <p style={{ margin: 0, opacity: 0.9, fontSize: '0.9rem' }}>Direct from Principal & Admin</p>
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
                        placeholder="Search messages..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        style={{
                            background: 'none', border: 'none', color: 'var(--text-main)',
                            padding: '0 0.8rem', outline: 'none', width: '100%', fontSize: '1rem'
                        }}
                    />
                    {search && <X size={18} color="var(--text-muted)" onClick={() => setSearch('')} style={{ cursor: 'pointer' }} />}
                </div>

                {/* Message List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {filteredMessages.map((msg, idx) => {
                        const isReplying = replyingTo?.id === msg.id;
                        const isRead = msg.read;

                        return (
                            <motion.div
                                key={msg.id}
                                layout
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.2, delay: idx * 0.05 }}
                                className="glass"
                                style={{
                                    padding: '0',
                                    borderRadius: '20px',
                                    overflow: 'hidden',
                                    border: isReplying ? '1px solid #f59e0b' : (isRead ? '1px solid var(--glass-border)' : '1px solid rgba(245, 158, 11, 0.5)'),
                                    background: isReplying ? 'rgba(245, 158, 11, 0.05)' : 'var(--card-bg)'
                                }}
                                onClick={() => !isRead && handleMarkAsRead(msg)}
                            >
                                {/* Card Header / Content */}
                                <div style={{ padding: '1.25rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <div style={{
                                                background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b',
                                                padding: '4px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '700',
                                                display: 'flex', alignItems: 'center', gap: '0.25rem'
                                            }}>
                                                <Shield size={12} />
                                                {msg.fromName || 'Principal'}
                                            </div>
                                            {!isRead && (
                                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444' }} />
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                {msg.timestamp ? new Date(msg.timestamp.toDate()).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Just now'}
                                            </span>
                                            {/* Delete Button */}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDeleteMessage(msg.id);
                                                }}
                                                style={{
                                                    background: 'rgba(255, 0, 0, 0.1)', // Slight bg to see hit area
                                                    border: 'none',
                                                    color: '#ef4444',
                                                    padding: '8px', // Larger padding
                                                    cursor: 'pointer',
                                                    opacity: 1, // Full opacity
                                                    borderRadius: '50%',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    zIndex: 10,
                                                    marginLeft: '8px'
                                                }}
                                                title="Delete Message"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>

                                    <p style={{
                                        color: 'var(--text-main)', fontSize: '0.95rem', lineHeight: '1.5',
                                        marginBottom: '1rem', whiteSpace: 'pre-wrap'
                                    }}>
                                        {msg.text || msg.message}
                                    </p>

                                    {msg.attachment && (
                                        <div style={{ marginBottom: '1rem' }}>
                                            <a
                                                href={msg.attachment.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                                                    padding: '0.5rem 1rem', borderRadius: '8px',
                                                    background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b',
                                                    textDecoration: 'none', fontSize: '0.85rem', fontWeight: '600'
                                                }}
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                {msg.attachment.type?.startsWith('image/') ? <ImageIcon size={16} /> : <FileText size={16} />}
                                                {msg.attachment.name}
                                            </a>
                                        </div>
                                    )}

                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            {msg.hasReplied && (
                                                <span style={{ fontSize: '0.8rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                                    <CheckCircle2 size={14} /> Replied
                                                </span>
                                            )}
                                        </div>

                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setReplyingTo(isReplying ? null : msg);
                                                setReplyText('');
                                                setSelectedFile(null);
                                            }}
                                            style={{
                                                background: 'transparent',
                                                border: '1px solid var(--glass-border)',
                                                borderRadius: '8px',
                                                padding: '0.4rem 0.8rem',
                                                color: '#f59e0b',
                                                fontSize: '0.85rem',
                                                fontWeight: '600',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.4rem'
                                            }}
                                        >
                                            <Reply size={16} />
                                            {isReplying ? 'Cancel' : 'Reply'}
                                        </button>
                                    </div>
                                </div>

                                {/* Reply Area */}
                                <AnimatePresence>
                                    {isReplying && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            style={{ borderTop: '1px solid var(--glass-border)', background: 'var(--bg-dark-lighter)' }}
                                            onClick={(e) => e.stopPropagation()} // Prevent closing on click
                                        >
                                            <div style={{ padding: '1.25rem' }}>
                                                <textarea
                                                    value={replyText}
                                                    onChange={(e) => setReplyText(e.target.value)}
                                                    placeholder="Write a reply to the principal..."
                                                    autoFocus
                                                    style={{
                                                        width: '100%', minHeight: '80px', borderRadius: '12px',
                                                        background: 'var(--input-bg)', border: '1px solid var(--glass-border)',
                                                        padding: '1rem', color: 'var(--text-main)', fontSize: '0.95rem',
                                                        marginBottom: '0.5rem', resize: 'none', outline: 'none'
                                                    }}
                                                />

                                                {/* Attachment Preview */}
                                                {selectedFile && (
                                                    <div style={{
                                                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                                                        background: 'rgba(245, 158, 11, 0.1)', padding: '0.5rem',
                                                        borderRadius: '8px', marginBottom: '1rem', fontSize: '0.85rem'
                                                    }}>
                                                        <FileText size={16} color="#f59e0b" />
                                                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            {selectedFile.name}
                                                        </span>
                                                        <X size={16} style={{ cursor: 'pointer' }} onClick={() => setSelectedFile(null)} />
                                                    </div>
                                                )}

                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    {/* Attach Button */}
                                                    <div style={{ flex: 1 }}>
                                                        <input
                                                            type="file"
                                                            ref={fileInputRef}
                                                            onChange={handleFileSelect}
                                                            style={{ display: 'none' }}
                                                            accept="image/*,application/pdf"
                                                        />
                                                        <button
                                                            onClick={() => fileInputRef.current.click()}
                                                            style={{
                                                                background: 'transparent', border: '1px solid var(--glass-border)',
                                                                borderRadius: '8px', padding: '0.4rem 0.6rem',
                                                                display: 'flex', alignItems: 'center', gap: '0.4rem',
                                                                cursor: 'pointer', color: 'var(--text-muted)'
                                                            }}
                                                        >
                                                            <Paperclip size={16} />
                                                            <span style={{ fontSize: '0.8rem' }}>Attach</span>
                                                        </button>
                                                    </div>

                                                    <button
                                                        onClick={handleSendReply}
                                                        disabled={sending || (!replyText.trim() && !selectedFile)}
                                                        style={{
                                                            padding: '0.6rem 1.5rem', borderRadius: '12px',
                                                            background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                                                            border: 'none', color: 'white', fontWeight: 'bold',
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                                                            cursor: (sending || (!replyText.trim() && !selectedFile)) ? 'not-allowed' : 'pointer',
                                                            opacity: (sending || (!replyText.trim() && !selectedFile)) ? 0.7 : 1
                                                        }}
                                                    >
                                                        {sending ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
                                                        Send Reply
                                                    </button>
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </motion.div>
                        );
                    })}

                    {filteredMessages.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                            <div style={{
                                width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(245, 158, 11, 0.1)',
                                margin: '0 auto 1rem', display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}>
                                <Shield size={30} color="#f59e0b" opacity={0.6} />
                            </div>
                            <p>No messages found from Admin</p>
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
};

export default AdminMessages;
