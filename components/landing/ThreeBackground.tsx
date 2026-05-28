import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface ThreeBackgroundProps {
  isDark: boolean;
}

const ThreeBackground: React.FC<ThreeBackgroundProps> = ({ isDark }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<any>({});

  useEffect(() => {
    if (!mountRef.current) return;
    const el = mountRef.current;
    const W = el.clientWidth, H = el.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, W / H, 0.1, 1000);
    camera.position.set(0, 0, 35);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);

    // Colors
    const nodeColor = isDark ? 0x6366f1 : 0x4f46e5;
    const lineColor = isDark ? 0x818cf8 : 0x6366f1;
    const particleColor = isDark ? 0xa5b4fc : 0x818cf8;

    // === NODES ===
    const nodes: THREE.Mesh[] = [];
    const nodePositions: THREE.Vector3[] = [];
    const nodeCount = 40;

    const nodeMat = new THREE.MeshPhongMaterial({
      color: nodeColor,
      emissive: nodeColor,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.85,
    });

    for (let i = 0; i < nodeCount; i++) {
      const geo = new THREE.SphereGeometry(
        Math.random() * 0.35 + 0.1,
        8, 8
      );
      const mesh = new THREE.Mesh(geo, nodeMat.clone());
      const pos = new THREE.Vector3(
        (Math.random() - 0.5) * 60,
        (Math.random() - 0.5) * 40,
        (Math.random() - 0.5) * 30
      );
      mesh.position.copy(pos);
      nodes.push(mesh);
      nodePositions.push(pos);
      scene.add(mesh);
    }

    // === CONNECTING LINES ===
    const lineMat = new THREE.LineBasicMaterial({
      color: lineColor,
      transparent: true,
      opacity: 0.18,
    });

    const lines: THREE.Line[] = [];
    for (let i = 0; i < nodeCount; i++) {
      for (let j = i + 1; j < nodeCount; j++) {
        const dist = nodePositions[i].distanceTo(nodePositions[j]);
        if (dist < 16) {
          const geo = new THREE.BufferGeometry().setFromPoints([
            nodePositions[i], nodePositions[j]
          ]);
          const line = new THREE.Line(geo, lineMat.clone());
          lines.push(line);
          scene.add(line);
        }
      }
    }

    // === FLOATING PARTICLES ===
    const pCount = 200;
    const pPositions = new Float32Array(pCount * 3);
    for (let i = 0; i < pCount; i++) {
      pPositions[i * 3]     = (Math.random() - 0.5) * 80;
      pPositions[i * 3 + 1] = (Math.random() - 0.5) * 60;
      pPositions[i * 3 + 2] = (Math.random() - 0.5) * 40;
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));
    const pMat = new THREE.PointsMaterial({
      color: particleColor,
      size: 0.15,
      transparent: true,
      opacity: 0.5,
      sizeAttenuation: true,
    });
    const particles = new THREE.Points(pGeo, pMat);
    scene.add(particles);

    // === LARGE TORUS (ring) ===
    const torusGeo = new THREE.TorusGeometry(18, 0.08, 8, 120);
    const torusMat = new THREE.MeshBasicMaterial({
      color: lineColor,
      transparent: true,
      opacity: 0.12,
    });
    const torus = new THREE.Mesh(torusGeo, torusMat);
    torus.rotation.x = Math.PI / 3;
    scene.add(torus);

    const torus2 = new THREE.Mesh(
      new THREE.TorusGeometry(24, 0.05, 8, 120),
      new THREE.MeshBasicMaterial({ color: lineColor, transparent: true, opacity: 0.07 })
    );
    torus2.rotation.x = -Math.PI / 5;
    torus2.rotation.y = Math.PI / 4;
    scene.add(torus2);

    // === ICOSAHEDRON (central) ===
    const icoGeo = new THREE.IcosahedronGeometry(3.5, 1);
    const icoMat = new THREE.MeshPhongMaterial({
      color: nodeColor,
      emissive: nodeColor,
      emissiveIntensity: 0.3,
      wireframe: true,
      transparent: true,
      opacity: 0.25,
    });
    const ico = new THREE.Mesh(icoGeo, icoMat);
    scene.add(ico);

    // === LIGHTS ===
    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambient);
    const pointLight = new THREE.PointLight(nodeColor, 2, 60);
    pointLight.position.set(5, 5, 10);
    scene.add(pointLight);
    const pointLight2 = new THREE.PointLight(0x8b5cf6, 1.5, 50);
    pointLight2.position.set(-10, -5, 5);
    scene.add(pointLight2);

    // === MOUSE ===
    let mouseX = 0, mouseY = 0;
    const onMouseMove = (e: MouseEvent) => {
      mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
      mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener('mousemove', onMouseMove);

    // === NODE VELOCITIES ===
    const velocities = nodes.map(() => new THREE.Vector3(
      (Math.random() - 0.5) * 0.008,
      (Math.random() - 0.5) * 0.008,
      (Math.random() - 0.5) * 0.005,
    ));

    // === ANIMATION ===
    let frame = 0;
    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      frame++;
      const t = frame * 0.003;

      // Rotate rings
      torus.rotation.z += 0.002;
      torus2.rotation.z -= 0.0015;
      torus2.rotation.x += 0.001;

      // Rotate icosahedron
      ico.rotation.x += 0.004;
      ico.rotation.y += 0.006;

      // Rotate particles slowly
      particles.rotation.y += 0.0005;

      // Animate nodes
      nodes.forEach((node, i) => {
        node.position.add(velocities[i]);
        // Boundary bounce
        ['x', 'y', 'z'].forEach((axis) => {
          const a = axis as 'x' | 'y' | 'z';
          const limit = axis === 'x' ? 30 : axis === 'y' ? 20 : 15;
          if (Math.abs(node.position[a]) > limit) velocities[i][a] *= -1;
        });
        nodePositions[i].copy(node.position);
        // Pulse emissive
        (node.material as THREE.MeshPhongMaterial).emissiveIntensity =
          0.3 + Math.sin(t + i * 0.5) * 0.3;
      });

      // Update lines
      let lineIdx = 0;
      for (let i = 0; i < nodeCount && lineIdx < lines.length; i++) {
        for (let j = i + 1; j < nodeCount && lineIdx < lines.length; j++) {
          const dist = nodePositions[i].distanceTo(nodePositions[j]);
          const line = lines[lineIdx];
          const mat = line.material as THREE.LineBasicMaterial;
          if (dist < 16) {
            mat.opacity = (1 - dist / 16) * 0.25;
            const pts = [nodePositions[i], nodePositions[j]];
            line.geometry.setFromPoints(pts);
            line.geometry.attributes.position.needsUpdate = true;
          } else {
            mat.opacity = 0;
          }
          lineIdx++;
        }
      }

      // Camera follows mouse subtly
      camera.position.x += (mouseX * 4 - camera.position.x) * 0.02;
      camera.position.y += (-mouseY * 3 - camera.position.y) * 0.02;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
    };
    animate();

    // Resize
    const onResize = () => {
      const W2 = el.clientWidth, H2 = el.clientHeight;
      camera.aspect = W2 / H2;
      camera.updateProjectionMatrix();
      renderer.setSize(W2, H2);
    };
    window.addEventListener('resize', onResize);

    sceneRef.current = { animId, renderer };

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  }, [isDark]);

  return (
    <div
      ref={mountRef}
      className="absolute inset-0 w-full h-full"
      style={{ pointerEvents: 'none' }}
    />
  );
};

export default ThreeBackground;
