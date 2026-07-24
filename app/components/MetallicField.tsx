"use client";

import { useEffect, useRef } from "react";

type MetallicFieldProps = {
  className?: string;
};

export default function MetallicField({ className = "" }: MetallicFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      powerPreference: "high-performance",
    });
    if (!gl) return;

    const vertexSource = `
      attribute vec2 a_position;
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;

    const fragmentSource = `
      precision highp float;
      uniform vec2 u_resolution;
      uniform float u_time;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
          f.y
        );
      }

      float fbm(vec2 p) {
        float value = 0.0;
        float amplitude = 0.55;
        for (int i = 0; i < 5; i++) {
          value += amplitude * noise(p);
          p = p * 2.03 + vec2(17.3, 9.2);
          amplitude *= 0.48;
        }
        return value;
      }

      void main() {
        vec2 uv = gl_FragCoord.xy / u_resolution.xy;
        vec2 p = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / min(u_resolution.x, u_resolution.y);
        float t = u_time * 0.13;
        vec2 warp = vec2(
          fbm(p * 1.45 + vec2(t, -t * 0.5)),
          fbm(p * 1.32 + vec2(-t * 0.7, t))
        );
        float field = fbm(p * 2.0 + warp * 1.7);
        float ribbons = sin((p.x + warp.x * 0.75) * 8.0 + field * 7.0 - t * 3.0);
        float ridge = smoothstep(0.08, 0.92, field + ribbons * 0.13);
        float sheen = pow(max(0.0, 1.0 - abs(ribbons)), 7.0);
        float edge = smoothstep(1.15, 0.08, length(p * vec2(0.78, 1.0)));

        vec3 shadow = vec3(0.055, 0.06, 0.068);
        vec3 steel = vec3(0.46, 0.49, 0.53);
        vec3 pearl = vec3(0.93, 0.95, 0.97);
        vec3 color = mix(shadow, steel, ridge);
        color = mix(color, pearl, sheen * 0.9);
        color += vec3(0.05, 0.025, 0.065) * (1.0 - uv.y);
        color *= 0.68 + edge * 0.42;
        gl_FragColor = vec4(color, 1.0);
      }
    `;

    function compile(type: number, source: string) {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
    }

    const vertex = compile(gl.VERTEX_SHADER, vertexSource);
    const fragment =
      compile(gl.FRAGMENT_SHADER, fragmentSource) ??
      compile(
        gl.FRAGMENT_SHADER,
        fragmentSource.replace("precision highp float;", "precision mediump float;"),
      );
    const program = gl.createProgram();
    if (!vertex || !fragment || !program) return;

    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );

    gl.useProgram(program);
    const position = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const resolution = gl.getUniformLocation(program, "u_resolution");
    const time = gl.getUniformLocation(program, "u_time");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let isVisible = true;
    let pageIsVisible = !document.hidden;
    const start = performance.now();

    function render(now: number) {
      frame = 0;
      const dprCap = window.innerWidth < 768 ? 1.15 : 1.5;
      const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
      const width = Math.max(1, Math.floor(canvas!.clientWidth * dpr));
      const height = Math.max(1, Math.floor(canvas!.clientHeight * dpr));
      if (canvas!.width !== width || canvas!.height !== height) {
        canvas!.width = width;
        canvas!.height = height;
        gl!.viewport(0, 0, width, height);
      }
      gl!.uniform2f(resolution, width, height);
      gl!.uniform1f(time, reducedMotion.matches ? 2.6 : (now - start) / 1000);
      gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
      if (!reducedMotion.matches && isVisible && pageIsVisible) {
        frame = requestAnimationFrame(render);
      }
    }

    const resume = () => {
      if (!frame && isVisible && pageIsVisible) {
        frame = requestAnimationFrame(render);
      }
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        isVisible = entry.isIntersecting;
        if (!isVisible && frame) {
          cancelAnimationFrame(frame);
          frame = 0;
        } else {
          resume();
        }
      },
      { threshold: 0.01 },
    );
    observer.observe(canvas);

    const handleVisibility = () => {
      pageIsVisible = !document.hidden;
      if (!pageIsVisible && frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      } else {
        resume();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    const handleReducedMotion = () => {
      if (reducedMotion.matches && frame) {
        cancelAnimationFrame(frame);
        frame = 0;
        render(performance.now());
      } else {
        resume();
      }
    };
    reducedMotion.addEventListener("change", handleReducedMotion);

    const handleContextLost = (event: Event) => {
      event.preventDefault();
      cancelAnimationFrame(frame);
      frame = 0;
      canvas.style.opacity = "0";
    };
    canvas.addEventListener("webglcontextlost", handleContextLost);
    frame = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("visibilitychange", handleVisibility);
      reducedMotion.removeEventListener("change", handleReducedMotion);
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={`metallic-field ${className}`.trim()}
      aria-hidden="true"
    />
  );
}
