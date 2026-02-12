import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Home, Clock, Bell, User, BarChart3, FileText, PlusCircle } from 'lucide-react';

const NavIcon = ({ icon: Icon, label, active, onClick }) => (
    <button
        onClick={onClick}
        className="btn-press"
        style={{
            background: 'none',
            border: 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '4px',
            color: active ? 'var(--nav-active)' : 'var(--nav-icon)',
            cursor: 'pointer',
            padding: '0.5rem',
            position: 'relative'
        }}
    >
        <Icon size={24} strokeWidth={active ? 2.5 : 2} />
        {active && (
            <motion.div
                layoutId="nav-pill"
                style={{
                    position: 'absolute',
                    bottom: '-6px',
                    width: '4px',
                    height: '4px',
                    borderRadius: '50%',
                    background: 'var(--nav-active)'
                }}
            />
        )}
    </button>
);

const BottomNav = ({ activeTab, setActiveTab }) => {
    const [isVisible, setIsVisible] = useState(true);
    const [lastScrollY, setLastScrollY] = useState(0);

    useEffect(() => {
        const handleScroll = () => {
            const container = document.querySelector('.app-container');
            if (!container) return;

            const currentScrollY = container.scrollTop;

            // Show if scrolling up OR near top
            if (currentScrollY < lastScrollY || currentScrollY < 50) {
                setIsVisible(true);
            } else if (currentScrollY > lastScrollY && currentScrollY > 50) {
                // Hide if scrolling down AND past initial offset
                setIsVisible(false);
            }

            setLastScrollY(currentScrollY);
        };

        const container = document.querySelector('.app-container');
        if (container) {
            container.addEventListener('scroll', handleScroll, { passive: true });
        }

        return () => {
            if (container) {
                container.removeEventListener('scroll', handleScroll);
            }
        };
    }, [lastScrollY]);

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.footer
                    initial={{ y: 100, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 100, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                    style={{
                        position: 'fixed',
                        bottom: '1.5rem', // Slightly higher for better aesthetics
                        left: '1rem',
                        right: '1rem',
                        height: '70px',
                        maxWidth: 'calc(500px - 2rem)',
                        margin: '0 auto',
                        borderRadius: '24px',
                        display: 'flex',
                        justifyContent: 'space-around',
                        alignItems: 'center',
                        padding: '0 0.5rem',
                        zIndex: 9999, // High z-index to stay on top
                        boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        background: 'var(--nav-bg)'
                    }}
                    className="glass"
                >
                    <NavIcon icon={Home} label="Home" active={activeTab === 'home'} onClick={() => setActiveTab('home')} />
                    <NavIcon icon={Clock} label="Classes" active={activeTab === 'classes'} onClick={() => setActiveTab('classes')} />

                    {/* Central "New Task" Button */}
                    <div style={{ position: 'relative', marginTop: '-35px' }}>
                        <button
                            onClick={() => setActiveTab('new-task')}
                            className="btn-press"
                            style={{
                                width: '64px',
                                height: '64px',
                                borderRadius: '50%',
                                background: 'linear-gradient(135deg, var(--primary), var(--secondary))',
                                border: '4px solid var(--bg-dark)', // Match app bg for "cutout" effect
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'white',
                                boxShadow: '0 8px 20px var(--primary-glow)',
                                cursor: 'pointer'
                            }}
                        >
                            <PlusCircle size={32} />
                        </button>
                    </div>

                    <NavIcon icon={BarChart3} label="Performance" active={activeTab === 'performance'} onClick={() => setActiveTab('performance')} />
                    <NavIcon icon={User} label="Profile" active={activeTab === 'profile'} onClick={() => setActiveTab('profile')} />
                </motion.footer>
            )}
        </AnimatePresence>
    );
};

export default BottomNav;
