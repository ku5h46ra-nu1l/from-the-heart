// ===== Global State =====
let currentSection = 1;
let gameCompleted = false;
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const hasFinePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const isDesktop = window.matchMedia('(min-width: 768px)').matches;

// ===== Background music state (single continuous soundtrack) =====
// Bump ASSET_VER to force browsers to re-fetch audio after changes (cache-bust).
const ASSET_VER = '?v=3';
const MUSIC_SRC = 'assets/music/sec01.wav' + ASSET_VER; // the one soundtrack for the whole site
const MUSIC_VOL = 0.20;                     // subtle background volume (15–25%)
let musicEl = null;        // the ONE Audio element (created once, never per-section)
let musicStarted = false;  // has playback actually begun
let gestureHandlers = [];  // temporary listeners awaiting first interaction
let sfxContinue = null;

// ===== DOM Elements =====
const sections = document.querySelectorAll('.section');
const startBtn = document.getElementById('startBtn');
const soundToggle = document.getElementById('soundToggle');
const easterEgg = document.getElementById('easterEgg');
const easterMessage = document.getElementById('easterMessage');
const continueBtn = document.getElementById('continueBtn');
const gameResult = document.getElementById('gameResult');
const choices = document.getElementById('choices');
const stageIntro = document.getElementById('stageIntro');
const letsSeeBtn = document.getElementById('letsSeeBtn');
const stageLevel = document.getElementById('stageLevel');
const levelTag = document.getElementById('levelTag');
const levelSituation = document.getElementById('levelSituation');
const levelNextBtn = document.getElementById('levelNextBtn');
const stageSlider = document.getElementById('stageSlider');
const sliderText = document.getElementById('sliderText');
const effortSlider = document.getElementById('effortSlider');
const sliderResult = document.getElementById('sliderResult');
const sliderNextBtn = document.getElementById('sliderNextBtn');
const stageAch = document.getElementById('stageAch');
const achText = document.getElementById('achText');
const achImportant = document.getElementById('achImportant');

// ===== Initialize =====
document.addEventListener('DOMContentLoaded', function() {
    // Single, continuous soundtrack (one Audio element, reused everywhere).
    initMusic();

    // One button-click sound used for every button (independent of music)
    sfxContinue = new Audio('assets/sfx/click_continue.wav' + ASSET_VER);
    sfxContinue.volume = 0.35;

    // Play the single click sound on every button press
    document.addEventListener('click', function(e) {
        const btn = e.target.closest('button');
        if (!btn) return;
        playClick();
    });
    
    // Setup starfield
    createStars(50, '.stars', 'white', 4000);
    createStars(30, '.particles', 'pink', 6000);
    
    // Start floating hearts (skip for reduced-motion users)
    if (!prefersReducedMotion) {
        setInterval(createHeart, 1500);
        // Start extra hearts for denser effect
        setInterval(createHeart, 2500);
    }

    // Attempt to autoplay on load. If blocked by browser policy, it will wait
    // for the first user interaction automatically.
    tryStartMusic();
    updateSoundIcon(false); // reflects "not yet playing" until a gesture starts it
});

// ===== Start Experience =====
function startExperience() {
    tryStartMusic();
    // Go to next section
    nextSection('section1', 'section2');
}

// ===== Section Navigation (deck: show ONE section at a time) =====
function showSection(toId, fromId) {
    const to = document.getElementById(toId);
    if (!to) return;
    if (fromId) {
        const from = document.getElementById(fromId);
        if (from) from.classList.remove('active');
    } else {
        document.querySelectorAll('.section.active').forEach(s => s.classList.remove('active'));
    }
    to.classList.add('active');
    to.scrollTop = 0;
    currentSection = parseInt(toId.replace('section', ''), 10);
    onSectionEnter(toId);
    updateScrollArrow();
}

function nextSection(fromId, toId) {
    showSection(toId, fromId);
}

function restartSite() {
    // Reset game state
    gameCompleted = false;
    currentLevel = 1;
    if (gameResult) {
        gameResult.style.display = 'none';
        gameResult.classList.remove('show');
        gameResult.textContent = '';
    }
    if (continueBtn) continueBtn.style.display = 'none';
    startGame();
    showSection('section1');
    // Reset the single soundtrack to the beginning and make sure it's playing.
    if (musicStarted && musicEl) {
        try { musicEl.currentTime = 0; } catch (e) {}
        if (musicEl.paused) { const p = musicEl.play(); if (p && p.catch) p.catch(() => {}); }
        fadeInMusic();
    }
}

// ===== Scroll-down arrow (shows only when there is more to read) =====
const scrollArrow = document.getElementById('scrollArrow');

function updateScrollArrow() {
    if (!scrollArrow) return;
    const active = document.querySelector('.section.active');
    if (!active) { scrollArrow.classList.remove('show'); return; }
    let show;
    if (isDesktop) {
        // Laptop: arrow is a "continue to next section" affordance
        show = currentSection < 11;
    } else {
        // Phone: arrow means "more content inside this section". Hide once the
        // actual .content is fully revealed. We ignore the arrow-clearance
        // padding (otherwise the section reads as "not over" while only empty
        // padding remains below the last line).
        const content = active.querySelector('.content');
        if (content) {
            const contentBottom = content.offsetTop + content.offsetHeight;
            const revealedBottom = active.scrollTop + active.clientHeight;
            show = contentBottom > revealedBottom + 8;
        } else {
            const maxScroll = active.scrollHeight - active.clientHeight;
            show = maxScroll > 4 && active.scrollTop < maxScroll - 4;
        }
    }
    scrollArrow.classList.toggle('show', show);
}

if (scrollArrow) {
    const goNext = () => {
        const active = document.querySelector('.section.active');
        if (isDesktop) {
            const next = currentSection + 1;
            if (next <= 11) nextSection('section' + currentSection, 'section' + next);
        } else if (active) {
            active.scrollBy({ top: active.clientHeight * 0.85, behavior: 'smooth' });
        }
    };
    scrollArrow.addEventListener('click', goNext);
    scrollArrow.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goNext(); }
    });
}

// Update the arrow on internal (phone) scroll and viewport changes
sections.forEach(s => s.addEventListener('scroll', updateScrollArrow, { passive: true }));
window.addEventListener('resize', updateScrollArrow);
window.addEventListener('orientationchange', updateScrollArrow);
updateScrollArrow();

// ===== Background music: ONE continuous soundtrack for the whole site =====

// Create the single, reusable Audio element (once — never per-section).
function initMusic() {
    musicEl = new Audio(MUSIC_SRC);
    musicEl.loop = true;
    musicEl.preload = 'auto';
    musicEl.volume = 0;
    musicEl.addEventListener('error', function () {
        console.warn('[music] failed to load', MUSIC_SRC);
    });
}

// Smooth volume ramp using requestAnimationFrame.
function ramp(el, target, ms) {
    if (!el) return;
    const start = el.volume;
    const t0 = performance.now();
    if (el._fade) cancelAnimationFrame(el._fade);
    (function step(now) {
        const p = Math.min(1, (now - t0) / ms);
        el.volume = start + (target - start) * p;
        if (p < 1) el._fade = requestAnimationFrame(step);
    })(performance.now());
}

function fadeInMusic() {
    if (musicEl) ramp(musicEl, MUSIC_VOL, 1500);
}

// Start (or resume) playback. Reload first because some mobile browsers
// (notably iOS Safari) refuse a later gesture-triggered play() if an earlier
// autoplay attempt was rejected, unless the element is reloaded.
function startPlayback() {
    try { musicEl.load(); } catch (e) {}
    musicEl.volume = 0;
    const pr = musicEl.play();
    if (pr && pr.then) {
        pr.then(function () {
            musicStarted = true;
            fadeInMusic();
            removeGestureHandlers();
            updateSoundIcon(true);
            console.log('[music] playback started');
        }).catch(function () {
            console.log('[music] playback blocked, waiting for gesture');
            setupGestureHandlers();
        });
    } else {
        musicStarted = true;
        fadeInMusic();
        removeGestureHandlers();
        updateSoundIcon(true);
    }
}

// Attempt to autoplay on load, using the play() promise exactly as required:
//   play().then(...)  when allowed  → music starts immediately
//   play().catch(...) when blocked  → keep ready, start on first interaction
function tryStartMusic() {
    if (!musicEl || musicStarted) { removeGestureHandlers(); return; }
    startPlayback();
}

// Explicit, always-available control. The first tap is a guaranteed user
// gesture, so this is the most reliable way to start audio on mobile.
function updateSoundIcon(playing) {
    if (!soundToggle) return;
    soundToggle.textContent = playing ? '🔊' : '🔇';
    soundToggle.setAttribute('aria-label', playing ? 'Mute music' : 'Play music');
}

function toggleSound() {
    if (!musicEl) return;
    if (musicStarted && !musicEl.paused) {
        try { musicEl.pause(); } catch (e) {}
        updateSoundIcon(false);
    } else {
        startPlayback();
        updateSoundIcon(true);
    }
}

function setupGestureHandlers() {
    ['pointerdown', 'touchstart', 'keydown', 'click'].forEach(function (ev) {
        const h = function () { tryStartMusic(); };
        gestureHandlers.push({ ev: ev, h: h });
        window.addEventListener(ev, h, { capture: true });
    });
}

function removeGestureHandlers() {
    gestureHandlers.forEach(function (g) {
        window.removeEventListener(g.ev, g.h, { capture: true });
    });
    gestureHandlers = [];
}

// Called whenever a section becomes active. The ONE soundtrack never restarts
// on navigation; it only fades out at the very end (finale) and resumes if we
// return to a normal section (e.g. after restart).
function onSectionEnter(sectionId) {
    if (!musicEl) return;
    if (sectionId === 'section11') {
        if (musicStarted && !musicEl.paused) {
            ramp(musicEl, 0, 1500);
            setTimeout(function () {
                // Only pause if we are STILL on the finale (guards against a
                // stale timer pausing music after the user restarted away).
                if (currentSection === 11 && musicEl && !musicEl.paused) {
                    try { musicEl.pause(); } catch (e) {}
                }
            }, 1600);
        }
    } else {
        if (musicStarted && musicEl.paused) {
            const p = musicEl.play();
            if (p && p.catch) p.catch(() => {});
            fadeInMusic();
        }
    }
}

// Short click feedback sound (independent of background music).
function playClick() {
    if (!sfxContinue) return;
    try { sfxContinue.currentTime = 0; } catch (e) {}
    const pr = sfxContinue.play();
    if (pr && pr.catch) pr.catch(() => {});
}

// ===== Flip Cards =====
function flipCard(card) {
    card.classList.toggle('flipped');
}

// ===== Mini Game: Actions > Words =====
const levelData = {
  1: {
    tag: "Level 1 — School 🏫",
    situation: "School mein tum saamne ho. Main kya karun?",
    options: [
      { text: "A — Ignore you again 👻", wrong: true, why: "Ignore karna wahi purani galti hai 😣" },
      { text: "B — Pretend kuch hua hi nahi", wrong: true, why: "Pretend karke kuch fix nahi hoga 🙃" },
      { text: "C — Tumse normally baat karun", correct: true }
    ],
    correctMsg: "✅ Better. But ek baar sahi decision lena enough nahi hai."
  },
  2: {
    tag: "Level 2 — When things feel awkward",
    situation: "Tumse baat karna awkward lag raha hai. What do I do?",
    options: [
      { text: "A — Avoid you", wrong: true, why: "Avoid karna sirf doori badhata hai 🚪" },
      { text: "B — Wait for you to talk first", wrong: true, why: "Wait karne se awkward aur badhta hai ⏳" },
      { text: "C — Khud effort karun", correct: true }
    ],
    correctMsg: "Exactly. Effort tab matter karta hai jab cheez awkward ho."
  }
};

let currentLevel = 1;

function hideAllStages() {
  [stageIntro, stageLevel, stageSlider, stageAch].forEach(s => s.style.display = 'none');
}

function startGame() {
  gameCompleted = false;
  currentLevel = 1;
  hideAllStages();
  stageIntro.style.display = 'block';
  if (continueBtn) continueBtn.style.display = 'none';
}

letsSeeBtn.addEventListener('click', () => showLevel(1));

function showLevel(n) {
  currentLevel = n;
  hideAllStages();
  stageLevel.style.display = 'block';
  const d = levelData[n];
  levelTag.textContent = d.tag;
  levelSituation.textContent = d.situation;
  gameResult.textContent = '';
  gameResult.classList.remove('show');
  levelNextBtn.style.display = 'none';
  choices.innerHTML = '';
  d.options.forEach((opt) => {
    const b = document.createElement('button');
    b.className = 'choice-btn';
    b.textContent = opt.text;
    b.addEventListener('click', () => chooseOption(b, opt));
    choices.appendChild(b);
  });
}

function chooseOption(btn, opt) {
  if (gameCompleted) return;
  if (opt.correct) {
    btn.classList.add('correct', 'correct-hl');
    btn.style.transform = 'scale(1.05)';
    gameResult.textContent = levelData[currentLevel].correctMsg;
    gameResult.classList.add('show');
    choices.querySelectorAll('.choice-btn').forEach(b => b.style.pointerEvents = 'none');
    levelNextBtn.style.display = 'inline-block';
  } else {
    btn.classList.add('wrong', 'shake');
    setTimeout(() => btn.classList.remove('shake'), 450);
    btn.style.opacity = '0.4';
    btn.style.pointerEvents = 'none';
    gameResult.textContent = opt.why;
    gameResult.classList.add('show');
  }
}

levelNextBtn.addEventListener('click', () => {
  if (currentLevel === 1) showLevel(2);
  else showSlider();
});

function showSlider() {
  hideAllStages();
  stageSlider.style.display = 'block';
  sliderText.textContent = "This one is different. How much effort should an apology have?";
  effortSlider.value = 50;
  sliderResult.textContent = '';
  sliderResult.classList.remove('show');
  sliderNextBtn.style.display = 'none';
}

effortSlider.addEventListener('input', () => {
  if (parseInt(effortSlider.value, 10) >= 55) {
    sliderResult.textContent = "That's the point. Main sirf \"sorry\" bolke khatam nahi karna chahta. Agar main genuinely sorry hoon, toh mujhe apne actions se bhi dikhana padega.";
    sliderResult.classList.add('show');
    sliderNextBtn.style.display = 'inline-block';
  }
});

sliderNextBtn.addEventListener('click', showAchievement);

function showAchievement() {
  gameCompleted = true;
  hideAllStages();
  stageAch.style.display = 'block';
  achText.textContent = "Sorry bolna starting point hai. Trust aur comfort wapas aana actions se hota hai. So... I won't ask you to just forgive me. I'll try to show you I'm sorry.";
  achImportant.textContent = "Main ye website bana ke ye prove nahi kar raha ki ab sab theek ho gaya. Ye bas meri taraf se effort hai. Baaki mujhe apne actions se prove karna hai.";
  if (continueBtn) continueBtn.style.display = 'inline-block';
  celebrate();
}

function celebrate() {
  if (prefersReducedMotion) return;
  const emojis = ['🤍', '💖', '✨', '🌟'];
  for (let i = 0; i < 14; i++) {
    const s = document.createElement('div');
    s.textContent = emojis[i % emojis.length];
    s.style.position = 'fixed';
    s.style.left = (50 + (Math.random() * 40 - 20)) + 'vw';
    s.style.top = '62vh';
    s.style.fontSize = (Math.random() * 14 + 16) + 'px';
    s.style.zIndex = '300';
    s.style.pointerEvents = 'none';
    s.style.transition = 'transform 1.4s ease-out, opacity 1.4s ease-out';
    document.body.appendChild(s);
    requestAnimationFrame(() => {
      s.style.transform = 'translateY(-62vh) rotate(' + (Math.random() * 40 - 20) + 'deg)';
      s.style.opacity = '0';
    });
    setTimeout(() => s.remove(), 1500);
  }
}

startGame();

// ===== Easter Egg =====
function showEasterMessage() {
    easterMessage.style.display = 'block';
    easterEgg.style.display = 'none';
}

function hideEasterMessage() {
    easterMessage.style.display = 'none';
}

// ===== Star/Particle Creation =====
function createStars(count, containerSelector, color, duration) {
    const container = document.querySelector(containerSelector);
    if (!container) return;
    
    for (let i = 0; i < count; i++) {
        const star = document.createElement('div');
        star.style.position = 'absolute';
        star.style.width = Math.random() * 3 + 'px';
        star.style.height = star.style.width;
        star.style.left = Math.random() * 100 + '%';
        star.style.top = Math.random() * 100 + '%';
        star.style.background = color;
        star.style.borderRadius = '50%';
        star.style.opacity = Math.random() * 0.8 + 0.2;
        const animDuration = (duration / 1000) + Math.random() * 3;
        const animDelay = Math.random() * 5;
        star.style.animation = `twinkle ${animDuration}s ease-in-out infinite`;
        star.style.animationDelay = animDelay + 's';
        container.appendChild(star);
    }
}

// ===== Floating Hearts =====
function createHeart() {
    const heart = document.createElement('div');
    heart.innerHTML = '🤍';
    heart.style.position = 'fixed';
    heart.style.left = Math.random() * window.innerWidth + 'px';
    heart.style.top = window.innerHeight - 20 + 'px';
    heart.style.fontSize = Math.random() * 15 + 15 + 'px';
    heart.style.opacity = '0.6';
    heart.style.pointerEvents = 'none';
    heart.style.zIndex = '10';
    heart.style.animation = 'floatHeart 4s forwards';
    heart.style.animationDelay = Math.random() * 0.5 + 's';
    
    document.body.appendChild(heart);
    
    setTimeout(() => {
        heart.remove();
    }, 5000);
}

// ===== Cursor Glow Effect =====
let mouseX = 0;
let mouseY = 0;
let glowX = 0;
let glowY = 0;

document.addEventListener('mousemove', function(e) {
    mouseX = e.clientX;
    mouseY = e.clientY;
});

function animateGlow() {
    glowX += (mouseX - glowX) * 0.1;
    glowY += (mouseY - glowY) * 0.1;
    
    const glow = document.querySelector('.glow');
    if (glow) {
        glow.style.top = glowY + 'px';
        glow.style.left = glowX + 'px';
    }
    
    requestAnimationFrame(animateGlow);
}

if (hasFinePointer && !prefersReducedMotion) {
    animateGlow();
}

// ===== Event Listeners =====
startBtn?.addEventListener('click', startExperience);
easterEgg?.addEventListener('click', showEasterMessage);
soundToggle?.addEventListener('click', toggleSound);
