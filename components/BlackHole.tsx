"use client";

import { useEffect, useRef } from "react";

/**
 * Buraco negro Gargantua — lente gravitacional REAL via fragment shader WebGL.
 *
 * Por que não dá pra fazer com CSS:
 * O "arco superior" luminoso não é o disco "em cima" do buraco. É a luz do disco
 * de acreção que está ATRÁS do buraco negro, cuja trajetória foi curvada ~180°
 * pela gravidade extrema e reaparece por cima (e por baixo). Isso é um efeito de
 * lente gravitacional — exige calcular a geodésica do fóton pixel a pixel.
 *
 * Este shader integra a trajetória de cada raio de luz usando a aproximação de
 * Schwarzschild para a aceleração do fóton:  a = -1.5 · h² · r / |r|⁵
 * (h = momento angular do raio em relação ao centro). Onde o raio cruza o plano
 * do disco, amostramos o disco; senão, amostramos o céu de estrelas — já distorcido.
 */

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform vec2  uRes;
uniform float uTime;

// hash 3D para estrelas
float hash(vec3 p){
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

// céu de fundo: estrelas esparsas + leve nebulosa (amostrado pela direção final do raio)
vec3 starfield(vec3 dir){
  vec3 col = vec3(0.0);
  for(int i = 0; i < 3; i++){
    float scale = 24.0 + float(i) * 48.0;
    vec3 p  = dir * scale;
    vec3 ip = floor(p);
    float h = hash(ip);
    if(h > 0.982){
      float b = fract(h * 137.0);
      float tw = 0.6 + 0.4 * sin(uTime * 0.8 + h * 40.0);
      col += vec3(b * 0.9, b * 0.92, b) * tw;
    }
  }
  // nebulosa fria, bem sutil
  float neb = pow(max(0.0, 0.5 + 0.5 * dir.y), 2.0);
  col += vec3(0.015, 0.02, 0.045) * neb;
  return col;
}

// cor do disco de acreção pela distância radial (interno quente -> externo frio)
vec3 diskColor(float r, float rin, float rout){
  float t = clamp((r - rin) / (rout - rin), 0.0, 1.0);
  vec3 hot  = vec3(1.0, 0.96, 0.85);
  vec3 mid  = vec3(1.0, 0.62, 0.22);
  vec3 cool = vec3(0.75, 0.20, 0.04);
  vec3 c = mix(hot, mid, smoothstep(0.0, 0.45, t));
  c = mix(c, cool, smoothstep(0.45, 1.0, t));
  return c;
}

// turbulência radial/angular do disco (faixas em rotação)
float diskTexture(vec3 hit, float r){
  float ang = atan(hit.z, hit.x);
  float swirl = ang * 3.0 + r * 1.6 - uTime * 0.9;
  float bands = 0.6 + 0.4 * sin(swirl);
  float fine  = 0.7 + 0.3 * sin(swirl * 4.0 + r * 3.0);
  return bands * fine;
}

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;

  // câmera: levemente acima do plano do disco, olhando o centro
  float orbit = uTime * 0.05;
  float camDist = 13.0;
  vec3 ro = vec3(sin(orbit) * camDist, 1.6, -cos(orbit) * camDist);
  vec3 ta = vec3(0.0, 0.0, 0.0);
  vec3 fwd   = normalize(ta - ro);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), fwd));
  vec3 up    = cross(fwd, right);
  float fov  = 1.3;
  vec3 dir = normalize(fwd + uv.x * fov * right + uv.y * fov * up);

  // integração da geodésica do fóton
  vec3 pos = ro;
  vec3 vel = dir;
  vec3 L   = cross(pos, vel);
  float h2 = dot(L, L);            // momento angular² do raio

  const float rs   = 1.0;          // raio do horizonte (escala)
  const float rin  = 2.6;          // borda interna do disco
  const float rout = 9.5;          // borda externa do disco

  vec3  color = vec3(0.0);
  float alpha = 0.0;
  bool  captured = false;
  float dt = 0.16;

  for(int i = 0; i < 170; i++){
    float r = length(pos);
    if(r < rs * 1.02){ captured = true; break; }   // caiu no horizonte
    if(r > 32.0) break;                            // escapou ao infinito

    vec3 prev = pos;
    // aceleração do fóton (curva a luz em direção ao centro)
    vec3 acc = -1.5 * h2 * pos / pow(dot(pos, pos), 2.5);
    vel += acc * dt;
    pos += vel * dt;

    // cruzou o plano do disco (y = 0)?
    if(prev.y * pos.y < 0.0){
      float f = prev.y / (prev.y - pos.y);
      vec3 hit = mix(prev, pos, f);
      float rr = length(vec2(hit.x, hit.z));
      if(rr > rin && rr < rout){
        vec3 dc = diskColor(rr, rin, rout);
        float tex = diskTexture(hit, rr);
        float bright = 1.6 / (0.4 + (rr - rin) * 0.45);
        // Doppler beaming: material orbitando em direção à câmera fica mais brilhante
        vec3 orbitDir = normalize(cross(vec3(0.0, 1.0, 0.0), hit));
        vec3 toCam = normalize(ro - hit);
        float dop = 0.5 + 0.5 * dot(orbitDir, toCam);
        dop = pow(dop, 2.2) * 2.2 + 0.25;
        float a = 0.9;
        vec3 add = dc * bright * tex * dop;
        color += (1.0 - alpha) * add;
        alpha += (1.0 - alpha) * a;
      }
    }
  }

  // fundo (estrelas lenteadas pela direção final do raio)
  vec3 bg = captured ? vec3(0.0) : starfield(normalize(vel));

  // anel de fóton: brilho fino na borda do horizonte aparente
  vec3 outc = color + (1.0 - alpha) * bg;

  // tonemap + leve realce
  outc = outc / (1.0 + outc);
  outc = pow(outc, vec3(0.82));

  // vinheta para integrar ao fundo escuro do dashboard
  float vig = smoothstep(1.25, 0.35, length(uv));
  outc *= 0.35 + 0.65 * vig;

  gl_FragColor = vec4(outc, 1.0);
}
`;

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error("BlackHole shader error:", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

export default function BlackHole({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = (canvas.getContext("webgl", { antialias: false, alpha: false }) ||
      canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) return;

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;

    const prog = gl.createProgram();
    if (!prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error("BlackHole link error:", gl.getProgramInfoLog(prog));
      return;
    }
    gl.useProgram(prog);

    // triângulo de tela cheia
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, "uRes");
    const uTime = gl.getUniformLocation(prog, "uTime");

    // limita resolução interna p/ custo do shader (é só fundo)
    const MAX_DIM = 900;
    function resize() {
      if (!canvas) return;
      const w = canvas.clientWidth || window.innerWidth;
      const h = canvas.clientHeight || window.innerHeight;
      const scale = Math.min(1, MAX_DIM / Math.max(w, h));
      const bw = Math.max(1, Math.round(w * scale));
      const bh = Math.max(1, Math.round(h * scale));
      if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw;
        canvas.height = bh;
      }
      gl!.viewport(0, 0, bw, bh);
    }
    resize();
    window.addEventListener("resize", resize);

    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const start = performance.now();
    let raf = 0;
    let running = true;

    function frame(now: number) {
      if (!running) return;
      resize();
      const t = reduce ? 8.0 : (now - start) / 1000;
      gl!.uniform2f(uRes, canvas!.width, canvas!.height);
      gl!.uniform1f(uTime, t);
      gl!.drawArrays(gl!.TRIANGLES, 0, 3);
      if (reduce) { running = false; return; } // estático: desenha 1 frame
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    const onVis = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!reduce) {
        running = true;
        raf = requestAnimationFrame(frame);
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVis);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buf);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: "100%", height: "100%", display: "block" }}
      aria-hidden="true"
    />
  );
}
