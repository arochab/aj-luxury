"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";

const DESKTOP_IMAGE_SRC = "/images/client/campaign-duo-pourpre.webp";
const MOBILE_IMAGE_SRC = "/images/client/hero-mobile-duo.webp";

export default function ProceduralDuo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("webgl", {
      alpha: true,
      antialias: false,
      powerPreference: "high-performance",
      premultipliedAlpha: false,
    });
    if (!context) return;
    const gl = context;

    const vertexSource = `
      attribute vec2 a_position;
      varying vec2 v_uv;

      void main() {
        v_uv = a_position * 0.5 + 0.5;
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;

    const fragmentSource = `
      precision highp float;

      uniform sampler2D u_image;
      uniform float u_time;
      uniform vec2 u_pointer;
      varying vec2 v_uv;

      float region(vec2 uv, vec2 center, vec2 radius) {
        vec2 delta = (uv - center) / radius;
        return exp(-dot(delta, delta) * 2.35);
      }

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
        for (int i = 0; i < 3; i++) {
          value += amplitude * noise(p);
          p = p * 2.02 + vec2(13.7, 8.4);
          amplitude *= 0.47;
        }
        return value;
      }

      void main() {
        const float TAU = 6.28318530718;
        const float LOOP_SECONDS = 24.0;
        vec2 uv = v_uv;
        float phase = mod(u_time, LOOP_SECONDS) / LOOP_SECONDS * TAU;
        vec2 orbit = vec2(cos(phase), sin(phase));
        vec2 pointerOffset = (u_pointer - 0.5) * vec2(0.0034, 0.0024);
        float zoom = 1.009 + sin(phase) * 0.0018;
        vec2 sampleUv = (uv - 0.5) / zoom + 0.5;
        sampleUv += pointerOffset;
        sampleUv += vec2(
          sin(phase) * 0.00115,
          cos(phase) * 0.00072
        );

        float leftBreath = sin(phase * 2.0 + 0.18);
        float rightBreath = sin(phase * 2.0 + 1.02);
        float weightShift = sin(phase);
        float armDrift = sin(phase + 0.62);

        float leftChest = region(uv, vec2(0.30, 0.57), vec2(0.19, 0.18));
        float rightChest = region(uv, vec2(0.69, 0.57), vec2(0.18, 0.18));
        float leftShoulder = region(uv, vec2(0.19, 0.66), vec2(0.17, 0.13));
        float rightShoulder = region(uv, vec2(0.79, 0.64), vec2(0.16, 0.14));
        float leftArm = region(uv, vec2(0.13, 0.34), vec2(0.13, 0.25));
        float rightArm = region(uv, vec2(0.88, 0.34), vec2(0.12, 0.25));
        float seatedLeg = region(uv, vec2(0.52, 0.17), vec2(0.34, 0.18));
        float standingLegs = region(uv, vec2(0.73, 0.17), vec2(0.21, 0.22));
        float leftFace = region(uv, vec2(0.31, 0.79), vec2(0.13, 0.12));
        float rightFace = region(uv, vec2(0.68, 0.80), vec2(0.12, 0.12));
        float seatedProduct = region(uv, vec2(0.43, 0.25), vec2(0.24, 0.13));
        float standingProduct = region(uv, vec2(0.70, 0.27), vec2(0.19, 0.13));
        float protectedAreas = clamp(
          (leftFace + rightFace) * 1.35 +
          (seatedProduct + standingProduct) * 1.55,
          0.0,
          1.0
        );

        // Coherent, sub-pixel translations: no local scaling, hence no rubber anatomy.
        vec2 bodyMotion = vec2(0.0);
        bodyMotion += vec2(-0.00020, -0.00115) * leftChest * leftBreath;
        bodyMotion += vec2(0.00016, -0.00102) * rightChest * rightBreath;
        bodyMotion += vec2(-0.00048, -0.00062) * leftShoulder * leftBreath;
        bodyMotion += vec2(0.00042, -0.00055) * rightShoulder * rightBreath;
        bodyMotion += vec2(-0.00115, 0.00018) * leftArm * armDrift;
        bodyMotion += vec2(0.00098, 0.00014) * rightArm * armDrift;
        bodyMotion += vec2(-0.00072, 0.00048) * seatedLeg * weightShift;
        bodyMotion += vec2(0.00058, 0.00018) * standingLegs * weightShift;
        sampleUv += bodyMotion * (1.0 - smoothstep(0.12, 0.78, protectedAreas));

        sampleUv = clamp(sampleUv, vec2(0.002), vec2(0.998));
        vec3 photo = texture2D(u_image, sampleUv).rgb;

        // Every temporal term derives from the same closed orbit: exact 24 s loop.
        vec2 liquidP = uv * vec2(2.18, 2.82);
        liquidP += orbit * vec2(0.18, 0.14);
        vec2 liquidWarp = vec2(
          fbm(liquidP * 1.17 + orbit.yx * 0.22),
          fbm(liquidP * 1.09 - orbit * 0.19)
        );
        vec2 warpedP = liquidP + (liquidWarp - 0.5) * 1.34;
        float liquidField = fbm(warpedP);
        float ribbons = sin(
          (uv.x * 0.92 + uv.y * 0.36 + liquidField * 1.18) * 10.4 -
          orbit.x * 0.58 + orbit.y * 0.36
        );
        float frameDistance = min(
          min(uv.x, 1.0 - uv.x),
          min(uv.y, 1.0 - uv.y)
        );
        float edgeEntry = 1.0 - smoothstep(0.02, 0.31, frameDistance);
        float liquidMask = smoothstep(
          0.64,
          0.84,
          liquidField + ribbons * 0.10 + edgeEntry * 0.28
        );
        liquidMask *= 1.0 - smoothstep(0.04, 0.72, protectedAreas);

        float epsilon = 0.010;
        float liquidX = fbm(warpedP + vec2(epsilon, 0.0));
        float liquidY = fbm(warpedP + vec2(0.0, epsilon));
        vec2 liquidNormal = (vec2(liquidX, liquidY) - liquidField) / epsilon;
        vec2 refractUv = clamp(
          sampleUv + liquidNormal * liquidMask * 0.0065,
          vec2(0.002),
          vec2(0.998)
        );
        vec3 refractedPhoto = texture2D(u_image, refractUv).rgb;

        float ridge = pow(max(0.0, 1.0 - abs(ribbons)), 8.0);
        float silverBody = smoothstep(0.50, 0.82, liquidField);
        vec3 metalNormal = normalize(vec3(-liquidNormal * 0.72, 1.0));
        vec3 keyLight = normalize(vec3(-0.45, 0.62, 0.68));
        float specular = pow(max(dot(reflect(-keyLight, metalNormal), vec3(0.0, 0.0, 1.0)), 0.0), 18.0);
        float fresnel = pow(1.0 - max(metalNormal.z, 0.0), 3.0);
        vec3 chrome = mix(
          vec3(0.028, 0.032, 0.043),
          vec3(0.49, 0.54, 0.62),
          silverBody
        );
        chrome = mix(chrome, vec3(0.93, 0.96, 1.0), ridge * 0.72 + specular * 0.62);
        chrome += vec3(0.07, 0.025, 0.085) * (1.0 - uv.y);
        chrome += vec3(0.20, 0.23, 0.29) * fresnel;

        vec3 color = mix(photo, refractedPhoto, liquidMask * 0.30);
        color = mix(color, chrome, liquidMask * 0.62);

        float vignette = smoothstep(
          0.86,
          0.22,
          length((uv - 0.5) * vec2(0.78, 1.0))
        );
        color *= 0.83 + vignette * 0.19;
        color = pow(max(color, 0.0), vec3(0.98));
        float grain = hash(gl_FragCoord.xy) - 0.5;
        color += grain * (0.0075 + sin(phase * 3.0) * 0.001);

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

    const time = gl.getUniformLocation(program, "u_time");
    const pointer = gl.getUniformLocation(program, "u_pointer");
    const imageUniform = gl.getUniformLocation(program, "u_image");
    const texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.uniform1i(imageUniform, 0);

    const image = new window.Image();
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let imageReady = false;
    let isVisible = true;
    let pageIsVisible = !document.hidden;
    let pointerX = 0.5;
    let pointerY = 0.5;
    let pointerTargetX = 0.5;
    let pointerTargetY = 0.5;
    const start = performance.now();

    const render = (now: number) => {
      frame = 0;
      if (!imageReady) return;

      const dprCap = window.innerWidth < 768 ? 1.2 : 1.55;
      const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
      const width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
      const height = Math.max(1, Math.floor(canvas.clientHeight * dpr));

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
      }

      pointerX += (pointerTargetX - pointerX) * 0.045;
      pointerY += (pointerTargetY - pointerY) * 0.045;
      gl.uniform1f(time, reducedMotion.matches ? 1.6 : (now - start) / 1000);
      gl.uniform2f(pointer, pointerX, pointerY);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      canvas.dataset.ready = "true";

      if (!reducedMotion.matches && isVisible && pageIsVisible) {
        frame = window.requestAnimationFrame(render);
      }
    };

    const resume = () => {
      if (!frame && imageReady && isVisible && pageIsVisible) {
        frame = window.requestAnimationFrame(render);
      }
    };

    image.onload = () => {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        image,
      );
      imageReady = true;
      resume();
    };
    image.src = window.matchMedia("(max-width: 760px)").matches
      ? MOBILE_IMAGE_SRC
      : DESKTOP_IMAGE_SRC;

    const observer = new IntersectionObserver(
      ([entry]) => {
        isVisible = entry.isIntersecting;
        if (!isVisible && frame) {
          window.cancelAnimationFrame(frame);
          frame = 0;
        } else {
          resume();
        }
      },
      { threshold: 0.01 },
    );
    observer.observe(canvas);

    const handlePointer = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const rect = canvas.getBoundingClientRect();
      pointerTargetX = Math.min(
        1,
        Math.max(0, (event.clientX - rect.left) / rect.width),
      );
      pointerTargetY = Math.min(
        1,
        Math.max(0, 1 - (event.clientY - rect.top) / rect.height),
      );
    };
    const resetPointer = () => {
      pointerTargetX = 0.5;
      pointerTargetY = 0.5;
    };
    window.addEventListener("pointermove", handlePointer, { passive: true });
    window.addEventListener("pointerleave", resetPointer);

    const handleVisibility = () => {
      pageIsVisible = !document.hidden;
      if (!pageIsVisible && frame) {
        window.cancelAnimationFrame(frame);
        frame = 0;
      } else {
        resume();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    const handleReducedMotion = () => {
      if (reducedMotion.matches && frame) {
        window.cancelAnimationFrame(frame);
        frame = 0;
        render(performance.now());
      } else {
        resume();
      }
    };
    reducedMotion.addEventListener("change", handleReducedMotion);

    const handleContextLost = (event: Event) => {
      event.preventDefault();
      window.cancelAnimationFrame(frame);
      frame = 0;
      canvas.dataset.ready = "false";
    };
    const handleContextRestored = () => {
      canvas.dataset.ready = "false";
    };
    canvas.addEventListener("webglcontextlost", handleContextLost);
    canvas.addEventListener("webglcontextrestored", handleContextRestored);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("visibilitychange", handleVisibility);
      reducedMotion.removeEventListener("change", handleReducedMotion);
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      canvas.removeEventListener("webglcontextrestored", handleContextRestored);
      window.removeEventListener("pointermove", handlePointer);
      window.removeEventListener("pointerleave", resetPointer);
      gl.deleteTexture(texture);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
    };
  }, []);

  return (
    <div className="aj-film__living-duo" aria-hidden="true">
      <Image
        className="aj-film__duo-source aj-film__duo-source--desktop"
        unoptimized
        src={DESKTOP_IMAGE_SRC}
        alt=""
        fill
        priority
        sizes="(max-width: 760px) 1px, 107vh"
      />
      <Image
        className="aj-film__duo-source aj-film__duo-source--mobile"
        unoptimized
        src={MOBILE_IMAGE_SRC}
        alt=""
        fill
        priority
        sizes="(max-width: 760px) 100vw, 1px"
      />
      <canvas ref={canvasRef} />
    </div>
  );
}
