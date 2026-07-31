import React, { useRef } from 'react';
import { motion, useScroll, useTransform, useSpring } from 'motion/react';

const VideoBackground: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll();
  
  // Smooth out the scroll progress
  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001
  });

  // Parallax and movement effects
  const y = useTransform(smoothProgress, [0, 1], ['0%', '20%']);
  const rotate = useTransform(smoothProgress, [0, 1], [0, 45]);
  const scale = useTransform(smoothProgress, [0, 0.5, 1], [1, 1.2, 0.9]);
  const opacity = useTransform(smoothProgress, [0, 0.1, 0.9, 1], [0.6, 0.8, 0.8, 0.4]);

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
        <video
          autoPlay
          loop
          muted
          playsInline
          className="w-full h-full object-contain"
          style={{
            // Professional dark theme adjustments:
            // 1. Invert colors (White background -> Black)
            // 2. Hue-rotate 180deg to restore original blue tones (roughly)
            // 3. Contrast boost to make the rivers pop
            // 4. Brightness adjustment for subtle background look
            filter: 'invert(1) hue-rotate(180deg) contrast(1.5) brightness(0.8) saturate(1.2)',
            mixBlendMode: 'screen', // Ensures it blends nicely with dark backgrounds
            maxWidth: '120vh',
            maxHeight: '120vh',
          }}
        >
          <source src="/globe_bg.mp4" type="video/mp4" />
        </video>
      </motion.div>
      
      {/* Subtle vignette overlay to integrate with dark theme */}
      <div className="absolute inset-0 bg-radial-gradient from-transparent via-transparent to-black opacity-60" />
    </div>
  );
};

export default VideoBackground;
