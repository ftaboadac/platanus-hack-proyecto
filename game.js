// 1982 — Argentine A-4 Skyhawk vs British forces over the South Atlantic
const W = 800, H = 600, HS_KEY = 'malvinas-highscore';

// DO NOT replace existing keys — they match the physical arcade cabinet wiring.
const CABINET_KEYS = {
  P1_U: ['w'], P1_D: ['s'], P1_L: ['a'], P1_R: ['d'],
  P1_1: ['u'], P1_2: ['i'], P1_3: ['o'], P1_4: ['j'],
  P1_5: ['k'], P1_6: ['l'],
  P2_U: ['ArrowUp'], P2_D: ['ArrowDown'], P2_L: ['ArrowLeft'], P2_R: ['ArrowRight'],
  P2_1: ['r'], P2_2: ['t'], P2_3: ['y'], P2_4: ['f'],
  P2_5: ['g'], P2_6: ['h'],
  START1: ['Enter'], START2: ['2'],
};

const KEY_MAP = {};
for (const [code, keys] of Object.entries(CABINET_KEYS)) {
  for (const k of keys) KEY_MAP[normKey(k)] = code;
}

function normKey(k) {
  if (!k || !k.length) return '';
  if (k === ' ') return 'space';
  return k.toLowerCase();
}

const ctrl = { held: {}, pressed: {} };

(function setupKeys() {
  window.addEventListener('keydown', e => {
    const code = KEY_MAP[normKey(e.key)];
    if (!code) return;
    if (!ctrl.held[code]) ctrl.pressed[code] = true;
    ctrl.held[code] = true;
  });
  window.addEventListener('keyup', e => {
    const code = KEY_MAP[normKey(e.key)];
    if (code) ctrl.held[code] = false;
  });
})();

function consume(code) {
  if (ctrl.pressed[code]) { ctrl.pressed[code] = false; return true; }
  return false;
}
function consumeAny(codes) {
  for (const c of codes) if (consume(c)) return true;
  return false;
}
function isHeld(code) { return !!ctrl.held[code]; }

function getStorage() {
  if (window.platanusArcadeStorage) return window.platanusArcadeStorage;
  return {
    async get(k) {
      try {
        const v = localStorage.getItem(k);
        return v !== null ? { found: true, value: JSON.parse(v) } : { found: false, value: null };
      } catch (_) { return { found: false, value: null }; }
    },
    async set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }
  };
}
async function loadHS() {
  const r = await getStorage().get(HS_KEY);
  return (r.found && typeof r.value === 'number') ? r.value : 0;
}
async function saveHS(score) { await getStorage().set(HS_KEY, score); }

const LB_KEY = 'malvinas-leaderboard';
async function loadLB() {
  const r = await getStorage().get(LB_KEY);
  return (r.found && Array.isArray(r.value)) ? r.value.slice(0, 10) : [];
}
async function saveLB(lb) { await getStorage().set(LB_KEY, lb.slice(0, 10)); }
function qualifiesLB(lb, score) { return score > 0 && (lb.length < 10 || score > lb[lb.length - 1].score); }
function insertLB(lb, entry) {
  const next = [...lb, entry];
  next.sort((a, b) => b.score - a.score);
  return next.slice(0, 10);
}

let _audioCtx = null;
function getAudioCtx() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (_audioCtx.state === 'suspended') _audioCtx.resume();
  return _audioCtx;
}

function playSound(type) {
  try {
    const ctx = getAudioCtx();
    const now = ctx.currentTime;
    function tone(freq, type2, dur, vol, freqEnd) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = type2; o.frequency.setValueAtTime(freq, now);
      if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, now + dur);
      g.gain.setValueAtTime(vol, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + dur);
      o.start(now); o.stop(now + dur + 0.01);
    }
    if (type === 'shoot') tone(1400, 'square', 0.05, 0.08, 700);
    else if (type === 'explode') tone(180, 'sawtooth', 0.35, 0.22, 40);
    else if (type === 'hit') tone(90, 'sine', 0.2, 0.28);
    else if (type === 'boss') tone(55, 'sawtooth', 0.6, 0.28, 110);
    else if (type === 'powerup') {
      [440, 550, 660].forEach((f, i) => {
        const o = ctx.createOscillator(), g2 = ctx.createGain();
        o.connect(g2); g2.connect(ctx.destination);
        o.type = 'triangle'; o.frequency.value = f;
        const t = now + i * 0.09;
        g2.gain.setValueAtTime(0.14, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        o.start(t); o.stop(t + 0.12);
      });
    } else if (type === 'select') tone(700, 'square', 0.1, 0.1, 1400);
  } catch (_) {}
}

// ─── SPRITE DRAWING ───────────────────────────────────────────────────────────

function drawPlayerGfx(g) {
  g.clear();
  // Fuselage — narrow central body
  g.fillStyle(0x75AADB, 1);
  g.fillRect(-5, -26, 10, 48);
  // Swept wings — left
  g.fillStyle(0x5a8ab5, 1);
  g.fillTriangle(-5, -6, -30, 16, -5, 10);
  // Swept wings — right
  g.fillTriangle(5, -6, 30, 16, 5, 10);
  // Wing leading edge highlight
  g.fillStyle(0x8dc4e8, 1);
  g.fillTriangle(-5, -6, -18, 4, -5, 2);
  g.fillTriangle(5, -6, 18, 4, 5, 2);
  // Wing tip fuel tanks
  g.fillStyle(0x4a7aa0, 1);
  g.fillRect(-32, 12, 8, 5);
  g.fillRect(24, 12, 8, 5);
  // Horizontal stabilizers / tail
  g.fillStyle(0x5a8ab5, 1);
  g.fillTriangle(-5, 18, -16, 24, -5, 21);
  g.fillTriangle(5, 18, 16, 24, 5, 21);
  // Vertical tail fin
  g.fillStyle(0x4a7aa0, 1);
  g.fillTriangle(-3, 14, 3, 14, 0, 24);
  // Cockpit canopy
  g.fillStyle(0xffffff, 1);
  g.fillRect(-4, -20, 8, 10);
  g.fillStyle(0x88ccff, 1);
  g.fillRect(-3, -19, 6, 8);
  // Nose cone
  g.fillStyle(0x75AADB, 1);
  g.fillTriangle(-4, -26, 4, -26, 0, -38);
  // Air intake under cockpit
  g.fillStyle(0x2a5a80, 1);
  g.fillRect(-4, -10, 8, 5);
  // Engine nozzle
  g.fillStyle(0x3a6a90, 1);
  g.fillRect(-4, 20, 8, 7);
  g.fillStyle(0xff8800, 0.5);
  g.fillRect(-3, 27, 6, 3);
}

function drawEnemyJetGfx(g) {
  g.clear();
  // Fuselage — pointing DOWN (nose toward player)
  g.fillStyle(0x3a3a3a, 1);
  g.fillRect(-5, -22, 10, 44);
  // Swept wings
  g.fillStyle(0x4a4a4a, 1);
  g.fillTriangle(-5, 6, -28, -12, -5, -4);
  g.fillTriangle(5, 6, 28, -12, 5, -4);
  // Wing underside darker
  g.fillStyle(0x2a2a2a, 1);
  g.fillTriangle(-5, 4, -22, -8, -5, -1);
  g.fillTriangle(5, 4, 22, -8, 5, -1);
  // Red accent stripes
  g.fillStyle(0xCC2222, 1);
  g.fillRect(-26, -9, 7, 3);
  g.fillRect(19, -9, 7, 3);
  // Tail fins (at top — enemy points down)
  g.fillStyle(0x444444, 1);
  g.fillTriangle(-5, -16, -14, -22, -5, -20);
  g.fillTriangle(5, -16, 14, -22, 5, -20);
  // Cockpit
  g.fillStyle(0x222222, 1);
  g.fillRect(-4, 10, 8, 9);
  g.fillStyle(0x882222, 1);
  g.fillRect(-3, 11, 6, 7);
  // Nose
  g.fillStyle(0x2a2a2a, 1);
  g.fillTriangle(-4, 22, 4, 22, 0, 32);
  // Air intakes
  g.fillStyle(0x1a1a1a, 1);
  g.fillRect(-9, 2, 5, 7);
  g.fillRect(4, 2, 5, 7);
  // Engine exhaust at tail
  g.fillStyle(0x555555, 1);
  g.fillRect(-4, -22, 8, 5);
}

function drawBomberGfx(g) {
  g.clear();
  // Main fuselage polygon — heavy bomber, top-down view, nose at top
  g.fillStyle(0x555555, 1);
  g.fillPoints([
    {x:0,y:-20},{x:5,y:-14},{x:5,y:6},{x:30,y:0},{x:32,y:4},
    {x:5,y:12},{x:3,y:20},{x:-3,y:20},{x:-5,y:12},
    {x:-32,y:4},{x:-30,y:0},{x:-5,y:6},{x:-5,y:-14}
  ], true);
  // Cockpit
  g.fillStyle(0x333333, 1);
  g.fillRect(-2, -16, 4, 5);
  // Wing engines
  g.fillStyle(0x444444, 1);
  g.fillRect(-22, 2, 4, 4);
  g.fillRect(18, 2, 4, 4);
  // Engine exhaust glow
  g.fillStyle(0xcc5544, 1);
  g.fillRect(-21, 6, 2, 3);
  g.fillRect(19, 6, 2, 3);
}

function drawBossBomberGfx(g) {
  g.clear();
  // Main fuselage — 3x scaled heavy bomber polygon
  g.fillStyle(0x4a4a4a, 1);
  g.fillPoints([
    {x:0,y:-60},{x:15,y:-42},{x:15,y:18},{x:90,y:0},{x:96,y:12},
    {x:15,y:36},{x:9,y:60},{x:-9,y:60},{x:-15,y:36},
    {x:-96,y:12},{x:-90,y:0},{x:-15,y:18},{x:-15,y:-42}
  ], true);
  // Body markings — lighter gray panels
  g.fillStyle(0x606060, 1);
  g.fillRect(-10, -52, 20, 18);
  g.fillRect(-14, 22, 28, 10);
  g.fillRect(-6, -18, 12, 30);
  // Cockpit
  g.fillStyle(0x333333, 1);
  g.fillRect(-7, -50, 14, 16);
  g.fillStyle(0x222244, 1);
  g.fillRect(-5, -48, 10, 12);
  // 4 engines — 2 per wing
  g.fillStyle(0x3a3a3a, 1);
  g.fillRect(-58, 4, 14, 14);
  g.fillRect(-36, 2, 14, 14);
  g.fillRect(22, 2, 14, 14);
  g.fillRect(44, 4, 14, 14);
  // Engine glow — red
  g.fillStyle(0xcc4433, 1);
  g.fillRect(-57, 18, 12, 7);
  g.fillRect(-35, 16, 12, 7);
  g.fillRect(23, 16, 12, 7);
  g.fillRect(45, 18, 12, 7);
  // Nose turret
  g.fillStyle(0x505050, 1);
  g.fillRect(-8, -62, 16, 10);
  g.fillStyle(0x282828, 1);
  g.fillRect(-3, -72, 6, 14);
  // Tail turret
  g.fillStyle(0x505050, 1);
  g.fillRect(-8, 52, 16, 10);
  g.fillStyle(0x282828, 1);
  g.fillRect(-3, 58, 6, 14);
  // Left wing turret
  g.fillStyle(0x505050, 1);
  g.fillRect(-86, -4, 16, 10);
  g.fillStyle(0x282828, 1);
  g.fillRect(-96, 0, 14, 4);
  // Right wing turret
  g.fillStyle(0x505050, 1);
  g.fillRect(70, -4, 16, 10);
  g.fillStyle(0x282828, 1);
  g.fillRect(82, 0, 14, 4);
}

function drawThatcherGfx(g) {
  g.clear();
  // Big iconic bouffant hair
  g.fillStyle(0xd4a830, 1);
  g.fillEllipse(0, -28, 122, 92);
  g.fillEllipse(-48, -12, 50, 64);
  g.fillEllipse(48, -12, 50, 64);
  g.fillStyle(0xecc444, 0.65);
  g.fillEllipse(0, -38, 84, 52);
  g.fillStyle(0xb08820, 0.45);
  g.fillRect(-30, -38, 6, 22); g.fillRect(-18, -42, 6, 20); g.fillRect(-6, -44, 6, 20);
  g.fillRect(6, -44, 6, 20); g.fillRect(18, -42, 6, 20); g.fillRect(26, -38, 6, 22);
  // Face
  g.fillStyle(0xf0c090, 1);
  g.fillEllipse(0, 18, 82, 96);
  g.fillRect(-34, -14, 68, 34);
  // Eyes — icy blue
  g.fillStyle(0xffffff, 1);
  g.fillEllipse(-21, 4, 24, 14); g.fillEllipse(21, 4, 24, 14);
  g.fillStyle(0x1848cc, 1);
  g.fillCircle(-21, 4, 7); g.fillCircle(21, 4, 7);
  g.fillStyle(0x000000, 1);
  g.fillCircle(-21, 4, 4); g.fillCircle(21, 4, 4);
  g.fillStyle(0xffffff, 0.8);
  g.fillCircle(-19, 2, 2); g.fillCircle(23, 2, 2);
  // Stern furrowed brows
  g.fillStyle(0x6a4018, 1);
  g.fillRect(-30, -5, 20, 4); g.fillRect(10, -5, 20, 4);
  // Prominent nose
  g.fillStyle(0xdda070, 1);
  g.fillTriangle(-7, 16, 7, 16, 2, 30); g.fillRect(-8, 26, 16, 6);
  // Thin stern mouth
  g.fillStyle(0xcc3333, 1);
  g.fillRect(-20, 36, 40, 5);
  g.fillStyle(0x991111, 1);
  g.fillRect(-14, 36, 28, 3);
  // Rosy cheeks
  g.fillStyle(0xff8877, 0.22);
  g.fillCircle(-28, 22, 12); g.fillCircle(28, 22, 12);
  // Chin and neck
  g.fillStyle(0xf0c090, 1);
  g.fillEllipse(0, 52, 56, 28); g.fillRect(-15, 48, 30, 15);
  // Blue suit
  g.fillStyle(0x1a3899, 1);
  g.fillPoints([{x:-50,y:82},{x:-25,y:60},{x:0,y:65},{x:25,y:60},{x:50,y:82}], true);
  g.fillRect(-50, 80, 100, 16);
  // Pearl necklace
  g.fillStyle(0xeeeeee, 1);
  for (let i = -3; i <= 3; i++) g.fillCircle(i * 8, 58, 3);
}

// ─── EXPLOSION ────────────────────────────────────────────────────────────────

function spawnExplosion(scene, x, y, sz) {
  sz = sz || 1;

  // Phase 1: bright white core flash
  const core = scene.add.graphics().setDepth(14);
  core.fillStyle(0xffffff, 1);
  core.fillCircle(0, 0, 10 * sz);
  core.x = x; core.y = y;
  scene.tweens.add({
    targets: core, scaleX: 2.2, scaleY: 2.2, alpha: 0, duration: 160,
    onComplete: () => core.destroy()
  });

  // Phase 2: yellow-orange ring
  const ring1 = scene.add.graphics().setDepth(13);
  ring1.fillStyle(0xFFCC00, 1);
  ring1.fillCircle(0, 0, 16 * sz);
  ring1.x = x; ring1.y = y;
  scene.tweens.add({
    targets: ring1, scaleX: 2.8, scaleY: 2.8, alpha: 0, duration: 300, delay: 50,
    onComplete: () => ring1.destroy()
  });

  // Phase 3: orange-red fireball
  const ring2 = scene.add.graphics().setDepth(12);
  ring2.fillStyle(0xFF5500, 1);
  ring2.fillCircle(0, 0, 20 * sz);
  ring2.x = x; ring2.y = y;
  scene.tweens.add({
    targets: ring2, scaleX: 3.2, scaleY: 3.2, alpha: 0, duration: 480, delay: 120,
    onComplete: () => ring2.destroy()
  });

  // Phase 4: dark smoke cloud drifts up
  const smoke = scene.add.graphics().setDepth(11);
  smoke.fillStyle(0x2a2a2a, 0.75);
  smoke.fillCircle(0, 0, 18 * sz);
  smoke.x = x; smoke.y = y;
  scene.tweens.add({
    targets: smoke, scaleX: 4 * sz, scaleY: 3.5 * sz, y: y - 30 * sz,
    alpha: 0, duration: 750, delay: 250,
    onComplete: () => smoke.destroy()
  });

  // Debris particles flying outward
  const debrisCount = Math.round(8 * sz);
  const debrisCols = [0xFF9900, 0xFF6600, 0xFF3300, 0xFFCC00, 0xDD4400];
  for (let i = 0; i < debrisCount; i++) {
    const d = scene.add.graphics().setDepth(13);
    d.fillStyle(debrisCols[i % debrisCols.length], 1);
    const ds = Phaser.Math.Between(2, 5) * sz;
    d.fillRect(-ds, -ds, ds * 2, ds * 2);
    d.x = x; d.y = y;
    const ang = (i / debrisCount) * Math.PI * 2 + Math.random() * 0.6;
    const dist = Phaser.Math.Between(28, 75) * sz;
    scene.tweens.add({
      targets: d,
      x: x + Math.cos(ang) * dist,
      y: y + Math.sin(ang) * dist,
      angle: Phaser.Math.Between(-200, 200),
      alpha: 0, scaleX: 0.1, scaleY: 0.1,
      duration: Phaser.Math.Between(300, 620),
      onComplete: () => d.destroy()
    });
  }
}

function showScorePopup(scene, x, y, pts) {
  const t = scene.add.text(x, y, `+${pts}`, {
    fontFamily: 'monospace', fontSize: '12px', color: '#ffcc44', fontStyle: 'bold',
    stroke: '#000000', strokeThickness: 2
  }).setOrigin(0.5).setDepth(18);
  scene.tweens.add({
    targets: t, y: y - 45, alpha: 0, duration: 500,
    onComplete: () => t.destroy()
  });
}

// ─── TITLE SCENE ─────────────────────────────────────────────────────────────
class TitleScene extends Phaser.Scene {
  constructor() { super('Title'); }

  create() {
    this.idleTimer = 0;
    const bg = this.add.graphics();
    bg.fillStyle(0x0a1a2e, 1); bg.fillRect(0, 0, W, H);
    bg.fillStyle(0x1a3a5c, 1); bg.fillRect(0, H * 0.3, W, H * 0.7);

    bg.fillStyle(0x75AADB, 0.25); bg.fillRect(0, 0, W, H / 3);
    bg.fillStyle(0xFFFFFF, 0.12); bg.fillRect(0, H / 3, W, H / 3);
    bg.fillStyle(0x75AADB, 0.25); bg.fillRect(0, H * 2 / 3, W, H / 3);

    for (let i = 0; i < 40; i++) {
      bg.fillStyle(0xffffff, Phaser.Math.FloatBetween(0.3, 0.9));
      bg.fillRect(Phaser.Math.Between(0, W), Phaser.Math.Between(0, H * 0.5), 2, 2);
    }

    const title1 = this.add.text(W / 2, 90, 'MALVINAS', {
      fontFamily: 'monospace', fontSize: '76px', color: '#75AADB',
      fontStyle: 'bold', stroke: '#ffffff', strokeThickness: 3
    }).setOrigin(0.5);

    const title2 = this.add.text(W / 2, 175, '1982', {
      fontFamily: 'monospace', fontSize: '68px', color: '#ffffff',
      fontStyle: 'bold', stroke: '#75AADB', strokeThickness: 4
    }).setOrigin(0.5);

    this.tweens.add({ targets: title1, scaleX: 1.03, scaleY: 1.03, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: title2, scaleX: 1.02, scaleY: 1.02, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    this.add.text(W / 2, 255, 'FUERZA AEREA ARGENTINA — 1982', {
      fontFamily: 'monospace', fontSize: '16px', color: '#aaccff'
    }).setOrigin(0.5);

    const startTxt = this.add.text(W / 2, 316, 'PRESS START', {
      fontFamily: 'monospace', fontSize: '30px', color: '#ffffff', fontStyle: 'bold'
    }).setOrigin(0.5);
    this.tweens.add({ targets: startTxt, alpha: 0, duration: 650, yoyo: true, repeat: -1 });

    const lbTxt = this.add.text(W / 2, 360, 'HIGH SCORES', {
      fontFamily: 'monospace', fontSize: '18px', color: '#c0dff0'
    }).setOrigin(0.5);
    this.tweens.add({ targets: lbTxt, alpha: 0.4, duration: 900, yoyo: true, repeat: -1 });

    this.hsText = this.add.text(W / 2, 396, 'HIGH SCORE: 000000', {
      fontFamily: 'monospace', fontSize: '20px', color: '#FFD700'
    }).setOrigin(0.5);

    this.add.text(W / 2, 438, 'MOVE: WASD   FIRE: U   BOMB: I', {
      fontFamily: 'monospace', fontSize: '14px', color: '#888888'
    }).setOrigin(0.5);

    this.add.text(W / 2, 458, 'DESTROY HARRIERS, BOMBERS & BOSS BOMBERS', {
      fontFamily: 'monospace', fontSize: '13px', color: '#666666'
    }).setOrigin(0.5);

    this.add.text(W / 2, 480, 'BOMB: VIEW HIGH SCORES', {
      fontFamily: 'monospace', fontSize: '12px', color: '#555577'
    }).setOrigin(0.5);

    const deco = this.add.graphics();
    deco.x = W / 2; deco.y = 540;
    drawPlayerGfx(deco);
    this.tweens.add({ targets: deco, y: 524, duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    loadHS().then(hs => {
      this.hsText.setText(`HIGH SCORE: ${String(hs).padStart(6, '0')}`);
    });
  }

  update(time, delta) {
    this.idleTimer += delta;
    if (this.idleTimer > 8000) {
      this.scene.start('Leaderboard', {});
      return;
    }
    if (consume('P1_2')) {
      playSound('select');
      this.scene.start('Leaderboard', {});
      return;
    }
    if (consumeAny(['START1', 'P1_1'])) {
      playSound('select');
      this.scene.start('Game');
    }
  }
}

// ─── GAME SCENE ──────────────────────────────────────────────────────────────
class GameScene extends Phaser.Scene {
  constructor() { super('Game'); }

  create() {
    this.score = 0;
    this.lives = 3;
    this.bombs = 3;
    this.wave = 1;
    this.gameTime = 0;
    this.paused = false;
    this.highScore = 0;

    this.spreadShot = false;
    this.spreadTimer = 0;
    this.speedBoost = false;
    this.speedTimer = 0;

    this.invincible = false;
    this.invTimer = 0;

    this.fireTimer = 0;
    this.enemySpawnTimer = 0;
    this.shipSpawnTimer = 3000;
    this.bossTimer = 0;
    this.bonusSpawnTimer = Phaser.Math.Between(12000, 22000);

    this.bossActive = false;
    this.bossHealth = 0;
    this.boss = null;
    this.lastBossWave = 0;
    this.thatcherRound = 0;

    this.playerBullets = [];
    this.enemyBullets = [];
    this.enemies = [];
    this.ships = [];
    this.powerups = [];
    this.bonusTargets = [];

    // Ocean scroll state
    this.scrollY = 0;
    this.islands = [];
    this.islandTimer = Phaser.Math.Between(8000, 18000);

    // Clouds for parallax
    this.clouds = [];
    for (let i = 0; i < 8; i++) {
      this.clouds.push({
        x: Phaser.Math.Between(50, W - 50),
        y: Phaser.Math.Between(0, H),
        w: Phaser.Math.Between(120, 160),
        h: Phaser.Math.Between(8, 12),
        spd: Phaser.Math.FloatBetween(22, 42),
        alpha: Phaser.Math.FloatBetween(0.10, 0.15)
      });
    }

    // Background stars
    this.stars = [];
    for (let i = 0; i < 17; i++) {
      this.stars.push({
        x: Phaser.Math.Between(0, W), y: Phaser.Math.Between(0, H),
        sz: Phaser.Math.Between(1, 2),
        al: Phaser.Math.FloatBetween(0.05, 0.15),
        sp: Phaser.Math.FloatBetween(18, 38)
      });
    }
    this.starsGfx = this.add.graphics().setDepth(1);
    this.trailParticles = [];
    this.trailFrame = 0;
    this.bossWarning = false;
    this.lastShownWave = 1;

    // Layer order: ocean → shadow → entities → HUD
    this.oceanGfx = this.add.graphics().setDepth(0);
    this.shadowGfx = this.add.graphics().setDepth(9).setAlpha(0.38);

    this.playerX = W / 2;
    this.playerY = H - 80;
    this.playerGfx = this.add.graphics().setDepth(10);

    this.hudScore = this.add.text(10, 10, 'SCORE: 000000', {
      fontFamily: 'monospace', fontSize: '18px', color: '#ffffff'
    }).setDepth(20);

    this.hudHS = this.add.text(10, 32, 'BEST: 000000', {
      fontFamily: 'monospace', fontSize: '14px', color: '#FFD700'
    }).setDepth(20);

    this.hudRight = this.add.text(W - 10, 10, '', {
      fontFamily: 'monospace', fontSize: '18px', color: '#75AADB'
    }).setOrigin(1, 0).setDepth(20);

    this.hudBombs = this.add.text(W - 10, 32, 'B:0', {
      fontFamily: 'monospace', fontSize: '14px', color: '#FF9900'
    }).setOrigin(1, 0).setDepth(20);

    this.hudWave = this.add.text(W / 2, H - 20, 'WAVE 1', {
      fontFamily: 'monospace', fontSize: '14px', color: '#aaaaaa'
    }).setOrigin(0.5).setDepth(20);

    this.hudPower = this.add.text(W / 2, H - 38, '', {
      fontFamily: 'monospace', fontSize: '12px', color: '#00ffcc'
    }).setOrigin(0.5).setDepth(20);

    this.bossHPGfx = this.add.graphics().setDepth(21);

    const hudLine = this.add.graphics().setDepth(20);
    hudLine.lineStyle(1, 0x5a8aaa, 0.2);
    hudLine.beginPath(); hudLine.moveTo(0, 58); hudLine.lineTo(W, 58); hudLine.strokePath();

    this.pauseBg = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.75).setDepth(30).setVisible(false);
    this.pauseTxt = this.add.text(W / 2, H / 2, 'PAUSED\n\nPRESS START TO RESUME', {
      fontFamily: 'monospace', fontSize: '38px', color: '#ffffff',
      fontStyle: 'bold', align: 'center'
    }).setOrigin(0.5).setDepth(31).setVisible(false);

    loadHS().then(hs => {
      this.highScore = hs;
      this.hudHS.setText(`BEST: ${String(hs).padStart(6, '0')}`);
    });

    this.updateHUD();
  }

  // ── Rendering helpers ────────────────────────────────────────────────────

  renderOcean(dt) {
    this.scrollY = (this.scrollY + 58 * dt) % (H + 30);

    const g = this.oceanGfx;
    g.clear();

    // Solid ocean base
    g.fillStyle(0x162a3e, 1);
    g.fillRect(0, 0, W, H);

    // Subtle large color variation bands — almost imperceptible
    const bandCols = [0x192d44, 0x152840, 0x1b3049, 0x192d44];
    const bandH = [180, 140, 160, 200];
    let bY = 0;
    for (let i = 0; i < 4; i++) {
      g.fillStyle(bandCols[i], 0.12);
      g.fillRect(0, bY, W, bandH[i]);
      bY += bandH[i];
    }

    // Very thin scrolling motion lines — barely visible
    const lineOff = [0, 137, 251, 389, 478, 612];
    for (let i = 0; i < 6; i++) {
      const lh = i % 3 === 0 ? 2 : 1;
      g.lineStyle(lh, 0x2a4a65, 0.08);
      const ly = (lineOff[i] + this.scrollY * 0.85) % (H + 20) - 10;
      g.beginPath(); g.moveTo(0, ly); g.lineTo(W, ly); g.strokePath();
    }

    // Subtle sparkle flecks
    g.fillStyle(0x88bbdd, 0.10);
    for (let i = 0; i < 14; i++) {
      const sx = (i * 131 + 40) % W;
      const sy = (i * 87 + this.scrollY * 0.7) % (H + 20) - 10;
      g.fillRect(sx, sy, 3, 1);
    }

    // Islands / coastline (scroll at same speed as ocean)
    this.islandTimer -= dt * 1000;
    if (this.islandTimer <= 0) {
      this.islands.push({
        x: Phaser.Math.Between(90, W - 90),
        y: -110,
        w: Phaser.Math.Between(80, 220),
        h: Phaser.Math.Between(50, 120)
      });
      this.islandTimer = Phaser.Math.Between(30000, 60000);
    }
    for (let i = this.islands.length - 1; i >= 0; i--) {
      const isl = this.islands[i];
      isl.y += 58 * dt;
      this.drawIsland(g, isl);
      if (isl.y > H + 130) this.islands.splice(i, 1);
    }

    // Clouds — flat wisps, barely visible
    for (const c of this.clouds) {
      c.y = (c.y + c.spd * dt);
      if (c.y > H + c.h + 10) { c.y = -c.h - 10; c.x = Phaser.Math.Between(40, W - 40); }
      g.fillStyle(0x1e3a52, c.alpha);
      g.fillEllipse(c.x, c.y, c.w, c.h);
    }
  }

  drawIsland(g, isl) {
    const { x, y, w, h } = isl;
    // Shallow water blending — behind main island
    g.fillStyle(0x1a3048, 0.35);
    g.fillPoints([
      { x: x - w * 0.62, y: y + h * 0.18 },
      { x: x - w * 0.5,  y: y - h * 0.08 },
      { x: x - w * 0.3,  y: y + h * 0.52 },
    ], true);
    g.fillPoints([
      { x: x + w * 0.48, y: y - h * 0.18 },
      { x: x + w * 0.62, y: y + h * 0.12 },
      { x: x + w * 0.32, y: y + h * 0.48 },
    ], true);
    g.fillPoints([
      { x: x - w * 0.12, y: y - h * 0.54 },
      { x: x + w * 0.18, y: y - h * 0.58 },
      { x: x + w * 0.35, y: y - h * 0.44 },
      { x: x - w * 0.02, y: y - h * 0.44 },
    ], true);
    // Outer terrain — no stroke
    g.fillStyle(0x2b4228, 1);
    g.fillPoints([
      { x: x - w * 0.5,  y: y + h * 0.1  },
      { x: x - w * 0.38, y: y - h * 0.45 },
      { x: x - w * 0.08, y: y - h * 0.5  },
      { x: x + w * 0.28, y: y - h * 0.42 },
      { x: x + w * 0.5,  y: y - h * 0.05 },
      { x: x + w * 0.4,  y: y + h * 0.4  },
      { x: x + w * 0.08, y: y + h * 0.5  },
      { x: x - w * 0.28, y: y + h * 0.45 },
    ], true);
    // Inner terrain
    g.fillStyle(0x3a5632, 1);
    g.fillPoints([
      { x: x - w * 0.32, y: y + h * 0.08 },
      { x: x - w * 0.25, y: y - h * 0.32 },
      { x: x + w * 0.08, y: y - h * 0.38 },
      { x: x + w * 0.3,  y: y - h * 0.08 },
      { x: x + w * 0.26, y: y + h * 0.26 },
      { x: x - w * 0.08, y: y + h * 0.32 },
    ], true);
    // Detail patch
    g.fillStyle(0x385530, 1);
    g.fillPoints([
      { x: x - w * 0.12, y: y - h * 0.08 },
      { x: x + w * 0.04, y: y - h * 0.28 },
      { x: x + w * 0.2,  y: y - h * 0.1  },
      { x: x + w * 0.14, y: y + h * 0.12 },
      { x: x - w * 0.04, y: y + h * 0.14 },
    ], true);
  }

  renderPlayer() {
    const g = this.playerGfx;
    const sg = this.shadowGfx;
    if (this.invincible && Math.floor(this.invTimer / 120) % 2 === 1) {
      g.clear(); sg.clear(); return;
    }
    // Shadow — dark ellipse below and offset for fake altitude
    sg.clear();
    sg.fillStyle(0x000000, 1);
    sg.fillEllipse(this.playerX + 10, this.playerY + 14, 44, 14);

    g.x = this.playerX; g.y = this.playerY;
    drawPlayerGfx(g);
  }

  updateHUD() {
    this.hudScore.setText(`SCORE: ${String(this.score).padStart(6, '0')}`);
    this.hudRight.setText('< '.repeat(this.lives));
    this.hudBombs.setText(`B:${this.bombs}`);
    this.hudWave.setText(`WAVE ${this.wave}`);
    const powers = [];
    if (this.spreadShot) powers.push('SPREAD');
    if (this.speedBoost) powers.push('FAST');
    this.hudPower.setText(powers.join('  '));
  }

  renderBossHP() {
    const g = this.bossHPGfx;
    g.clear();
    if (!this.bossActive || !this.boss) return;
    g.fillStyle(0x222222, 1); g.fillRect(W / 2 - 105, 6, 210, 14);
    g.fillStyle(0xff0000, 1);
    g.fillRect(W / 2 - 105, 6, Math.round(210 * (this.bossHealth / this.boss.maxHP)), 14);
    g.lineStyle(1, 0xffffff, 0.5);
    g.strokeRect(W / 2 - 105, 6, 210, 14);
  }

  // ── Spawning ─────────────────────────────────────────────────────────────

  fireBullet() {
    playSound('shoot');
    const bx = this.playerX, by = this.playerY - 26;
    if (this.spreadShot) {
      // 3 distinct streams with different colors
      for (const [deg, col] of [[-16, 0xFFDD00], [0, 0xFFFFFF], [16, 0xFFDD00]]) {
        const rad = deg * Math.PI / 180;
        const g = this.add.graphics().setDepth(9);
        g.fillStyle(col, 1); g.fillRect(-2, -9, 4, 18);
        g.fillStyle(0xffffff, 0.7); g.fillRect(-1, -9, 2, 5);
        g.x = bx; g.y = by;
        this.playerBullets.push({ g, x: bx, y: by, vx: Math.sin(rad) * 420, vy: -430 });
      }
    } else {
      const g = this.add.graphics().setDepth(9);
      g.fillStyle(0xFFFF44, 1); g.fillRect(-2, -9, 4, 18);
      g.fillStyle(0xffffff, 0.8); g.fillRect(-1, -9, 2, 6);
      g.x = bx; g.y = by;
      this.playerBullets.push({ g, x: bx, y: by, vx: 0, vy: -530 });
    }
  }

  spawnEnemyBullet(x, y, angleDeg) {
    const spd = 170 + this.wave * 14;
    const rad = angleDeg * Math.PI / 180;
    const g = this.add.graphics().setDepth(9);
    g.fillStyle(0xFF3333, 1); g.fillCircle(0, 0, 4);
    g.fillStyle(0xFF9999, 0.6); g.fillCircle(0, 0, 2);
    g.x = x; g.y = y;
    this.enemyBullets.push({ g, x, y, vx: Math.sin(rad) * spd, vy: Math.cos(rad) * spd });
  }

  spawnEnemyFormation() {
    const count = Math.min(2 + Math.floor(this.wave / 1.5), 8);
    const formType = Phaser.Math.Between(0, 3);
    const positions = [];

    if (formType === 0) {
      // Horizontal line
      const spacing = Math.min(W / (count + 1), 120);
      const startX = W / 2 - spacing * (count - 1) / 2;
      for (let i = 0; i < count; i++) positions.push({ x: startX + i * spacing + Phaser.Math.Between(-15, 15), y: -30 });
    } else if (formType === 1) {
      // V-shape (arrow pointing forward)
      const spacing = 75;
      for (let i = 0; i < count; i++) {
        const col = i - Math.floor(count / 2);
        positions.push({ x: W / 2 + col * spacing, y: -30 - Math.abs(col) * 32 });
      }
    } else if (formType === 2) {
      // Diagonal sweep left to right
      for (let i = 0; i < count; i++) {
        positions.push({ x: 70 + i * 88, y: -30 - i * 28 });
      }
    } else {
      // Inverted V / wedge pointing down
      const spacing = 72;
      for (let i = 0; i < count; i++) {
        const col = i - Math.floor(count / 2);
        positions.push({ x: W / 2 + col * spacing, y: -30 + Math.abs(col) * 30 });
      }
    }

    for (const pos of positions) {
      const g = this.add.graphics().setDepth(8);
      drawEnemyJetGfx(g);
      g.x = pos.x; g.y = pos.y;
      this.enemies.push({
        g, x: pos.x, y: pos.y, baseX: pos.x,
        t: Phaser.Math.FloatBetween(0, Math.PI * 2),
        freq: Phaser.Math.FloatBetween(1.2, 2.8),
        amp: Phaser.Math.Between(25, 65),
        vy: 75 + this.wave * 8,
        fireTimer: Phaser.Math.Between(900, 1800),
        hp: 1 + Math.floor(this.wave / 4),
        prevX: pos.x
      });
    }
  }

  spawnShip() {
    const x = Phaser.Math.Between(70, W - 70);
    const g = this.add.graphics().setDepth(8);
    drawBomberGfx(g);
    g.x = x; g.y = -40;
    this.ships.push({
      g, x, y: -40,
      vx: (Math.random() > 0.5 ? 1 : -1) * (30 + this.wave * 5),
      fireTimer: Phaser.Math.Between(1500, 2500),
      hp: 2 + Math.floor(this.wave / 3)
    });
  }

  spawnBoss() {
    this.bossActive = true;
    this.bossTimer = 0;
    const maxHP = 50 + this.wave * 12;
    this.bossHealth = maxHP;
    const g = this.add.graphics().setDepth(8);
    drawBossBomberGfx(g);
    g.x = W / 2; g.y = -80;
    this.boss = { g, x: W / 2, y: -80, t: 0, fireTimer: 2200, maxHP };
    playSound('boss');
    const warn = this.add.text(W / 2, H / 2, '! BOSS BOMBER INCOMING !', {
      fontFamily: 'monospace', fontSize: '26px', color: '#FF2222', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(25);
    this.tweens.add({ targets: warn, alpha: 0, delay: 1200, duration: 800, onComplete: () => warn.destroy() });
  }

  spawnThatcher() {
    const round = this.thatcherRound++;
    const maxHP = 200 + this.wave * 15 + round * 60;
    this.bossHealth = maxHP;
    const g = this.add.graphics().setDepth(8);
    drawThatcherGfx(g);
    g.x = W / 2; g.y = -110;
    this.boss = {
      g, x: W / 2, y: -110, t: 0, maxHP,
      type: 'thatcher', round,
      spiralAngle: 0,
      spiralTimer: Math.max(400, 600 - round * 40),
      aimTimer: Math.max(1000, 1600 - round * 100),
      ringTimer: Math.max(1800, 2800 - round * 200)
    };
    playSound('boss');
    const warn = this.add.text(W / 2, H / 2, '! IRON LADY INCOMING !', {
      fontFamily: 'monospace', fontSize: '26px', color: '#ff4466', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(25);
    this.tweens.add({ targets: warn, alpha: 0, delay: 1400, duration: 700, onComplete: () => warn.destroy() });
  }

  spawnPowerup(x, y) {
    const types = ['S', 'F', 'L'];
    const colors = [0x00FFFF, 0xFFFF00, 0x00FF55];
    const idx = Phaser.Math.Between(0, 3);
    const t = types[idx], col = colors[idx];
    const g = this.add.graphics().setDepth(9);
    g.fillStyle(col, 1); g.fillRect(-13, -13, 26, 26);
    g.lineStyle(2, 0xffffff, 0.8); g.strokeRect(-13, -13, 26, 26);
    g.x = x; g.y = y;
    const lbl = this.add.text(x, y, t, {
      fontFamily: 'monospace', fontSize: '14px', color: '#000000', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(10);
    this.powerups.push({ g, lbl, x, y, type: t });
  }

  spawnBonusTarget() {
    const fromLeft = Math.random() > 0.5;
    const x = fromLeft ? -40 : W + 40;
    const y = Phaser.Math.Between(80, H - 120);
    const g = this.add.graphics().setDepth(8);
    // Supply boat — crosses slowly
    g.fillStyle(0x887755, 1);
    g.fillRect(-22, -10, 44, 18);
    g.fillStyle(0x998866, 1);
    g.fillRect(-20, -10, 40, 7);
    g.fillStyle(0x665544, 1);
    g.fillRect(-6, -18, 12, 10);
    g.fillStyle(0x444433, 1);
    g.fillRect(-1, -22, 2, 6);
    g.fillStyle(0x776655, 0.5);
    g.fillTriangle(-22, 8, -32, 18, -22, 12);
    g.fillTriangle(22, 8, 32, 18, 22, 12);
    g.x = x; g.y = y;
    const vx = (fromLeft ? 1 : -1) * Phaser.Math.Between(80, 120);
    this.bonusTargets.push({ g, x, y, vx, vy: 15, hp: 2, pts: 300, isCross: true });
  }

  // ── Update logic ─────────────────────────────────────────────────────────

  update(time, delta) {
    if (this.paused) {
      if (consumeAny(['START1'])) {
        this.paused = false;
        this.pauseBg.setVisible(false);
        this.pauseTxt.setVisible(false);
      }
      return;
    }
    if (consume('START1')) {
      this.paused = true;
      this.pauseBg.setVisible(true);
      this.pauseTxt.setVisible(true);
      return;
    }

    const dt = delta / 1000;
    this.gameTime += dt;

    const prevWave = this.wave;
    this.wave = Math.min(1 + Math.floor(this.gameTime / 25), 12);
    if (this.wave !== prevWave && !this.bossActive) this.showWaveTransition(this.wave);

    if (this.spreadShot) { this.spreadTimer -= delta; if (this.spreadTimer <= 0) this.spreadShot = false; }
    if (this.speedBoost) { this.speedTimer -= delta; if (this.speedTimer <= 0) this.speedBoost = false; }
    if (this.invincible) { this.invTimer -= delta; if (this.invTimer <= 0) { this.invincible = false; this.invTimer = 0; } }

    this.renderOcean(dt);
    this.renderStars(dt);
    this.handleInput(delta, dt);
    this.updateBullets(dt);
    this.updateEnemies(delta, dt);
    this.updateBonusTargets(delta, dt);
    this.updatePowerups(dt);
    this.handleSpawning(delta);
    this.checkCollisions();
    this.renderPlayer();
    this.trailFrame++;
    if (this.trailFrame % 3 === 0) this.spawnTrailParticle();
    this.updateTrailParticles(dt);
    this.renderBossHP();
    this.updateHUD();
  }

  renderStars(dt) {
    const g = this.starsGfx;
    g.clear();
    for (const s of this.stars) {
      s.y += s.sp * dt;
      if (s.y > H + 2) { s.y = -2; s.x = Phaser.Math.Between(0, W); }
      g.fillStyle(0xffffff, s.al);
      g.fillRect(s.x, s.y, s.sz, s.sz);
    }
  }

  spawnTrailParticle() {
    if (this.trailParticles.length >= 10) return;
    if (this.invincible && Math.floor(this.invTimer / 120) % 2 === 1) return;
    const g = this.add.graphics().setDepth(9);
    g.fillStyle(0x90ccee, 1);
    g.fillCircle(0, 0, 2);
    g.x = this.playerX + Phaser.Math.Between(-2, 2);
    g.y = this.playerY + 27;
    this.trailParticles.push({ g, life: 300 });
  }

  updateTrailParticles(dt) {
    this.trailParticles = this.trailParticles.filter(p => {
      p.life -= dt * 1000;
      p.g.y += 30 * dt;
      p.g.alpha = Math.max(0, p.life / 300);
      if (p.life <= 0) { p.g.destroy(); return false; }
      return true;
    });
  }

  showWaveTransition(waveNum) {
    const t = this.add.text(W / 2, H / 2, `WAVE ${waveNum}`, {
      fontFamily: 'monospace', fontSize: '28px', color: '#c0dff0', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(26).setAlpha(0);
    this.tweens.add({
      targets: t, alpha: 1, duration: 300,
      onComplete: () => {
        this.tweens.add({ targets: t, alpha: 0, delay: 1200, duration: 300, onComplete: () => t.destroy() });
      }
    });
  }

  showBossWarning() {
    const t = this.add.text(W / 2, H / 2 - 20, 'WARNING', {
      fontFamily: 'monospace', fontSize: '42px', color: '#ee3333', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(26);
    this.time.addEvent({ delay: 333, repeat: 5, callback: () => t.setVisible(!t.visible) });
    this.time.delayedCall(2100, () => { if (t && t.active) t.destroy(); });
  }

  handleInput(delta, dt) {
    const spd = this.speedBoost ? 290 : 195;
    if (isHeld('P1_L')) this.playerX = Math.max(18, this.playerX - spd * dt);
    if (isHeld('P1_R')) this.playerX = Math.min(W - 18, this.playerX + spd * dt);
    if (isHeld('P1_U')) this.playerY = Math.max(55, this.playerY - spd * dt);
    if (isHeld('P1_D')) this.playerY = Math.min(H - 28, this.playerY + spd * dt);

    this.fireTimer -= delta;
    if (isHeld('P1_1') && this.fireTimer <= 0) {
      this.fireBullet();
      this.fireTimer = this.spreadShot ? 140 : 210;
    }

    if (consume('P1_2') && this.bombs > 0) this.useBomb();
  }

  useBomb() {
    this.bombs--;
    playSound('explode');
    for (const e of this.enemies) { spawnExplosion(this, e.x, e.y); this.score += 60; e.g.destroy(); }
    this.enemies = [];
    for (const s of this.ships) { spawnExplosion(this, s.x, s.y, 2); this.score += 150; s.g.destroy(); }
    this.ships = [];
    for (const bt of this.bonusTargets) { spawnExplosion(this, bt.x, bt.y); this.score += bt.pts; bt.g.destroy(); }
    this.bonusTargets = [];
    for (const b of this.enemyBullets) b.g.destroy();
    this.enemyBullets = [];
    if (this.bossActive && this.boss) {
      this.bossHealth -= 25;
      spawnExplosion(this, this.boss.x, this.boss.y, 2);
      if (this.bossHealth <= 0) this.destroyBoss();
    }
    this.cameras.main.shake(200, 0.01);
    const flash = this.add.rectangle(W / 2, H / 2, W, H, 0xffffff, 0.6).setDepth(25);
    this.tweens.add({ targets: flash, alpha: 0, duration: 300, onComplete: () => flash.destroy() });
  }

  updateBullets(dt) {
    this.playerBullets = this.playerBullets.filter(b => {
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.g.x = b.x; b.g.y = b.y;
      if (b.y < -20 || b.x < -20 || b.x > W + 20) { b.g.destroy(); return false; }
      return true;
    });
    this.enemyBullets = this.enemyBullets.filter(b => {
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.g.x = b.x; b.g.y = b.y;
      if (b.y > H + 20 || b.x < -20 || b.x > W + 20) { b.g.destroy(); return false; }
      return true;
    });
  }

  updateEnemies(delta, dt) {
    this.enemies = this.enemies.filter(e => {
      e.t += dt;
      const newX = e.baseX + Math.sin(e.t * e.freq) * e.amp;
      const dx = newX - e.x;
      e.x = Phaser.Math.Clamp(newX, 20, W - 20);
      e.y += e.vy * dt;
      e.g.x = e.x; e.g.y = e.y;
      // Bank based on lateral movement
      e.g.angle = Phaser.Math.Clamp(dx * 3, -25, 25);

      e.fireTimer -= delta;
      if (e.fireTimer <= 0) {
        const ax = this.playerX - e.x;
        const ay = this.playerY - e.y;
        const aDeg = Math.atan2(ax, ay) * 180 / Math.PI;
        this.spawnEnemyBullet(e.x, e.y, aDeg);
        // Later waves fire 2-3 shot bursts
        if (this.wave >= 4) this.spawnEnemyBullet(e.x, e.y, aDeg + Phaser.Math.Between(-12, 12));
        if (this.wave >= 7) this.spawnEnemyBullet(e.x, e.y, aDeg + Phaser.Math.Between(-20, 20));
        e.fireTimer = Math.max(500, 1600 - this.wave * 80);
      }
      if (e.y > H + 30) { e.g.destroy(); return false; }
      return true;
    });

    this.ships = this.ships.filter(s => {
      s.x += s.vx * dt;
      if (s.x < 52 || s.x > W - 52) { s.vx *= -1; s.x = Phaser.Math.Clamp(s.x, 52, W - 52); }
      s.y += 18 * dt;
      s.g.x = s.x; s.g.y = s.y;
      s.fireTimer -= delta;
      if (s.fireTimer <= 0) {
        // Heavy bomber: fires 3-bullet spread from two wing positions
        const spread = this.wave >= 5 ? [-38, 0, 38] : [-30, 0, 30];
        for (const a of spread) this.spawnEnemyBullet(s.x - 22, s.y + 20, a);
        if (this.wave >= 3) for (const a of spread) this.spawnEnemyBullet(s.x + 22, s.y + 20, a);
        s.fireTimer = Math.max(1800, 3800 - this.wave * 140);
      }
      if (s.y > H + 50) { s.g.destroy(); return false; }
      return true;
    });

    if (this.bossActive && this.boss) {
      const b = this.boss;
      b.t += dt;
      if (b.type === 'thatcher') {
        // Figure-8 drift across top area
        b.x = W / 2 + Math.sin(b.t * 0.5) * 260;
        b.y = Math.min(b.y + 28 * dt, 105 + Math.sin(b.t * 0.9) * 28);
        b.g.x = b.x; b.g.y = b.y;
        const hp = this.bossHealth / b.maxHP;
        const ph = hp > 0.66 ? 1 : hp > 0.33 ? 2 : 3;
        b.spiralAngle += dt * (1.6 + ph * 0.45 + b.round * 0.15);
        // Rotating spiral arms — more arms each round
        b.spiralTimer -= delta;
        if (b.spiralTimer <= 0) {
          const arms = Math.min(2 + (ph >= 3 ? 1 : 0) + Math.floor(b.round / 2), 5);
          for (let i = 0; i < arms; i++) {
            const a = (b.spiralAngle + i * 6.2832 / arms) * 180 / Math.PI;
            this.spawnEnemyBullet(b.x, b.y + 42, a);
          }
          b.spiralTimer = Math.max(60, 170 - ph * 28 - b.round * 8);
        }
        // Aimed burst at player
        b.aimTimer -= delta;
        if (b.aimTimer <= 0) {
          const ax = this.playerX - b.x, ay = this.playerY - b.y;
          const base = Math.atan2(ax, ay) * 180 / Math.PI;
          const cnt = 3 + ph + Math.floor(b.round / 2);
          for (let i = 0; i < cnt; i++) this.spawnEnemyBullet(b.x, b.y + 42, base + (i - (cnt >> 1)) * (11 - ph * 2));
          b.aimTimer = Math.max(400, 1800 - ph * 280 - b.round * 60);
        }
        // Ring burst in all directions
        b.ringTimer -= delta;
        if (b.ringTimer <= 0) {
          const rc = 8 + ph * 4 + b.round * 2;
          for (let i = 0; i < rc; i++) this.spawnEnemyBullet(b.x, b.y + 42, (i / rc) * 360);
          b.ringTimer = Math.max(900, 3000 - ph * 450 - b.round * 150);
        }
      } else {
        b.x = W / 2 + Math.sin(b.t * 0.45) * 230;
        b.y = Math.min(b.y + 22 * dt, 85);
        b.g.x = b.x; b.g.y = b.y;
        b.fireTimer -= delta;
        if (b.fireTimer <= 0) {
          const fanCount = 7;
          for (let i = 0; i < fanCount; i++) {
            const a = -35 + i * (70 / (fanCount - 1));
            this.spawnEnemyBullet(b.x, b.y + 52, a);
          }
          for (const a of [-25, 0, 30]) this.spawnEnemyBullet(b.x - 80, b.y + 10, a);
          for (const a of [-30, 0, 25]) this.spawnEnemyBullet(b.x + 80, b.y + 10, a);
          const ax = this.playerX - b.x, ay = this.playerY - b.y;
          this.spawnEnemyBullet(b.x, b.y + 55, Math.atan2(ax, ay) * 180 / Math.PI);
          b.fireTimer = Math.max(800, 1400 - this.wave * 50);
        }
      }
    }
  }

  updateBonusTargets(delta, dt) {
    this.bonusTargets = this.bonusTargets.filter(bt => {
      bt.x += bt.vx * dt;
      bt.y += bt.vy * dt;
      bt.g.x = bt.x; bt.g.y = bt.y;
      if (bt.x < -80 || bt.x > W + 80 || bt.y > H + 50) { bt.g.destroy(); return false; }
      return true;
    });
  }

  handleSpawning(delta) {
    if (!this.bossActive && this.lastBossWave < this.wave) {
      if (this.wave >= 5 && this.wave % 5 === 0) {
        this.lastBossWave = this.wave;
        this.bossActive = true;
        this.showBossWarning();
        this.time.delayedCall(2000, () => this.spawnThatcher());
      } else if (this.wave >= 3 && (this.wave - 3) % 5 === 0) {
        this.lastBossWave = this.wave;
        this.bossActive = true;
        this.showBossWarning();
        this.time.delayedCall(2000, () => this.spawnBoss());
      }
    }
    if (!this.bossActive) {
      this.enemySpawnTimer -= delta;
      if (this.enemySpawnTimer <= 0) {
        this.spawnEnemyFormation();
        this.enemySpawnTimer = Math.max(400, 2200 - this.wave * 140);
      }
      this.shipSpawnTimer -= delta;
      if (this.shipSpawnTimer <= 0 && Math.random() < 0.7) {
        this.spawnShip();
        this.shipSpawnTimer = Math.max(3500, 9000 - this.wave * 450);
      }
      this.bonusSpawnTimer -= delta;
      if (this.bonusSpawnTimer <= 0) {
        this.spawnBonusTarget();
        this.bonusSpawnTimer = Phaser.Math.Between(14000, 28000);
      }
    }
  }

  updatePowerups(dt) {
    this.powerups = this.powerups.filter(p => {
      p.y += 58 * dt;
      p.g.y = p.y; p.lbl.y = p.y;
      if (p.y > H + 20) { p.g.destroy(); p.lbl.destroy(); return false; }
      return true;
    });
  }

  checkCollisions() {
    for (let bi = this.playerBullets.length - 1; bi >= 0; bi--) {
      const b = this.playerBullets[bi];
      let hit = false;

      for (let ei = this.enemies.length - 1; ei >= 0 && !hit; ei--) {
        const e = this.enemies[ei];
        if (Math.abs(b.x - e.x) < 20 && Math.abs(b.y - e.y) < 20) {
          e.hp--;
          hit = true;
          if (e.hp <= 0) {
            spawnExplosion(this, e.x, e.y);
            playSound('explode');
            const pts = 100 * this.wave;
            this.score += pts;
            showScorePopup(this, e.x, e.y, pts);
            if (Math.random() < 0.15) this.spawnPowerup(e.x, e.y);
            e.g.destroy();
            this.enemies.splice(ei, 1);
          }
        }
      }

      for (let si = this.ships.length - 1; si >= 0 && !hit; si--) {
        const s = this.ships[si];
        if (Math.abs(b.x - s.x) < 34 && Math.abs(b.y - s.y) < 22) {
          s.hp--;
          hit = true;
          if (s.hp <= 0) {
            spawnExplosion(this, s.x, s.y, 2);
            playSound('explode');
            const pts = 250 * this.wave;
            this.score += pts;
            showScorePopup(this, s.x, s.y, pts);
            if (Math.random() < 0.3) this.spawnPowerup(s.x, s.y);
            s.g.destroy();
            this.ships.splice(si, 1);
          }
        }
      }

      for (let bti = this.bonusTargets.length - 1; bti >= 0 && !hit; bti--) {
        const bt = this.bonusTargets[bti];
        if (Math.abs(b.x - bt.x) < 25 && Math.abs(b.y - bt.y) < 20) {
          bt.hp--;
          hit = true;
          if (bt.hp <= 0) {
            spawnExplosion(this, bt.x, bt.y, 1.2);
            playSound('explode');
            this.score += bt.pts;
            showScorePopup(this, bt.x, bt.y, bt.pts);
            bt.g.destroy();
            this.bonusTargets.splice(bti, 1);
          }
        }
      }

      if (!hit && this.bossActive && this.boss) {
        const bs = this.boss;
        const hw = bs.type === 'thatcher' ? 58 : 96;
        const hh = bs.type === 'thatcher' ? 58 : 60;
        if (Math.abs(b.x - bs.x) < hw && Math.abs(b.y - bs.y) < hh) {
          this.bossHealth--;
          hit = true;
          this.score += 10;
          if (this.bossHealth <= 0) this.destroyBoss();
        }
      }

      if (hit) { b.g.destroy(); this.playerBullets.splice(bi, 1); }
    }

    if (!this.invincible) {
      for (let bi = this.enemyBullets.length - 1; bi >= 0; bi--) {
        const b = this.enemyBullets[bi];
        if (Math.abs(b.x - this.playerX) < 15 && Math.abs(b.y - this.playerY) < 15) {
          this.playerHit();
          b.g.destroy();
          this.enemyBullets.splice(bi, 1);
          break;
        }
      }
    }

    for (let pi = this.powerups.length - 1; pi >= 0; pi--) {
      const p = this.powerups[pi];
      if (Math.abs(p.x - this.playerX) < 22 && Math.abs(p.y - this.playerY) < 22) {
        this.collectPowerup(p.type);
        p.g.destroy(); p.lbl.destroy();
        this.powerups.splice(pi, 1);
      }
    }
  }

  collectPowerup(type) {
    playSound('powerup');
    if (type === 'S') { this.spreadShot = true; this.spreadTimer = 10000; }
    else if (type === 'F') { this.speedBoost = true; this.speedTimer = 8000; }
    else if (type === 'L') this.lives = Math.min(this.lives + 1, 5);
    else if (type === 'B') this.bombs = Math.min(this.bombs + 1, 5);
    this.updateHUD();
  }

  playerHit() {
    playSound('hit');
    this.cameras.main.shake(100, 0.005);
    this.lives--;
    spawnExplosion(this, this.playerX, this.playerY);
    if (this.lives <= 0) { this.gameOver(); return; }
    this.invincible = true;
    this.invTimer = 2200;
    this.updateHUD();
  }

  destroyBoss() {
    const isThatcher = this.boss.type === 'thatcher';
    spawnExplosion(this, this.boss.x, this.boss.y, isThatcher ? 4.5 : 3.5);
    playSound('explode');
    this.cameras.main.shake(isThatcher ? 600 : 400, isThatcher ? 0.022 : 0.015);
    this.score += (isThatcher ? 5000 : 1000) + this.wave * 200;
    this.boss.g.destroy();
    this.boss = null;
    this.bossActive = false;
    this.bossTimer = 0;
    this.bossWarning = false;
    this.wave = Math.min(this.wave + 1, 12);
    const msg = isThatcher ? 'IRON LADY DEFEATED!' : 'BOSS BOMBER DOWN!';
    const col = isThatcher ? '#ff88bb' : '#FFD700';
    const txt = this.add.text(W / 2, H / 2 - 40, msg, {
      fontFamily: 'monospace', fontSize: '36px', color: col, fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(25);
    this.tweens.add({ targets: txt, alpha: 0, delay: 1500, duration: 700, onComplete: () => txt.destroy() });
    this.updateHUD();
  }

  gameOver() {
    const finalScore = this.score;
    const isNew = finalScore > this.highScore;
    if (isNew) saveHS(finalScore);
    loadLB().then(lb => {
      if (qualifiesLB(lb, finalScore)) {
        this.scene.start('Initials', { score: finalScore });
      } else {
        this.scene.start('GameOver', {
          score: finalScore,
          highScore: isNew ? finalScore : this.highScore,
          isNew
        });
      }
    });
  }
}

// ─── GAME OVER SCENE ─────────────────────────────────────────────────────────
class GameOverScene extends Phaser.Scene {
  constructor() { super('GameOver'); }

  init(data) {
    this.finalScore = data.score || 0;
    this.highScore = data.highScore || 0;
    this.isNew = !!data.isNew;
  }

  create() {
    const bg = this.add.graphics();
    bg.fillStyle(0x0a0014, 1); bg.fillRect(0, 0, W, H);
    for (let i = 0; i < 60; i++) {
      bg.fillStyle(0xffffff, Phaser.Math.FloatBetween(0.1, 0.6));
      bg.fillRect(Phaser.Math.Between(0, W), Phaser.Math.Between(0, H), 2, 2);
    }

    const goTxt = this.add.text(W / 2, 100, 'GAME OVER', {
      fontFamily: 'monospace', fontSize: '68px', color: '#FF2222', fontStyle: 'bold',
      stroke: '#880000', strokeThickness: 4
    }).setOrigin(0.5);
    this.tweens.add({ targets: goTxt, scaleX: 1.04, scaleY: 1.04, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    this.add.text(W / 2, 230, `SCORE: ${String(this.finalScore).padStart(6, '0')}`, {
      fontFamily: 'monospace', fontSize: '30px', color: '#ffffff', fontStyle: 'bold'
    }).setOrigin(0.5);

    if (this.isNew) {
      const newTxt = this.add.text(W / 2, 285, '★  NEW HIGH SCORE!  ★', {
        fontFamily: 'monospace', fontSize: '22px', color: '#FFD700', fontStyle: 'bold'
      }).setOrigin(0.5);
      this.tweens.add({ targets: newTxt, alpha: 0.3, duration: 400, yoyo: true, repeat: -1 });
    }

    this.add.text(W / 2, 335, `HIGH SCORE: ${String(this.highScore).padStart(6, '0')}`, {
      fontFamily: 'monospace', fontSize: '20px', color: '#FFD700'
    }).setOrigin(0.5);

    const retry = this.add.text(W / 2, 420, 'PRESS START TO RETRY', {
      fontFamily: 'monospace', fontSize: '24px', color: '#ffffff', fontStyle: 'bold'
    }).setOrigin(0.5);
    this.tweens.add({ targets: retry, alpha: 0, duration: 700, yoyo: true, repeat: -1 });

    this.add.text(W / 2, 490, 'PRESS P1 FIRE TO RETURN TO TITLE', {
      fontFamily: 'monospace', fontSize: '14px', color: '#666666'
    }).setOrigin(0.5);

    this.add.text(W / 2, 514, 'PRESS BOMB TO VIEW HIGH SCORES', {
      fontFamily: 'monospace', fontSize: '14px', color: '#555577'
    }).setOrigin(0.5);

    this.add.text(W / 2, H - 30, '— VIVA LA ARGENTINA —', {
      fontFamily: 'monospace', fontSize: '14px', color: '#75AADB'
    }).setOrigin(0.5);

    const deco = this.add.graphics();
    deco.fillStyle(0x886644, 1); deco.fillTriangle(0, -15, -9, 8, 9, 8);
    deco.x = W / 2; deco.y = 560;
    deco.angle = 45;
    this.tweens.add({ targets: deco, y: 570, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  update() {
    if (consumeAny(['START1'])) {
      playSound('select');
      this.scene.start('Game');
    }
    if (consumeAny(['P1_1'])) {
      playSound('select');
      this.scene.start('Title');
    }
    if (consume('P1_2')) {
      playSound('select');
      this.scene.start('Leaderboard', {});
    }
  }
}

// ─── INITIALS SCENE ───────────────────────────────────────────────────────────
class InitialsScene extends Phaser.Scene {
  constructor() { super('Initials'); }
  init(data) { this.finalScore = data.score || 0; }

  create() {
    this.letters = ['A', 'A', 'A'];
    this.slot = 0;
    this.confirmed = false;

    const bg = this.add.graphics();
    bg.fillStyle(0x0a0014, 1); bg.fillRect(0, 0, W, H);
    for (let i = 0; i < 60; i++) {
      bg.fillStyle(0xffffff, Phaser.Math.FloatBetween(0.1, 0.6));
      bg.fillRect(Phaser.Math.Between(0, W), Phaser.Math.Between(0, H), 2, 2);
    }

    const goTxt = this.add.text(W / 2, 80, 'GAME OVER', {
      fontFamily: 'monospace', fontSize: '58px', color: '#FF2222', fontStyle: 'bold',
      stroke: '#880000', strokeThickness: 4
    }).setOrigin(0.5);
    this.tweens.add({ targets: goTxt, scaleX: 1.04, scaleY: 1.04, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    const nhsTxt = this.add.text(W / 2, 180, 'NEW HIGH SCORE!', {
      fontFamily: 'monospace', fontSize: '26px', color: '#FFD700', fontStyle: 'bold'
    }).setOrigin(0.5);
    this.tweens.add({ targets: nhsTxt, alpha: 0.3, duration: 400, yoyo: true, repeat: -1 });

    this.add.text(W / 2, 228, `SCORE: ${String(this.finalScore).padStart(6, '0')}`, {
      fontFamily: 'monospace', fontSize: '24px', color: '#ffffff'
    }).setOrigin(0.5);

    this.add.text(W / 2, 278, 'ENTER YOUR INITIALS', {
      fontFamily: 'monospace', fontSize: '18px', color: '#aaccff'
    }).setOrigin(0.5);

    this.slotHi = this.add.graphics().setDepth(5);
    const xs = [W / 2 - 66, W / 2, W / 2 + 66];
    this.slotTxts = xs.map(sx =>
      this.add.text(sx, 352, 'A', {
        fontFamily: 'monospace', fontSize: '56px', color: '#aaaaaa', fontStyle: 'bold'
      }).setOrigin(0.5).setDepth(6)
    );

    this.add.text(W / 2, 428, 'UP/DOWN: CHANGE   FIRE: CONFIRM', {
      fontFamily: 'monospace', fontSize: '14px', color: '#666666'
    }).setOrigin(0.5);

    this.add.text(W / 2, H - 30, '— VIVA LA ARGENTINA —', {
      fontFamily: 'monospace', fontSize: '14px', color: '#75AADB'
    }).setOrigin(0.5);

    this.renderSlots();
  }

  renderSlots() {
    const xs = [W / 2 - 66, W / 2, W / 2 + 66];
    for (let i = 0; i < 3; i++) {
      this.slotTxts[i].setText(this.letters[i]);
      this.slotTxts[i].setColor(i === this.slot ? '#FFD700' : '#aaaaaa');
    }
    this.slotHi.clear();
    this.slotHi.lineStyle(3, 0xFFD700, 0.9);
    this.slotHi.strokeRect(xs[this.slot] - 34, 318, 68, 72);
  }

  update() {
    if (this.confirmed) return;
    if (consume('P1_U')) {
      this.letters[this.slot] = String.fromCharCode((this.letters[this.slot].charCodeAt(0) - 65 + 1) % 26 + 65);
      this.renderSlots(); playSound('select');
    }
    if (consume('P1_D')) {
      this.letters[this.slot] = String.fromCharCode((this.letters[this.slot].charCodeAt(0) - 65 + 25) % 26 + 65);
      this.renderSlots(); playSound('select');
    }
    if (consume('P1_L') && this.slot > 0) { this.slot--; this.renderSlots(); playSound('select'); }
    if (consume('P1_R') && this.slot < 2) { this.slot++; this.renderSlots(); playSound('select'); }
    if (consume('P1_1')) {
      playSound('select');
      if (this.slot < 2) { this.slot++; this.renderSlots(); }
      else {
        this.confirmed = true;
        const name = this.letters.join('');
        loadLB().then(lb => {
          const newLB = insertLB(lb, { name, score: this.finalScore });
          const newIdx = newLB.findIndex(e => e.name === name && e.score === this.finalScore);
          saveLB(newLB).then(() => {
            this.scene.start('Leaderboard', { lb: newLB, newIdx });
          });
        });
      }
    }
  }
}

// ─── LEADERBOARD SCENE ────────────────────────────────────────────────────────
class LeaderboardScene extends Phaser.Scene {
  constructor() { super('Leaderboard'); }
  init(data) {
    this.lb = data.lb || null;
    this.newIdx = data.newIdx != null ? data.newIdx : -1;
  }

  create() {
    const bg = this.add.graphics();
    bg.fillStyle(0x0a1a2e, 1); bg.fillRect(0, 0, W, H);
    bg.fillStyle(0x1a3a5c, 1); bg.fillRect(0, H * 0.22, W, H * 0.78);
    for (let i = 0; i < 40; i++) {
      bg.fillStyle(0xffffff, Phaser.Math.FloatBetween(0.1, 0.5));
      bg.fillRect(Phaser.Math.Between(0, W), Phaser.Math.Between(0, H), 2, 2);
    }

    this.add.text(W / 2, 42, 'TOP SCORES', {
      fontFamily: 'monospace', fontSize: '42px', color: '#c0dff0', fontStyle: 'bold',
      stroke: '#ffffff', strokeThickness: 2
    }).setOrigin(0.5);

    this.rendered = false;
    if (this.lb) {
      this.renderEntries();
    } else {
      loadLB().then(lb => { this.lb = lb; this.renderEntries(); });
    }

    const pressTxt = this.add.text(W / 2, H - 36, 'PRESS START TO CONTINUE', {
      fontFamily: 'monospace', fontSize: '20px', color: '#ffffff'
    }).setOrigin(0.5);
    this.tweens.add({ targets: pressTxt, alpha: 0, duration: 600, yoyo: true, repeat: -1 });
  }

  renderEntries() {
    if (this.rendered) return;
    this.rendered = true;
    if (!this.lb || this.lb.length === 0) {
      this.add.text(W / 2, H / 2, 'NO SCORES YET', {
        fontFamily: 'monospace', fontSize: '20px', color: '#888888'
      }).setOrigin(0.5);
      return;
    }
    const startY = 102;
    const rowH = 44;
    for (let i = 0; i < this.lb.length; i++) {
      const e = this.lb[i];
      const rank = String(i + 1).padStart(2, ' ');
      const scoreStr = String(e.score).padStart(6, '0');
      const line = `${rank}. ${e.name}  ${scoreStr}`;
      const isNew = i === this.newIdx;
      const color = isNew ? '#FFD700' : (i === 0 ? '#ffffff' : '#aaccff');
      const t = this.add.text(W / 2, startY + i * rowH, line, {
        fontFamily: 'monospace', fontSize: '24px', color
      }).setOrigin(0.5);
      if (isNew) {
        this.tweens.add({ targets: t, alpha: 0.2, duration: 350, yoyo: true, repeat: -1 });
      }
    }
  }

  update() {
    if (consumeAny(['START1', 'P1_1'])) {
      playSound('select');
      this.scene.start('Title');
    }
  }
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────
new Phaser.Game({
  type: Phaser.AUTO,
  width: W,
  height: H,
  parent: 'game-root',
  backgroundColor: '#0c2840',
  physics: { default: 'arcade', arcade: { gravity: { y: 0 }, debug: false } },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: W, height: H
  },
  scene: [TitleScene, GameScene, GameOverScene, InitialsScene, LeaderboardScene]
});
