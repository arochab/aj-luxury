"use client";

import { useEffect, useRef } from "react";
import { HERO_FUSION_VERSION, metalAmountFromLoop } from "../../lib/hero-fusion";

type HeroFusionFieldProps = {
  playing?: boolean;
  className?: string;
  onReady?: () => void;
};

const PHOTO_SRC = "/images/client/hero-duo-static.webp";
const MASK_SRC = "/images/client/hero-duo-cutout.png";
const LOOP_SECONDS = 26;
const MAX_FPS = 30;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load ${src}`));
    image.src = src;
  });
}

function createTexture(
  gl: WebGLRenderingContext,
  image: TexImageSource,
  unit: number,
) {
  const texture = gl.createTexture();
  if (!texture) return null;

  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  return texture;
}

const FRAGMENT_SHADER = `
  precision highp float;

  uniform vec2 u_resolution;
  uniform float u_phase;
  uniform float u_metalMix;
  uniform float u_photoAspect;
  uniform sampler2D u_photo;
  uniform sampler2D u_mask;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 eased = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), eased.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), eased.x),
      eased.y
    );
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.55;
    for (int i = 0; i < 3; i++) {
      value += amplitude * noise(p);
      p = p * 2.02 + vec2(4.1, 2.7);
      amplitude *= 0.48;
    }
    return value;
  }

  float smoothstepRange(float edge0, float edge1, float value) {
    float t = clamp((value - edge0) / (edge1 - edge0), 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
  }

  vec4 containRect(float imageAspect, float screenAspect) {
    if (screenAspect > imageAspect) {
      float width = imageAspect / screenAspect;
      float left = (1.0 - width) * 0.5;
      return vec4(left, 1.0 - left, 0.0, 1.0);
    }
    float height = screenAspect / imageAspect;
    float top = (1.0 - height) * 0.5;
    return vec4(0.0, 1.0, top, 1.0 - top);
  }

  vec2 containPhotoUV(vec2 screenUV, float imageAspect, float screenAspect) {
    vec4 rect = containRect(imageAspect, screenAspect);
    float width = rect.y - rect.x;
    float height = rect.w - rect.z;
    return vec2(
      (screenUV.x - rect.x) / width,
      (screenUV.y - rect.z) / height
    );
  }

  float outsidePhotoDistance(vec2 screenUV, vec4 rect) {
    float width = rect.y - rect.x;
    float height = rect.w - rect.z;

    if (screenUV.x < rect.x) {
      return (rect.x - screenUV.x) / max(rect.x, 0.001);
    }
    if (screenUV.x > rect.y) {
      return (screenUV.x - rect.y) / max(1.0 - rect.y, 0.001);
    }
    if (screenUV.y < rect.z) {
      return (rect.z - screenUV.y) / max(rect.z, 0.001);
    }
    if (screenUV.y > rect.w) {
      return (screenUV.y - rect.w) / max(1.0 - rect.w, 0.001);
    }
    return 0.0;
  }

  float liquidHeight(vec2 p, float phase) {
    vec2 drift = vec2(cos(phase * 0.52), sin(phase * 0.52)) * 0.16;
    float fieldA = fbm(p * 1.14 + drift);
    float fieldB = fbm(vec2(-p.y, p.x) * 1.02 - drift + vec2(5.4, 1.1));
    vec2 warped = p + (vec2(fieldA, fieldB) - 0.5) * 0.58;
    float fold = sin(warped.x * 1.72 + warped.y * 0.64 + fieldB * 2.2 + phase * 0.1);
    return fieldA * 0.4 + fieldB * 0.3 + fold * 0.16;
  }

  float atomField(vec2 uv, float phase) {
    float atoms = 0.0;
    for (int i = 0; i < 7; i++) {
      float fi = float(i);
      vec2 center = vec2(
        0.5 + sin(phase * 0.28 + fi * 1.51) * 0.42,
        0.5 + cos(phase * 0.22 + fi * 1.93) * 0.3
      );
      float radius = 0.011 + sin(phase * 0.7 + fi) * 0.0025;
      float dist = length(uv - center);
      atoms += radius / (dist + radius * 2.4);
    }
    return atoms;
  }

  vec3 liquidMetal(vec2 uv, vec2 p, float phase) {
    float height = liquidHeight(p, phase);
    float epsilon = 0.004;
    float heightX = liquidHeight(p + vec2(epsilon, 0.0), phase);
    float heightY = liquidHeight(p + vec2(0.0, epsilon), phase);
    vec2 gradient = vec2(heightX - height, heightY - height) / epsilon;
    vec3 normal = normalize(vec3(-gradient * 0.5, 1.0));
    vec3 reflection = reflect(vec3(0.0, 0.0, 1.0), normal);

    float env = clamp(reflection.y * 0.36 + reflection.x * 0.1 + 0.5, 0.0, 1.0);
    vec3 ink = vec3(0.1, 0.095, 0.12);
    vec3 pewter = vec3(0.38, 0.385, 0.4);
    vec3 satin = vec3(0.66, 0.665, 0.675);
    vec3 pearl = vec3(0.88, 0.885, 0.895);

    vec3 material = mix(ink, satin, smoothstepRange(0.08, 0.82, env));
    material = mix(material, pearl, pow(max(0.0, dot(normal, normalize(vec3(-0.38, 0.52, 0.84)))), 1.5) * 0.12);
    material = mix(material, pearl, clamp(atomField(uv, phase) * 0.18, 0.0, 0.22));
    return material;
  }

  vec3 sampleVioletEdge(vec2 photoUV, vec4 rect, vec2 screenUV) {
    float edgeX = screenUV.x < (rect.x + rect.y) * 0.5 ? 0.03 : 0.97;
    vec2 edgeUV = vec2(edgeX, clamp(photoUV.y, 0.06, 0.94));
    return texture2D(u_photo, edgeUV).rgb;
  }

  float subtleFusionMix(
    vec2 screenUV,
    vec4 rect,
    float subject,
    float loopMetal
  ) {
    float outside = outsidePhotoDistance(screenUV, rect);
    float pillarMetal = smoothstepRange(0.02, 0.58, outside) * 0.68;

    float halfWidth = (rect.y - rect.x) * 0.5;
    float distFromCenterX = abs(screenUV.x - 0.5) / max(halfWidth, 0.001);
    float insideEdgeBleed = 0.0;
    if (outside <= 0.0) {
      insideEdgeBleed =
        smoothstepRange(0.42, 0.92, distFromCenterX) *
        smoothstepRange(0.08, 0.52, 1.0 - subject) *
        0.1;
    }

    float subjectShield = smoothstepRange(0.04, 0.38, subject);
    float mixAmount = pillarMetal + insideEdgeBleed;
    mixAmount += loopMetal * smoothstepRange(0.12, 0.58, 1.0 - subject) * 0.06;
    return clamp(mixAmount, 0.0, 1.0) * (1.0 - subjectShield);
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    float screenAspect = u_resolution.x / max(u_resolution.y, 1.0);
    vec4 rect = containRect(u_photoAspect, screenAspect);
    vec2 photoUV = containPhotoUV(uv, u_photoAspect, screenAspect);
    vec2 clampedUV = clamp(photoUV, 0.001, 0.999);

    vec4 photo = texture2D(u_photo, clampedUV);
    float subject = texture2D(u_mask, clampedUV).a;

    vec2 p = (uv - 0.5) * vec2(screenAspect, 1.0) * 2.0;
    vec3 metal = liquidMetal(uv, p, u_phase);
    vec3 violetEdge = sampleVioletEdge(photoUV, rect, uv);
    vec3 bridgedMetal = mix(metal, violetEdge, 0.64);

    float mixAmount = subtleFusionMix(uv, rect, subject, u_metalMix);
    vec3 fused = mix(photo.rgb, bridgedMetal, mixAmount);

    gl_FragColor = vec4(fused, 1.0);
  }
`;

export default function HeroFusionField({
  playing = true,
  className = "",
  onReady,
}: HeroFusionFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;
    let animationFrame = 0;
    let gl: WebGLRenderingContext | null = null;
    let program: WebGLProgram | null = null;
    let photoTexture: WebGLTexture | null = null;
    let maskTexture: WebGLTexture | null = null;
    let buffer: WebGLBuffer | null = null;

    const vertexSource = `
      attribute vec2 a_position;
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;

    function compile(type: number, source: string) {
      if (!gl) return null;
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    }

    async function init() {
      const context = canvas.getContext("webgl", {
        alpha: false,
        antialias: false,
        depth: false,
        powerPreference: "high-performance",
      });
      if (!context || disposed) return;
      gl = context;

      const [photoImage, maskImage] = await Promise.all([
        loadImage(PHOTO_SRC),
        loadImage(MASK_SRC),
      ]);
      if (disposed || !gl) return;

      photoTexture = createTexture(gl, photoImage, 0);
      maskTexture = createTexture(gl, maskImage, 1);
      if (!photoTexture || !maskTexture) return;

      const vertex = compile(gl.VERTEX_SHADER, vertexSource);
      let fragment = compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
      if (!fragment) {
        fragment = compile(
          gl.FRAGMENT_SHADER,
          FRAGMENT_SHADER.replace("precision highp float;", "precision mediump float;"),
        );
      }
      if (!vertex || !fragment) return;

      program = gl.createProgram();
      if (!program) return;
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;

      buffer = gl.createBuffer();
      if (!buffer) return;
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

      gl.uniform1i(gl.getUniformLocation(program, "u_photo"), 0);
      gl.uniform1i(gl.getUniformLocation(program, "u_mask"), 1);

      const photoAspect = photoImage.naturalWidth / photoImage.naturalHeight;
      const resolution = gl.getUniformLocation(program, "u_resolution");
      const phase = gl.getUniformLocation(program, "u_phase");
      const metalMix = gl.getUniformLocation(program, "u_metalMix");
      const photoAspectUniform = gl.getUniformLocation(program, "u_photoAspect");

      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
      const frameInterval = 1000 / MAX_FPS;
      const start = performance.now();
      let lastPaint = -frameInterval;
      let needsResize = true;
      let isVisible = true;
      let pageIsVisible = !document.hidden;

      const shouldAnimate = () => playing && !reducedMotion.matches;

      const resizeCanvas = () => {
        if (!gl || !canvas) return;
        const dprCap = window.innerWidth < 768 ? 1 : 1.5;
        const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
        const width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
        const height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
          gl.viewport(0, 0, width, height);
        }
        needsResize = false;
      };

      const paint = (now: number) => {
        if (!gl || !program || disposed) return;
        if (needsResize) resizeCanvas();

        const elapsed = (now - start) / 1000;
        const loopPhase = shouldAnimate() ? (elapsed % LOOP_SECONDS) / LOOP_SECONDS : 0;
        const metalAmount = shouldAnimate() ? metalAmountFromLoop(loopPhase) : 0;
        const currentPhase = shouldAnimate()
          ? elapsed * ((Math.PI * 2) / LOOP_SECONDS)
          : 0;

        gl.uniform2f(resolution, canvas.width, canvas.height);
        gl.uniform1f(phase, currentPhase);
        gl.uniform1f(metalMix, metalAmount);
        gl.uniform1f(photoAspectUniform, photoAspect);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        lastPaint = now;
      };

      const schedule = () => {
        if (animationFrame || !shouldAnimate() || !isVisible || !pageIsVisible) return;
        animationFrame = requestAnimationFrame(render);
      };

      const render = (now: number) => {
        animationFrame = 0;
        if (now - lastPaint >= frameInterval) paint(now);
        schedule();
      };

      const stop = () => {
        if (animationFrame) {
          cancelAnimationFrame(animationFrame);
          animationFrame = 0;
        }
      };

      const intersectionObserver = new IntersectionObserver(
        ([entry]) => {
          isVisible = entry.isIntersecting;
          if (!isVisible) stop();
          else if (shouldAnimate()) schedule();
          else paint(performance.now());
        },
        { threshold: 0.01 },
      );
      intersectionObserver.observe(canvas);

      const resizeObserver = new ResizeObserver(() => {
        needsResize = true;
        if (!shouldAnimate() && isVisible) paint(performance.now());
      });
      resizeObserver.observe(canvas);

      const handleVisibility = () => {
        pageIsVisible = !document.hidden;
        if (!pageIsVisible) stop();
        else if (shouldAnimate() && isVisible) schedule();
        else if (isVisible) paint(performance.now());
      };
      document.addEventListener("visibilitychange", handleVisibility);

      const handleMotionPreference = () => {
        if (shouldAnimate()) schedule();
        else paint(performance.now());
      };
      reducedMotion.addEventListener("change", handleMotionPreference);

      paint(performance.now());
      schedule();
      onReady?.();

      return () => {
        stop();
        intersectionObserver.disconnect();
        resizeObserver.disconnect();
        document.removeEventListener("visibilitychange", handleVisibility);
        reducedMotion.removeEventListener("change", handleMotionPreference);
        if (gl) {
          if (photoTexture) gl.deleteTexture(photoTexture);
          if (maskTexture) gl.deleteTexture(maskTexture);
          if (buffer) gl.deleteBuffer(buffer);
          if (program) gl.deleteProgram(program);
          if (vertex) gl.deleteShader(vertex);
          if (fragment) gl.deleteShader(fragment);
        }
      };
    }

    let cleanup: (() => void) | undefined;
    init().then((disposeInit) => {
      cleanup = disposeInit;
    });

    return () => {
      disposed = true;
      if (animationFrame) cancelAnimationFrame(animationFrame);
      cleanup?.();
    };
  }, [playing, onReady]);

  return (
    <canvas
      ref={canvasRef}
      className={`hero-fusion-field ${className}`.trim()}
      data-hero-fusion={HERO_FUSION_VERSION}
      aria-hidden="true"
    />
  );
}
