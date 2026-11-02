'use client';

import dynamic from 'next/dynamic';
import { useRef, useState, useEffect } from 'react';

// Keep the decorative shader out of the initial server-rendered bundle.
const Galaxy = dynamic(() => import('./galaxy'), { ssr: false });

export default function GalaxyBackground() {
  const host = useRef<HTMLDivElement>(null);
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    const element = host.current;
    const restore = () => setGeneration(value => value + 1);
    element?.addEventListener('galaxy-restore', restore);
    return () => element?.removeEventListener('galaxy-restore', restore);
  }, []);
  return <div ref={host} className="galaxy-background" aria-hidden="true">
    <Galaxy key={generation} lightMode transparent={false} backgroundColor="#ffffff"
      starColors={['#7651c9', '#9568db', '#b298dc']} density={0.8} layers={3}
      starSize={1.1} glowIntensity={0.35} flareIntensity={0.7} opacity={0.7}
      starSpeed={0.14} speed={0.35} rotationSpeed={0.015} twinkleIntensity={0.25}
      mouseRepulsion repulsionStrength={1.5} clickWarp={false} intro={false} dpr={1} />
  </div>;
}
