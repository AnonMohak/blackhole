// Heads-up overlay: scene title and caption, live telemetry, an altitude ruler.

export interface Telemetry {
  alt: number; // camera height (m)
  horizon: number; // observer distance (Schwarzschild radii)
  time: number; // seconds
  fps: number;
  cinematic: boolean;
}

const ALT_MAX = 20; // metres at the top of the ruler

export class Hud {
  private readonly title = document.getElementById('hud-title')!;
  private readonly caption = document.getElementById('hud-caption')!;
  private readonly tele = document.getElementById('hud-tele')!;
  private readonly mark = document.getElementById('hud-mark')!;
  private readonly markVal = document.getElementById('hud-mark-val')!;
  private readonly cineBtn = document.getElementById('btn-cine')!;
  private textTimer = 0;
  private swapTimer = 0;

  constructor() {
    const ticks = document.getElementById('hud-ticks')!;
    for (let i = 0; i <= ALT_MAX; i += 2) {
      const t = document.createElement('span');
      t.className = i % 10 === 0 ? 'major' : '';
      t.style.bottom = `${(i / ALT_MAX) * 100}%`;
      if (i % 10 === 0) t.dataset.label = String(i);
      ticks.append(t);
    }
  }

  setScene(label: string, caption: string, numeral: string) {
    const head = document.querySelector('.hud-head')!;
    head.classList.add('swap');
    clearTimeout(this.swapTimer);
    this.swapTimer = window.setTimeout(() => {
      this.title.textContent = label;
      this.title.dataset.num = numeral;
      this.caption.textContent = caption;
      head.classList.remove('swap');
    }, 350);
  }

  update(dt: number, t: Telemetry) {
    const k = Math.min(Math.max(t.alt / ALT_MAX, 0), 1);
    this.mark.style.bottom = `${k * 100}%`;
    this.textTimer -= dt;
    if (this.textTimer > 0) return;
    this.textTimer = 0.25;
    const mm = String(Math.floor(t.time / 60)).padStart(2, '0');
    const ss = String(Math.floor(t.time % 60)).padStart(2, '0');
    this.markVal.textContent = `${t.alt.toFixed(1)} m`;
    this.tele.innerHTML =
      `<span>ALT <b>${t.alt.toFixed(2)} m</b></span><span>HORIZON <b>${t.horizon.toFixed(1)} r<sub>s</sub></b></span>` +
      `<span>T <b>${mm}:${ss}</b></span><span><b>${t.fps}</b> FPS</span>`;
    this.cineBtn.setAttribute('aria-pressed', String(t.cinematic));
  }
}
