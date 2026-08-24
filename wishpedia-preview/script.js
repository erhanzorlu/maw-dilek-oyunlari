/* ================================================================
   WISHPEDIA PREVIEW — Scroll-Driven Storytelling Engine
   ================================================================ */

(function () {
    'use strict';

    // ──────────────────────────────────────────────
    // Config
    // ──────────────────────────────────────────────
    const CFG = {
        LERP: 0.065,
        SCROLL_SENS: 0.12,
        STAR_COUNT: 45,
        PARTICLE_LIMIT: 80,
        MAX_MOUSE_STARS: 5,         // En fazla 5 tane net yıldız
        MOUSE_SPAWN_INTERVAL: 230,  // Ritmik, akıcı aralık
        MOUSE_STAR_SPEED: 2.2,      // Bir tık daha dinamik, akıcı seyir hızı
    };

    // Scene ranges (progress 0–100)
    // Overlapping edges create cross-fades
    const RANGES = [
        { start: 0,  end: 18 },   // Scene 1: Hero
        { start: 15, end: 38 },   // Scene 2: Problem
        { start: 35, end: 53 },   // Scene 3: Reveal
        { start: 50, end: 73 },   // Scene 4: Features
        { start: 70, end: 88 },   // Scene 5: Stats
        { start: 85, end: 100 },  // Scene 6: CTA
    ];

    // Dot nav target progress values
    const DOT_TARGETS = [0, 20, 40, 58, 76, 92];

    // ──────────────────────────────────────────────
    // State
    // ──────────────────────────────────────────────
    let target = 0;
    let current = 0;
    let scrolled = false;
    let prevActiveIdx = 0;
    let countersAnimated = false;
    let particles = [];

    // Mouse & Touch tracking
    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    let mouseMoving = false;
    let mouseTimer = null;
    let lastMouseStarTime = 0;

    // Gyroscope / Device Tilt (Mobile 3D Parallax)
    let tiltX = 0, tiltY = 0;
    let targetTiltX = 0, targetTiltY = 0;

    // Haptic Feedback Helper
    function triggerHaptic(type) {
        if (!navigator.vibrate) return;
        try {
            if (type === 'scene') navigator.vibrate(14);             // Zarif sahne geçiş tıkı
            else if (type === 'reveal') navigator.vibrate([20, 35, 20]); // Özel kutlama/açılış titreşimi
            else if (type === 'tap') navigator.vibrate(10);          // Dokunma hissi
            else if (type === 'micro') navigator.vibrate(6);        // Minik kıvılcım hissi
        } catch (e) {}
    }

    // ──────────────────────────────────────────────
    // DOM
    // ──────────────────────────────────────────────
    const $ = {};

    // ──────────────────────────────────────────────
    // Init
    // ──────────────────────────────────────────────
    function init() {
        cacheDOM();
        resizeCanvas();
        listen();
        raf();
    }

    function cacheDOM() {
        $.body = document.body;
        $.fill = document.getElementById('progressFill');
        $.pct = document.getElementById('progressPct');
        $.dots = [...document.querySelectorAll('.dot-nav .dot')];
        $.panels = [...document.querySelectorAll('.scene-panel')];
        $.hint = document.getElementById('scrollHint');
        $.canvas = document.getElementById('particleCanvas');
        $.ctx = $.canvas.getContext('2d');
        $.counters = document.querySelectorAll('.stat-number[data-target]');
    }

    // ──────────────────────────────────────────────
    // Canvas
    // ──────────────────────────────────────────────
    function resizeCanvas() {
        const dpr = window.devicePixelRatio || 1;
        $.canvas.width = window.innerWidth * dpr;
        $.canvas.height = window.innerHeight * dpr;
        $.canvas.style.width = window.innerWidth + 'px';
        $.canvas.style.height = window.innerHeight + 'px';
        $.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // ──────────────────────────────────────────────
    // Events
    // ──────────────────────────────────────────────
    function listen() {
        window.addEventListener('wheel', onWheel, { passive: false });
        window.addEventListener('resize', resizeCanvas);

        // ── Mobile Touch (Dokunmatik Kontrol & Kıvılcım Patlaması) ──
        let ty = 0;
        let tx = 0;

        window.addEventListener('touchstart', e => {
            if (e.touches.length > 0) {
                tx = e.touches[0].clientX;
                ty = e.touches[0].clientY;
                mouseX = tx;
                mouseY = ty;

                // Ekrana her dokunulduğunda parmağın altında minik sihirli kıvılcım patlaması
                createTapBurst(tx, ty);
                triggerHaptic('micro');

                // Hemen parmağa doğru 1 yıldız yönlendir
                particles.push(makeMouseStar(window.innerWidth, window.innerHeight, mouseX, mouseY));
                firstScroll();
            }
        }, { passive: true });

        window.addEventListener('touchmove', e => {
            if (e.touches.length > 0) {
                const currentY = e.touches[0].clientY;
                const currentX = e.touches[0].clientX;
                const dy = ty - currentY;
                ty = currentY;
                tx = currentX;

                mouseX = currentX;
                mouseY = currentY;

                // Akıcı dikey kaydırma
                target = clamp(target + dy * 0.22, 0, 100);
                firstScroll();

                // Kaydırırken parmağı takip eden yıldız akışı
                const now = performance.now();
                if (now - lastMouseStarTime >= CFG.MOUSE_SPAWN_INTERVAL) {
                    let activeMouseStars = 0;
                    for (let i = 0; i < particles.length; i++) {
                        if (particles[i].type === 'mouse') activeMouseStars++;
                    }
                    if (activeMouseStars < CFG.MAX_MOUSE_STARS) {
                        lastMouseStarTime = now;
                        particles.push(makeMouseStar(window.innerWidth, window.innerHeight, mouseX, mouseY));
                    }
                }
            }
        }, { passive: true });

        // ── Mobile Gyroscope / Jiroskop Eğim Takibi ──
        if (window.DeviceOrientationEvent) {
            window.addEventListener('deviceorientation', e => {
                if (e.gamma !== null && e.beta !== null) {
                    targetTiltX = clamp(e.gamma / 35, -1, 1) * 16; // Sağa-sola eğim (maks 16px)
                    targetTiltY = clamp((e.beta - 45) / 35, -1, 1) * 16; // Öne-arkaya eğim
                }
            }, { passive: true });
        }

        // Keyboard
        window.addEventListener('keydown', e => {
            if (e.key === 'ArrowDown' || e.key === ' ') {
                e.preventDefault(); target = clamp(target + 5, 0, 100); firstScroll();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault(); target = clamp(target - 5, 0, 100);
            }
        });

        // Dots
        $.dots.forEach(d => d.addEventListener('click', () => {
            target = parseInt(d.dataset.target);
            triggerHaptic('tap');
            firstScroll();
        }));

        // Mouse tracking — Teker teker, ölçülü yıldız gelişi
        window.addEventListener('mousemove', e => {
            mouseX = e.clientX;
            mouseY = e.clientY;
            mouseMoving = true;
            clearTimeout(mouseTimer);
            mouseTimer = setTimeout(() => { mouseMoving = false; }, 200);

            const now = performance.now();
            if (now - lastMouseStarTime >= CFG.MOUSE_SPAWN_INTERVAL) {
                let activeMouseStars = 0;
                for (let i = 0; i < particles.length; i++) {
                    if (particles[i].type === 'mouse') activeMouseStars++;
                }

                if (activeMouseStars < CFG.MAX_MOUSE_STARS) {
                    lastMouseStarTime = now;
                    particles.push(makeMouseStar(window.innerWidth, window.innerHeight, mouseX, mouseY));
                }
            }
        });
    }

    function onWheel(e) {
        e.preventDefault();
        target = clamp(target + e.deltaY * CFG.SCROLL_SENS, 0, 100);
        firstScroll();
    }

    function firstScroll() {
        if (scrolled) return;
        scrolled = true;
        $.hint.classList.add('hidden');
    }

    // ──────────────────────────────────────────────
    // Animation Loop (Delta-Time ile Monitör Hz Sabitleme)
    // ──────────────────────────────────────────────
    let lastFrameTime = performance.now();

    function raf(now) {
        if (!now) now = performance.now();
        const deltaMs = now - lastFrameTime;
        lastFrameTime = now;

        // 60 FPS bazlı zaman çarpanı (144Hz, 165Hz veya 240Hz monitörlerde hızlanmayı önler)
        const dt = Math.min(Math.max(deltaMs / 16.667, 0.1), 3.0);

        current += (target - current) * (1 - Math.pow(1 - CFG.LERP, dt));
        if (Math.abs(current - target) < 0.05) current = target;

        // Jiroskop yumuşatma
        tiltX += (targetTiltX - tiltX) * 0.08;
        tiltY += (targetTiltY - tiltY) * 0.08;

        updatePanels(current);
        updateUI(current);
        updateBackground(current);
        tickParticles(current, dt);
        drawParticles();

        requestAnimationFrame(raf);
    }

    // ──────────────────────────────────────────────
    // Panel Visibility
    // ──────────────────────────────────────────────
    function updatePanels(p) {
        let highestIdx = 0;
        let highestOp = 0;

        $.panels.forEach((panel, i) => {
            const op = calcOpacity(p, RANGES[i].start, RANGES[i].end);

            panel.style.opacity = op;
            if (op > 0.01) {
                panel.classList.add('visible');
            } else {
                panel.classList.remove('visible');
            }

            if (op > highestOp) {
                highestOp = op;
                highestIdx = i;
            }
        });

        // Activate the most visible panel (triggers stagger CSS)
        if (highestIdx !== prevActiveIdx) {
            $.panels[prevActiveIdx].classList.remove('active');
            $.panels[highestIdx].classList.add('active');
            prevActiveIdx = highestIdx;

            // Haptik Titreşim: Açılış/CTA için özel, diğer sahneler için zarif tık
            if (highestIdx === 2 || highestIdx === 5) {
                triggerHaptic('reveal');
            } else {
                triggerHaptic('scene');
            }

            // Trigger counter animation when scene 5 activates
            if (highestIdx === 4 && !countersAnimated) {
                countersAnimated = true;
                animateCounters();
            }
            // Reset counters when leaving scene 5
            if (highestIdx !== 4 && countersAnimated) {
                countersAnimated = false;
                resetCounters();
            }
        }
    }

    function calcOpacity(progress, start, end) {
        if (progress <= start) return start === 0 && progress === 0 ? 1 : 0;
        if (progress >= end) return end === 100 && progress === 100 ? 1 : 0;

        const dur = end - start;
        const fadeZone = Math.min(dur * 0.22, 5);

        if (progress < start + fadeZone) return (progress - start) / fadeZone;
        if (progress > end - fadeZone) return (end - progress) / fadeZone;
        return 1;
    }

    // ──────────────────────────────────────────────
    // Counter Animation
    // ──────────────────────────────────────────────
    function animateCounters() {
        $.counters.forEach(el => {
            const targetVal = parseInt(el.dataset.target);
            const suffix = el.dataset.suffix || '';
            const duration = 1800;
            const start = performance.now();

            function tick(now) {
                const elapsed = now - start;
                const t = Math.min(elapsed / duration, 1);
                const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
                const val = Math.round(eased * targetVal);
                el.textContent = val + suffix;
                if (t < 1) requestAnimationFrame(tick);
            }
            requestAnimationFrame(tick);
        });
    }

    function resetCounters() {
        $.counters.forEach(el => { el.textContent = '0'; });
    }

    // ──────────────────────────────────────────────
    // UI Updates
    // ──────────────────────────────────────────────
    function updateUI(p) {
        $.fill.style.height = p + '%';
        $.pct.textContent = Math.round(p) + '%';

        // Active dot
        let activeIdx = 0;
        for (let i = DOT_TARGETS.length - 1; i >= 0; i--) {
            if (p >= DOT_TARGETS[i] - 5) { activeIdx = i; break; }
        }
        $.dots.forEach((d, i) => d.classList.toggle('active', i === activeIdx));
    }

    // ──────────────────────────────────────────────
    // Background Color
    // ──────────────────────────────────────────────
    function updateBackground(p) {
        // Deep navy → purple → slightly lighter purple
        const t = p / 100;
        const r = Math.round(7 + t * 19);
        const g = Math.round(0 + t * 12);
        const b = Math.round(26 + t * 32);
        $.body.style.backgroundColor = `rgb(${r},${g},${b})`;
    }

    // ──────────────────────────────────────────────
    // Particle System (Stars)
    // ──────────────────────────────────────────────
    function tickParticles(p, dt) {
        if (!dt) dt = 1;
        const w = window.innerWidth;
        const h = window.innerHeight;

        // Arka plan ortam yıldızları — çok seyrek ve sade
        let ambientRate = 0.03 * dt;
        if (p > 35 && p < 53) ambientRate = 0.06 * dt;
        if (p > 70 && p < 88) ambientRate = 0.06 * dt;

        if (Math.random() < ambientRate && particles.length < CFG.PARTICLE_LIMIT) {
            particles.push(makeStar(w, h, p));
        }

        // Update
        for (let i = particles.length - 1; i >= 0; i--) {
            const s = particles[i];

            if (s.type === 'tap') {
                // Dokunma kıvılcımı: yavaşlayıp hızla parlayarak kaybolur
                s.vx *= Math.pow(0.93, dt);
                s.vy *= Math.pow(0.93, dt);
            } else if (s.type === 'mouse') {
                // Konum geçmişini (kuyruk izi) kaydet
                if (!s.trail) s.trail = [];
                s.trail.unshift({ x: s.x, y: s.y });
                if (s.trail.length > 16) s.trail.pop();

                // Mouse hedefli yıldız: kontrollü ve sakin seyir hızıyla hedefe süzülür
                const dx = s.tx - s.x;
                const dy = s.ty - s.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < 22) {
                    // Fareye/parmağa ulaştığında nazikçe parlayıp solar
                    s.decay = 0.04;
                    s.size *= Math.pow(0.95, dt);
                } else {
                    // Yumuşak yönlendirme (açı tabanlı yumuşak kavis)
                    const targetAngle = Math.atan2(dy, dx);
                    const currentAngle = Math.atan2(s.vy, s.vx);
                    let diff = targetAngle - currentAngle;
                    while (diff < -Math.PI) diff += Math.PI * 2;
                    while (diff > Math.PI) diff -= Math.PI * 2;

                    const newAngle = currentAngle + diff * (0.058 * dt);
                    const speed = s.speed || CFG.MOUSE_STAR_SPEED;

                    s.vx = Math.cos(newAngle) * speed;
                    s.vy = Math.sin(newAngle) * speed;
                }

                // Canlı hedef takibi
                s.tx = mouseX;
                s.ty = mouseY;
            } else {
                // CTA sahnesi: merkeze doğru yavaş çekim
                if (p > 88) {
                    const cx = w / 2, cy = h / 2;
                    s.vx += (cx - s.x) * 0.0002 * dt;
                    s.vy += (cy - s.y) * 0.0002 * dt;
                }
            }

            s.x += s.vx * dt;
            s.y += s.vy * dt;
            s.life -= s.decay * dt;
            s.angle += s.spin * dt;

            if (s.life <= 0) particles.splice(i, 1);
        }
    }

    function createTapBurst(x, y) {
        const count = 7;
        const colors = ['#ffd700', '#fff5c0', '#c084fc', '#ec4899', '#60a5fa', '#34d399'];
        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 / count) * i + (Math.random() - 0.5) * 0.5;
            const speed = Math.random() * 2.8 + 1.8;
            particles.push({
                type: 'tap',
                x: x,
                y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                size: Math.random() * 2 + 2.8,
                life: 1,
                decay: 0.035 + Math.random() * 0.02,
                color: colors[Math.floor(Math.random() * colors.length)],
                angle: Math.random() * Math.PI * 2,
                spin: (Math.random() - 0.5) * 0.1,
                isStar: true
            });
        }
    }

    function makeStar(w, h, p) {
        // Arka plan minik ortam yıldızı
        const colors = ['#ffd700', '#ffffff', '#c084fc', '#f0abfc'];

        return {
            x: Math.random() * w,
            y: Math.random() * h,
            vx: (Math.random() - 0.5) * 0.15,
            vy: -Math.random() * 0.2 - 0.04,
            size: Math.random() * 2 + 0.8,
            life: 1,
            decay: 0.0015 + Math.random() * 0.002,
            color: colors[Math.floor(Math.random() * colors.length)],
            angle: Math.random() * Math.PI * 2,
            spin: (Math.random() - 0.5) * 0.012,
            isStar: Math.random() > 0.6,
        };
    }

    function makeMouseStar(w, h, mx, my) {
        // Ekranın 4 kenarından birinden rastgele belirir
        let sx, sy;
        const edge = Math.floor(Math.random() * 4);
        switch (edge) {
            case 0: sx = Math.random() * w; sy = -15; break;          // üst
            case 1: sx = Math.random() * w; sy = h + 15; break;       // alt
            case 2: sx = -15; sy = Math.random() * h; break;          // sol
            case 3: sx = w + 15; sy = Math.random() * h; break;       // sağ
        }

        const dx = mx - sx;
        const dy = my - sy;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const speed = CFG.MOUSE_STAR_SPEED + (Math.random() - 0.5) * 0.35; // 2.0 - 2.4 px/frame

        // Canlı, sihirli parıltı renkleri
        const colors = ['#ffd700', '#ffea75', '#ec4899', '#c084fc', '#60a5fa', '#34d399'];

        return {
            type: 'mouse',
            x: sx,
            y: sy,
            trail: [],
            speed: speed,
            vx: (dx / dist) * speed,
            vy: (dy / dist) * speed,
            tx: mx,
            ty: my,
            size: Math.random() * 2 + 3.8, // Net, parlak yıldız
            life: 1,
            decay: 0.0012 + Math.random() * 0.001, // Uzun ömür
            color: colors[Math.floor(Math.random() * colors.length)],
            angle: Math.random() * Math.PI * 2,
            spin: (Math.random() - 0.5) * 0.05,
            isStar: true,
        };
    }

    function drawParticles() {
        const ctx = $.ctx;
        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

        for (const s of particles) {
            const alpha = clamp(s.life, 0, 1);

            // Önce kuyruk izini çiz (yıldızın arkasında kalsın)
            if (s.type === 'mouse' && s.trail && s.trail.length > 1) {
                const len = s.trail.length;

                // Yumuşak parıltılı kuyruk çizgisi
                ctx.save();
                ctx.beginPath();
                ctx.moveTo(s.x, s.y);
                for (let t = 0; t < len; t++) {
                    ctx.lineTo(s.trail[t].x, s.trail[t].y);
                }
                ctx.strokeStyle = s.color;
                ctx.lineWidth = s.size * 0.45;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.globalAlpha = alpha * 0.22;
                ctx.shadowColor = s.color;
                ctx.shadowBlur = 8;
                ctx.stroke();
                ctx.restore();

                // Kuyruk boyunca geriye doğru küçülen ışıltı parçacıkları
                for (let t = 0; t < len; t += 2) {
                    const pt = s.trail[t];
                    const ratio = 1 - (t / len);
                    ctx.save();
                    ctx.globalAlpha = alpha * ratio * 0.3;
                    ctx.fillStyle = s.color;
                    ctx.shadowColor = s.color;
                    ctx.shadowBlur = 6 * ratio;
                    ctx.beginPath();
                    ctx.arc(pt.x, pt.y, (s.size * 0.4) * ratio, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                }
            }

            // Ana yıldızı çiz
            ctx.save();
            ctx.globalAlpha = s.type === 'mouse' ? alpha * 0.95 : alpha * 0.6;
            ctx.translate(s.x, s.y);
            ctx.rotate(s.angle);

            const r = s.size * Math.max(s.life, 0.2);

            if (s.isStar && r > 1.2) {
                // Parlak 4 uçlu yıldız çizimi
                drawMiniStar(ctx, 0, 0, r, s.color);
            } else {
                // Minik yuvarlak ışıma
                ctx.beginPath();
                ctx.arc(0, 0, r, 0, Math.PI * 2);
                ctx.fillStyle = s.color;
                ctx.shadowColor = s.color;
                ctx.shadowBlur = s.type === 'mouse' ? 12 : 6;
                ctx.fill();
            }

            ctx.restore();
        }
    }

    function drawMiniStar(ctx, cx, cy, r, color) {
        const ir = r * 0.4;
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
            const rad = i % 2 === 0 ? r : ir;
            const angle = (i * Math.PI) / 4;
            const x = cx + rad * Math.cos(angle);
            const y = cy + rad * Math.sin(angle);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 10;
        ctx.fill();
    }

    // ──────────────────────────────────────────────
    // Utils
    // ──────────────────────────────────────────────
    function clamp(v, lo, hi) { return Math.min(Math.max(v, lo), hi); }

    // ──────────────────────────────────────────────
    // Boot
    // ──────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', init);

})();
