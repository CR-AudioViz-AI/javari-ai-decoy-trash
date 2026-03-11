```tsx
'use client';

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Text, Html, Float, Sparkles, Trail } from '@react-three/drei';
import { motion, AnimatePresence, useMotionValue, useSpring } from 'framer-motion';
import * as THREE from 'three';
import { create } from 'zustand';
import { cn } from '@/lib/utils';

// Types and Interfaces
interface HolographicInterfaceProps {
  children?: React.ReactNode;
  className?: string;
  environmentLighting?: number;
  gestureEnabled?: boolean;
  adaptiveTransparency?: boolean;
  particleCount?: number;
  onGesture?: (gesture: GestureType) => void;
  onEnvironmentChange?: (lighting: number) => void;
  'aria-label'?: string;
}

interface HolographicMenuProps {
  items: MenuItem[];
  position?: [number, number, number];
  rotation?: [number, number, number];
  onItemSelect?: (item: MenuItem) => void;
  className?: string;
  isOpen?: boolean;
}

interface HolographicButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  glowIntensity?: number;
  className?: string;
  disabled?: boolean;
  'aria-label'?: string;
}

interface HolographicPanelProps {
  children: React.ReactNode;
  width?: number;
  height?: number;
  opacity?: number;
  edgeLighting?: boolean;
  className?: string;
  'aria-labelledby'?: string;
}

interface HolographicTextProps {
  children: string;
  size?: number;
  color?: string;
  glowIntensity?: number;
  depth?: number;
  className?: string;
}

interface MenuItem {
  id: string;
  label: string;
  icon?: string;
  action?: () => void;
  submenu?: MenuItem[];
}

type GestureType = 'swipe_left' | 'swipe_right' | 'pinch' | 'point' | 'grab' | 'wave';

interface HolographicState {
  isActive: boolean;
  currentGesture: GestureType | null;
  environmentLighting: number;
  transparency: number;
  particleVelocity: [number, number, number];
  menuState: {
    isOpen: boolean;
    activeMenu: string | null;
    depth: number;
  };
  setActive: (active: boolean) => void;
  setGesture: (gesture: GestureType | null) => void;
  setEnvironmentLighting: (lighting: number) => void;
  setTransparency: (transparency: number) => void;
  setParticleVelocity: (velocity: [number, number, number]) => void;
  toggleMenu: (menuId?: string) => void;
  setMenuDepth: (depth: number) => void;
}

// Zustand Store
const useHolographicStore = create<HolographicState>((set, get) => ({
  isActive: false,
  currentGesture: null,
  environmentLighting: 0.5,
  transparency: 0.8,
  particleVelocity: [0, 0.01, 0],
  menuState: {
    isOpen: false,
    activeMenu: null,
    depth: 0,
  },
  setActive: (active) => set({ isActive: active }),
  setGesture: (gesture) => set({ currentGesture: gesture }),
  setEnvironmentLighting: (lighting) => {
    set({ environmentLighting: lighting });
    // Auto-adjust transparency based on lighting
    const transparency = Math.max(0.3, Math.min(0.9, 1 - lighting * 0.6));
    set({ transparency });
  },
  setTransparency: (transparency) => set({ transparency }),
  setParticleVelocity: (velocity) => set({ particleVelocity: velocity }),
  toggleMenu: (menuId) => {
    const { menuState } = get();
    set({
      menuState: {
        ...menuState,
        isOpen: !menuState.isOpen,
        activeMenu: menuId || null,
      },
    });
  },
  setMenuDepth: (depth) => {
    const { menuState } = get();
    set({
      menuState: {
        ...menuState,
        depth,
      },
    });
  },
}));

// Particle System Component
const ParticleSystem: React.FC<{ count: number }> = ({ count = 100 }) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const { particleVelocity, environmentLighting } = useHolographicStore();
  
  const particles = useMemo(() => {
    const temp = new Array(count).fill(0).map(() => ({
      position: [
        (Math.random() - 0.5) * 20,
        (Math.random() - 0.5) * 20,
        (Math.random() - 0.5) * 20,
      ] as [number, number, number],
      velocity: [
        (Math.random() - 0.5) * 0.02,
        (Math.random() - 0.5) * 0.02,
        (Math.random() - 0.5) * 0.02,
      ] as [number, number, number],
    }));
    return temp;
  }, [count]);

  useFrame((state, delta) => {
    if (!meshRef.current) return;

    const dummy = new THREE.Object3D();
    particles.forEach((particle, i) => {
      particle.position[0] += particle.velocity[0] + particleVelocity[0];
      particle.position[1] += particle.velocity[1] + particleVelocity[1];
      particle.position[2] += particle.velocity[2] + particleVelocity[2];

      // Boundary wrapping
      particle.position.forEach((pos, axis) => {
        if (Math.abs(pos) > 10) {
          particle.position[axis] = (Math.random() - 0.5) * 20;
        }
      });

      dummy.position.set(...particle.position);
      dummy.scale.setScalar(0.1 + environmentLighting * 0.1);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <sphereGeometry args={[0.02]} />
      <meshBasicMaterial
        color="#00ffff"
        transparent
        opacity={0.6}
        blending={THREE.AdditiveBlending}
      />
    </instancedMesh>
  );
};

// Environment Light Sensor Component
const EnvironmentLightSensor: React.FC<{
  onLightingChange?: (lighting: number) => void;
}> = ({ onLightingChange }) => {
  const { scene } = useThree();
  const { setEnvironmentLighting } = useHolographicStore();

  useFrame(() => {
    // Simulate environment lighting detection
    const lights = scene.children.filter(child => 
      child instanceof THREE.Light
    ) as THREE.Light[];
    
    const totalIntensity = lights.reduce((sum, light) => sum + light.intensity, 0);
    const normalizedLighting = Math.min(1, totalIntensity / 5);
    
    setEnvironmentLighting(normalizedLighting);
    onLightingChange?.(normalizedLighting);
  });

  return null;
};

// Gesture Controller Component
const GestureController: React.FC<{
  children: React.ReactNode;
  onGesture?: (gesture: GestureType) => void;
  enabled?: boolean;
}> = ({ children, onGesture, enabled = true }) => {
  const [isTracking, setIsTracking] = useState(false);
  const { setGesture } = useHolographicStore();

  useEffect(() => {
    if (!enabled) return;

    // Simulate gesture recognition
    // In a real implementation, this would integrate with @mediapipe/hands
    const handleKeyDown = (event: KeyboardEvent) => {
      let gesture: GestureType | null = null;
      
      switch (event.key) {
        case 'ArrowLeft':
          gesture = 'swipe_left';
          break;
        case 'ArrowRight':
          gesture = 'swipe_right';
          break;
        case 'Control':
          gesture = 'pinch';
          break;
        case ' ':
          gesture = 'point';
          break;
        case 'g':
          gesture = 'grab';
          break;
        case 'w':
          gesture = 'wave';
          break;
      }

      if (gesture) {
        setGesture(gesture);
        onGesture?.(gesture);
        
        // Clear gesture after a delay
        setTimeout(() => setGesture(null), 1000);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    setIsTracking(true);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      setIsTracking(false);
    };
  }, [enabled, onGesture, setGesture]);

  return (
    <div className="relative">
      {children}
      {enabled && (
        <div className="absolute top-2 right-2 text-xs text-cyan-400 opacity-50">
          Gesture: {isTracking ? 'Active' : 'Inactive'}
        </div>
      )}
    </div>
  );
};

// Holographic Text Component
const HolographicText: React.FC<HolographicTextProps> = ({
  children,
  size = 1,
  color = '#00ffff',
  glowIntensity = 1,
  depth = 0.1,
  className,
}) => {
  const textRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (textRef.current) {
      textRef.current.position.z = Math.sin(state.clock.elapsedTime * 2) * depth;
    }
  });

  return (
    <Float speed={2} rotationIntensity={0.1} floatIntensity={0.2}>
      <Text
        ref={textRef}
        fontSize={size}
        color={color}
        anchorX="center"
        anchorY="middle"
        className={className}
      >
        {children}
        <meshBasicMaterial
          transparent
          opacity={0.9}
          emissive={color}
          emissiveIntensity={glowIntensity * 0.5}
        />
      </Text>
      <Sparkles count={20} scale={size * 2} size={2} speed={0.5} />
    </Float>
  );
};

// Holographic Button Component
const HolographicButton: React.FC<HolographicButtonProps> = ({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  glowIntensity = 1,
  className,
  disabled = false,
  'aria-label': ariaLabel,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const { currentGesture } = useHolographicStore();

  const variants = {
    primary: 'bg-cyan-500/20 border-cyan-400 text-cyan-100',
    secondary: 'bg-purple-500/20 border-purple-400 text-purple-100',
    ghost: 'bg-transparent border-white/40 text-white/80',
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
  };

  return (
    <motion.button
      className={cn(
        'relative overflow-hidden rounded-lg border backdrop-blur-sm',
        'transition-all duration-300 transform-gpu',
        'hover:scale-105 active:scale-95',
        'focus:outline-none focus:ring-2 focus:ring-cyan-400/50',
        variants[variant],
        sizes[size],
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onMouseDown={() => setIsPressed(true)}
      onMouseUp={() => setIsPressed(false)}
      disabled={disabled}
      aria-label={ariaLabel}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      animate={{
        boxShadow: isHovered
          ? `0 0 ${20 * glowIntensity}px rgba(0, 255, 255, 0.5)`
          : `0 0 ${10 * glowIntensity}px rgba(0, 255, 255, 0.2)`,
      }}
    >
      {/* Holographic overlay */}
      <div
        className={cn(
          'absolute inset-0 opacity-30',
          'bg-gradient-to-r from-transparent via-white/20 to-transparent',
          'transform -skew-x-12 translate-x-full',
          isHovered && 'animate-shimmer'
        )}
      />
      
      {/* Ripple effect */}
      {isPressed && (
        <motion.div
          className="absolute inset-0 bg-cyan-400/30 rounded-lg"
          initial={{ scale: 0, opacity: 0.5 }}
          animate={{ scale: 1.5, opacity: 0 }}
          transition={{ duration: 0.6 }}
        />
      )}

      <span className="relative z-10">{children}</span>
      
      {/* Gesture indicator */}
      {currentGesture === 'point' && (
        <div className="absolute -top-2 -right-2 w-2 h-2 bg-cyan-400 rounded-full animate-pulse" />
      )}
    </motion.button>
  );
};

// Holographic Panel Component
const HolographicPanel: React.FC<HolographicPanelProps> = ({
  children,
  width = 400,
  height = 300,
  opacity = 0.8,
  edgeLighting = true,
  className,
  'aria-labelledby': ariaLabelledBy,
}) => {
  const { transparency } = useHolographicStore();

  return (
    <motion.div
      className={cn(
        'relative backdrop-blur-md rounded-xl overflow-hidden',
        'bg-gradient-to-br from-cyan-500/10 to-purple-500/10',
        edgeLighting && 'border border-cyan-400/50',
        className
      )}
      style={{
        width,
        height,
        opacity: opacity * transparency,
      }}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: opacity * transparency, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ duration: 0.5 }}
      aria-labelledby={ariaLabelledBy}
    >
      {/* Edge lighting effect */}
      {edgeLighting && (
        <>
          <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-cyan-400 to-transparent" />
          <div className="absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-cyan-400 to-transparent" />
          <div className="absolute top-0 left-0 w-px h-full bg-gradient-to-b from-transparent via-cyan-400 to-transparent" />
          <div className="absolute top-0 right-0 w-px h-full bg-gradient-to-b from-transparent via-cyan-400 to-transparent" />
        </>
      )}

      {/* Content */}
      <div className="relative z-10 p-6 h-full">
        {children}
      </div>

      {/* Holographic noise overlay */}
      <div
        className="absolute inset-0 opacity-5 mix-blend-overlay"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />
    </motion.div>
  );
};

// Holographic Menu Component
const HolographicMenu: React.FC<HolographicMenuProps> = ({
  items,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  onItemSelect,
  className,
  isOpen = false,
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const { menuState } = useHolographicStore();

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.1;
    }
  });

  return (
    <AnimatePresence>
      {isOpen && (
        <group ref={groupRef} position={position} rotation={rotation}>
          {items.map((item, index) => {
            const angle = (index / items.length) * Math.PI * 2;
            const radius = 3;
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;

            return (
              <Float key={item.id} speed={2 + index * 0.5} rotationIntensity={0.1}>
                <group position={[x, 0, z]}>
                  <Html center>
                    <HolographicButton
                      onClick={() => {
                        item.action?.();
                        onItemSelect?.(item);
                      }}
                      className={cn('min-w-[120px]', className)}
                      aria-label={item.label}
                    >
                      {item.icon && <span className="mr-2">{item.icon}</span>}
                      {item.label}
                    </HolographicButton>
                  </Html>
                  <Trail
                    width={5}
                    length={10}
                    color="#00ffff"
                    attenuation={(width) => width}
                  >
                    <mesh>
                      <sphereGeometry args={[0.1]} />
                      <meshBasicMaterial
                        color="#00ffff"
                        transparent
                        opacity={0.6}
                      />
                    </mesh>
                  </Trail>
                </group>
              </Float>
            );
          })}
        </group>
      )}
    </AnimatePresence>
  );
};

// Main Holographic Interface Component
const HolographicInterface: React.FC<HolographicInterfaceProps> = ({
  children,
  className,
  environmentLighting = 0.5,
  gestureEnabled = true,
  adaptiveTransparency = true,
  particleCount = 100,
  onGesture,
  onEnvironmentChange,
  'aria-label': ariaLabel,
}) => {
  const { isActive, transparency, setActive } = useHolographicStore();

  useEffect(() => {
    setActive(true);
    return () => setActive(false);
  }, [setActive]);

  return (
    <GestureController enabled={gestureEnabled} onGesture={onGesture}>
      <div
        className={cn(
          'relative w-full h-full overflow-hidden',
          'bg-gradient-to-br from-slate-900 via-blue-900/50 to-purple-900/50',
          className
        )}
        aria-label={ariaLabel || 'Holographic Interface'}
      >
        {/* 3D Canvas */}
        <Canvas
          camera={{ position: [0, 0, 10], fov: 50 }}
          className="absolute inset-0"
          gl={{ alpha: true, antialias: true }}
        >
          <ambientLight intensity={0.2} />
          <pointLight position={[10, 10, 10]} intensity={0.5} />
          <pointLight position={[-10, -10, -10]} intensity={0.3} color="#ff00ff" />

          <EnvironmentLightSensor onLightingChange={onEnvironmentChange} />
          <ParticleSystem count={particleCount} />

          {/* 3D Content */}
          <Suspense fallback={null}>
            <Float speed={1} rotationIntensity={0.1}>
              <HolographicText size={2} glowIntensity={2}>
                CRAIverse
              </HolographicText>
            </Float>
          </Suspense>
        </Canvas>

        {/* 2D UI Overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ opacity: transparency }}
        >
          <div className="pointer-events-auto">{children}</div>
        </div>

        {/* Status indicators */}
        <div className="absolute top-4 left-4 space-y-2">
          <div className="flex items-center space-x-2 text-xs text-cyan-400">
            <div
              className={cn(
                'w-2 h-2 rounded-full',
                isActive ? 'bg-cyan-400 animate-pulse' : 'bg-gray-600'
              )}
            />
            <span>Holographic Interface</span>
          </div>
          {gestureEnabled && (
            <div className="flex items-center space-x-2 text-xs text-purple-400">
              <div className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
              <span>Gesture Control Active</span>
            </div>
          )}
        </div>

        {/* Holographic grid overlay */}
        <div
          className="absolute inset-0 opacity-10 pointer-events-none"
          style={{
            backgroundImage: `
              linear-gradient(rgba(0, 255, 255, 0.1) 1px, transparent 1