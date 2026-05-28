'use client';

import React, { useEffect, useRef } from 'react';

export default function FluidBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) {
      console.error('WebGL not supported');
      return;
    }

    let animationFrameId: number;
    let isPageVisible = true;

    const config = {
      SIM_RESOLUTION: 128,
      DYE_RESOLUTION: 512,
      DENSITY_DISSIPATION: 0.97,
      VELOCITY_DISSIPATION: 0.98,
      PRESSURE_DISSIPATION: 0.8,
      PRESSURE_ITERATIONS: 20,
      CURL: 30,
      SPLAT_RADIUS: 0.25,
    };

    const pointers: any[] = [];
    pointers.push({
      id: -1,
      x: 0,
      y: 0,
      dx: 0,
      dy: 0,
      down: false,
      moved: false,
      color: [Math.random() * 5, Math.random() * 5, Math.random() * 5]
    });

    const baseVertexShader = `
      precision highp float;
      attribute vec2 aPosition;
      varying vec2 vUv;
      varying vec2 vL;
      varying vec2 vR;
      varying vec2 vT;
      varying vec2 vB;
      uniform vec2 texelSize;
      void main () {
        vUv = aPosition * 0.5 + 0.5;
        vL = vUv - vec2(texelSize.x, 0.0);
        vR = vUv + vec2(texelSize.x, 0.0);
        vT = vUv + vec2(0.0, texelSize.y);
        vB = vUv - vec2(0.0, texelSize.y);
        gl_Position = vec4(aPosition, 0.0, 1.0);
      }
    `;

    const displayShader = `
      precision highp float;
      varying vec2 vUv;
      uniform sampler2D uTexture;
      void main () {
        vec3 col = texture2D(uTexture, vUv).rgb;
        gl_FragColor = vec4(col, 1.0);
      }
    `;

    const splatShader = `
      precision highp float;
      varying vec2 vUv;
      uniform sampler2D uTarget;
      uniform float aspect;
      uniform vec2 point;
      uniform vec3 color;
      uniform float radius;
      void main () {
        vec2 p = vUv - point;
        p.x *= aspect;
        vec3 base = texture2D(uTarget, vUv).xyz;
        vec3 splat = color * exp(-dot(p, p) / radius);
        gl_FragColor = vec4(base + splat, 1.0);
      }
    `;

    function createShader(gl: WebGLRenderingContext, type: number, source: string) {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      return shader;
    }

    function createProgram(gl: WebGLRenderingContext, vertexSource: string, fragmentSource: string) {
      const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexSource);
      const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
      const program = gl.createProgram();
      if (!program || !vertexShader || !fragmentShader) return null;
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      return program;
    }

    const displayProgram = createProgram(gl, baseVertexShader, displayShader);
    const splatProgram = createProgram(gl, baseVertexShader, splatShader);

    const blit = (() => {
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
      return (program: WebGLProgram) => {
        gl.useProgram(program);
        const positionAttr = gl.getAttribLocation(program, 'aPosition');
        gl.enableVertexAttribArray(positionAttr);
        gl.vertexAttribPointer(positionAttr, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      };
    })();

    function createFBO(w: number, h: number) {
      gl!.activeTexture(gl!.TEXTURE0);
      const texture = gl!.createTexture();
      gl!.bindTexture(gl!.TEXTURE_2D, texture);
      gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, w, h, 0, gl!.RGBA, gl!.UNSIGNED_BYTE, null);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);

      const fbo = gl!.createFramebuffer();
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, fbo);
      gl!.framebufferTexture2D(gl!.FRAMEBUFFER, gl!.COLOR_ATTACHMENT0, gl!.TEXTURE_2D, texture, 0);

      return { texture, fbo, width: w, height: h };
    }

    let density = createFBO(config.DYE_RESOLUTION, config.DYE_RESOLUTION);

    function resizeCanvas() {
      if (canvas!.width !== window.innerWidth || canvas!.height !== window.innerHeight) {
        canvas!.width = window.innerWidth;
        canvas!.height = window.innerHeight;
        gl!.viewport(0, 0, canvas!.width, canvas!.height);
      }
    }

    function splat(x: number, y: number, dx: number, dy: number, color: number[]) {
      if (!splatProgram) return;
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, density.fbo);
      gl!.useProgram(splatProgram);
      gl!.uniform1i(gl!.getUniformLocation(splatProgram, 'uTarget'), 0);
      gl!.uniform1f(gl!.getUniformLocation(splatProgram, 'aspect'), canvas!.width / canvas!.height);
      gl!.uniform2f(gl!.getUniformLocation(splatProgram, 'point'), x, y);
      gl!.uniform3f(gl!.getUniformLocation(splatProgram, 'color'), color[0], color[1], color[2]);
      gl!.uniform1f(gl!.getUniformLocation(splatProgram, 'radius'), config.SPLAT_RADIUS / 100.0);
      blit(splatProgram);
    }

    function update() {
      if (!isPageVisible) return;
      resizeCanvas();

      if (Math.random() < 0.03) {
        const randomColor = [Math.random() * 2, Math.random() * 1, Math.random() * 3];
        splat(Math.random(), Math.random(), 0, 0, randomColor);
      }

      if (displayProgram) {
        gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
        gl!.useProgram(displayProgram);
        gl!.uniform1i(gl!.getUniformLocation(displayProgram, 'uTexture'), 0);
        blit(displayProgram);
      }

      animationFrameId = requestAnimationFrame(update);
    }

    const observer = new IntersectionObserver(([entry]) => {
      isPageVisible = entry.isIntersecting;
      if (isPageVisible) {
        update();
      } else {
        cancelAnimationFrame(animationFrameId);
      }
    }, { threshold: 0.1 });

    observer.observe(canvas);

    const handleMouseMove = (e: MouseEvent) => {
      const x = e.clientX / window.innerWidth;
      const y = 1.0 - e.clientY / window.innerHeight;
      splat(x, y, 0, 0, [Math.sin(Date.now() * 0.001) * 2, 0.5, Math.cos(Date.now() * 0.0015) * 2]);
    };

    window.addEventListener('mousemove', handleMouseMove);

    // Start animation
    update();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('mousemove', handleMouseMove);
      observer.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full pointer-events-none bg-[#0a0a0e]"
      style={{ zIndex: 0 }}
    />
  );
}