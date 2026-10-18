/** Sonido de encaje sintetizado (clic de madera) con WebAudio: sin archivos que descargar. */
let ctx: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(on: boolean) {
  enabled = on;
}

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** Desbloquea el audio en iOS (debe llamarse dentro de un gesto del usuario). */
export function unlockAudio() {
  if (enabled) audio();
}

export function playSnap(strength = 1) {
  if (!enabled) return;
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  // Golpe: ruido corto filtrado
  const len = Math.floor(ac.sampleRate * 0.05);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 4;
  const noise = ac.createBufferSource();
  noise.buffer = buf;
  const band = ac.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 1900 + Math.random() * 400;
  band.Q.value = 1.2;
  const ng = ac.createGain();
  ng.gain.value = 0.5 * strength;
  noise.connect(band).connect(ng).connect(ac.destination);
  noise.start(t);
  // Cuerpo: tono grave que decae
  const osc = ac.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(420, t);
  osc.frequency.exponentialRampToValueAtTime(180, t + 0.08);
  const og = ac.createGain();
  og.gain.setValueAtTime(0.22 * strength, t);
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  osc.connect(og).connect(ac.destination);
  osc.start(t);
  osc.stop(t + 0.13);
}

/** Pequeña fanfarria al terminar. */
export function playWin() {
  if (!enabled) return;
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
    const osc = ac.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = f;
    const g = ac.createGain();
    const s = t + i * 0.11;
    g.gain.setValueAtTime(0.0001, s);
    g.gain.exponentialRampToValueAtTime(0.18, s + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, s + 0.5);
    osc.connect(g).connect(ac.destination);
    osc.start(s);
    osc.stop(s + 0.55);
  });
}
