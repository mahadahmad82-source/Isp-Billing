import React, { useRef } from 'react';
import { motion, useScroll, useTransform, useSpring } from 'motion/react';

const VideoBackground: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll();
  
  // Ultra-smooth scroll response
  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 40,
    damping: 20,
    restDelta: 0.001
  });

  // Dynamic parallax values
  const y = useTransform(smoothProgress, [0, 1], ['-15%', '15%']);
  const rotate = useTransform(smoothProgress, [0, 1], [0, 25]);
  const scale = useTransform(smoothProgress, [0, 0.5, 1], [1.2, 1.4, 1.2]);
  const opacity = useTransform(smoothProgress, [0, 0.2, 0.8, 1], [0.4, 0.7, 0.7, 0.3]);
  const blur = useTransform(smoothProgress, [0, 0.1, 0.9, 1], ['blur(0px)', 'blur(0px)', 'blur(0px)', 'blur(4px)']);

  return (
    <div 
      ref={containerRef}
      className="fixed inset-0 w-full h-full pointer-events-none overflow-hidden z-0 flex items-center justify-center bg-[#020617]"
    >
      <motion.div
        style={{
          y,
          rotate,
          scale,
          opacity,
          filter: blur,
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div className="relative w-[120vh] h-[120vh] flex items-center justify-center">
          {/* The Globe Video */}
          <video
            autoPlay
            loop
            muted
            playsInline
            className="w-full h-full object-contain"
            style={{
              // Enhanced filters for deep integration
              filter: 'invert(1) hue-rotate(190deg) contrast(2) brightness(0.85) saturate(1.8)',
              mixBlendMode: 'screen',
              // Ultra-smooth radial mask to eliminate any edge artifacts
              WebkitMaskImage: 'radial-gradient(circle at center, rgba(0,0,0,1) 20%, rgba(0,0,0,0.8) 40%, rgba(0,0,0,0) 70%)',
              maskImage: 'radial-gradient(circle at center, rgba(0,0,0,1) 20%, rgba(0,0,0,0.8) 40%, rgba(0,0,0,0) 70%)',
            }}
          >
            <source src="/globe_bg.mp4" type="video/mp4" />
          </video>
          
          {/* Atmospheric Glow - makes it look like it belongs in the dark theme */}
          <div 
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'radial-gradient(circle at center, rgba(79, 70, 229, 0.2) 0%, rgba(99, 102, 241, 0.05) 40%, transparent 70%)',
              mixBlendMode: 'plus-lighter',
              transform: 'scale(1.2)'
            }}
          />
        </div>
      </motion.div>
      
      {/* Global Vignette to ensure seamless transition to the rest of the page */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(circle at center, transparent 30%, #020617 90%)',
          opacity: 0.9
        }}
      />
    </div>
  );
};

export default VideoBackground;
