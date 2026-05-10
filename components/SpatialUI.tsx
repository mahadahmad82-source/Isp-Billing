import React, { useRef, useState } from 'react';
import { motion, useSpring, useTransform } from 'motion/react';

interface TiltCardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  intensity?: number;
}

export const TiltCard: React.FC<TiltCardProps> = ({
  children,
  className = '',
  onClick,
  intensity = 12,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  const x = useSpring(0, { stiffness: 400, damping: 30 });
  const y = useSpring(0, { stiffness: 400, damping: 30 });
  const scale = useSpring(1, { stiffness: 400, damping: 30 });

  const rotateX = useTransform(y, [-0.5, 0.5], [intensity, -intensity]);
  const rotateY = useTransform(x, [-0.5, 0.5], [-intensity, intensity]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / rect.width - 0.5;
    const my = (e.clientY - rect.top) / rect.height - 0.5;
    x.set(mx);
    y.set(my);
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
    scale.set(1.03);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    x.set(0);
    y.set(0);
    scale.set(1);
  };

  return (
    <motion.div
      ref={ref}
      onClick={onClick}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        rotateX,
        rotateY,
        scale,
        transformStyle: 'preserve-3d',
        willChange: 'transform',
      }}
      className={`cursor-pointer relative ${className}`}
    >
      {/* Glare overlay */}
      <motion.div
        className="absolute inset-0 rounded-[2rem] pointer-events-none z-10"
        style={{
          background: isHovered
            ? 'radial-gradient(circle at 50% 0%, rgba(255,255,255,0.08) 0%, transparent 60%)'
            : 'none',
          opacity: isHovered ? 1 : 0,
          transition: 'opacity 0.3s ease',
        }}
      />
      {/* Bottom shadow for depth */}
      <motion.div
        className="absolute -bottom-2 left-4 right-4 h-8 rounded-[2rem] pointer-events-none"
        style={{
          background: 'rgba(0,0,0,0.3)',
          filter: 'blur(12px)',
          opacity: isHovered ? 0.6 : 0.2,
          transform: 'translateZ(-20px)',
          transition: 'opacity 0.3s ease',
        }}
      />
      {children}
    </motion.div>
  );
};

// Floating animation for nav icons
export const FloatingIcon: React.FC<{ children: React.ReactNode; delay?: number }> = ({
  children,
  delay = 0,
}) => (
  <motion.div
    animate={{ y: [0, -4, 0] }}
    transition={{
      duration: 2.5,
      repeat: Infinity,
      ease: 'easeInOut',
      delay,
    }}
    style={{ willChange: 'transform' }}
  >
    {children}
  </motion.div>
);

// Push button effect
export const PushButton: React.FC<{
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  style?: React.CSSProperties;
  title?: string;
  disabled?: boolean;
}> = ({ children, className, onClick, style, title, disabled }) => (
  <motion.button
    onClick={onClick}
    style={style}
    title={title}
    disabled={disabled}
    whileTap={{ scale: 0.94, y: 2 }}
    whileHover={{ scale: 1.03 }}
    transition={{ type: 'spring', stiffness: 500, damping: 25 }}
    className={className}
  >
    {children}
  </motion.button>
);

// Page transition wrapper
export const PageTransition: React.FC<{ children: React.ReactNode; tabKey: string }> = ({
  children,
  tabKey,
}) => (
  <motion.div
    key={tabKey}
    initial={{ opacity: 0, y: 12, scale: 0.99 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    exit={{ opacity: 0, y: -8, scale: 0.99 }}
    transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
    style={{ willChange: 'transform, opacity' }}
  >
    {children}
  </motion.div>
);

// Mesh gradient background (reacts to scroll)
export const MeshBackground: React.FC = () => (
  <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
    <motion.div
      animate={{
        backgroundPosition: ['0% 0%', '100% 100%', '0% 0%'],
      }}
      transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
      style={{
        position: 'absolute',
        inset: 0,
        backgroundImage: `
          radial-gradient(ellipse at 20% 20%, rgba(99,102,241,0.06) 0%, transparent 50%),
          radial-gradient(ellipse at 80% 80%, rgba(139,92,246,0.05) 0%, transparent 50%),
          radial-gradient(ellipse at 50% 50%, rgba(16,185,129,0.03) 0%, transparent 60%)
        `,
        backgroundSize: '200% 200%',
        willChange: 'background-position',
      }}
    />
  </div>
);
