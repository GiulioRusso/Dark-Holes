// Dark Holes · Deep Space — first-person exploration of an endless procedural universe.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const V3 = THREE.Vector3;
// 1 world unit = 10 km. Sectors are cubes; a sector holds at most one star system / black hole / wormhole.
const SECTOR = 100000, LOAD = 2, C_LIGHT = 150000, MAX_WARP = 120000, CRUISE = 3000, SEED = 0x5eed;
const FADE_NEAR = 150000, FADE_FAR = 200000, FOV = 70;

// ---------------------------------------------------------------- rng / helpers
function rng(seed) {
  let t = seed >>> 0 || 1;
  return () => { t = t + 0x6D2B79F5 | 0; let s = t; s = Math.imul(s ^ s >>> 15, s | 1); s ^= s + Math.imul(s ^ s >>> 7, s | 61); return ((s ^ s >>> 14) >>> 0) / 4294967296; };
}
function hash(x, y, z) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1442695041) ^ SEED;
  h = Math.imul(h ^ h >>> 13, 1274126177);
  return (h ^ h >>> 16) >>> 0;
}
const rr = (r, a, b) => a + r() * (b - a), ri = (r, a, b) => Math.floor(rr(r, a, b)), pick = (r, a) => a[Math.floor(r() * a.length)];
const wpick = (r, a) => { let t = r() * a.reduce((s, x) => s + x.w, 0); for (const x of a) if ((t -= x.w) <= 0) return x; return a[0]; };
const jit = (r, s) => new V3((r() * 2 - 1) * s, (r() * 2 - 1) * s * .4, (r() * 2 - 1) * s); // always 3 draws
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const code = r => (r() * 0x10000 | 0).toString(16).toUpperCase().padStart(4, '0'); // catalog id, no invented names
const store = { get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } } };

// ---------------------------------------------------------------- renderer
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
const PR = Math.min(devicePixelRatio, 1.5);
renderer.setPixelRatio(PR);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(FOV, innerWidth / innerHeight, 0.5, 3e6);
scene.add(new THREE.AmbientLight(0xffffff, 0.12));
const sunLight = new THREE.DirectionalLight(0xffffff, 2.2);
scene.add(sunLight, sunLight.target);

// ---------------------------------------------------------------- GLSL
const NOISE = `
vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}
vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1./6.,1./3.); const vec4 D=vec4(0.,.5,1.,2.);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
  float n_=.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.+1.; vec4 s1=floor(b1)*2.+1.; vec4 sh=-step(h,vec4(0.));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.); m=m*m;
  return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
float fbm(vec3 p){float f=0.,a=.5;for(int i=0;i<5;i++){f+=a*snoise(p);p*=2.03;a*=.5;}return f;}
`;
const LD = '\n#include <logdepthbuf_vertex>\n', FD = '\n#include <logdepthbuf_fragment>\n';
const UT = { value: 0 }; // shared clock
function smat(vs, fs, uniforms, extra = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: UT, ...uniforms },
    vertexShader: '#include <common>\n#include <logdepthbuf_pars_vertex>\nuniform float uTime;\n' + vs,
    fragmentShader: '#include <logdepthbuf_pars_fragment>\nuniform float uTime;\n' + NOISE + fs,
    ...extra,
  });
}
const ADD = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false };

const SPHERE_VS = `varying vec3 vP; varying vec3 vN; varying vec3 vW;
void main(){ vP=position; vN=normalize(mat3(modelMatrix)*normal); vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz;
  gl_Position=projectionMatrix*viewMatrix*w; ${LD} }`;

const PLANET_FS = `uniform float uType,uFreq; uniform vec3 uSeed,uC1,uC2,uC3,uLight,uLC,uAtmo;
varying vec3 vP; varying vec3 vN; varying vec3 vW;
void main(){ ${FD}
  vec3 p=normalize(vP), N=normalize(vN), L=normalize(uLight-vW), V=normalize(cameraPosition-vW);
  float ndl=dot(N,L), diff=max(ndl,0.), h=fbm(p*uFreq+uSeed), spec=0.;
  vec3 col, emi=vec3(0.);
  if(uType<.5){ // rocky
    col=mix(uC1,uC2,smoothstep(-.35,.35,h));
    col=mix(col,uC3,smoothstep(.1,.5,fbm(p*uFreq*4.+uSeed.zxy))*.7);
    col*=.8+.4*smoothstep(.3,.7,snoise(p*uFreq*3.+uSeed.yzx));
    for(float k=0.;k<2.;k++){ float cn=snoise(p*uFreq*(4.+k*5.)+uSeed.zxy+k*7.); col*=1.-.35*smoothstep(.62,.75,cn)+.25*smoothstep(.5,.6,cn)*(1.-smoothstep(.6,.66,cn)); }
  } else if(uType<1.5){ // terran
    float land=smoothstep(0.,.06,h);
    vec3 sea=mix(uC1*.45,uC1,smoothstep(-.6,0.,h));
    col=mix(sea,mix(uC2,uC3,smoothstep(.1,.45,h)),land);
    float ice=smoothstep(.72,.8,abs(p.y)+h*.15);
    col=mix(col,vec3(.9,.93,.97),ice);
    spec=pow(max(dot(N,normalize(L+V)),0.),60.)*(1.-land)*(1.-ice)*.9;
    float city=smoothstep(.55,.85,snoise(p*90.+uSeed))*land*(1.-ice);
    emi=vec3(1.,.65,.3)*city*smoothstep(.05,-.2,ndl)*.9;
    emi+=vec3(1.,.45,.2)*exp(-pow(ndl*7.,2.))*.06; // sunset along the terminator
  } else if(uType<2.5){ // gas giant
    float w=fbm(p*vec3(1.5,4.,1.5)*uFreq+uSeed+vec3(uTime*.003,0.,0.));
    float b=p.y*uFreq*3.+w*2.2;
    col=mix(uC1,uC2,.5+.5*sin(b*2.));
    col=mix(col,uC3,smoothstep(.3,1.,sin(b*5.3+1.7))*.6);
    vec3 sc=normalize(vec3(cos(uSeed.x),(fract(uSeed.y)-.5)*.9,sin(uSeed.x)));
    float sd=distance(p,sc)+fbm(p*9.+uSeed)*.03;
    float storm=smoothstep(.17,.02,sd);
    col=mix(col,mix(uC2*1.2,uC3,.5+.5*sin(sd*90.-uTime*.4)),storm*.85);
  } else if(uType<3.5){ // lava
    float c=abs(fbm(p*uFreq*1.5+uSeed.yxz));
    col=mix(uC3,uC3*2.,smoothstep(-.3,.3,h));
    emi=uC1*pow(1.-smoothstep(0.,.1,c),2.)*(2.2+1.2*sin(uTime*.6+h*12.));
  } else { // ice
    col=mix(uC1,uC2,smoothstep(-.3,.4,h));
    col=mix(col,uC3,(1.-smoothstep(0.,.04,abs(snoise(p*uFreq*2.+uSeed))))*.6);
    spec=pow(max(dot(N,normalize(L+V)),0.),30.)*.3;
  }
  float rim=pow(1.-max(dot(N,V),0.),3.)*smoothstep(-.3,.5,ndl);
  vec3 c=col*(diff*1.15+smoothstep(-.2,.3,ndl)*.04)*uLC + col*.012 + spec*uLC + emi + uAtmo*rim*1.2;
  gl_FragColor=vec4(c,1.);
}`;

const CLOUD_FS = `uniform vec3 uSeed,uLight,uLC; varying vec3 vP; varying vec3 vN; varying vec3 vW;
void main(){ ${FD}
  vec3 p=normalize(vP), N=normalize(vN), L=normalize(uLight-vW);
  float n=fbm(p*3.2+uSeed+vec3(uTime*.004,0.,0.));
  float a=smoothstep(.05,.45,n)*.85;
  gl_FragColor=vec4(uLC*(max(dot(N,L),0.)*1.1+.008),a);
}`;

const HALO_FS = `uniform vec3 uAtmo,uLight; varying vec3 vP; varying vec3 vN; varying vec3 vW;
void main(){ ${FD}
  vec3 N=normalize(vN), V=normalize(cameraPosition-vW), L=normalize(uLight-vW);
  float i=pow(smoothstep(0.,.42,abs(dot(N,V))),2.)*smoothstep(-.4,.5,dot(N,L));
  gl_FragColor=vec4(uAtmo*i*1.3,1.);
}`;

const STAR_FS = `uniform vec3 uC,uSeed; varying vec3 vP; varying vec3 vN; varying vec3 vW;
void main(){ ${FD}
  vec3 p=normalize(vP), V=normalize(cameraPosition-vW); float mu=max(dot(normalize(vN),V),0.);
  float n=fbm(p*4.+uSeed+vec3(0.,uTime*.02,uTime*.015)), g=snoise(p*28.+uTime*.05);
  float spot=smoothstep(.55,.75,snoise(p*5.+uSeed*1.7+uTime*.004));
  vec3 c=uC*(1.-spot*.5)*(.9+n*.5+g*.1)*(.55+.45*sqrt(mu)) + uC*pow(1.-mu,3.)*.5;
  gl_FragColor=vec4(c,1.);
}`;

const RING_VS = `varying vec3 vL; varying vec3 vW;
void main(){ vL=position; vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; ${LD} }`;
const RING_FS = `uniform vec3 uLight,uP,uC1,uLC; uniform float uPR,uSeed,uIn,uOut; varying vec3 vL; varying vec3 vW;
void main(){ ${FD}
  float t=(length(vL.xy)-uIn)/(uOut-uIn); if(t<0.||t>1.) discard;
  float b=(.55+.45*sin(t*70.+uSeed)*sin(t*23.+uSeed*1.7))*(.6+.4*snoise(vec3(t*40.,uSeed,0.)));
  float a=b*smoothstep(0.,.02,abs(t-.62)-.015)*smoothstep(0.,.08,t)*smoothstep(1.,.85,t)*.85;
  vec3 L=normalize(uLight-vW), oc=vW-uP; float bb=dot(oc,L), cc=dot(oc,oc)-uPR*uPR;
  float sh=(bb<0.&&bb*bb-cc>0.)?.06:1.;
  gl_FragColor=vec4(uC1*uLC*sh*.9,a);
}`;

const DISK_VS = `varying vec2 vL; varying vec3 vW; varying vec3 vT;
void main(){ vL=position.xy; vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz;
  vT=normalize(mat3(modelMatrix)*vec3(-position.y,position.x,0.)); gl_Position=projectionMatrix*viewMatrix*w; ${LD} }`;
const DISK_FS = `uniform float uFade; varying vec2 vL; varying vec3 vW; varying vec3 vT;
void main(){ ${FD}
  float r=length(vL), a=atan(vL.y,vL.x), t=(r-3.)/7.;
  float ph=a-uTime*2.5*pow(r/3.,-1.5);
  float n=fbm(vec3(cos(ph)*r*.8,sin(ph)*r*.8,r*.6)), n2=snoise(vec3(r*3.,ph*2.,uTime*.2));
  float I=max(0.,.55+n*.9+n2*.15)*smoothstep(0.,.06,t)*pow(max(1.-t,0.),1.6);
  vec3 col=mix(vec3(1.,.96,.9),vec3(1.,.78,.48),smoothstep(0.,.35,t));
  col=mix(col,vec3(.55,.32,.16),smoothstep(.35,.95,t));
  float dop=1.+.3*dot(normalize(vT),normalize(cameraPosition-vW));
  gl_FragColor=vec4(col*I*dop*dop*1.8*uFade,1.);
}`;

const WH_FS = `uniform samplerCube uSky; uniform float uFade; varying vec3 vP; varying vec3 vN; varying vec3 vW;
void main(){ ${FD}
  vec3 V=normalize(vW-cameraPosition), N=normalize(vN);
  float f=max(dot(-V,N),0.);
  vec3 d=refract(V,N,.55); d=vec3(-d.z,-d.y,d.x); // look into a different patch of sky
  vec3 col=textureCube(uSky,d).rgb*9.;
  float g=exp(-pow(length(d.xz-vec2(.35,.1)),2.)*14.)*exp(-d.y*d.y*40.); // the far galaxy
  col+=vec3(1.,.86,.66)*g*(.6+.6*fbm(d*6.))*1.4;
  col+=vec3(1.)*pow(max(snoise(d*90.),0.),12.)*2.5;
  col=mix(col,vec3(.85,.82,.78),pow(1.-f,5.)*.9); // bright Einstein rim
  gl_FragColor=vec4(col*uFade,1.);
}`;

const BEAM_VS = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); ${LD} }`;
const BEAM_FS = `uniform vec3 uC; uniform float uFade,uPow; varying vec2 vUv;
void main(){ ${FD}
  float a=pow(clamp(vUv.y,0.,1.),uPow)*(.65+.35*snoise(vec3(vUv.x*8.,vUv.y*14.-uTime*.6,uTime*.2)));
  gl_FragColor=vec4(uC*a*uFade,1.);
}`;
const NEB_VS = `attribute vec4 aData; attribute vec3 aCol; uniform float uFade;
varying vec2 vUv; varying vec3 vCol; varying float vA;
void main(){
  vec3 center=(modelMatrix*instanceMatrix*vec4(0.,0.,0.,1.)).xyz;
  float sc=length(instanceMatrix[0].xyz), c=cos(aData.x), s=sin(aData.x);
  vec2 q=mat2(c,-s,s,c)*position.xy;
  vec3 R=vec3(viewMatrix[0][0],viewMatrix[1][0],viewMatrix[2][0]), U=vec3(viewMatrix[0][1],viewMatrix[1][1],viewMatrix[2][1]);
  vA=aData.y*clamp(distance(cameraPosition,center)/(sc*.6),0.,1.)*uFade; vUv=uv; vCol=aCol;
  gl_Position=projectionMatrix*viewMatrix*vec4(center+(R*q.x+U*q.y)*sc,1.); ${LD} }`;
const NEB_FS = `uniform sampler2D uMap; varying vec2 vUv; varying vec3 vCol; varying float vA;
void main(){ ${FD} gl_FragColor=vec4(vCol*texture2D(uMap,vUv).a*vA,1.); }`;

const POINTS_VS = `attribute float aSize; attribute vec3 aCol; varying vec3 vC;
void main(){ vC=aCol; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); gl_PointSize=aSize; ${LD} }`;
const POINTS_FS = `varying vec3 vC; void main(){ ${FD} float d=length(gl_PointCoord-.5); gl_FragColor=vec4(vC*smoothstep(.5,0.,d),1.); }`;

const SKY_FS = `uniform vec3 uGC; varying vec3 vP; varying vec3 vN; varying vec3 vW;
void main(){ ${FD}
  vec3 d=normalize(vP); float band=exp(-d.y*d.y*26.), core=pow(max(dot(d,uGC),0.),6.);
  float n=fbm(d*3.5), n2=fbm(d*9.+7.);
  vec3 col=vec3(.62,.56,.47)*band*(.3+.7*smoothstep(-.3,.6,n))*.075;
  col+=vec3(1.,.8,.58)*core*band*.22*(.6+.4*n);
  col*=1.-smoothstep(0.,.5,n2)*band*.85;
  col+=vec3(.14,.17,.22)*pow(max(fbm(d*1.6+3.),0.),2.)*.05;
  gl_FragColor=vec4(col,1.);
}`;

// ---------------------------------------------------------------- shared assets
const GEO = {
  sphere: new THREE.SphereGeometry(1, 96, 64),
  ring: new THREE.RingGeometry(1.2, 2.6, 160, 1),
  cone: new THREE.ConeGeometry(1, 1, 32, 1, true).translate(0, -.5, 0), // tip at origin, opening toward -Y
  disk: new THREE.RingGeometry(3, 10, 256, 6),
  rock: (() => {
    const g = new THREE.IcosahedronGeometry(1, 1), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const f = 1 + .32 * Math.sin(x * 5) * Math.sin(y * 4 + 1) * Math.sin(z * 6 + 2) + .15 * Math.sin(x * 11 + z * 7);
      p.setXYZ(i, x * f, y * f * .8, z * f);
    }
    g.computeVertexNormals();
    return g;
  })(),
};
const sharedMat = m => (m.userData.shared = true, m);
const MAT = {
  black: sharedMat(new THREE.MeshBasicMaterial({ color: 0 })),
  rock: sharedMat(new THREE.MeshStandardMaterial({ color: 0x8a7d70, roughness: .95, flatShading: true })),
};
function canvasTex(size, draw) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  draw(cv.getContext('2d'), size);
  return new THREE.CanvasTexture(cv);
}
const glowTex = canvasTex(256, (g, s) => {
  const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  [[0, 1], [.08, .8], [.25, .25], [.55, .05], [1, 0]].forEach(([o, a]) => gr.addColorStop(o, `rgba(255,255,255,${a})`));
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
});
const cloudTex = canvasTex(256, (g, s) => {
  const r = rng(7);
  for (let i = 0; i < 70; i++) {
    const x = s / 2 + (r() - .5) * s * .5, y = s / 2 + (r() - .5) * s * .5, rad = rr(r, s * .06, s * .28);
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, `rgba(255,255,255,${rr(r, .05, .16)})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
  }
  g.globalCompositeOperation = 'destination-in';
  const m = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  m.addColorStop(0, '#fff'); m.addColorStop(.65, 'rgba(255,255,255,.6)'); m.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = m; g.fillRect(0, 0, s, s);
});
function sprite(color, scale, opacity, mul = 1.4) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: color.clone().multiplyScalar(mul), opacity, ...ADD }));
  s.scale.setScalar(scale); s.userData.base = opacity;
  return s;
}

// ---------------------------------------------------------------- sky: baked galaxy cubemap + live starfield
const skyTex = (() => {
  const sky = new THREE.Scene();
  sky.add(new THREE.Mesh(new THREE.SphereGeometry(1000, 64, 32),
    smat(SPHERE_VS, SKY_FS, { uGC: { value: new V3(1, 0, .3).normalize() } }, { side: THREE.BackSide })));
  const crt = new THREE.WebGLCubeRenderTarget(1024, { type: THREE.HalfFloatType });
  new THREE.CubeCamera(1, 5000, crt).update(renderer, sky);
  return crt.texture;
})();
scene.background = skyTex;
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromCubemap(skyTex).texture; // reflections on the ship's steel
const starfield = (() => {
  const N = 2600, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N), r = rng(99);
  const tints = [[1, .97, .92], [1, 1, 1], [.85, .9, 1], [1, .88, .72], [.9, .93, 1]];
  const d = new V3();
  for (let i = 0; i < N; i++) {
    if (i < N * .55) { const a = r() * 6.283; d.set(Math.cos(a), (r() + r() + r() - 1.5) * .12, Math.sin(a)); }
    else d.set(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1);
    d.normalize().multiplyScalar(2.4e6).toArray(pos, i * 3);
    const t = pick(r, tints), b = Math.pow(r(), 6) * .9 + .1;
    col.set([t[0] * b, t[1] * b, t[2] * b], i * 3);
    size[i] = (1 + Math.pow(r(), 8) * 1.6) * PR;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  const p = new THREE.Points(g, smat(POINTS_VS, POINTS_FS, {}, ADD));
  p.frustumCulled = false; p.renderOrder = -1;
  scene.add(p);
  return p;
})();

// ---------------------------------------------------------------- universe generation
const discSet = new Set(store.get('dh3d.disc', []));
const STARS = [
  { k: 'Yellow dwarf', c: [1, .82, .55], R: [1800, 2600], w: 3 },
  { k: 'Orange dwarf', c: [1, .6, .3], R: [1400, 2200], w: 2 },
  { k: 'Red dwarf', c: [1, .38, .2], R: [900, 1500], w: 3 },
  { k: 'White star', c: [.95, .95, 1], R: [2200, 3200], w: 1 },
  { k: 'Blue giant', c: [.55, .7, 1], R: [3500, 5200], w: 1 },
  { k: 'Red giant', c: [1, .42, .18], R: [7000, 10000], w: .6 },
  { k: 'Brown dwarf', c: [.5, .2, .1], R: [600, 900], w: .8 },
  { k: 'White dwarf', c: [.85, .9, 1], R: [250, 400], w: .6 },
];
const PTYPES = ['Rocky world', 'Terran world', 'Gas giant', 'Lava world', 'Ice world'];
const PALS = [
  [[[.32, .28, .25], [.55, .47, .4], [.18, .16, .15]], [[.45, .2, .1], [.7, .42, .25], [.28, .12, .08]], [[.4, .4, .42], [.62, .62, .64], [.25, .25, .27]]],
  [[[.03, .12, .35], [.12, .32, .1], [.45, .38, .25]], [[.03, .2, .3], [.35, .3, .12], [.6, .55, .45]], [[.1, .05, .3], [.35, .12, .4], [.6, .4, .5]]],
  [[[.8, .62, .42], [.5, .32, .18], [.95, .9, .8]], [[.2, .38, .8], [.38, .58, .95], [.12, .2, .55]], [[.85, .78, .55], [.7, .6, .4], [.95, .92, .8]],
   [[.75, .38, .55], [.45, .2, .45], [.95, .75, .8]], [[.3, .7, .65], [.15, .45, .5], [.8, .95, .9]]],
  [[[1, .35, .05], [.3, .08, .03], [.12, .06, .05]], [[1, .6, .1], [.3, .15, .02], [.1, .08, .07]]],
  [[[.7, .82, .95], [.45, .6, .85], [.92, .96, 1]], [[.85, .88, .9], [.6, .7, .75], [.4, .55, .7]]],
];
const NEBS = [[[.8, .6, .42], [.3, .26, .24]], [[.5, .56, .66], [.22, .24, .3]], [[.9, .72, .5], [.45, .32, .24]], [[.62, .5, .45], [.3, .34, .42]]];
const pSys = sy => .5 * Math.exp(-Math.abs(sy) * .35); // galaxy disk thins out vertically

function addBody(sec, props) {
  const b = { id: sec.key + ':' + sec.n++, pos: new V3(), prev: new V3(), delta: new V3(), gm: 0, lockR: 0, ...props };
  b.disc = discSet.has(b.id);
  sec.bodies.push(b);
  return b;
}
function orbitPos(b, t, out) {
  const o = b.orbit, th = o.phase + o.omega * t;
  return out.set(Math.cos(th) * o.a, Math.sin(th) * o.a * o.incl, Math.sin(th) * o.a).add(o.parent.pos);
}
const fadeOf = d => 1 - sstep(FADE_NEAR, FADE_FAR, d);

function starVisual(r, col, R, bright) {
  const obj = new THREE.Group();
  const surf = new THREE.Mesh(GEO.sphere, smat(SPHERE_VS, STAR_FS, { uC: { value: col.clone().lerp(new THREE.Color(1, 1, 1), .35).multiplyScalar(bright) }, uSeed: { value: new V3(rr(r, 0, 99), rr(r, 0, 99), rr(r, 0, 99)) } }));
  surf.scale.setScalar(R);
  const glows = [sprite(col.clone().lerp(new THREE.Color(1, 1, 1), .35), R * 6, .45 * bright), sprite(col, R * 24, .07 * bright), sprite(col.clone().lerp(new THREE.Color(.8, .9, 1), .5), 1, .09 * bright)];
  glows[2].scale.set(R * 60, R * 1.1, 1); // cinematic horizontal flare
  obj.add(surf, ...glows);
  return { obj, glows };
}
function makeComet(sec, r, group, star) {
  const R = rr(r, 40, 90), a = rr(r, 14000, 34000);
  const b = addBody(sec, {
    kind: 'comet', label: 'Comet', name: 'C/' + code(r), R, gm: R * R * 5, lockR: R, discR: R * 60,
    orbit: { parent: star, a, omega: (r() < .5 ? 1 : -1) * rr(r, 80, 160) / a, phase: rr(r, 0, 6.283), incl: rr(r, -.6, .6) },
  });
  orbitPos(b, simT, b.pos); b.prev.copy(b.pos);
  const obj = new THREE.Group();
  const nucleus = new THREE.Mesh(GEO.rock, MAT.rock); nucleus.scale.setScalar(R);
  const coma = sprite(new THREE.Color(.75, .88, 1), R * 14, .5, 1.2);
  const U = { uC: { value: new THREE.Color(.55, .7, .9) }, uFade: { value: 1 }, uPow: { value: 2.2 } };
  const tail = new THREE.Mesh(GEO.cone, smat(BEAM_VS, BEAM_FS, U, { ...ADD, side: THREE.DoubleSide }));
  const U2 = { uC: { value: new THREE.Color(.75, .6, .42) }, uFade: { value: .7 }, uPow: { value: 1.6 } };
  const dust = new THREE.Mesh(GEO.cone, smat(BEAM_VS, BEAM_FS, U2, { ...ADD, side: THREE.DoubleSide })); // curved dust tail, lags behind the motion
  obj.add(nucleus, coma, tail, dust); group.add(obj);
  const away = new V3(), lag = new V3(), DOWN = new V3(0, -1, 0);
  b.obj = obj;
  b.render = () => {
    obj.position.copy(b.pos); nucleus.rotation.y = simT * .2;
    away.subVectors(b.pos, star.pos); const ds = away.length();
    const L = 1500 + 9000 * (1 - sstep(8000, 40000, ds)); // tail grows near the star, always points away from it
    tail.quaternion.setFromUnitVectors(DOWN, away.divideScalar(ds)); tail.scale.set(L * .09, L, L * .09);
    if (b.delta.lengthSq() > 1e-6) lag.copy(b.delta).normalize().multiplyScalar(-.7).add(away).normalize();
    dust.quaternion.setFromUnitVectors(DOWN, lag.lengthSq() ? lag : away); dust.scale.set(L * .16, L * .7, L * .16);
  };
}
function makeSystem(sec, r, c, home) {
  const st = home ? STARS[0] : wpick(r, STARS), R = rr(r, ...st.R), col = new THREE.Color(...st.c), name = 'STAR-' + code(r);
  const star = addBody(sec, { kind: 'star', label: st.k, name, R, gm: R * R * 35, lockR: R, discR: R * 8 });
  star.pos.copy(c);
  const { obj, glows } = starVisual(r, col, R, st.k === 'Brown dwarf' ? .35 : 1);
  obj.position.copy(c);
  sec.group.add(obj);
  const sysGroup = new THREE.Group(); sec.group.add(sysGroup);
  const lightCol = col.clone().lerp(new THREE.Color(1, 1, 1), .45);
  const belts = [];
  const dir = r() < .5 ? 1 : -1;
  let orbit = R * (R > 6000 ? 1.7 : 3) + rr(r, 2500, 5000);
  if (!home && R < 6000 && r() < .2) { // binary: a close companion star
    const cs = wpick(r, STARS.slice(0, 3)), cR = R * rr(r, .3, .6), cc = new THREE.Color(...cs.c), a = orbit;
    const comp = addBody(sec, { kind: 'star', label: cs.k + ' (companion)', name: name + ' B', R: cR, gm: cR * cR * 35, lockR: cR, discR: cR * 8, orbit: { parent: star, a, omega: dir * 70 / a, phase: rr(r, 0, 6.283), incl: 0 } });
    orbitPos(comp, simT, comp.pos); comp.prev.copy(comp.pos);
    const cv = starVisual(r, cc, cR, 1);
    sysGroup.add(cv.obj);
    comp.obj = cv.obj; comp.render = () => cv.obj.position.copy(comp.pos);
    orbit += a + cR * 4;
  }
  const nP = home ? 5 : ri(r, 1, 8);
  for (let i = 0; i < nP && orbit < 36000; i++) {
    const f = orbit / 36000;
    const type = home ? [0, 1, 2, 4, 2][i] : wpick(r, [.8, f > .1 && f < .6 ? .8 : .1, f * 1.6, Math.max(0, .6 - f * 2), f * .9].map((w, t) => ({ w, t }))).t;
    const pr = type === 2 ? rr(r, 800, 2200) : rr(r, 150, 650);
    orbit += pr * 2;
    const pl = makePlanet(sec, r, sysGroup, star, lightCol, {
      type, R: home && i === 1 ? 520 : pr, parent: star, a: orbit, omega: dir * rr(r, 20, 50) / orbit,
      name: name + ' ' + 'bcdefghij'[i], rings: home ? i === 2 : r() < (type === 2 ? .6 : .12),
    });
    if (home && i === 1) sec.home = pl;
    const nm = type === 2 ? ri(r, 0, 4) : (type === 1 || home && i === 1) ? ri(r, 1, 3) : ri(r, 0, 2);
    for (let j = 0; j < nm; j++) {
      const mr = Math.max(50, pr * rr(r, .1, .28));
      makePlanet(sec, r, sysGroup, star, lightCol, {
        type: r() < .6 ? 0 : 4, R: mr, parent: pl, a: pr * rr(r, 3, 4.5) + j * pr * 2.2, omega: rr(r, 12, 30) / (pr * 4 + j * pr * 2),
        name: pl.name + ' ' + ['I', 'II', 'III'][j], moon: true,
      });
    }
    orbit += pr * 2 + rr(r, 3000, 6500);
    if (r() < .25 || (home && i === 2)) { belts.push(makeBelt(r, c, orbit)); orbit += 3500; }
  }
  belts.forEach(b => sysGroup.add(b));
  for (let i = home ? 1 : ri(r, 0, 3); i > 0; i--) makeComet(sec, r, sysGroup, star);
  sec.ticks.push(dt => {
    const d = ship.pos.distanceTo(c), f = fadeOf(d);
    glows.forEach(g => g.material.opacity = g.userData.base * f);
    sysGroup.visible = d < FADE_FAR;
    belts.forEach(b => { b.visible = d < 70000; b.rotation.y += b.userData.omega * dt; });
  });
}

function makePlanet(sec, r, group, star, lightCol, o) {
  const pal = pick(r, PALS[o.type]).map(c => { const k = new THREE.Color(c[0] * rr(r, .85, 1.15), c[1] * rr(r, .85, 1.15), c[2] * rr(r, .85, 1.15)); const l = k.r * .3 + k.g * .55 + k.b * .15; return k.lerp(new THREE.Color(l, l, l), .3); });
  const atmo = [null, new THREE.Color(.3, .55, 1), pal[0].clone().lerp(new THREE.Color(1, 1, 1), .3), new THREE.Color(1, .35, .1), new THREE.Color(.55, .75, 1)][o.type];
  const R = o.R;
  const b = addBody(sec, {
    kind: o.moon ? 'moon' : 'planet', label: o.moon ? 'Moon' : PTYPES[o.type], name: o.name, R, gm: R * R * 18, lockR: R, discR: R * 10,
    orbit: { parent: o.parent, a: o.a, omega: o.omega, phase: rr(r, 0, 6.283), incl: rr(r, -.06, .06) }, spin: rr(r, .01, .05) * (r() < .15 ? -1 : 1),
  });
  orbitPos(b, simT, b.pos); b.prev.copy(b.pos);
  const seed = new V3(rr(r, 0, 99), rr(r, 0, 99), rr(r, 0, 99));
  const U = { uLight: { value: star.pos }, uLC: { value: lightCol }, uSeed: { value: seed } };
  const obj = new THREE.Group(), tilt = new THREE.Group();
  tilt.rotation.set(rr(r, -.15, .15), 0, rr(r, -.45, .45));
  obj.add(tilt); group.add(obj);
  const surf = new THREE.Mesh(GEO.sphere, smat(SPHERE_VS, PLANET_FS, {
    ...U, uType: { value: o.type }, uFreq: { value: [2.2, 1.6, 1, 2, 2][o.type] },
    uC1: { value: pal[0] }, uC2: { value: pal[1] }, uC3: { value: pal[2] }, uAtmo: { value: atmo && !o.moon ? atmo : new THREE.Color(0) },
  }));
  surf.scale.setScalar(R); tilt.add(surf);
  let clouds = null;
  if (atmo && !o.moon) {
    const halo = new THREE.Mesh(GEO.sphere, smat(SPHERE_VS, HALO_FS, { uAtmo: { value: atmo.clone().multiplyScalar(o.type === 1 ? 1 : .6) }, uLight: U.uLight }, { ...ADD, side: THREE.BackSide }));
    halo.scale.setScalar(R * 1.1); tilt.add(halo);
  }
  if (o.type === 1) {
    clouds = new THREE.Mesh(GEO.sphere, smat(SPHERE_VS, CLOUD_FS, U, { transparent: true, depthWrite: false }));
    clouds.scale.setScalar(R * 1.012); tilt.add(clouds);
  }
  if (o.rings) {
    const ring = new THREE.Mesh(GEO.ring, smat(RING_VS, RING_FS, {
      ...U, uP: { value: b.pos }, uPR: { value: R }, uC1: { value: pal[2].clone().lerp(pal[0], .4) }, uSeed: { value: rr(r, 0, 50) },
      uIn: { value: rr(r, 1.25, 1.6) }, uOut: { value: rr(r, 2.0, 2.55) },
    }, { transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    ring.scale.setScalar(R); ring.rotation.x = -Math.PI / 2; tilt.add(ring);
  }
  b.obj = obj;
  b.render = () => { obj.position.copy(b.pos); surf.rotation.y = b.spin * simT; if (clouds) clouds.rotation.y = b.spin * simT * 1.2; };
  return b;
}

function makeBelt(r, c, a) {
  const N = 700, m = new THREE.InstancedMesh(GEO.rock, MAT.rock, N), M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new V3(), p = new V3();
  for (let i = 0; i < N; i++) {
    const th = r() * 6.283, rad = a + (r() + r() - 1) * 1600;
    p.set(Math.cos(th) * rad, (r() + r() - 1) * 250, Math.sin(th) * rad);
    q.setFromEuler(e.set(r() * 6, r() * 6, r() * 6));
    s.setScalar(8 + Math.pow(r(), 4) * 90);
    m.setMatrixAt(i, M.compose(p, q, s));
  }
  m.position.copy(c); m.computeBoundingSphere();
  m.userData.omega = rr(r, .002, .006);
  return m;
}

function makeBlackHole(sec, r, c) {
  const rs = rr(r, 350, 650);
  const b = addBody(sec, { kind: 'bh', label: 'Black hole', name: 'BH-' + code(r), R: rs, gm: rs * rs * 6000, lockR: 0, discR: rs * 25 });
  b.pos.copy(c);
  const obj = new THREE.Group(); obj.position.copy(c);
  const core = new THREE.Mesh(GEO.sphere, MAT.black); core.scale.setScalar(rs);
  const U = { uFade: { value: 1 } };
  const disk = new THREE.Mesh(GEO.disk, smat(DISK_VS, DISK_FS, U, { ...ADD, side: THREE.DoubleSide }));
  disk.scale.setScalar(rs); disk.rotation.set(rr(r, -1.2, 1.2) - Math.PI / 2, rr(r, 0, 6), 0);
  const glow = sprite(new THREE.Color(1, .55, .25), rs * 16, .15, 1);
  obj.add(core, disk, glow); sec.group.add(obj);
  sec.ticks.push(() => { const f = fadeOf(ship.pos.distanceTo(c)); U.uFade.value = f; glow.material.opacity = .15 * f; });
}

function makeWormhole(sec, r, c) {
  const R = rr(r, 500, 800);
  const b = addBody(sec, { kind: 'wormhole', label: 'Wormhole', name: 'WH-' + code(r), R, gm: R * R * 4, lockR: 0, discR: R * 30 });
  b.pos.copy(c);
  const U = { uFade: { value: 1 }, uSky: { value: skyTex } };
  const m = new THREE.Mesh(GEO.sphere, smat(SPHERE_VS, WH_FS, U)); m.scale.setScalar(R); m.position.copy(c);
  const glow = sprite(new THREE.Color(1, .92, .8), R * 5, .12, 1); glow.position.copy(c);
  sec.group.add(m, glow);
  sec.ticks.push(() => { const f = fadeOf(ship.pos.distanceTo(c)); U.uFade.value = f; glow.material.opacity = .12 * f; });
}

function cloud(sec, c, items) { // items: [{p, s, col, a}]
  const N = items.length, geo = new THREE.PlaneGeometry(1, 1), data = new Float32Array(N * 4), cols = new Float32Array(N * 3);
  const U = { uFade: { value: 1 }, uMap: { value: cloudTex } };
  const m = new THREE.InstancedMesh(geo, smat(NEB_VS, NEB_FS, U, ADD), N), M = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new V3();
  items.forEach((it, i) => {
    m.setMatrixAt(i, M.compose(it.p, q, s.setScalar(it.s)));
    data.set([Math.random() * 6.283, it.a, 0, 0], i * 4);
    it.col.toArray(cols, i * 3);
  });
  geo.setAttribute('aData', new THREE.InstancedBufferAttribute(data, 4));
  geo.setAttribute('aCol', new THREE.InstancedBufferAttribute(cols, 3));
  m.frustumCulled = false; m.userData.ownGeo = true;
  sec.group.add(m);
  sec.ticks.push(() => { U.uFade.value = fadeOf(ship.pos.distanceTo(c)); });
}
function makeNebula(sec, r, c) {
  const S = rr(r, 25000, 50000), pal = pick(r, NEBS).map(x => new THREE.Color(...x));
  addBody(sec, { kind: 'nebula', label: 'Nebula', name: 'NEB-' + code(r), R: S * .45, discR: S * .45 }).pos.copy(c);
  const g = () => (r() + r() + r() - 1.5) / 1.5;
  cloud(sec, c, Array.from({ length: 55 }, () => ({ p: new V3(g() * S * .4, g() * S * .25, g() * S * .4).add(c), s: S * rr(r, .25, .7), col: pal[0].clone().lerp(pal[1], r()), a: rr(r, .025, .06) })));
  const stars = [];
  for (let i = 0; i < 7; i++) {
    const st = sprite(new THREE.Color(.8, .9, 1), rr(r, 500, 1600), .6, 1.2);
    st.position.set(g() * S * .3, g() * S * .2, g() * S * .3).add(c);
    stars.push(st); sec.group.add(st);
  }
  sec.ticks.push(() => { const f = fadeOf(ship.pos.distanceTo(c)); stars.forEach(s => s.material.opacity = .6 * f); });
}
function makePlanetaryNebula(sec, r, c) { // dying star: white dwarf inside a glowing shell
  const R = rr(r, 250, 380), col = new THREE.Color(.85, .9, 1), name = 'PN-' + code(r);
  addBody(sec, { kind: 'star', label: 'White dwarf', name: name + ' WD', R, gm: R * R * 300, lockR: R, discR: R * 40 }).pos.copy(c);
  const { obj, glows } = starVisual(r, col, R, 1.4); obj.position.copy(c); sec.group.add(obj);
  const Rr = rr(r, 7000, 12000);
  addBody(sec, { kind: 'nebula', label: 'Planetary nebula', name, R: Rr * 1.3, discR: Rr * 1.5 }).pos.copy(c);
  const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(rr(r, 0, 3), rr(r, 0, 3), 0));
  const inner = new THREE.Color(.45, .65, .8), outer = new THREE.Color(.95, .45, .3);
  cloud(sec, c, Array.from({ length: 90 }, () => {
    const t = r() * 6.283, w = rr(r, -1, 1);
    const p = new V3(Math.cos(t) * Rr * (1 + w * .18), (r() - .5) * Rr * .35, Math.sin(t) * Rr * (1 + w * .18)).applyQuaternion(tilt).add(c);
    return { p, s: Rr * rr(r, .35, .7), col: inner.clone().lerp(outer, (w + 1) / 2), a: rr(r, .03, .07) };
  }));
  sec.ticks.push(() => { const f = fadeOf(ship.pos.distanceTo(c)); glows.forEach(g => g.material.opacity = g.userData.base * f); });
}
function makePulsar(sec, r, c) { // rotating neutron star sweeping two beams
  const R = rr(r, 60, 110);
  const b = addBody(sec, { kind: 'pulsar', label: 'Pulsar (neutron star)', name: 'PSR-' + code(r), R, gm: R * R * 20000, lockR: R, discR: R * 220 });
  b.pos.copy(c); b.period = rr(r, .8, 2.2);
  const col = new THREE.Color(.75, .85, 1);
  const { obj, glows } = starVisual(r, col, R, 2.2);
  const halo = sprite(col, R * 260, .1, 1); obj.add(halo); glows.push(halo);
  const spin = new THREE.Group(), beams = new THREE.Group();
  beams.rotation.x = rr(r, .35, .7); // magnetic axis tilted from the spin axis
  const U = { uC: { value: new THREE.Color(.55, .7, 1) }, uFade: { value: 1 }, uPow: { value: 3 } };
  for (const s of [1, -1]) {
    const cone = new THREE.Mesh(GEO.cone, smat(BEAM_VS, BEAM_FS, U, { ...ADD, side: THREE.DoubleSide }));
    cone.scale.set(1400, 36000, 1400); if (s > 0) cone.rotation.x = Math.PI; beams.add(cone);
  }
  spin.add(beams); obj.add(spin);
  spin.rotation.set(rr(r, 0, 3), 0, rr(r, 0, 3));
  obj.position.copy(c); sec.group.add(obj);
  sec.ticks.push(() => {
    beams.rotation.y = simT / b.period * 6.283;
    const f = fadeOf(ship.pos.distanceTo(c)); U.uFade.value = f * .35; glows.forEach(g => g.material.opacity = g.userData.base * f);
  });
}
function sectorSystem(sx, sy, sz) { // mirrors makeSector's first rng draws: where (if anywhere) this sector's star system is
  if (!sx && !sy && !sz) return new V3();
  const r = rng(hash(sx, sy, sz)), roll = r(), off = jit(r, 8000);
  return roll < pSys(sy) ? off.add(new V3(sx, sy, sz).multiplyScalar(SECTOR)) : null;
}
function makeSector(sx, sy, sz) {
  const r = rng(hash(sx, sy, sz)), base = new V3(sx, sy, sz).multiplyScalar(SECTOR);
  const sec = { key: `${sx},${sy},${sz}`, sx, sy, sz, group: new THREE.Group(), bodies: [], ticks: [], n: 0 };
  const home = !sx && !sy && !sz, roll = r(), off = jit(r, 8000), p = pSys(sy);
  if (home) makeSystem(sec, r, base, true);
  else if (roll < p) makeSystem(sec, r, base.clone().add(off), false);
  else if (roll < p + .09) makeBlackHole(sec, r, base.clone().add(off.multiplyScalar(2.5)));
  else if (roll < p + .17) makeWormhole(sec, r, base.clone().add(off.multiplyScalar(2.5)));
  else if (roll < p + .23) makePulsar(sec, r, base.clone().add(off.multiplyScalar(2.5)));
  else if (roll < p + .28) makePlanetaryNebula(sec, r, base.clone().add(off.multiplyScalar(2.5)));
  if (r() < .09) makeNebula(sec, r, base.clone().add(jit(r, 30000)));
  scene.add(sec.group);
  return sec;
}
function disposeSector(sec) {
  scene.remove(sec.group);
  sec.group.traverse(o => {
    if (o.isInstancedMesh) o.dispose();
    if (o.userData.ownGeo) o.geometry.dispose();
    if (o.material && !o.material.userData.shared) o.material.dispose();
  });
}

const sectors = new Map();
let bodies = [];
const sectorOf = p => ({ x: Math.round(p.x / SECTOR), y: Math.round(p.y / SECTOR), z: Math.round(p.z / SECTOR) });
function updateSectors(budget = 2) { // creates at most `budget` new sectors (nearest first)
  const c = sectorOf(ship.pos), want = [];
  for (let x = -LOAD; x <= LOAD; x++) for (let y = -LOAD; y <= LOAD; y++) for (let z = -LOAD; z <= LOAD; z++) {
    const k = `${c.x + x},${c.y + y},${c.z + z}`;
    if (!sectors.has(k)) want.push([x * x + y * y + z * z, c.x + x, c.y + y, c.z + z, k]);
  }
  let changed = false;
  want.sort((a, b) => a[0] - b[0]).slice(0, budget).forEach(([, x, y, z, k]) => { sectors.set(k, makeSector(x, y, z)); changed = true; });
  for (const [k, s] of sectors) {
    if (Math.max(Math.abs(s.sx - c.x), Math.abs(s.sy - c.y), Math.abs(s.sz - c.z)) > LOAD + 1) { disposeSector(s); sectors.delete(k); changed = true; }
  }
  if (changed) bodies = [...sectors.values()].flatMap(s => s.bodies);
}

// ---------------------------------------------------------------- ship & input
let simT = store.get('dh3d.t', 0);
const ship = { transit: null, autoOrbit: false, orbitR: 0, pos: new V3(), vel: new V3(), q: new THREE.Quaternion(), w: new V3(), tau: store.get('dh3d.tau', 0), auto: false, target: null, cand: null, orbit: null, orbitCand: null };
const keys = {};
let paused = false, mdx = 0, mdy = 0, mapRange = 1, chase = store.get('dh3d.chase', false), muted = false, started = false, lastHeat = -9;
const RANGES = [15000, 60000, 240000];
// safe, useful orbit radii (in body radii): black holes stay clear of the accretion disk (outer edge 10 rs)
const ORBIT_K = { bh: [12, 30], wormhole: [2.5, 8] }, orbitK = b => ORBIT_K[b.kind] || [2, 7];
const orbitable = b => !!b && (isSolid(b) || b.kind === 'bh' || b.kind === 'wormhole') && b.kind !== 'comet';
function engageOrbit(b) {
  const [lo, hi] = orbitK(b);
  ship.orbit = b; ship.target = b; ship.auto = ship.autoOrbit = false;
  ship.orbitR = THREE.MathUtils.clamp(ship.pos.distanceTo(b.pos), b.R * lo, b.R * hi);
}
const lookQ = (from, to, up = new V3(0, 1, 0)) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(from, to, up));

function spawnAt(center, dist) {
  const d = new V3(Math.random() - .5, (Math.random() - .5) * .3, Math.random() - .5).normalize();
  ship.pos.copy(center).addScaledVector(d, dist);
  ship.vel.set(0, 0, 0); ship.w.set(0, 0, 0); ship.auto = ship.autoOrbit = false; ship.target = null; ship.orbit = null; trail.length = 0;
  ship.q.copy(lookQ(ship.pos, center));
  updateSectors(27);
}
function spawnHome() {
  ship.pos.set(0, 0, 0); updateSectors(27);
  const pl = sectors.get('0,0,0').home, star = pl.orbit.parent;
  const toStar = star.pos.clone().sub(pl.pos).normalize(), side = toStar.clone().cross(new V3(0, 1, 0)).normalize();
  ship.pos.copy(pl.pos).addScaledVector(toStar.multiplyScalar(.7).add(side.multiplyScalar(.7)).normalize(), pl.R * 3.4).add(new V3(0, pl.R * .5, 0));
  ship.vel.set(0, 0, 0); ship.w.set(0, 0, 0); ship.auto = false; ship.target = null;
  ship.q.copy(lookQ(ship.pos, pl.pos.clone().add(side.multiplyScalar(pl.R * .9))));
  updateSectors(27);
}
// Interstellar-style transit: a tunnel ride hides the teleport and the streaming-in of the new region
function startTransit(kind, arrive) {
  ship.transit = { t: 0, dur: kind === 'bh' ? 3.6 : 4, kind, arrive, done: false };
  ship.vel.set(0, 0, 0); ship.auto = ship.autoOrbit = false; ship.orbit = null; ship.target = null; alarm = null;
}
function updateTransit(dt) {
  const tr = ship.transit; tr.t += dt;
  const u = tr.t / tr.dur;
  if (!tr.done && u > .4) { tr.done = true; tr.arrive(); }
  if (tr.done) updateSectors(6);
  if (tr.kind === 'bh') lens.uniforms.uBlack.value = u < .45 ? sstep(0, .3, u) : 1 - sstep(.5, 1, u); // darkness closes in, then dissolves away
  else lens.uniforms.uTunnel.value = sstep(0, .18, u) * (1 - sstep(.82, 1, u));
  lens.uniforms.uTT.value = tr.t;
  lens.uniforms.uTC.value.set(...(tr.kind === 'bh' ? [1, .45, .2] : tr.kind === 'home' ? [.7, .8, 1] : [1, .85, .6]));
  if (u >= 1) { ship.transit = null; lens.uniforms.uTunnel.value = lens.uniforms.uBlack.value = 0; if (tr.kind !== 'bh') flash(.5, '#fff'); }
}
function farSystem(rand) { // a star system 15-60 sectors away
  const c = sectorOf(ship.pos);
  let dest = null;
  for (let i = 0; i < 500 && !dest; i++) {
    const n = ri(rand, 15, 60);
    const d = new V3(rand() - .5, (rand() - .5) * .08, rand() - .5).normalize().multiplyScalar(n); // stay in the galactic disk
    dest = sectorSystem(c.x + Math.round(d.x), c.y + Math.round(d.y), c.z + Math.round(d.z));
  }
  return dest;
}
// wormhole: no cut. You keep speed and heading and fly straight out of the twin mouth on the other side.
const exitMouth = new THREE.Mesh(GEO.sphere, smat(SPHERE_VS, WH_FS, { uFade: { value: 0 }, uSky: { value: skyTex } }));
exitMouth.visible = false; scene.add(exitMouth);
function traverse(wh) {
  const dest = farSystem(rng(hash(...wh.id.split(':')[0].split(',').map(Number)) ^ 0x77)); // each wormhole always leads to the same place
  const fwd = new V3(0, 0, -1).applyQuaternion(ship.q);
  const exit = dest.clone().addScaledVector(fwd, -45000); // come out heading toward the system
  ship.pos.copy(exit).addScaledVector(fwd, wh.R * 1.05);
  ship.auto = ship.autoOrbit = false; ship.orbit = null; ship.target = null; trail.length = 0; alarm = null;
  updateSectors(27);
  exitMouth.position.copy(exit); exitMouth.scale.setScalar(wh.R); exitMouth.visible = true; exitMouth.userData.t = 0;
  lens.uniforms.uTunnel.value = 0; flashA = 0;
}
function updateExitMouth(dt) { // the mouth you came out of stays behind you for a while, then fades
  if (!exitMouth.visible) return;
  const t = exitMouth.userData.t += dt;
  exitMouth.material.uniforms.uFade.value = 1 - sstep(8, 14, t);
  if (t > 14) exitMouth.visible = false;
}
function jump(kind) {
  const dest = farSystem(Math.random);
  startTransit(kind, () => spawnAt(dest, 60000));
}

document.getElementById('helpBody').innerHTML = document.getElementById('keys').innerHTML;
const launch = () => { if (started) return; started = true; document.getElementById('intro').classList.add('hidden'); lockPointer(); initAudio(); };
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (!started) { if (e.code === 'Enter') launch(); return; }
  switch (e.code) {
    case 'KeyT': ship.target = ship.target ? null : ship.cand; ship.auto = ship.autoOrbit = false; break; // plain toggle
    case 'KeyX': ship.target = null; ship.auto = ship.autoOrbit = false; ship.orbit = null; break;
    case 'KeyG': { const t = ship.target || ship.cand; if (t) { ship.target = t; ship.auto = !ship.auto; } break; }
    case 'KeyP': paused = !paused; $('paused').classList.toggle('hidden', !paused); break;
    case 'KeyN': setShip((shipIdx + 1) % SHIPS.length); chase = true; store.set('dh3d.chase', true); camQ.copy(ship.q); break;
    case 'KeyO': {
      // locked target first, then what's in your sights, then the nearest object; never a different one silently
      const current = ship.orbit || (ship.autoOrbit && ship.target);
      const picked = ship.target || ship.cand;
      if (picked && !orbitable(picked) && !current) break; // e.g. a nebula: nothing to orbit
      let t = orbitable(picked) ? picked : ship.orbitCand;
      if (current && (!t || t === current)) { ship.orbit = null; ship.autoOrbit = ship.auto = false; break; } // O again on the same object = release
      if (!t) { let best = Infinity; for (const b of bodies) if (orbitable(b)) { const d = ship.pos.distanceTo(b.pos) - b.R; if (d < best) { best = d; t = b; } } }
      if (!t) break;
      if (ship.pos.distanceTo(t.pos) < t.R * orbitK(t)[1] * 1.1) engageOrbit(t); else { ship.orbit = null; ship.target = t; ship.auto = ship.autoOrbit = true; }
      break;
    }
    case 'KeyM': mapRange = (mapRange + 1) % RANGES.length; break;
    case 'KeyC': chase = !chase; store.set('dh3d.chase', chase); camQ.copy(ship.q); break;
    case 'KeyV': muted = !muted; if (audio) audio.master.gain.value = muted ? 0 : .35; break;
    case 'KeyH': document.getElementById('help').classList.toggle('hidden'); break;
    case 'KeyB': if (!ship.transit) startTransit('home', spawnHome); break;
  }
  if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
});
addEventListener('keyup', e => keys[e.code] = false);
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
addEventListener('mousemove', e => { if (document.pointerLockElement) { mdx += e.movementX; mdy += e.movementY; } });
document.addEventListener('pointerlockchange', () => document.getElementById('hint').classList.toggle('hidden', !!document.pointerLockElement || !started));
const lockPointer = () => { try { const p = canvas.requestPointerLock(); p?.catch?.(() => { }); } catch { } };
canvas.addEventListener('click', () => { if (started) lockPointer(); });
document.getElementById('intro').addEventListener('click', e => {
  const b = e.target.closest('[data-ship]');
  if (b) setShip(+b.dataset.ship); else launch();
});

const tO = new V3(), tF = new V3(), tR = new V3(), tU = new V3(), tA = new V3(), tD = new V3(), tE = new THREE.Euler(), tQ = new THREE.Quaternion(), tQ2 = new THREE.Quaternion();
const isSolid = b => b.kind === 'planet' || b.kind === 'moon' || b.kind === 'star' || b.kind === 'pulsar' || b.kind === 'comet';
let nearSurf = null, nearStar = null, dilation = 1, rate = 1, lockSpeed = MAX_WARP, gAcc = 0, alarm = null, thrustVis = 0;

function updateShip(dt) {
  const k = c => keys[c] ? 1 : 0;
  const ctl = started && document.getElementById('help').classList.contains('hidden');
  const pitch = k('ArrowUp') - k('ArrowDown'), yaw = k('ArrowLeft') - k('ArrowRight'), roll = k('KeyQ') - k('KeyE');
  let th = k('KeyW') - k('KeyS'), st = k('KeyD') - k('KeyA'), vt = k('KeyR') - k('KeyF');
  let warp = k('ShiftLeft') || k('ShiftRight');
  if (!ctl) th = st = vt = warp = 0;
  const manual = th || st || vt; // looking around with mouse/arrows never cancels autopilot
  if (manual && ship.auto) ship.auto = ship.autoOrbit = false;

  ship.w.lerp(tA.set(pitch * 1.1, yaw * 1.1, roll * 1.6), 1 - Math.exp(-dt * 5));
  const sens = .0019 * (FOV / camera.fov);
  ship.q.multiply(tQ.setFromEuler(tE.set(ship.w.x * dt, ship.w.y * dt, ship.w.z * dt, 'YXZ')))
    .multiply(tQ.setFromEuler(tE.set(-mdy * sens, -mdx * sens, 0, 'YXZ'))).normalize();
  mdx = mdy = 0;
  const fwd = tF.set(0, 0, -1).applyQuaternion(ship.q), right = tR.set(1, 0, 0).applyQuaternion(ship.q), up = tU.set(0, 1, 0).applyQuaternion(ship.q);

  // one pass over everything nearby: gravity, mass-lock, riding orbits, time dilation, discovery, target candidate
  const acc = tA.set(0, 0, 0);
  let pullA = 0, pullB = null, nsurf = Infinity, nsurfB = null, lock = Infinity, ride = null, rideK = 6, oc = null, ocK = 8, nsD = Infinity, cand = null, candS = .3, proxS = Infinity, proxB = null, bhK = Infinity, bhB = null;
  dilation = 1; nearStar = null;
  for (const b of bodies) {
    tD.subVectors(b.pos, ship.pos);
    const d = tD.length() || 1e-6;
    if (b.gm) { const a = Math.min(b.gm / (d * d), 3000); acc.addScaledVector(tD, a / d); if (a > pullA) { pullA = a; pullB = b; } }
    if (isSolid(b) && d - b.R < nsurf) { nsurf = d - b.R; nsurfB = b; }
    if (b.kind !== 'nebula') lock = Math.min(lock, d - b.lockR);
    if ((b.kind === 'planet' || b.kind === 'moon') && d / b.R < rideK) { ride = b; rideK = d / b.R; }
    if (b.kind === 'bh' && d < b.R * 60) dilation *= Math.sqrt(Math.max(0, 1 - b.R / d));
    if (b.kind === 'star' && d < nsD) { nsD = d; nearStar = b; }
    if (!b.disc && d < b.discR) discover(b);
    if (isSolid(b) && b.kind !== 'comet' && d / b.R < ocK) { ocK = d / b.R; oc = b; }
    if (isSolid(b) && (d - b.R) / b.R < proxS) { proxS = (d - b.R) / b.R; proxB = b; }
    if (b.kind === 'bh' && d / b.R < bhK) { bhK = d / b.R; bhB = b; }
    if (d > b.R && d < 240000) {
      const s = Math.acos(Math.min(1, fwd.dot(tD) / d)) - Math.asin(Math.min(1, b.R / d));
      if (s < candS) { candS = s; cand = b; }
    }
  }
  ship.cand = cand; ship.orbitCand = oc; nearSurf = nsurfB ? [nsurf, nsurfB] : null;
  // emergency escape: Shift+Space burns hard straight away from whatever pulls hardest, ignoring mass lock
  const escape = ctl && k('Space') && warp;
  if (escape) { warp = 0; ship.auto = ship.autoOrbit = false; ship.orbit = null; }
  if (ship.orbit && (th || st || vt || ship.auto || ship.pos.distanceTo(ship.orbit.pos) > ship.orbitR * 1.8)) ship.orbit = null;
  if (ship.orbit) ride = ship.orbit.orbit ? ship.orbit : null; // co-move only with bodies that themselves move
  // proximity / gravity alarm (level 1 = caution, 2 = danger)
  gAcc = acc.length();
  alarm = bhK < 15 ? { lvl: bhK < 6 ? 2 : 1, txt: `EVENT HORIZON ${bhB.name} :: ${bhK.toFixed(1)} rs · Shift+Space escape` }
    : proxS < .35 ? { lvl: proxS < .12 ? 2 : 1, txt: `PROXIMITY ${proxB.name} :: alt ${fmtD(proxS * proxB.R)}` }
    : gAcc > 30 ? { lvl: gAcc > 120 ? 2 : 1, txt: `GRAVITY WELL :: ${(gAcc * 10).toFixed(0)} km/s² · Shift+Space escape` } : null;
  if (ride) ship.pos.add(ride.delta); // co-move with the nearest world so it doesn't drift away

  // autopilot
  if (ship.auto && ship.target) {
    const t = ship.target, d = ship.pos.distanceTo(t.pos), stop = t.kind === 'nebula' ? t.R : t.kind === 'bh' ? t.R * 16 : t.kind === 'wormhole' ? t.R * 4 : t.R * 3.5 + 400;
    ship.q.slerp(tQ2.copy(lookQ(ship.pos, t.pos, up)), 1 - Math.exp(-dt * 2.2));
    const ang = fwd.angleTo(tD.subVectors(t.pos, ship.pos));
    if (d < stop) { ship.vel.multiplyScalar(Math.exp(-dt * 3)); if (ship.autoOrbit) engageOrbit(t); else if (ship.vel.length() < 60) ship.auto = false; }
    else { th = ang < .35 ? 1 : 0; warp = ang < .1 && d - stop > 15000 ? 1 : 0; }
  }

  thrustVis += ((th > 0 ? (warp ? 2 : 1) : 0) - thrustVis) * Math.min(1, dt * 4);
  const speed0 = ship.vel.length();
  const A = warp && th > 0 ? 1500 + speed0 * 2.2 : 700;
  ship.vel.addScaledVector(fwd, th * A * dt).addScaledVector(right, st * 400 * dt).addScaledVector(up, vt * 400 * dt).addScaledVector(acc, dt);
  // flight assist: bleed sideways drift so turning feels responsive
  const along = ship.vel.dot(fwd);
  if (th || ship.auto) ship.vel.sub(tD.copy(ship.vel).addScaledVector(fwd, -along).multiplyScalar(1 - Math.exp(-dt * .9)));
  if (ship.orbit) { // station keeping: steer velocity toward a circular orbit at the current radius
    orbitVel(ship.orbit, ship.orbitR, fwd, tO);
    ship.vel.lerp(tO, 1 - Math.exp(-dt * 2));
  }
  if (escape && pullB) ship.vel.addScaledVector(tO.subVectors(ship.pos, pullB.pos).normalize(), 9000 * dt);
  else if (k('Space') && ctl) ship.vel.multiplyScalar(Math.exp(-dt * 2.5));
  let speed = ship.vel.length();
  if (!warp && speed > CRUISE) ship.vel.multiplyScalar(Math.max(CRUISE / speed, Math.exp(-dt * 1.8)));
  lockSpeed = Math.min(MAX_WARP, Math.max(escape ? 6000 : 400, lock * 1.1));
  speed = ship.vel.length();
  if (speed > lockSpeed) ship.vel.multiplyScalar(lockSpeed / speed);
  ship.pos.addScaledVector(ship.vel, dt);

  for (const b of bodies) {
    const d = ship.pos.distanceTo(b.pos);
    if (isSolid(b) && d < b.R * 1.015 + 3) {
      const n = tD.subVectors(ship.pos, b.pos).normalize();
      ship.pos.copy(b.pos).addScaledVector(n, b.R * 1.015 + 3);
      const vn = ship.vel.dot(n); if (vn < 0) ship.vel.addScaledVector(n, -vn * 1.3);
      if (b.kind === 'star' && simT - lastHeat > 3) { lastHeat = simT; flash(.6, '#ff8a3c'); }
    }
    if (b.kind === 'bh' && d < b.R) return jump('bh');
    if (b.kind === 'wormhole' && d < b.R * .9) return traverse(b);
  }
  rate = Math.sqrt(Math.max(0, 1 - (ship.vel.lengthSq() / (C_LIGHT * C_LIGHT)))) * dilation;
  ship.tau += dt * rate;
}

// velocity the ship needs for a circular orbit of radius rd around b (prograde = current motion, else where the nose points)
function orbitVel(b, rd, fwd, out) {
  const n = tN2.subVectors(ship.pos, b.pos), r = n.length(); n.divideScalar(r);
  out.copy(ship.vel).addScaledVector(n, -ship.vel.dot(n));
  if (out.lengthSq() < 25) out.copy(fwd).addScaledVector(n, -fwd.dot(n));
  if (out.lengthSq() < 1e-6) out.set(0, 1, 0).cross(n);
  const vo = Math.sqrt(b.gm / rd);
  return out.normalize().multiplyScalar(vo).addScaledVector(n, THREE.MathUtils.clamp((rd - r) * .6, -vo, vo));
}
const tN2 = new V3();
function updateOrbits() {
  for (const b of bodies) if (b.orbit) { b.prev.copy(b.pos); orbitPos(b, simT, b.pos); b.delta.subVectors(b.pos, b.prev); }
  for (const b of bodies) if (b.render && b.obj.parent.visible) b.render();
}

// ---------------------------------------------------------------- space dust (motion cue + warp streaks)
const DUST_N = 350, DB = 1600;
const dust = (() => {
  const seeds = new Float32Array(DUST_N * 3).map(() => Math.random() * DB);
  const pos = new Float32Array(DUST_N * 6), col = new Float32Array(DUST_N * 6);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, ...ADD }));
  l.frustumCulled = false; scene.add(l);
  return { seeds, pos, col, g };
})();
function updateDust() {
  const { seeds, pos, col, g } = dust, c = ship.pos, v = ship.vel, sp = v.length();
  const tl = Math.min(.04, DB * .5 / Math.max(sp, 1)), vis = sstep(10, 120, sp);
  for (let i = 0; i < DUST_N; i++) {
    const j = i * 3, o = i * 6;
    const x = c.x + (((seeds[j] - c.x) % DB) + DB) % DB - DB / 2;
    const y = c.y + (((seeds[j + 1] - c.y) % DB) + DB) % DB - DB / 2;
    const z = c.z + (((seeds[j + 2] - c.z) % DB) + DB) % DB - DB / 2;
    pos[o] = x; pos[o + 1] = y; pos[o + 2] = z;
    pos[o + 3] = x - v.x * tl; pos[o + 4] = y - v.y * tl; pos[o + 5] = z - v.z * tl;
    const dx = x - c.x, dy = y - c.y, dz = z - c.z;
    const f = (1 - sstep(DB * .2, DB * .5, Math.sqrt(dx * dx + dy * dy + dz * dz))) * vis * .35;
    col[o] = .55 * f; col[o + 1] = f; col[o + 2] = .7 * f; col[o + 3] = col[o + 4] = col[o + 5] = 0;
  }
  g.attributes.position.needsUpdate = g.attributes.color.needsUpdate = true;
}

// ---------------------------------------------------------------- post: lensing + bloom
const LensShader = {
  uniforms: { tDiffuse: { value: null }, uC: { value: new THREE.Vector2(.5, .5) }, uR: { value: 0 }, uAspect: { value: 1 }, uOn: { value: 0 }, uWarp: { value: 0 }, uT: { value: 0 }, uTunnel: { value: 0 }, uBlack: { value: 0 }, uTT: { value: 0 }, uTC: { value: new THREE.Vector3(1, .85, .6) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: NOISE + `uniform sampler2D tDiffuse; uniform vec2 uC; uniform vec3 uTC; uniform float uR,uAspect,uOn,uWarp,uT,uTunnel,uBlack,uTT; varying vec2 vUv;
  void main(){
    vec2 uv=vUv; float r=1.;
    if(uOn>.5){
      vec2 d=vUv-uC; d.x*=uAspect; r=length(d);
      float te=uR*2.6, fade=1.-smoothstep(te*4.,te*9.,r);
      vec2 nd=d/max(r,1e-5)*(r-te*te/max(r,1e-5)*fade); nd.x/=uAspect;
      uv=uC+nd;
    }
    vec2 cd=uv-.5; float ca=uWarp*.008;
    vec3 col=vec3(texture2D(tDiffuse,uv+cd*ca).r, texture2D(tDiffuse,uv).g, texture2D(tDiffuse,uv-cd*ca).b);
    if(uOn>.5){ col*=smoothstep(uR*2.35,uR*2.6,r); col+=vec3(1.,.9,.75)*exp(-pow((r-uR*2.62)/(uR*.025+.0005),2.))*.35; } // shadow ~2.6 rs + photon ring
    col*=1.-.35*pow(length(vUv-.5)*1.35,2.5);
    if(uTunnel>0.){ // transit tunnel: rings of light rushing past, a bright exit ahead
      vec2 d=vUv-.5; d.x*=uAspect; float r=length(d)+1e-3, a=atan(d.y,d.x);
      float z=.3/r+uTT*2.6;
      float n=snoise(vec3(cos(a)*1.6,sin(a)*1.6,z*.7));
      float streak=pow(max(snoise(vec3(cos(a)*9.,sin(a)*9.,z*.12)),0.),2.5);
      vec3 tc=mix(vec3(.03,.025,.02),uTC,smoothstep(-.3,.9,n))*(.25+streak*2.2)*smoothstep(.0,.08,r);
      tc+=mix(uTC,vec3(1.),.6)*pow(smoothstep(.22,0.,r),2.)*(.4+uTT*.35);
      vec3 bent=texture2D(tDiffuse,.5+(vUv-.5)*(1.-uTunnel*.6*r)).rgb; // scene pulled into the throat
      col=mix(col,bent*.12+tc,uTunnel);
    }
    if(uBlack>0.){ // black-hole plunge: darkness eats the frame in ragged patches, then dissolves the same way
      float n=fbm(vec3((vUv-.5)*vec2(uAspect,1.)*2.5,uTT*.15))*.5+.5;
      n=mix(n,1.-length(vUv-.5)*1.2,.35); // edges go first
      float m=smoothstep(n-.012,n+.012,uBlack*1.15);
      col=col*(1.-m)+vec3(1.,.55,.25)*m*(1.-m)*.5; // a thin ember line along the dissolve front
    }
    float l=dot(col,vec3(.2126,.7152,.0722));
    col=mix(vec3(l),col,.7)*vec3(1.05,1.,.92); // filmic: desaturated, warm
    col+=(fract(sin(dot(vUv*1e3+uT,vec2(12.9898,78.233)))*43758.5453)-.5)*.01;
    gl_FragColor=vec4(col,1.);
  }`,
};
const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
const lens = new ShaderPass(LensShader); composer.addPass(lens);
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .5, 0, .85); composer.addPass(bloom);
// three's bloom truncates its gaussian at 1 sigma (sigma = radius) -> box filter -> square halos around bright points.
// Re-derive the weights with sigma = radius / 2.5 so the tails reach ~0 inside the kernel.
bloom.separableBlurMaterials.forEach(m => {
  const k = m.defines.KERNEL_RADIUS, sg = k / 2.5;
  m.uniforms.gaussianCoefficients.value = Array.from({ length: k }, (_, i) => Math.exp(-.5 * i * i / (sg * sg)));
});
bloom.compositeMaterial.uniforms.bloomFactors.value = [1.2, 1, .8, .5, .3];
composer.addPass(new OutputPass());
function resize() {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setPixelRatio(PR); composer.setSize(innerWidth, innerHeight);
  lens.uniforms.uAspect.value = camera.aspect;
}
addEventListener('resize', resize); resize();

const tP = new V3();
function updateLens() {
  let best = null, bs = 0;
  const fwd = tF.set(0, 0, -1).applyQuaternion(camera.quaternion);
  for (const b of bodies) if (b.kind === 'bh') {
    tP.subVectors(b.pos, camera.position);
    const d = tP.length(), s = b.R / d;
    if (tP.dot(fwd) > 0 && s > bs) { bs = s; best = b; }
  }
  const U = lens.uniforms;
  U.uOn.value = best && bs > 4e-4 ? 1 : 0;
  if (U.uOn.value) {
    tP.copy(best.pos).project(camera);
    U.uC.value.set(tP.x * .5 + .5, tP.y * .5 + .5);
    U.uR.value = Math.tan(Math.asin(Math.min(.99, bs))) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * .5;
  }
}

// ---------------------------------------------------------------- audio
let audio = null;
function initAudio() {
  if (audio) return;
  try {
    const ctx = new AudioContext(), master = ctx.createGain(); master.gain.value = muted ? 0 : .35; master.connect(ctx.destination);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320; lp.connect(master);
    [[55, 'sawtooth', .035], [82.4, 'sine', .06], [110.6, 'sine', .035]].forEach(([f, type, gain], i) => {
      const o = ctx.createOscillator(), g = ctx.createGain(), l = ctx.createOscillator(), lg = ctx.createGain();
      o.type = type; o.frequency.value = f; g.gain.value = gain; o.connect(g); g.connect(lp);
      l.frequency.value = .05 + i * .031; lg.gain.value = 4; l.connect(lg); lg.connect(o.detune);
      o.start(); l.start();
    });
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const n = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), eg = ctx.createGain();
    n.buffer = buf; n.loop = true; bp.type = 'lowpass'; bp.frequency.value = 200; eg.gain.value = 0;
    n.connect(bp); bp.connect(eg); eg.connect(master); n.start();
    audio = { ctx, master, bp, eg };
  } catch { }
}
function chime() {
  if (!audio) return;
  const t = audio.ctx.currentTime;
  [880, 1318.5, 1760].forEach((f, i) => {
    const o = audio.ctx.createOscillator(), g = audio.ctx.createGain(), s = t + i * .11;
    o.frequency.value = f; g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(.08, s + .02); g.gain.exponentialRampToValueAtTime(.0001, s + 1.4);
    o.connect(g); g.connect(audio.master); o.start(s); o.stop(s + 1.5);
  });
}
function updateAudio() {
  if (!audio) return;
  const t = audio.ctx.currentTime, k = c => keys[c] ? 1 : 0, sp = ship.vel.length();
  const thrust = Math.max(k('KeyW'), k('KeyS'), ship.auto ? 1 : 0);
  audio.eg.gain.setTargetAtTime(thrust * .22 + sstep(1500, MAX_WARP, sp) * .25, t, .15);
  audio.bp.frequency.setTargetAtTime(160 + sstep(0, MAX_WARP, sp) * 1800, t, .2);
  if (alarm && t > nextBeep) { // proximity / gravity klaxon
    nextBeep = t + (alarm.lvl > 1 ? .32 : .9);
    const o = audio.ctx.createOscillator(), g = audio.ctx.createGain();
    o.type = 'square'; o.frequency.value = alarm.lvl > 1 ? 988 : 659;
    g.gain.setValueAtTime(.045, t); g.gain.exponentialRampToValueAtTime(.0001, t + .12);
    o.connect(g); g.connect(audio.master); o.start(t); o.stop(t + .13);
  }
}
let nextBeep = 0, lastPulse = 0;
function pulsarTick() { // each beam sweep past you is an audible click, louder when close
  if (!audio) return;
  let best = null, bd = 80000;
  for (const b of bodies) if (b.kind === 'pulsar') { const d = ship.pos.distanceTo(b.pos); if (d < bd) { bd = d; best = b; } }
  if (!best) return;
  const k = Math.floor(simT / best.period * 2);
  if (k === lastPulse) return;
  lastPulse = k;
  const t = audio.ctx.currentTime, o = audio.ctx.createOscillator(), g = audio.ctx.createGain();
  o.type = 'triangle'; o.frequency.value = 1900;
  g.gain.setValueAtTime(.12 * (1 - bd / 80000), t); g.gain.exponentialRampToValueAtTime(.0001, t + .05);
  o.connect(g); g.connect(audio.master); o.start(t); o.stop(t + .06);
}

// ---------------------------------------------------------------- ships (chase view): spaceplane (default), Starship-style, retro rocket
const HUD_RGB = '242,184,102'; // keep in sync with --c in index.html
const X90 = -Math.PI / 2; // lathe/cylinder +Y -> ship forward (-Z); geometry +Z -> ship +Y
function part(g, geo, mat, pos, rot = [0, 0, 0], scl = [1, 1, 1]) { const m = new THREE.Mesh(geo, mat); m.position.set(...pos); m.rotation.set(...rot); m.scale.set(...scl); g.add(m); return m; }
function engine(g, x, y, z, r, col) { // nozzle bell + glowing throat + exhaust sprite
  const bell = new THREE.MeshStandardMaterial({ color: 0x2a2622, metalness: .8, roughness: .45, side: THREE.DoubleSide });
  part(g, new THREE.CylinderGeometry(r * .6, r, r * 1.6, 24, 1, true), bell, [x, y, z + r * .8], [X90, 0, 0]);
  const throat = new THREE.MeshBasicMaterial({ color: 0x331a08, side: THREE.DoubleSide });
  part(g, new THREE.CircleGeometry(r * .6, 20), throat, [x, y, z + .02]);
  const f = sprite(col, 1, 0, 1.6); f.position.set(x, y, z + r * 2.4); g.add(f);
  g.userData.flames.push({ f, r }); g.userData.throats.push(throat);
}
function panelTex(base, line, tilesX, tilesY, seed) { // procedural hull panelling
  const t = canvasTex(512, (c, S) => {
    const r = rng(seed); c.fillStyle = base; c.fillRect(0, 0, S, S);
    const w = S / tilesX, h = S / tilesY;
    for (let i = 0; i < tilesX; i++) for (let j = 0; j < tilesY; j++) { c.fillStyle = `rgba(0,0,0,${r() * .07})`; c.fillRect(i * w, j * h, w, h); }
    c.strokeStyle = line; c.lineWidth = 1.5;
    for (let i = 0; i <= tilesX; i++) { c.beginPath(); c.moveTo(i * w, 0); c.lineTo(i * w, S); c.stroke(); }
    for (let j = 0; j <= tilesY; j++) { c.beginPath(); c.moveTo(0, j * h); c.lineTo(S, j * h); c.stroke(); }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const newShip = () => { const g = new THREE.Group(); g.userData = { flames: [], throats: [], tips: [] }; return g; };

function hexTex(seed, patched = 0) { // black hexagonal heat-shield tiles with slight variation (+ a few light replacement tiles)
  const t = canvasTex(512, (c, S) => {
    const r = rng(seed), w = 16, h = w * Math.sqrt(3) / 2;
    c.fillStyle = '#0c0d0f'; c.fillRect(0, 0, S, S);
    for (let y = -1, row = 0; y < S / h + 1; y++, row++) for (let x = -1; x < S / w + 1; x++) {
      const cx = x * w + (row % 2) * w / 2, cy = y * h, g = r() < patched ? 150 + r() * 40 | 0 : 22 + r() * 14 | 0;
      c.fillStyle = `rgb(${g},${g},${g + 2})`; c.beginPath();
      for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; c.lineTo(cx + Math.cos(a) * w * .54, cy + Math.sin(a) * w * .54); }
      c.fill();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const halfLathe = (prof, upper, segs = 48) => new THREE.LatheGeometry(prof, segs, upper ? -Math.PI / 2 : Math.PI / 2, Math.PI); // upper: ship +Y half
const ceramic = seed => new THREE.MeshStandardMaterial({ map: panelTex('#e2e0da', 'rgba(70,70,70,.3)', 14, 8, seed), metalness: .1, roughness: .55, envMapIntensity: 1.1, side: THREE.DoubleSide });
const tileMat = seed => new THREE.MeshStandardMaterial({ map: panelTex('#1b1c1f', 'rgba(0,0,0,.65)', 40, 20, seed), metalness: .05, roughness: .85, side: THREE.DoubleSide });
const glassMat = () => new THREE.MeshStandardMaterial({ color: 0x07080a, metalness: .9, roughness: .06, envMapIntensity: 3 });
const navLights = (g, x, y, z) => [-1, 1].forEach(s => { const t = sprite(new THREE.Color(s < 0 ? 1 : .6, s < 0 ? .35 : 1, s < 0 ? .3 : .6), .7, .9, 2); t.position.set(s * x, y, z); g.add(t); g.userData.tips.push(t); });

// Dream Chaser-style lifting body, to scale (9.1 m long, 8.2 m span; 1 m = 1.9 units):
// rounded white-tiled top, flat black belly, blunt black nose cap, steeply upturned wings, lower body flaps, two engines.
function buildLiftingBody() {
  const g = newShip();
  const white = new THREE.MeshStandardMaterial({ map: panelTex('#ecebe6', 'rgba(90,90,90,.28)', 30, 18, 3), metalness: .05, roughness: .6, envMapIntensity: 1, side: THREE.DoubleSide });
  const black = new THREE.MeshStandardMaterial({ map: panelTex('#141517', 'rgba(0,0,0,.6)', 40, 22, 4), metalness: .05, roughness: .85, side: THREE.DoubleSide });
  const L = 17.3, W = 3.9;
  const prof = Array.from({ length: 56 }, (_, i) => { const y = i / 55 * L, t = y / L; return new THREE.Vector2(Math.max(.001, W * (1 - .55 * t ** 1.3) * Math.sqrt(Math.max(0, 1 - t ** 5))), y); });
  part(g, halfLathe(prof, true, 64), white, [0, 0, L / 2], [X90, 0, 0], [1, 1, .85]);   // top hump
  part(g, halfLathe(prof, false, 64), black, [0, 0, L / 2], [X90, 0, 0], [1, 1, .3]);  // belly: nearly flat (~2.4 m total height)
  part(g, new THREE.SphereGeometry(1, 24, 16), black, [0, .1, -L / 2 + .5], [0, 0, 0], [.8, .6, .75]); // nose cap
  part(g, new THREE.CircleGeometry(W, 40, 0, Math.PI), black, [0, 0, L / 2], [0, 0, 0], [1, .85, 1]);       // aft bulkhead
  part(g, new THREE.CircleGeometry(W, 40, Math.PI, Math.PI), black, [0, 0, L / 2], [0, 0, 0], [1, .3, 1]);
  const wingShape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(4.6, 3.8), new THREE.Vector2(4.7, 6.6), new THREE.Vector2(0, 6.6)]);
  const wing = new THREE.ExtrudeGeometry(wingShape, { depth: .16, bevelEnabled: true, bevelThickness: .05, bevelSize: .07, bevelSegments: 2 });
  const wingUnder = new THREE.ShapeGeometry(wingShape);
  for (const s of [-1, 1]) {
    const cant = new THREE.Group(); cant.position.set(s * 3.3, -.3, 1.9); cant.rotation.z = s * .85; g.add(cant); // ~50° up
    part(cant, wing, white, [0, 0, 0], [Math.PI / 2, 0, 0], [s, 1, 1]);
    part(cant, wingUnder, black, [0, -.24, 0], [Math.PI / 2, 0, 0], [s, 1, 1]); // outer (windward) face black
    part(g, new THREE.BoxGeometry(1.7, .12, 1.3), black, [s * 1.4, -.75, L / 2 + .4], [.25, 0, 0]); // lower body flaps
  }
  navLights(g, 5.6, 3.4, 8.5);
  engine(g, -.8, .7, L / 2, .36, new THREE.Color(1, .8, .55));
  engine(g, .8, .7, L / 2, .36, new THREE.Color(1, .8, .55));
  return g;
}
function buildShuttle() {
  const g = newShip(), inner = new THREE.Group();
  inner.matrixAutoUpdate = false;
  inner.matrix.makeBasis(new V3(0, 0, -1), new V3(-1, 0, 0), new V3(0, 1, 0)).scale(new V3(.0125, .0125, .0125)).setPosition(0, -.4, .3);
  g.add(inner);
  gltf.load('assets/shuttle.glb', ({ scene: m }) => {
    m.traverse(o => { if (o.material) { o.material.envMapIntensity = 1.3; o.material.side = THREE.DoubleSide; } });
    inner.add(m);
  });
  // three main engines on the aft bulkhead (model coordinates), plus the two OMS engines
  [[-640, 0, 70, 38], [-640, -48, -10, 38], [-640, 48, -10, 38], [-575, -112, 112, 18], [-575, 112, 112, 18]].forEach(([x, y, z, r]) => {
    const f = sprite(new THREE.Color(.75, .82, 1), 1, 0, 1.6); f.position.set(x - r * 2, y, z); inner.add(f); g.userData.flames.push({ f, r });
  });
  return g;
}
// Orion-style, to scale (1 m = 1.2 units): 5.02 m silver crew module, Avcoat heat shield, adapter ring,
// 4.1 m European Service Module in gold/silver MLI with white radiators, four 7 m three-panel solar wings (19 m span).
function buildCapsule() {
  const g = newShip(), k = 1.2;
  const silver = new THREE.MeshStandardMaterial({ map: panelTex('#aeb2b7', 'rgba(25,25,28,.5)', 36, 5, 9), metalness: .7, roughness: .33, envMapIntensity: 1.8, side: THREE.DoubleSide });
  const avcoat = new THREE.MeshStandardMaterial({ color: 0x4a3a2c, metalness: .05, roughness: .9, side: THREE.DoubleSide });
  const white = new THREE.MeshStandardMaterial({ map: panelTex('#e6e5e0', 'rgba(80,80,80,.3)', 12, 2, 11), metalness: .1, roughness: .55, side: THREE.DoubleSide });
  const mli = new THREE.MeshStandardMaterial({ map: panelTex('#b9a57c', 'rgba(70,55,30,.4)', 14, 5, 10), metalness: .65, roughness: .42, envMapIntensity: 1.6, side: THREE.DoubleSide });
  const cells = canvasTex(256, (c, S) => { c.fillStyle = '#0e1a33'; c.fillRect(0, 0, S, S); c.strokeStyle = 'rgba(150,170,210,.35)'; c.lineWidth = 1; for (let i = 0; i <= 16; i++) { c.beginPath(); c.moveTo(i * S / 16, 0); c.lineTo(i * S / 16, S); c.moveTo(0, i * S / 16); c.lineTo(S, i * S / 16); c.stroke(); } });
  const panel = new THREE.MeshStandardMaterial({ map: cells, metalness: .5, roughness: .28, envMapIntensity: 2, side: THREE.DoubleSide });
  const frame = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: .8, roughness: .35 });
  let z = -4.2; // stack from the docking tunnel (front) to the engine (back)
  part(g, new THREE.CylinderGeometry(.6 * k, .68 * k, .55 * k, 32, 1), silver, [0, 0, z + .27 * k], [X90, 0, 0]); z += .55 * k;   // docking tunnel
  part(g, new THREE.CylinderGeometry(1.0 * k, 2.51 * k, 2.45 * k, 64, 1, true), silver, [0, 0, z + 1.22 * k], [X90, 0, 0]);       // crew module cone
  for (let w = 0; w < 4; w++) { const a = Math.PI / 2 + (w - 1.5) * .42; part(g, new THREE.BoxGeometry(.32 * k, .28 * k, .04), glassMat(), [Math.cos(a) * 1.5 * k, Math.sin(a) * 1.5 * k, z + .9 * k], [-.55, 0, a - Math.PI / 2]); }
  z += 2.45 * k;
  part(g, new THREE.CylinderGeometry(2.51 * k, 2.51 * k, .22 * k, 64), avcoat, [0, 0, z + .11 * k], [X90, 0, 0]); z += .22 * k;     // heat shield
  part(g, new THREE.CylinderGeometry(2.35 * k, 2.05 * k, .6 * k, 64, 1, true), white, [0, 0, z + .3 * k], [X90, 0, 0]); z += .6 * k; // crew module adapter
  const esmL = 2.9 * k;
  part(g, new THREE.CylinderGeometry(2.05 * k, 2.05 * k, esmL, 64, 1, true), mli, [0, 0, z + esmL / 2], [X90, 0, 0]);               // service module
  for (let r = 0; r < 4; r++) part(g, new THREE.CylinderGeometry(2.07 * k, 2.07 * k, esmL * .7, 16, 1, true, r * Math.PI / 2 + .15, .9), white, [0, 0, z + esmL * .45], [X90, 0, 0]); // radiators
  part(g, new THREE.CircleGeometry(2.05 * k, 64), mli, [0, 0, z + esmL]);
  for (let w = 0; w < 4; w++) { // solar wings: 3 panels of ~2.2 m on a boom, X configuration at the aft end
    const arm = new THREE.Group(); arm.rotation.z = Math.PI / 4 + w * Math.PI / 2; arm.position.z = z + esmL * .8; g.add(arm);
    part(arm, new THREE.CylinderGeometry(.05 * k, .05 * k, .9 * k, 6), frame, [2.5 * k, 0, 0], [0, 0, Math.PI / 2]);
    for (let i = 0; i < 3; i++) {
      part(arm, new THREE.BoxGeometry(2.2 * k, .05, 2.0 * k), frame, [(3.1 + i * 2.3) * k, -.03, 0]);
      part(arm, new THREE.BoxGeometry(2.12 * k, .05, 1.92 * k), panel, [(3.1 + i * 2.3) * k, 0, 0]);
    }
  }
  z += esmL;
  engine(g, 0, 0, z, .55 * k, new THREE.Color(.85, .88, 1));                                                                        // main engine
  for (let a = 0; a < 8; a++) { const t = a / 8 * Math.PI * 2 + Math.PI / 8; engine(g, Math.cos(t) * 1.45 * k, Math.sin(t) * 1.45 * k, z, .12 * k, new THREE.Color(.85, .88, 1)); } // auxiliary thrusters
  navLights(g, 10.5, 0, z - esmL * .2);
  return g;
}
// Starship (Block 2 proportions): 52.1 m x 9 m (1 m = 0.36 units), tangent-ogive nose, hex tiles over the windward
// ~200°, smaller forward flaps rotated ~20° leeward, aft flaps on the engine bay, 3 RSL + 3 RVac engines.
function buildStarship() {
  const g = newShip();
  const steel = new THREE.MeshStandardMaterial({ map: panelTex('#d3d7dc', 'rgba(85,90,96,.42)', 4, 28, 5), metalness: .55, roughness: .3, envMapIntensity: 2.4, side: THREE.DoubleSide }); // brushed steel reads bright, not mirror-dark
  const tex = (rx, ry, seed) => { const t = hexTex(seed, .012); t.repeat.set(rx, ry); return new THREE.MeshStandardMaterial({ map: t, metalness: .05, roughness: .85, side: THREE.DoubleSide }); };
  const tilesBody = tex(5, 9, 6), tilesNose = tex(5, 5, 7), tilesFlap = tex(2, 2, 8);
  const R = 1.62, Lb = 12.6, Ln = 6.2;
  const lee = [-Math.PI / 2 + .3, Math.PI - .6], wind = [Math.PI / 2 - .3, Math.PI + .6]; // θ from ship +Y
  part(g, new THREE.CylinderGeometry(R, R, Lb, 72, 1, true, ...lee), steel, [0, 0, 0], [X90, 0, 0]);
  part(g, new THREE.CylinderGeometry(R, R, Lb, 72, 1, true, ...wind), tilesBody, [0, 0, 0], [X90, 0, 0]);
  const rho = (R * R + Ln * Ln) / (2 * R);
  const prof = Array.from({ length: 44 }, (_, i) => { const y = i / 43 * Ln; return new THREE.Vector2(Math.max(.001, Math.sqrt(Math.max(0, rho * rho - y * y)) + R - rho), y); }); // tangent ogive, y measured from the base
  part(g, new THREE.LatheGeometry(prof, 72, ...lee), steel, [0, 0, -Lb / 2], [X90, 0, 0]);
  part(g, new THREE.LatheGeometry(prof, 72, ...wind), tilesNose, [0, 0, -Lb / 2], [X90, 0, 0]);
  // flap = steel plate (leeward face) + tile plate (windward face); shape x = span, y = chord toward the tail
  const flap = (span, root, tip) => {
    const sh = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(span, root - tip), new THREE.Vector2(span, root), new THREE.Vector2(0, root)]);
    const f = new THREE.Group();
    part(f, new THREE.ExtrudeGeometry(sh, { depth: .09, bevelEnabled: true, bevelThickness: .02, bevelSize: .03, bevelSegments: 1 }), steel, [0, 0, 0], [Math.PI / 2, 0, 0]);
    part(f, new THREE.ShapeGeometry(sh), tilesFlap, [0, -.13, 0], [Math.PI / 2, 0, 0]);
    return f;
  };
  for (const s of [-1, 1]) {
    const fwd = flap(1.05, 2.3, 1.0); fwd.position.set(s * 1.2, 0, -Lb / 2 - 3.6); fwd.rotation.z = s * .35; fwd.scale.x = s; g.add(fwd);   // forward, 20° leeward
    const aft = flap(1.5, 3.7, 2.0); aft.position.set(s * R * .98, -.05, Lb / 2 - 3.9); aft.rotation.z = -s * .04; aft.scale.x = s; g.add(aft); // aft
  }
  part(g, new THREE.CircleGeometry(R, 72), new THREE.MeshStandardMaterial({ color: 0x2a2b2e, metalness: .3, roughness: .7 }), [0, 0, Lb / 2 + .01]); // aft heat shield
  for (let k = 0; k < 3; k++) { const a = Math.PI / 2 + k * Math.PI * 2 / 3; engine(g, Math.cos(a) * .42, Math.sin(a) * .42, Lb / 2, .23, new THREE.Color(.65, .78, 1)); }      // RSL (1.3 m)
  for (let k = 0; k < 3; k++) { const a = -Math.PI / 2 + k * Math.PI * 2 / 3; engine(g, Math.cos(a) * 1.08, Math.sin(a) * 1.08, Lb / 2, .41, new THREE.Color(.65, .78, 1)); } // RVac (2.3 m)
  return g;
}
function buildRocket() { // retro rocket: checkered hull, three swept fins on landing pads
  const g = newShip();
  const check = canvasTex(256, (c, S) => { for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { c.fillStyle = (i + j) % 2 ? '#e8e2d6' : '#b8302a'; c.fillRect(i * S / 8, j * S / 8, S / 8, S / 8); } });
  check.wrapS = check.wrapT = THREE.RepeatWrapping; check.repeat.set(1, 1); check.colorSpace = THREE.SRGBColorSpace;
  const hull = new THREE.MeshStandardMaterial({ map: check, metalness: .2, roughness: .45, envMapIntensity: 1.2 });
  const red = new THREE.MeshStandardMaterial({ color: 0xb8302a, metalness: .25, roughness: .45, side: THREE.DoubleSide });
  const prof = Array.from({ length: 44 }, (_, i) => { // tail -> nose: waisted base, fat body, long pointed nose
    const y = i / 43 * 16, t = y / 16;
    return new THREE.Vector2(Math.max(.001, 1.55 * Math.pow(Math.sin(Math.PI * Math.min(1, t * .95 + .08)), .8) * (1 - .25 * Math.exp(-t * 12))), y);
  });
  part(g, new THREE.LatheGeometry(prof, 48), hull, [0, 0, 8], [X90, 0, 0]);
  const fin = new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(0, -3), new THREE.Vector2(2.6, 1.2), new THREE.Vector2(2.8, 3.4), new THREE.Vector2(1.9, 3.4), new THREE.Vector2(0, 1.8)]), { depth: .14, bevelEnabled: true, bevelThickness: .04, bevelSize: .05, bevelSegments: 1 });
  for (let k = 0; k < 3; k++) {
    const arm = new THREE.Group(); arm.rotation.z = Math.PI / 2 + k * Math.PI * 2 / 3; g.add(arm);
    part(arm, fin, red, [1.1, -.07, 5.2], [Math.PI / 2, 0, 0]);
    part(arm, new THREE.SphereGeometry(.28, 12, 8), red, [3.85, 0, 8.6]); // landing pad
  }
  const port = new THREE.MeshStandardMaterial({ color: 0x0b0c0e, metalness: .9, roughness: .1, envMapIntensity: 3 });
  part(g, new THREE.CircleGeometry(.35, 20), port, [0, 1.45, -2.2], [-Math.PI / 2 + .25, 0, 0]);
  engine(g, 0, 0, 8.05, .65, new THREE.Color(1, .6, .3));
  return g;
}
const SHIPS = [['lifting body', buildLiftingBody], ['shuttle', buildShuttle], ['capsule', buildCapsule], ['starship', buildStarship], ['rocket', buildRocket]];
let shipIdx = Math.min(SHIPS.length - 1, store.get('dh3d.ship2', 0) | 0), shipMesh = null;
function setShip(i) {
  if (shipMesh) { scene.remove(shipMesh); shipMesh.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material && !o.material.userData.shared) { o.material.map?.dispose(); o.material.dispose(); } }); }
  shipIdx = i; store.set('dh3d.ship2', i);
  shipMesh = SHIPS[i][1]();
  const fill = new THREE.PointLight(0xfff0dc, .9, 0, 0); fill.position.set(-8, 10, 20); shipMesh.add(fill); // soft key light so the hull reads against black space
  shipMesh.visible = false;
  scene.add(shipMesh);
  document.querySelectorAll('[data-ship]').forEach(b => b.classList.toggle('on', +b.dataset.ship === i));
}
setShip(shipIdx);
const camQ = new THREE.Quaternion(), CHASE_OFF = new V3(0, 5.5, 34);
const bankQ = new THREE.Quaternion(), bankE = new THREE.Euler();
function updateCamera(dt) {
  shipMesh.visible = chase;
  camQ.slerp(ship.q, chase ? 1 - Math.exp(-dt * 6) : 1);
  if (chase) {
    shipMesh.position.copy(ship.pos);
    shipMesh.quaternion.copy(ship.q).multiply(bankQ.setFromEuler(bankE.set(0, 0, ship.w.y * .35 - ship.w.z * .1)));
    const { flames, throats, tips } = shipMesh.userData, th = Math.min(1, thrustVis);
    flames.forEach(({ f, r }) => { f.scale.setScalar(r * (2 + thrustVis * 5 + Math.random() * .6)); f.material.opacity = th * .55; });
    throats.forEach(m => m.color.setRGB(.2 + th * .9, .1 + th * .6, .04 + th * .35));
    tips.forEach(t => t.material.opacity = simT % 1.6 < .08 ? 1 : .15); // strobe
    camera.position.copy(CHASE_OFF).applyQuaternion(camQ).add(ship.pos);
  } else camera.position.copy(ship.pos);
  camera.quaternion.copy(camQ);
  camera.updateMatrixWorld();
  $('reticle').classList.toggle('hidden', chase);
}

// ---------------------------------------------------------------- HUD (text only)
const $ = id => document.getElementById(id);
const stats = $('stats'), bracket = $('bracket'), blbl = bracket.firstChild;
const fmtD = u => { const km = u * 10; return km < 1e4 ? km.toFixed(0) + ' km' : km < 1e7 ? (km / 1e3).toFixed(1) + ' Mm' : (km / 1e6).toFixed(2) + ' Gm'; };
const fmtT = s => `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(Math.floor(s) % 60).padStart(2, '0')}`;
const worlds = store.get('dh3d.charted', []); // [{id, name, label}], oldest first
const worldsEl = $('worlds');
const SHORT = { 'Rocky world': 'rocky', 'Terran world': 'terran', 'Lava world': 'lava', 'Ice world': 'ice', 'Pulsar (neutron star)': 'pulsar' };
const renderWorlds = () => { worldsEl.innerHTML = worlds.slice().reverse().map(w => `<div>${w.name}  <span class="k">${SHORT[w.label] || w.label.toLowerCase()}</span></div>`).join(''); };
renderWorlds();
let flashA = 0;
function flash(a, color) { flashA = a; $('flash').style.background = color; }
function discover(b) {
  b.disc = true; discSet.add(b.id); store.set('dh3d.disc', [...discSet]);
  if (!worlds.some(w => w.id === b.id)) {
    worlds.push({ id: b.id, name: b.name, label: b.label }); store.set('dh3d.charted', worlds); renderWorlds(); worldsEl.scrollTop = 0;
  }
  if (started) chime();
}
// world point -> screen px, clamped to the screen edge when off-screen or behind
function screenPos(w) {
  tP.copy(w).applyMatrix4(camera.matrixWorldInverse);
  const behind = tP.z > 0;
  tP.copy(w).project(camera);
  let x = tP.x, y = tP.y;
  if (behind) { x = -x; y = -y; }
  const edge = behind || Math.abs(x) > .95 || Math.abs(y) > .9;
  if (edge) { const m = Math.max(Math.abs(x) / .92, Math.abs(y) / .85); x /= m; y /= m; }
  return [(x * .5 + .5) * innerWidth, (-y * .5 + .5) * innerHeight, edge];
}
let hudTick = 0;
function updateHUD(dt) {
  flashA = Math.max(0, flashA - dt * .8); $('flash').style.opacity = flashA;
  $('edge').classList.toggle('on', !!alarm && alarm.lvl > 1);
  const t = ship.target || ship.cand;
  bracket.classList.toggle('hidden', !t || !started);
  if (t) {
    const [sx, sy, edge] = screenPos(t.pos);
    const d = camera.position.distanceTo(t.pos);
    const sz = edge ? 16 : Math.min(400, Math.max(24, t.R / d / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * innerHeight * 1.15));
    bracket.style.width = bracket.style.height = sz + 'px';
    bracket.style.transform = `translate(${sx - sz / 2}px, ${sy - sz / 2}px)`;
    bracket.classList.toggle('locked', t === ship.target); bracket.classList.toggle('cand', t !== ship.target);
    if (hudTick % 6 === 0) blbl.innerHTML = `<b>${t === ship.target ? '■ LOCKED  ' : ''}${t.name}</b><br>${t.label.toLowerCase()}${t.disc ? '' : ' [uncharted]'}<br>${fmtD(Math.max(0, ship.pos.distanceTo(t.pos) - (isSolid(t) ? t.R : 0)))}${ship.auto && t === ship.target ? '<br>autopilot' : ''}`;
  }
  if (hudTick++ % 6) return;
  const sp = ship.vel.length();
  stats.innerHTML = [
    `<span class="k">SPEED  </span> ${ship.vel.dot(tF.set(0, 0, -1).applyQuaternion(ship.q)) < -1 ? '-' : ''}${(sp * 10).toLocaleString('en', { maximumFractionDigits: 0 })} km/s${sp > CRUISE * 1.05 ? ' · warp' : ''}`,
    `<span class="k">BETA   </span> ${(sp / C_LIGHT).toFixed(3)} c`,
    `<span class="k">TIME×  </span> ${rate.toFixed(3)}`,
    `<span class="k">ALT    </span> ${nearSurf && nearSurf[0] < 2e5 ? `${fmtD(Math.max(0, nearSurf[0]))} <span class="k">${nearSurf[1].name}</span>` : '--'}`,
    `<span class="k">CHARTED</span> ${worlds.length}`,
    ship.transit ? `<span class="k">MODE   </span> ${ship.transit.kind === 'home' ? 'beacon recall' : 'transit'}…`
      : ship.orbit ? `<span class="k">MODE   </span> orbit ${ship.orbit.name} <span class="k">[O]/[X] release</span>`
      : ship.auto ? `<span class="k">MODE   </span> ${ship.autoOrbit ? 'to orbit' : 'autopilot'} → ${ship.target.name} <span class="k">[X] cancel</span>`
      : ship.target ? `<span class="k">MODE   </span> locked ${ship.target.name} <span class="k">[T]/[X] unlock</span>` : '',
    alarm ? `<span class="a${alarm.lvl}">!! ${alarm.txt}</span>` : '',
  ].filter(Boolean).join('\n');
}

// ---------------------------------------------------------------- radar: tilted 3D disc, sqrt-scaled, sweep, flight path, orbit preview
const mapC = $('map'), mg = mapC.getContext('2d');
const MW = 230, MH = 210;
mapC.width = MW * PR; mapC.height = MH * PR;
const TAU2 = Math.PI * 2, TILT = .5; // disc seen from above-behind: forward axis squashed by TILT
const A = (a) => `rgba(${HUD_RGB},${a})`;
const trail = []; let trailT = 0;
function recordTrail(dt) {
  trailT += dt;
  const lastP = trail[trail.length - 1];
  if (trailT > .2 && (!lastP || lastP.distanceToSquared(ship.pos) > 400 * 400)) { trailT = 0; trail.push(ship.pos.clone()); if (trail.length > 900) trail.shift(); }
}
let sweep = 0;
const tN = new V3(), tT = new V3(), tW = new V3();
function drawMap(dt) {
  sweep = (sweep + dt * TAU2 / 2.6) % TAU2;
  const p = PR, cx = MW / 2 * p, cy = 100 * p, R = 98 * p, range = RANGES[mapRange];
  const fwd = tF.set(0, 0, -1).applyQuaternion(ship.q), right = tR.set(1, 0, 0).applyQuaternion(ship.q), up = tU.set(0, 1, 0).applyQuaternion(ship.q);
  const H = Math.sqrt(1 - TILT * TILT);
  const proj = (w, o) => { // world -> {x, y (on screen), gy (foot on disc), h (height, + = above), px/pz (disc plane), s (perspective)}
    tD.subVectors(w, ship.pos); const d = tD.length();
    if (d > range) return false;
    const k = d < 1 ? 0 : Math.sqrt(d / range) * R / d;
    o.k = k; o.px = tD.dot(right) * k; o.pz = tD.dot(fwd) * k; o.h = tD.dot(up) * k;
    o.s = 1 / (1 + o.pz / R * .35); // nearer the viewer (behind ship) = bigger
    o.x = cx + o.px * o.s; o.gy = cy - o.pz * TILT * o.s; o.y = o.gy - o.h * H * o.s;
    return true;
  };
  mg.clearRect(0, 0, mapC.width, mapC.height);
  mg.lineWidth = p;
  // collect blips, split by side of the disc so the plane can sit between them
  const blips = [];
  for (const b of bodies) { const o = {}; if (proj(b.pos, o)) { o.b = b; blips.push(o); } }
  blips.sort((a, b) => b.pz - a.pz); // far first
  const drawBlip = (o, below) => {
    const b = o.b, ang = Math.atan2(-o.pz, o.px);
    const age = (((sweep - ang) % TAU2) + TAU2) % TAU2 / TAU2;
    const a = Math.max(.2, 1 - age) * (b.disc ? 1 : .75) * (below ? .45 : 1);
    mg.strokeStyle = A(a * .4); mg.setLineDash(below ? [2 * p, 2 * p] : []);
    mg.beginPath(); mg.moveTo(o.x, o.gy); mg.lineTo(o.x, o.y); mg.stroke(); mg.setLineDash([]);
    mg.fillStyle = A(a * .5); mg.fillRect(o.x - p, o.gy - .5 * p, 2 * p, p); // foot on the disc
    const z = o.s * p;
    mg.fillStyle = mg.strokeStyle = b.kind === 'bh' ? `rgba(255,70,60,${a})` : A(a);
    switch (b.kind) {
      case 'star': mg.beginPath(); mg.arc(o.x, o.y, 3.6 * z, 0, TAU2); mg.fill(); mg.strokeStyle = A(a * .35); mg.beginPath(); mg.arc(o.x, o.y, 6 * z, 0, TAU2); mg.stroke(); break;
      case 'planet': mg.beginPath(); mg.arc(o.x, o.y, 2.3 * z, 0, TAU2); mg.fill(); break;
      case 'moon': mg.beginPath(); mg.arc(o.x, o.y, 1.2 * z, 0, TAU2); mg.fill(); break;
      case 'bh': mg.beginPath(); mg.arc(o.x, o.y, 4 * z, 0, TAU2); mg.stroke(); mg.beginPath(); mg.arc(o.x, o.y, 1.4 * z, 0, TAU2); mg.fill(); break;
      case 'wormhole': mg.beginPath(); mg.arc(o.x, o.y, 3.2 * z, 0, TAU2); mg.stroke(); break;
      case 'pulsar': mg.beginPath(); mg.arc(o.x, o.y, 1.8 * z, 0, TAU2); mg.fill(); mg.beginPath(); mg.moveTo(o.x - 6 * z, o.y + 3 * z); mg.lineTo(o.x + 6 * z, o.y - 3 * z); mg.stroke(); break;
      case 'comet': mg.beginPath(); mg.arc(o.x, o.y, 1.4 * z, 0, TAU2); mg.fill(); mg.strokeStyle = A(a * .5); mg.beginPath(); mg.moveTo(o.x, o.y); mg.lineTo(o.x + 5 * z, o.y - 2 * z); mg.stroke(); break;
      case 'nebula': mg.globalAlpha = .35; mg.setLineDash([2 * p, 3 * p]); mg.beginPath(); mg.ellipse(o.x, o.y, Math.max(5 * p, b.R * o.k * o.s), Math.max(3 * p, b.R * o.k * o.s * TILT), 0, 0, TAU2); mg.stroke(); mg.setLineDash([]); mg.globalAlpha = 1; break;
    }
    if (b === ship.target) { mg.strokeStyle = A(1); mg.strokeRect(o.x - 6 * z, o.y - 6 * z, 12 * z, 12 * z); }
  };
  blips.filter(o => o.h < 0).forEach(o => drawBlip(o, true));
  // the disc (translucent, so what's below shows through dimmed)
  mg.save(); mg.translate(cx, cy); mg.scale(1, TILT);
  const bg = mg.createRadialGradient(0, 0, 0, 0, 0, R);
  bg.addColorStop(0, 'rgba(20,14,6,.42)'); bg.addColorStop(1, 'rgba(20,14,6,.22)');
  mg.fillStyle = bg; mg.beginPath(); mg.arc(0, 0, R, 0, TAU2); mg.fill();
  mg.lineWidth = p / TILT * .7;
  mg.strokeStyle = alarm ? (alarm.lvl > 1 ? 'rgba(255,59,59,.8)' : 'rgba(255,140,66,.75)') : A(.45);
  mg.beginPath(); mg.arc(0, 0, R, 0, TAU2); mg.stroke();
  mg.strokeStyle = A(.13);
  [.25, .5].forEach(f => { mg.beginPath(); mg.arc(0, 0, R * Math.sqrt(f), 0, TAU2); mg.stroke(); });
  mg.beginPath(); mg.moveTo(-R, 0); mg.lineTo(R, 0); mg.moveTo(0, -R); mg.lineTo(0, R); mg.stroke();
  if (mg.createConicGradient) {
    const g = mg.createConicGradient(sweep - 1, 0, 0), e = 1 / TAU2;
    g.addColorStop(0, A(0)); g.addColorStop(e * .999, A(.22)); g.addColorStop(e, A(0)); g.addColorStop(1, A(0));
    mg.fillStyle = g; mg.beginPath(); mg.arc(0, 0, R, 0, TAU2); mg.fill();
  }
  mg.strokeStyle = A(.6); mg.beginPath(); mg.moveTo(0, 0); mg.lineTo(Math.cos(sweep) * R, Math.sin(sweep) * R); mg.stroke();
  mg.restore();
  mg.lineWidth = p;
  // flight path
  const q = {};
  mg.strokeStyle = A(.5); mg.setLineDash([3 * p, 3 * p]); mg.beginPath();
  let pen = false;
  for (const w of trail) { if (proj(w, q)) { pen ? mg.lineTo(q.x, q.y) : mg.moveTo(q.x, q.y); pen = true; } else pen = false; }
  if (pen) mg.lineTo(cx, cy);
  mg.stroke(); mg.setLineDash([]);
  // current orbit (only while holding one with [O])
  let hint = '';
  if (ship.orbit) {
    const ob = ship.orbit, rd = ship.orbitR;
    orbitVel(ob, rd, fwd, tW);
    const n = tN2; tT.copy(tW).addScaledVector(n, -tW.dot(n)).normalize();
    mg.strokeStyle = A(.8); mg.beginPath(); pen = false;
    for (let i = 0; i <= 64; i++) {
      const t = i / 64 * TAU2, w = tN.copy(ob.pos).addScaledVector(n, Math.cos(t) * rd).addScaledVector(tT, Math.sin(t) * rd).clone();
      if (proj(w, q)) { pen ? mg.lineTo(q.x, q.y) : mg.moveTo(q.x, q.y); pen = true; } else pen = false;
    }
    mg.stroke();
    hint = `orbiting ${ob.name} · [O] release`;
  }
  blips.filter(o => o.h >= 0).forEach(o => drawBlip(o, false));
  // ship
  mg.fillStyle = A(1); mg.beginPath(); mg.moveTo(cx, cy - 5 * p); mg.lineTo(cx - 3.5 * p, cy + 3 * p); mg.lineTo(cx + 3.5 * p, cy + 3 * p); mg.fill();
  mg.font = `${9.5 * p}px Menlo, ui-monospace, monospace`; mg.textAlign = 'center';
  mg.fillStyle = A(.6); mg.fillText(`rng ${fmtD(range)} · [M]`, cx, cy + R * TILT + 13 * p);
  mg.fillStyle = A(.85);
  hint.split('\n').forEach((l, i) => mg.fillText(l, cx, cy + R * TILT + 27 * p + i * 12 * p));
  mg.textAlign = 'left';
}

// ---------------------------------------------------------------- boot & loop
const saved = store.get('dh3d.ship', null);
if (saved) { ship.pos.fromArray(saved.p); ship.q.fromArray(saved.q); updateSectors(27); }
else spawnHome();
camQ.copy(ship.q);
setInterval(() => { store.set('dh3d.ship', { p: ship.pos.toArray(), q: ship.q.toArray() }); store.set('dh3d.t', simT); store.set('dh3d.tau', ship.tau); }, 3000);

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(Math.max(now - last, 0) / 1000, .05); last = now;
  if (!paused) step(dt);
  updateDust(); updateLens(); updateHUD(dt); drawMap(dt); updateAudio(); if (!paused) pulsarTick();
  composer.render();
}
function step(dt) {
  simT += dt; UT.value = simT;
  updateSectors();
  updateOrbits();
  if (ship.transit) updateTransit(dt); else { updateShip(dt); recordTrail(dt); }
  updateExitMouth(dt);
  for (const s of sectors.values()) for (const f of s.ticks) f(dt);
  if (nearStar) { sunLight.position.copy(nearStar.pos); sunLight.target.position.copy(ship.pos); }
  const warpF = sstep(CRUISE, MAX_WARP * .8, ship.vel.length());
  camera.fov += (FOV + warpF * 18 - camera.fov) * Math.min(1, dt * 3); camera.updateProjectionMatrix();
  updateCamera(dt);
  starfield.position.copy(camera.position);
  lens.uniforms.uWarp.value = warpF; lens.uniforms.uT.value = simT % 100;
}
requestAnimationFrame(frame);
