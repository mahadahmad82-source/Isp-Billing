import React, { useRef } from 'react';
import { motion, useScroll, useTransform, useSpring } from 'motion/react';

const VideoBackground: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll();
  
  // Smooth out the scroll progress
  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 60,
    damping: 25,
    restDelta: 0.001
  });

  // Parallax and movement effects
  // Increased movement range for a more "scroll animated" feel
  const y = useTransform(smoothProgress, [0, 1], ['-10%', '10%']);
  const rotate = useTransform(smoothProgress, [0, 1], [0, 30]);
  const scale = useTransform(smoothProgress, [0, 0.5, 1], [1.1, 1.3, 1.1]);
  const opacity = useTransform(smoothProgress, [0, 0.1, 0.9, 1], [0.5, 0.7, 0.7, 0.4]);

  return (
    <div 
      ref={containerRef}
      className="fixed inset-0 w-full h-full pointer-events-none overflow-hidden z-0 flex items-center justify-center"
      style={{ background: 'transparent' }}
    >
      <motion.div
        style={{
          y,
          rotate,
          scale,
          opacity,
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div className="relative w-full h-full flex items-center justify-center">
          <video
            autoPlay
            loop
            muted
            playsInline
            className="w-full h-full object-contain"
            style={{
              // Professional dark theme adjustments:
              // 1. Invert colors (White background -> Black)
              // 2. Hue-rotate to keep blue tones
              // 3. Contrast boost to ensure the black is pure black
              filter: 'invert(1) hue-rotate(180deg) contrast(1.8) brightness(0.9) saturate(1.5)',
              mixBlendMode: 'screen',
              maxWidth: '100vh',
              maxHeight: '100vh',
              // CRITICAL: Radial mask to remove the square box edges
              WebkitMaskImage: 'radial-gradient(circle, black 35%, transparent 65%)',
              maskImage: 'radial-gradient(circle, black 35%, transparent 65%)',
            }}
          >
            <source src="/globe_bg.mp4" type="video/mp4" />
          </video>
          
          {/* Extra glow layer to make it feel 3D and integrated */}
          <div 
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'radial-gradient(circle at center, rgba(99, 102, 241, 0.15) 0%, transparent 60%)',
              mixBlendMode: 'plus-lighter'
            }}
          />
        </div>
      </motion.div>
      
      {/* Background Vignette to merge with the page */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(circle at center, transparent 20%, #020617 85%)',
          opacity: 0.8
        }}
      />
    </div>
  );
};

export default VideoBackground;
