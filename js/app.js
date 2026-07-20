        import { db } from './data.js';
        import { fbSync } from './firebase-sync.js';
        import * as social from './social.js';
        import { startWcaLogin, handleWcaCallback, wcaEnabled, fetchMyWcaCompetitions, clearWcaSession } from './wca-auth.js';
        import { advanceScrambleTracker, completeScrambleTracker, createScrambleTracker, scrambleCorrectionMoves, scrambleTrackerComplete } from './smart-scramble.js?v=20260720-smart-reliable-1';

        let Alg = null;
        let randomScrambleForEvent = null;
        const cubingAlgReady = import("https://cdn.cubing.net/v0/js/cubing/alg")
            .then(mod => { Alg = mod.Alg; return Alg; })
            .catch(err => { console.warn('cubing/alg failed to load; using fallback alg helpers where possible.', err); return null; });
        const cubingScrambleReady = import("https://cdn.cubing.net/v0/js/cubing/scramble")
            .then(mod => { randomScrambleForEvent = mod.randomScrambleForEvent; return randomScrambleForEvent; })
            .catch(err => { console.warn('cubing/scramble failed to load.', err); return null; });
        async function getRandomScrambleForEvent(eventId) {
            if (!randomScrambleForEvent) await cubingScrambleReady;
            if (!randomScrambleForEvent) throw new Error('Scramble generator is still loading. Try again.');
            return randomScrambleForEvent(eventId);
        }

        let openRouterConfig = { apiKey: '' };
        try {
            const mod = await import('../openrouter-config.js');
            openRouterConfig = mod.openrouterConfig || mod.default || openRouterConfig;
        } catch (_) {}

        const MEGAMINX_CASE_ENTRIES = [
            { category: 'Megaminx EO', name: 'EO 1', setup: '', main_alg: "F R U R' U' F'", alts: [] },
            { category: 'Megaminx EO', name: 'EO 2', setup: '', main_alg: "F U R U' R' F'", alts: [] },
            { category: 'Megaminx EO', name: 'EO 3', setup: '', main_alg: "F R U2 R2' F R F' U2' F'", alts: [] },
            { category: 'Megaminx CO', name: 'CO 1', setup: '', main_alg: "R U R' U R U R' U2' R U' R'", alts: ["y2' R2' DR' R U2 R' DR R U2' R"] },
            { category: 'Megaminx CO', name: 'CO 2', setup: '', main_alg: "F R U2 R' U' R U' R' F'", alts: ["y2' R BR R' F R BR' R' F'", "y' R U R U2 R' U' R U' R' U' R'"] },
            { category: 'Megaminx CO', name: 'CO 3', setup: '', main_alg: "R U2 R' U R U2 R'", alts: ["y' R U2' R' U' R U2' R'", "L' U2' L U' L' U2' L", "y L' U2 L U L' U2 L"] },
            { category: 'Megaminx CO', name: 'CO 4', setup: '', main_alg: "F R' F' U' R' F R U R U' R' F'", alts: ["y F R U R' U R U2' R' F'", "L F R F' L'", "R' F R BR' R' F' R BR"] },
            { category: 'Megaminx CO', name: 'CO 5', setup: '', main_alg: "R U R' U R U2' R'", alts: ["y2 L U' R' U L' U' R U"] },
            { category: 'Megaminx CO', name: 'CO 6', setup: '', main_alg: "R' U' R U' R' U2 R", alts: ["y2 L' U' L U' L' U2 L"] },
            { category: 'Megaminx CO', name: 'CO 7', setup: '', main_alg: "R U2 R' U' R U' R'", alts: ["y' R' F R F' L F R' F' R L'"] },
            { category: 'Megaminx CO', name: 'CO 8', setup: '', main_alg: "R U R' U2 R U2 R'", alts: ["y L' U2' L U L' U L", "y' R' L F R F' L' F R' F' R"] },
            { category: 'Megaminx CO', name: 'CO 9', setup: '', main_alg: "R U2 R' U' R U R' U' R U' R'", alts: ["y F R U R' U' R U R' U' R U R' U' F'"] },
            { category: 'Megaminx CO', name: 'CO 10', setup: '', main_alg: "R U R' U R U' R' U R U2' R'", alts: [] },
            { category: 'Megaminx CO', name: 'CO 11', setup: '', main_alg: "R U R' U R U R' U' R U2' R'", alts: [] },
            { category: 'Megaminx CO', name: 'CO 12', setup: '', main_alg: "R U2 R' U' R U' R2' U' R U' R' U2 R", alts: ["R U2' R' U2' R U2 R' U2' R U' R'"] },
            { category: 'Megaminx CO', name: 'CO 13', setup: '', main_alg: "R U2 R2' U' R2 U' R2' U2 R", alts: [] },
            { category: 'Megaminx CO', name: 'CO 14', setup: '', main_alg: "R' U2' R2 U R2' U R2 U2' R'", alts: [] },
            { category: 'Megaminx CO', name: 'CO 15', setup: '', main_alg: "R U R' U2 R U2' R' U R U2' R'", alts: [] },
            { category: 'Megaminx CO', name: 'CO 16', setup: '', main_alg: "R U2 R' U' R U2 R' U2' R U' R'", alts: [] },
            { category: 'Megaminx CP', name: 'CP 1', setup: '', main_alg: "R' BR' R BR R' F' R BR' R' BR F R", alts: [] },
            { category: 'Megaminx CP', name: 'CP 2', setup: '', main_alg: "R' F' BR' R BR R' F R BR' R' BR R", alts: [] },
            { category: 'Megaminx CP', name: 'CP 3', setup: '', main_alg: "BR' R' U L U' R' U L' U' R2 BR", alts: [] },
            { category: 'Megaminx CP', name: 'CP 4', setup: '', main_alg: "BR' R2' U L U' R U L' U' R BR", alts: [] },
            { category: 'Megaminx CP', name: 'CP 5', setup: '', main_alg: "L' R U2 R' U' R U R' U' R U R' U' R U' R' L", alts: [] },
            { category: 'Megaminx CP', name: 'CP 6', setup: '', main_alg: "R U R' U R' U' R F' R U R' U' R' F R2 U' R2' U R U'", alts: [] },
            { category: 'Megaminx CP', name: 'CP 7', setup: '', main_alg: "R2 U R' U' y R U R' U' R U R' U' R U R' y' R U' R2'", alts: [] },
            { category: 'Megaminx CP', name: 'CP 8', setup: '', main_alg: "F R U2 R' U' R U' R' F' R' y' R' U' R U' R' U2 R BR U'", alts: [] },
            { category: 'Megaminx CP', name: 'CP 9', setup: '', main_alg: "R U R' U R' U' R2 U' R' U R' U R U R U R' U R' U' R2 U' R' U R' U R U", alts: [] },
            { category: 'Megaminx CP', name: 'CP 10', setup: '', main_alg: "R2 U2 R2' U' R2 U' R2' y' R2' U' R2 U' R2' U2 R2", alts: [] },
            { category: 'Megaminx CP', name: 'CP 11', setup: '', main_alg: "R2' U2' R2 U R2' U R2 y R2 U R2' U R2 U2' R2'", alts: [] },
            { category: 'Megaminx CP', name: 'CP 12', setup: '', main_alg: "R2 U2' R2' U' R2 U2' R' U R' U' R' F R2 U' R' U' R U R' F'", alts: [] },
            { category: 'Megaminx CP', name: 'CP 13', setup: '', main_alg: "R' U2 R U' R' U2 R U2' R' U' R U2' R' U R U2' R' U R", alts: [] },
            { category: 'Megaminx CP', name: 'CP 14', setup: '', main_alg: "R2 U2' R2' U' R2 U R2' U' R2 U R2' U' R2 U2' R2'", alts: [] },
            { category: 'Megaminx CP', name: 'CP 15', setup: '', main_alg: "R2 U2 R2' U R2 U' R2' U R2 U' R2' U R2 U2 R2'", alts: [] },
            { category: 'Megaminx EP', name: 'EP 1', setup: '', main_alg: "R2 U2' R2' U' R2 U2' R2'", alts: [] },
            { category: 'Megaminx EP', name: 'EP 2', setup: '', main_alg: "R2 U2 R2' U R2 U2 R2'", alts: [] },
            { category: 'Megaminx EP', name: 'EP 3', setup: '', main_alg: "R U R' F' R U R' U' R' F R2 U' R'", alts: [] },
            { category: 'Megaminx EP', name: 'EP 4', setup: '', main_alg: "R U R' U R' U' R2 U' R' U R' U R U2'", alts: [] },
            { category: 'Megaminx EP', name: 'EP 5', setup: '', main_alg: "L R U2 L' U R' L U' R U2 L' U2 R'", alts: [] }
        ];
        MEGAMINX_CASE_ENTRIES.forEach(entry => {
            const idx = db.findIndex(item => item.category === entry.category && item.name === entry.name);
            if (idx >= 0) db[idx] = entry;
            else db.push(entry);
        });

        const liteVisualMedia = window.matchMedia('(max-width: 640px), (prefers-reduced-motion: reduce)');
        function useLiteVisuals() {
            return !!liteVisualMedia.matches;
        }
        function prefer2DForPuzzle(puzzleId) {
            if (puzzleId === 'megaminx') return false;
            return useLiteVisuals();
        }
        function prefer2DForCategory(category) {
            if (category.startsWith('Megaminx')) return false;
            return useLiteVisuals();
        }
        function megaminxTopFace() {
            return 'gray';
        }
        function megaminxViewPrefix() {
            return megaminxTopFace() === 'black' ? 'z' : 'x2';
        }
        function applyPuzzleViewSetup(puzzleId, setupText = '') {
            // Match the working trainer/timer previews: Megaminx setup algs must be
            // passed directly, because cube rotations like x2/z can make Twisty skip
            // the whole setup string for Megaminx.
            return String(setupText || '').trim();
        }
        function algCategoryPuzzleId(category) {
            if (category.startsWith('2x2')) return '2x2x2';
            if (category.startsWith('4x4')) return '4x4x4';
            if (category.startsWith('5x5')) return '5x5x5';
            if (category.startsWith('Pyraminx')) return 'pyraminx';
            if (category.startsWith('Megaminx')) return 'megaminx';
            return '3x3x3';
        }
        function algCategoryEventId(category) {
            if (category.startsWith('2x2')) return '222';
            if (category.startsWith('4x4')) return '444';
            if (category.startsWith('5x5')) return '555';
            if (category.startsWith('Pyraminx')) return 'pyram';
            if (category.startsWith('Megaminx')) return 'minx';
            return '333';
        }
        function isReferenceCategory(category) {
            return false;
        }

        // ---- App accent colour theme ----
        const APP_COLORS = [
            { id: 'orange', label: 'Orange', light: '#FFD08A', main: '#FF9F0A', dark: '#D94F00' },
            { id: 'red',    label: 'Red',    light: '#FFAAAA', main: '#ff4e4e', dark: '#A91525' },
            { id: 'blue',   label: 'Blue',   light: '#A9D8FF', main: '#5ab0ff', dark: '#1746B3' },
            { id: 'green',  label: 'Green',  light: '#B5F3C9', main: '#5fe08c', dark: '#087A3C' },
            { id: 'teal',   label: 'Teal',   light: '#A5F3FC', main: '#22d3ee', dark: '#0E7490' },
            { id: 'purple', label: 'Purple', light: '#E4C7FF', main: '#c084fc', dark: '#7020B8' },
            { id: 'pink',   label: 'Pink',   light: '#FFD0E7', main: '#f472b6', dark: '#B51F68' },
        ];
        function applyAppColor(id) {
            const c = APP_COLORS.find(x => x.id === id) || APP_COLORS[0];
            document.documentElement.style.setProperty('--orange',      c.main);
            document.documentElement.style.setProperty('--orange-dark', c.dark);
            document.documentElement.style.setProperty('--brand-accent', c.main);
            document.documentElement.style.setProperty('--brand-accent-dark', c.dark);
            document.documentElement.style.setProperty('--brand-accent-light', c.light);
            document.documentElement.dataset.appColor = c.id;
        }
        applyAppColor((() => { try { const v = localStorage.getItem('uc_appColor'); return v ? JSON.parse(v) : 'orange'; } catch(e) { return 'orange'; } })());
        liteVisualMedia.addEventListener?.('change', () => {
            try {
                if (document.getElementById('alg-grid')?.style.display !== 'none') renderCards();
                if (typeof resetPuzzleCubeView === 'function') {
                    resetPuzzleCubeView(currentScramble);
                    if (typeof applyPuzzleCube === 'function') applyPuzzleCube();
                }
                if (typeof trainCube !== 'undefined' && trainCube) {
                    const currentPuzzle = trainCube.getAttribute('puzzle') || '';
                    if (prefer2DForPuzzle(currentPuzzle)) trainCube.setAttribute('visualization', '2D');
                    else trainCube.removeAttribute('visualization');
                }
            } catch (_) {}
        });

        function buildColorSwatches(targetId = 'app-color-grid') {
            const grid = document.getElementById(targetId);
            if (!grid) return;
            const active = LS.get('appColor', 'orange');
            grid.innerHTML = APP_COLORS.map(c => `
                <button type="button" class="app-color-swatch${c.id === active ? ' on' : ''}" data-color-id="${c.id}">
                    <div class="app-color-dot" style="background:linear-gradient(135deg,${c.light} 0%,${c.main} 52%,${c.dark} 100%)"></div>
                    <span class="app-color-label">${c.label}</span>
                </button>`).join('');
            grid.querySelectorAll('.app-color-swatch').forEach(btn => {
                btn.addEventListener('click', () => {
                    const id = btn.dataset.colorId;
                    LS.set('appColor', id);
                    applyAppColor(id);
                    grid.querySelectorAll('.app-color-swatch').forEach(b => b.classList.toggle('on', b.dataset.colorId === id));
                });
            });
        }

        const grid = document.getElementById('alg-grid');
        const categoryFilter = document.getElementById('category-filter');
        const searchInput = document.getElementById('search-input');
        const loader = document.getElementById('loading-indicator');
        let exactAlgNameFilter = '';

        // ---- Persistent user data (localStorage + optional cloud sync) ----
        const LS = {
            key(k) { return 'uc_' + (fbSync.getUser() ? '' : 'guest_') + k; },
            get(k, d) { try { const v = localStorage.getItem(this.key(k)); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
            set(k, v) {
                try { localStorage.setItem(this.key(k), JSON.stringify(v)); } catch (e) {}
                fbSync.noteLSWrite(k, v);
            }
        };
        const learnedSet  = new Set(LS.get('learned', []));
        const learningSet = new Set(LS.get('learning', []));
        const mainChoices = LS.get('mainChoices', {});
        function saveLearned()  { LS.set('learned',  [...learnedSet]); }
        function saveLearning() { LS.set('learning', [...learningSet]); }
        function saveMainChoices() { LS.set('mainChoices', mainChoices); }
        // Three-state cycle: unknown → learning → learned → unknown
        function cycleAlgState(name) {
            if (learnedSet.has(name)) {
                learnedSet.delete(name);
            } else if (learningSet.has(name)) {
                learningSet.delete(name);
                learnedSet.add(name);
            } else {
                learningSet.add(name);
            }
            saveLearned();
            saveLearning();
        }
        function algState(name) {
            if (learnedSet.has(name))  return 'learned';
            if (learningSet.has(name)) return 'learning';
            return 'unknown';
        }

        // ---- User profile (main event, cubes, bio, socials, WCA ID, avatar) ----
        const DEFAULT_PROFILE = {
            main_event: '333',
            main_cubes: '',
            bio: '',
            wca_id: '',
            wca_user_id: null,
            wca_verified: false,
            wca_name: '',     // verified name from WCA
            wca_records: {},  // normalized { eventId: { single, average } } in seconds
            avatar: '',     // base64 data URL, or '' for default (default-user-image.png)
            frame: 'none',  // default: no border (no auto-select); user picks explicitly
            events: [],     // from onboarding: list of event ids the user cubes
            methods: [],    // from onboarding: list of method ids
            onboarded: false,
            socials: { youtube: '', instagram: '' },
            dailyQuestLog: {}  // { 'YYYY-MM-DD-questId': xpAwarded }
        };

        // Avatar frame tiers — Discord-Nitro-style animated borders unlocked by activity
        // Each tier has: id, label, condition (returns bool given stats)
        const FRAME_TIERS = [
            { id: 'legendary', label: 'Legendary', minSolves: 5000, minLearned: 0 },
            { id: 'rainbow',   label: 'Rainbow',   minSolves: 1000, minLearned: 0   },
            { id: 'gold',      label: 'Gold',      minSolves: 500,  minLearned: 0   },
            { id: 'silver',    label: 'Silver',    minSolves: 100,  minLearned: 0   },
            { id: 'bronze',    label: 'Bronze',    minSolves: 25,   minLearned: 0   },
            { id: 'none',      label: 'None',      minSolves: 0,    minLearned: 0   }
        ];
        const ADMIN_EMAIL = 'unleashedcubing@gmail.com';
        function isAdminUser() {
            const u = fbSync.getUser();
            return !!(u && u.email && u.email.toLowerCase() === ADMIN_EMAIL);
        }
        function frameUnlocked(tier, totalSolves, learnedCount) {
            if (isAdminUser()) return true;        // admin unlocks everything
            return totalSolves >= tier.minSolves && learnedCount >= (tier.minLearned || 0);
        }
        function highestUnlockedFrame(totalSolves, learnedCount) {
            return (FRAME_TIERS.find(t => frameUnlocked(t, totalSolves, learnedCount)) || FRAME_TIERS[FRAME_TIERS.length - 1]).id;
        }
        const BATTLES_MIN_SOLVES = 150;
        const BATTLES_BYPASS_CODE = '645872';
        function battlesUnlocked() {
            if (isAdminUser()) return true;
            if (LS.get('battlesBypass', false)) return true;     // beta-tester bypass
            return totalSolvesAll() >= BATTLES_MIN_SOLVES;
        }
        let profile = Object.assign({}, DEFAULT_PROFILE, LS.get('profile', {}));
        profile.socials = Object.assign({}, DEFAULT_PROFILE.socials, profile.socials || {});
        function saveProfile() { LS.set('profile', profile); }
        // Strip URLs from bio (the user explicitly said "no links")
        function sanitizeBio(s) {
            return String(s || '')
                .replace(/https?:\/\/\S+/gi, '')
                .replace(/\bwww\.\S+/gi, '')
                .slice(0, 240)
                .trim();
        }
        function statsFilterDefault() { return LS.get('statsFilter', 'all'); }

        function cleanAlg(algText) {
            return algText.replace(/[()]/g, '').trim();
        }

        // Invert an algorithm: reverse move order + invert each move direction.
        // `fiveFold` is for Megaminx, where U2 and U2' are different turns.
        function inverseAlg(alg, opts = {}) {
            if (!alg || typeof alg !== 'string') return '';
            return alg.trim().split(/\s+/).filter(Boolean).reverse().map(tok => {
                if (opts.fiveFold && /2'?$/i.test(tok)) {
                    return tok.endsWith("'") ? tok.slice(0, -1) : tok + "'";
                }
                if (/2'?$/.test(tok)) return tok.replace("'", '');
                if (tok.endsWith("'")) return tok.slice(0, -1);
                return tok + "'";
            }).join(' ');
        }

        function extractPreRotation(algText) {
            const clean = cleanAlg(algText);
            const regex = /^((?:[xyz][2']?\s*)+)(.*)$/i;
            const match = clean.match(regex);
            if (match) {
                return { rotation: match[1].trim(), cleanAlg: match[2].trim() };
            }
            return { rotation: '', cleanAlg: clean };
        }

        // A leading y-rotation is baked into the cube's orientation instead of
        // being animated before the moves. Returns the full text to display,
        // the moves to actually animate, and the y-rotation to bake (if any).
        function parseAlgEntry(algText) {
            const { rotation, cleanAlg: stripped } = extractPreRotation(algText);
            const isY = rotation === 'y' || rotation === "y'" || rotation === 'y2';
            const display = cleanAlg(algText);
            return {
                display: display,
                anim: isY ? stripped : display,
                yrot: isY ? rotation : ''
            };
        }

        // ---- Algorithm shape/family grouping (PLL by perm letter, OLL by shape, COLL by OLL-type) ----
        const OLL_GROUPS = {
            'All Edges Oriented': [21, 22, 23, 24, 25, 26, 27],
            'T-Shapes': [33, 45],
            'Squares': [5, 6],
            'C-Shapes': [34, 46],
            'W-Shapes': [36, 38],
            'Corners Oriented': [28, 57],
            'P-Shapes': [31, 32, 43, 44],
            'I-Shapes': [51, 52, 55, 56],
            'Fish Shapes': [9, 10, 35, 37],
            'Knight Move Shapes': [13, 14, 15, 16],
            'Awkward Shapes': [29, 30, 41, 42],
            'L-Shapes': [47, 48, 49, 50, 53, 54],
            'Lightning Bolts': [7, 8, 11, 12, 39, 40],
            'Dot Shapes': [1, 2, 3, 4, 17, 18, 19, 20]
        };
        const OLL_NUM_TO_GROUP = {};
        Object.entries(OLL_GROUPS).forEach(([g, nums]) => nums.forEach(n => OLL_NUM_TO_GROUP[n] = g));
        const OLL_GROUP_ORDER = Object.keys(OLL_GROUPS);
        const PLL_GROUP_ORDER = ['A', 'E', 'F', 'G', 'H', 'J', 'N', 'R', 'T', 'U', 'V', 'Y', 'Z'];
        const COLL_GROUP_ORDER = ['Sune', 'Antisune', 'L', 'U', 'T', 'Pi', 'H'];
        const PLL_GROUP_LABEL = {
            A: 'A Perms', E: 'E Perm', F: 'F Perm', G: 'G Perms', H: 'H Perm',
            J: 'J Perms', N: 'N Perms', R: 'R Perms', T: 'T Perm', U: 'U Perms',
            V: 'V Perm', Y: 'Y Perm', Z: 'Z Perm'
        };

        function algGroup(item) {
            if (item.category === 'PLL') return item.name.charAt(0);
            if (item.category === 'OLL') {
                const m = item.name.match(/OLL (\d+)/);
                const n = m ? parseInt(m[1], 10) : 0;
                return OLL_NUM_TO_GROUP[n] || 'Other';
            }
            if (item.category === 'COLL') {
                if (item.name.startsWith('AS')) return 'Antisune';
                if (item.name.startsWith('Pi')) return 'Pi';
                if (item.name.startsWith('S ')) return 'Sune';
                return item.name.split(' ')[0];
            }
            return null;
        }
        function groupOrder(category) {
            if (category === 'PLL') return PLL_GROUP_ORDER;
            if (category === 'OLL') return OLL_GROUP_ORDER;
            if (category === 'COLL') return COLL_GROUP_ORDER;
            return null;
        }
        function groupLabel(category, key) {
            if (category === 'PLL') return PLL_GROUP_LABEL[key] || (key + ' Perm');
            return key;
        }

        let groupMode = LS.get('groupMode', 'name');   // 'name' | 'category'
        let lastRenderedGroup = null;

        let currentRenderList = [];
        let currentTodayAlgNames = new Set();
        let plannerData = null;
        let renderIndex = 0;
        const BATCH_SIZE = 12;
        let isRendering = false;
        let renderTimer = null;

        function renderBatch() {
            if (renderIndex >= currentRenderList.length) {
                isRendering = false;
                loader.style.display = 'none';
                return;
            }

            const end = Math.min(renderIndex + BATCH_SIZE, currentRenderList.length);
            const fragment = document.createDocumentFragment();
            const useGroups = groupMode === 'category' && groupOrder(categoryFilter.value);

            for (let i = renderIndex; i < end; i++) {
                const item = currentRenderList[i];
                if (useGroups) {
                    const g = algGroup(item);
                    if (g !== lastRenderedGroup) {
                        const header = document.createElement('div');
                        header.className = 'group-header';
                        const count = currentRenderList.filter(x => algGroup(x) === g).length;
                        header.innerHTML = `<span class="group-name">${groupLabel(item.category, g)}</span><span class="group-count">${count} ${count === 1 ? 'case' : 'cases'}</span>`;
                        fragment.appendChild(header);
                        lastRenderedGroup = g;
                    }
                }
                const card = document.createElement('div');
                const state = algState(item.name);   // 'unknown' | 'learning' | 'learned'
                const isLearned = state === 'learned';
                const isTodayGoal = currentTodayAlgNames.has(item.name);
                card.className = `card state-${state}` + (isLearned ? ' learned' : '') + (isTodayGoal ? ' goal-today' : '');
                card.dataset.case = item.name;
                if (isTodayGoal) card.dataset.goalLabel = 'Train today';

                // Apply a saved "main algorithm" choice, if the user picked one
                let algList = [item.main_alg, ...item.alts];
                const savedMain = item.category.startsWith('Megaminx') ? '' : mainChoices[item.name];
                let hasSavedMain = false;
                if (savedMain) {
                    const sIdx = algList.findIndex(a => cleanAlg(a) === savedMain);
                    if (sIdx > 0) {
                        algList = [algList[sIdx], ...algList.slice(0, sIdx), ...algList.slice(sIdx + 1)];
                        hasSavedMain = true;
                    }
                }

                const isF2L = item.category === 'F2L' || item.category === 'AF2L';
                const isPyraLike = item.category.startsWith('Pyraminx') || item.category.startsWith('Megaminx');
                const baseOrient = (isF2L || isPyraLike) ? '' : 'z2';
                // If the entry has no explicit setup, derive it as the inverse
                // of the (cleaned) main algorithm. This auto-fills setups for
                // all the non-3x3 categories.
                const effectiveSetup = (item.setup && item.setup.trim())
                    ? item.setup
                    : inverseAlg(cleanAlg(item.main_alg), { fiveFold: item.category.startsWith('Megaminx') });
                const cat = item.category;
                const puzzleFor = algCategoryPuzzleId(cat);
                const caseSetup = baseOrient ? `${baseOrient} ${effectiveSetup}` : effectiveSetup;
                const esaFor = (yrot) => applyPuzzleViewSetup(puzzleFor, yrot ? `${caseSetup} ${yrot}` : caseSetup);

                const mainEntry = parseAlgEntry(algList[0]);
                const viewRot = mainEntry.yrot;
                const defaultEsa = esaFor(viewRot);

                // Setup row animates solved -> case, ending in the default orientation
                const setupAnim = viewRot ? `${effectiveSetup} ${viewRot}` : effectiveSetup;

                // Choose the puzzle for this case
                // Only show the 2D LL map for 3x3 LL subsets
                const is3x3LL = cat === 'OLL' || cat === 'COLL' || cat === 'PLL';
                const showMap = is3x3LL;
                const stickering2dVal = cat === 'OLL' ? 'OLL' :
                                        cat === 'COLL' ? 'COLL' : 'full';
                const visualMode = prefer2DForCategory(cat) ? '2D' : '';
                const defaultSetupState = defaultEsa;

                let altsHTML = '';
                algList.slice(1).forEach(a => {
                    const alt = parseAlgEntry(a);
                    altsHTML += `<div class="alg alt-alg" data-player="player-${i}" data-anim="${alt.anim}" data-esa="${esaFor(alt.yrot)}">${alt.display}</div>`;
                });
                const referenceLink = item.reference_path ? `
                    <div class="alg-section">
                        <div class="alg-label">Reference</div>
                        <a class="train-quick-btn" href="${escHTML(item.reference_path)}" target="_blank" rel="noopener">Open Local PDF</a>
                    </div>
                ` : '';

                card.innerHTML = `
                    <div class="card-header">
                        <div class="card-title">${item.name}</div>
                        <button class="learned-btn state-${state}">${state === 'learned' ? '✓ Learned' : state === 'learning' ? '◐ Learning' : 'Mark Learning'}</button>
                    </div>
                    <div class="cube-container">
                        <twisty-player
                            id="player-${i}"
                            puzzle="${puzzleFor}"
                            data-default-esa="${defaultEsa}"
                            data-default-setup-state="${escHTML(defaultSetupState)}"
                            alg=""
                            experimental-setup-alg="${defaultEsa}"
                            ${visualMode ? `visualization="${visualMode}"` : ''}
                            background="none"
                            control-panel="none"
                            viewer-link="none">
                        </twisty-player>
                        ${showMap ? `
                        <div class="cube-2d-map">
                            <twisty-player
                                id="player-2d-${i}"
                                puzzle="${puzzleFor}"
                                experimental-stickering="${stickering2dVal}"
                                alg=""
                                experimental-setup-alg="${defaultEsa}"
                                visualization="experimental-2D-LL"
                                background="none"
                                control-panel="none"
                                viewer-link="none">
                            </twisty-player>
                        </div>
                        ` : ''}
                    </div>
                    <div class="alg-section">
                        <div class="alg-label">Setup</div>
                        <div class="alg setup-alg" data-player="player-${i}" data-anim="${setupAnim}" data-esa="${applyPuzzleViewSetup(puzzleFor, baseOrient)}">${effectiveSetup}</div>
                    </div>
                    <div class="alg-section">
                        <div class="alg-label">Main Algorithm</div>
                        <div class="alg main-alg ${hasSavedMain ? 'is-saved-main' : ''}" data-player="player-${i}" data-anim="${mainEntry.anim}" data-esa="${defaultEsa}">${mainEntry.display}</div>
                    </div>
                    ${referenceLink}
                    ${altsHTML ? `
                    <div class="alg-section">
                        <div class="alg-label">Alternative Algorithms</div>
                        <div class="alts-container">
                            ${altsHTML}
                        </div>
                    </div>` : ''}
                `;
                fragment.appendChild(card);
            }

            grid.appendChild(fragment);
            applyDefaultStates(renderIndex, end);
            attachInteractions(renderIndex, end);
            renderIndex = end;

            renderTimer = setTimeout(renderBatch, 50);
        }

        function renderCards() {
            if (renderTimer) clearTimeout(renderTimer);
            grid.innerHTML = '';
            renderIndex = 0;
            isRendering = true;
            loader.style.display = 'block';

            const selectedCat = categoryFilter.value;
            const term = searchInput.value.toLowerCase();

            let list = db.filter(item => {
                const matchCat = item.category === selectedCat;
                const matchTerm = exactAlgNameFilter
                    ? item.name === exactAlgNameFilter
                    : term === '' ||
                                  item.name.toLowerCase().includes(term) ||
                                  item.main_alg.toLowerCase().includes(term) ||
                                  item.alts.some(a => a.toLowerCase().includes(term));
                return matchCat && matchTerm;
            });

            const order = groupOrder(selectedCat);
            if (groupMode === 'category' && order) {
                list.sort((a, b) => {
                    const ga = algGroup(a), gb = algGroup(b);
                    const ia = order.indexOf(ga), ib = order.indexOf(gb);
                    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
                });
            }
            currentRenderList = list;
            currentTodayAlgNames = todaysAlgGoalNames();
            lastRenderedGroup = null;
            renderCatProgress();   // category header + progress bar
            renderBatch();
        }

        // ---- Per-category header: "Learn All" + block progress bar ----
        function renderCatProgress() {
            // Replace or insert the cat-progress block just above the grid
            let bar = document.querySelector('.cat-progress');
            if (bar) bar.remove();

            const cat = categoryFilter.value;
            if (!cat) return;
            // Build the full case list for this category (ignoring search filter)
            const allCases = db.filter(it => it.category === cat);
            if (!allCases.length) return;
            const stateOf = (n) => algState(n);
            const learned  = allCases.filter(it => stateOf(it.name) === 'learned').length;
            const learning = allCases.filter(it => stateOf(it.name) === 'learning').length;
            const total = allCases.length;
            const allLearned = learned === total;

            bar = document.createElement('div');
            bar.className = 'cat-progress';
            bar.dataset.cat = cat;
            bar.innerHTML = `
                <div class="cat-progress-head">
                    <div class="cat-progress-title">
                        <span class="cat-progress-label">${cat}</span>
                        <span class="cat-progress-counts">${learned} learned · ${learning} learning · ${total - learned - learning} to go</span>
                    </div>
                    <div style="display:flex;gap:6px;align-items:center;">
                        <button type="button" class="train-quick-btn" id="cat-make-goal" title="Create a day-by-day learning goal for ${escHTML(cat)}">📅 Set Goal</button>
                        <button type="button" class="train-quick-btn cat-learn-all" id="cat-learn-all" ${allLearned ? 'disabled' : ''}>
                            ${allLearned ? '✓ All learned' : 'Learn all'}
                        </button>
                    </div>
                </div>
                <div class="cat-block-bar">
                    ${allCases.map(it => `<span class="cat-block state-${stateOf(it.name)}" title="${it.name} (${stateOf(it.name)})"></span>`).join('')}
                </div>
            `;
            // Insert before #alg-grid
            algGridEl.parentNode.insertBefore(bar, algGridEl);

            // Wire Learn-all
            const learnAllBtn = document.getElementById('cat-learn-all');
            if (learnAllBtn) {
                learnAllBtn.addEventListener('click', async () => {
                    if (!await window.ucConfirm(`Mark all ${total} ${cat} cases as Learned?`)) return;
                    for (const it of allCases) {
                        learningSet.delete(it.name);
                        learnedSet.add(it.name);
                    }
                    saveLearned();
                    saveLearning();
                    renderCards();
                });
            }
            // Wire Set Goal button
            document.getElementById('cat-make-goal')?.addEventListener('click', () => openAlgGoalModal(cat));
        }

        function applyDefaultPlayerState(player) {
            const setupState = player.getAttribute('data-default-setup-state') || player.getAttribute('data-default-esa') || '';
            player.setAttribute('experimental-setup-alg', setupState);
            player.pause?.();
            player.alg = '';
            player.timestamp = 0;
            requestAnimationFrame(() => {
                try {
                    player.pause?.();
                    player.alg = '';
                    player.timestamp = 0;
                } catch (_) {}
            });
        }

        function applyDefaultStates(startIndex, endIndex) {
            for (let i = startIndex; i < endIndex; i++) {
                const player = document.getElementById(`player-${i}`);
                if (player) applyDefaultPlayerState(player);
            }
        }

        function attachInteractions(startIndex, endIndex) {
            for(let i = startIndex; i < endIndex; i++) {
                const allAlgs = document.querySelectorAll(`.alg.main-alg[data-player="player-${i}"], .alg.alt-alg[data-player="player-${i}"], .alg.setup-alg[data-player="player-${i}"]`);

                allAlgs.forEach(algDiv => {
                    algDiv.addEventListener('mouseenter', async (e) => {
                        const t = e.currentTarget;
                        const player = document.getElementById(t.getAttribute('data-player'));
                        if (!player) return;
                        try {
                            player.setAttribute('experimental-setup-alg', t.getAttribute('data-esa') || '');
                            player.alg = t.getAttribute('data-anim') || '';
                            player.timestamp = 0;
                            await player.play();
                        } catch(err) { console.error(err); }
                    });

                    algDiv.addEventListener('mouseleave', (e) => {
                        const t = e.currentTarget;
                        const player = document.getElementById(t.getAttribute('data-player'));
                        if (!player) return;
                        player.pause();
                        player.timestamp = 0;
                        applyDefaultPlayerState(player);
                    });

                    algDiv.addEventListener('click', (e) => {
                        const t = e.currentTarget;
                        if (t.classList.contains('main-alg') || t.classList.contains('setup-alg')) return;

                        const card = t.closest('.card');
                        const mainDiv = card.querySelector('.main-alg');

                        const cAnim = t.getAttribute('data-anim'), cEsa = t.getAttribute('data-esa'), cTxt = t.innerText;
                        const mAnim = mainDiv.getAttribute('data-anim'), mEsa = mainDiv.getAttribute('data-esa'), mTxt = mainDiv.innerText;

                        mainDiv.setAttribute('data-anim', cAnim);
                        mainDiv.setAttribute('data-esa', cEsa);
                        mainDiv.innerText = cTxt;

                        t.setAttribute('data-anim', mAnim);
                        t.setAttribute('data-esa', mEsa);
                        t.innerText = mTxt;

                        // The new main algorithm defines the card's default orientation
                        const mainPlayer = document.getElementById(mainDiv.getAttribute('data-player'));
                        if (mainPlayer) {
                            mainPlayer.setAttribute('data-default-esa', cEsa);
                            mainPlayer.setAttribute('data-default-setup-state', cEsa || '');
                            applyDefaultPlayerState(mainPlayer);
                        }
                        card.querySelectorAll('.cube-2d-map twisty-player').forEach(player => {
                            player.setAttribute('experimental-setup-alg', cEsa || '');
                            player.alg = '';
                            player.timestamp = 0;
                        });

                        // Persist the chosen main algorithm for this case
                        mainDiv.classList.add('is-saved-main');
                        mainChoices[card.dataset.case] = cTxt;
                        saveMainChoices();
                    });
                });
            }
        }

        categoryFilter.addEventListener('change', () => {
            exactAlgNameFilter = '';
            renderCards();
        });
        searchInput.addEventListener('input', () => {
            exactAlgNameFilter = '';
            renderCards();
        });

        // ---- Cube-picker landing page ----
        // Map each cube tile to its category whitelist (which <option>s stay visible)
        const CUBE_CATS = {
            '3x3':      ['PLL', 'OLL', 'COLL', 'F2L', 'AF2L', 'Winter Variation', 'Summer Variation'],
            '2x2':      ['2x2 CLL', '2x2 EG-1', '2x2 EG-2', '2x2 Ortega OLL', '2x2 Ortega PBL'],
            '4x4':      ['4x4 OLL Parity', '4x4 PLL Parity'],
            '5x5':      ['5x5 L2C', '5x5 L2E'],
            'Pyraminx': ['Pyraminx L4E', 'Pyraminx Last Layer'],
            'Megaminx': ['Megaminx CO', 'Megaminx EO', 'Megaminx CP', 'Megaminx EP']
        };
        const cubePicker  = document.getElementById('cube-picker');
        const learnCtrls  = document.getElementById('learn-controls');
        const algGridEl   = document.getElementById('alg-grid');
        const loaderEl    = document.getElementById('loading-indicator');

        function showCubePicker() {
            cubePicker.style.display  = '';
            learnCtrls.style.display  = 'none';
            algGridEl.style.display   = 'none';
            loaderEl.style.display    = 'none';
            const heading = document.getElementById('cube-picker-heading');
            if (heading) heading.style.display = '';
            // Strip every per-category progress bar (defensive — handles duplicates)
            document.querySelectorAll('.cat-progress').forEach(b => b.remove());
            LS.set('selectedCube', '');
        }
        // Pretty label for each category value (shown in the dropdown)
        const CAT_LABEL = {
            'PLL':'PLL', 'OLL':'OLL', 'COLL':'COLL', 'F2L':'F2L', 'AF2L':'Advanced F2L',
            'Winter Variation':'Winter Variation', 'Summer Variation':'Summer Variation',
            '2x2 CLL':'2x2 CLL', '2x2 EG-1':'2x2 EG-1', '2x2 EG-2':'2x2 EG-2',
            '2x2 Ortega OLL':'2x2 Ortega OLL', '2x2 Ortega PBL':'2x2 Ortega PBL',
            '4x4 OLL Parity':'4x4 OLL Parity', '4x4 PLL Parity':'4x4 PLL Parity',
            '5x5 L2C':'5x5 Last 2 Centers', '5x5 L2E':'5x5 Last 2 Edges',
            'Pyraminx L4E':'Pyraminx L4E', 'Pyraminx Last Layer':'Pyraminx Last Layer',
            'Megaminx CO':'Megaminx CO', 'Megaminx EO':'Megaminx EO',
            'Megaminx CP':'Megaminx CP', 'Megaminx EP':'Megaminx EP'
        };
        function showCubeAlgs(cube) {
            const allowed = CUBE_CATS[cube] || [];
            // Completely rebuild the dropdown — only options for this cube
            categoryFilter.innerHTML = allowed.map(v =>
                `<option value="${v}">${CAT_LABEL[v] || v}</option>`
            ).join('');
            categoryFilter.value = allowed[0] || '';
            cubePicker.style.display = 'none';
            learnCtrls.style.display = '';
            algGridEl.style.display  = '';
            const heading = document.getElementById('cube-picker-heading');
            if (heading) heading.style.display = 'none';
            LS.set('selectedCube', cube);
            renderCards();
        }
        cubePicker.addEventListener('click', (e) => {
            const t = e.target.closest('.cube-tile');
            if (!t) return;
            showCubeAlgs(t.dataset.cube);
        });
        document.getElementById('cube-back-btn')?.addEventListener('click', showCubePicker);

        // On first load, restore previous selection or default to the cube picker
        const _savedCube = LS.get('selectedCube', '');
        if (_savedCube && CUBE_CATS[_savedCube]) {
            showCubeAlgs(_savedCube);
        } else {
            showCubePicker();
        }

        // ---- Group-by toggle on the Algorithms page (Name / Category) ----
        document.querySelectorAll('.group-toggle-btn[data-group]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.group === groupMode);
            btn.addEventListener('click', () => {
                groupMode = btn.dataset.group;
                LS.set('groupMode', groupMode);
                document.querySelectorAll('.group-toggle-btn[data-group]').forEach(b =>
                    b.classList.toggle('active', b.dataset.group === groupMode));
                renderCards();
            });
        });

        // ---- Cycle alg state (event delegation on the grid) ----
        //   unknown → learning → learned → unknown
        grid.addEventListener('click', (e) => {
            const btn = e.target.closest('.learned-btn');
            if (!btn) return;
            const card = btn.closest('.card');
            const name = card.dataset.case;
            cycleAlgState(name);
            const s = algState(name);
            card.classList.remove('state-unknown', 'state-learning', 'state-learned', 'learned');
            card.classList.add('state-' + s);
            if (s === 'learned') card.classList.add('learned');
            btn.classList.remove('state-unknown', 'state-learning', 'state-learned');
            btn.classList.add('state-' + s);
            btn.textContent = s === 'learned' ? '✓ Learned' : s === 'learning' ? '◐ Learning' : 'Mark Learning';
            // Refresh the per-category progress bar if visible
            const catBar = document.querySelector('.cat-progress[data-cat]');
            if (catBar) renderCatProgress();
        });

        // ---- Sidebar navigation (Algorithms / Trainer / Timer / Stats) ----
        const learnView   = document.getElementById('learn-view');
        const trainView   = document.getElementById('train-view');
        const timerView   = document.getElementById('timer-view');
        const battlesView = document.getElementById('battles-view');
        const statsView   = document.getElementById('stats-view');
        const leaderboardView = document.getElementById('leaderboard-view');
        const assistantView = document.getElementById('assistant-view');
        const socialView  = document.getElementById('social-view');
        const planView    = document.getElementById('plan-view');
        const questsView  = document.getElementById('quests-view');
        function activateMode(mode = 'timer') {
            const tab = document.querySelector(`.nav-item[data-mode="${mode}"]`) || document.querySelector('.nav-item[data-mode="timer"]');
            if (!tab) return;
            document.querySelectorAll('.nav-item').forEach(t => t.classList.toggle('active', t === tab));
            mode = tab.dataset.mode;
            document.body.dataset.activeMode = mode;
            const views = {
                learn: learnView,
                train: trainView,
                timer: timerView,
                battles: battlesView,
                plan: planView,
                stats: statsView,
                leaderboard: leaderboardView,
                assistant: assistantView,
                social: socialView,
                quests: questsView
            };
            Object.entries(views).forEach(([k, v]) => {
                const showing = (k === mode);
                if (showing) {
                    v.style.display = '';
                    v.style.animation = 'none';
                    void v.offsetWidth;
                    v.style.animation = '';
                } else {
                    v.style.display = 'none';
                }
            });
            if (mode === 'train' && !trainCaselist.children.length) buildCaselist();
            if (mode === 'timer' && !puzzleStarted) startPuzzle();
            if (mode === 'stats') renderStats();
            if (mode === 'leaderboard') renderLeaderboardPage();
            if (mode === 'assistant') renderAssistantPage();
            if (mode === 'social') renderSocialPage();
            if (mode === 'quests') renderQuests();
            if (mode === 'battles') showBattlesLobby();
            if (mode === 'plan') renderPlanner();
            const fab = document.getElementById('mobile-side-fab');
            if (fab) fab.style.display = (mode === 'timer') ? '' : 'none';
            if (mode !== 'timer') {
                document.querySelector('.timer-side')?.classList.remove('mobile-open');
                document.getElementById('mobile-side-overlay')?.style && (document.getElementById('mobile-side-overlay').style.display = 'none');
            }
        }
        document.querySelectorAll('.nav-item').forEach(tab => {
            tab.addEventListener('click', () => activateMode(tab.dataset.mode));
        });

        // Sidebar collapse toggle (persisted)
        const appSidebar = document.getElementById('app-sidebar');
        // Keep navigation stationary and fully readable while pages scroll.
        appSidebar?.classList.remove('collapsed');
        try { localStorage.removeItem('uc_sidebarCollapsed'); } catch (_) {}

        // ---- Stats page (personal records, distribution, algorithm progress) ----
        const PUZZLES_FOR_STATS = ['222', '333', '444', '555', '666', '777', 'pyram', 'skewb', 'minx', 'sq1', 'clock'];
        const PUZZLE_LABEL = {
            '222': '2x2', '333': '3x3', '444': '4x4', '555': '5x5', '666': '6x6', '777': '7x7',
            'pyram': 'Pyraminx', 'skewb': 'Skewb', 'minx': 'Megaminx', 'sq1': 'Square-1', 'clock': 'Clock'
        };
        const ALG_MASTERY_ORDER = ['333', '222', '444', '555', 'pyram', 'minx'];
        function algMasteryGroups(cube = 'all') {
            const categories = [...new Set(db.map(item => item.category).filter(Boolean))];
            return categories.map(category => {
                const items = db.filter(item => item.category === category);
                const event = algCategoryEventId(category);
                const learned = items.filter(item => learnedSet.has(item.name)).length;
                const learning = items.filter(item => learningSet.has(item.name)).length;
                return {
                    id: category,
                    label: category,
                    event,
                    cubeLabel: PUZZLE_LABEL[event] || eventLabel(event),
                    learned,
                    learning,
                    total: items.length,
                    pct: items.length ? learned / items.length * 100 : 0
                };
            }).filter(group => cube === 'all' || group.event === cube)
                .sort((a, b) => {
                    const eventDelta = ALG_MASTERY_ORDER.indexOf(a.event) - ALG_MASTERY_ORDER.indexOf(b.event);
                    return eventDelta || a.label.localeCompare(b.label);
                });
        }
        function algMasteryCubeOptions() {
            const seen = new Set();
            return algMasteryGroups().filter(group => {
                if (seen.has(group.event)) return false;
                seen.add(group.event);
                return true;
            }).map(group => ({ id: group.event, label: group.cubeLabel }));
        }
        // Distinct colors for puzzle donut segments
        const PUZZLE_COLORS = ['#FF9F0A', '#FF6A00', '#5fe08c', '#5ab0ff', '#c084fc', '#f472b6', '#facc15', '#22d3ee', '#fb923c', '#a78bfa', '#34d399'];

        function statEff(s) { return s.penalty === 'dnf' ? Infinity : (s.penalty === '+2' ? s.t + 2 : s.t); }
        function aoNAll(solves, n) {
            if (solves.length < n) return null;
            const win = solves.slice(-n).map(statEff).sort((a, b) => a - b);
            const mid = win.slice(1, -1);
            if (mid.some(v => v === Infinity)) return Infinity;
            return mid.reduce((a, b) => a + b, 0) / mid.length;
        }
        function bestAoNAll(solves, n) {
            if (solves.length < n) return null;
            let best = Infinity;
            for (let i = 0; i + n <= solves.length; i++) {
                const a = aoNAll(solves.slice(i, i + n), n);
                if (a != null && a !== Infinity && a < best) best = a;
            }
            return best === Infinity ? null : best;
        }
        function fmtTime(v) { return v == null ? '—' : (v === Infinity ? 'DNF' : v.toFixed(2)); }

        function getPuzzleAllSolves(pid) {
            const globalStore = LS.get('sessions_global', null);
            if (globalStore && Array.isArray(globalStore.sessions)) {
                return globalStore.sessions
                    .filter(s => s && s.puzzle === pid)
                    .flatMap(s => s.solves || []);
            }
            // Combine solves across all sessions for a puzzle.
            const store = LS.get('sess_' + pid, null);
            if (store && store.sessions) {
                return store.sessions.flatMap(s => s.solves || []);
            }
            // legacy
            const legacy = LS.get('ptimes_' + pid, []);
            return legacy.map(x => typeof x === 'number' ? { t: x, penalty: 'ok' } : x);
        }

        // ---- Helpers for profile rendering ----
        const MAIN_EVENT_OPTIONS = [
            { id: '222', label: '2x2' }, { id: '333', label: '3x3' }, { id: '444', label: '4x4' },
            { id: '555', label: '5x5' }, { id: '666', label: '6x6' }, { id: '777', label: '7x7' },
            { id: '333oh', label: '3x3 One-Handed' }, { id: '333bf', label: '3x3 Blindfolded' },
            { id: '333fm', label: '3x3 Fewest Moves' },
            { id: 'pyram', label: 'Pyraminx' }, { id: 'skewb', label: 'Skewb' },
            { id: 'minx', label: 'Megaminx' }, { id: 'sq1', label: 'Square-1' }, { id: 'clock', label: 'Clock' },
            { id: '444bf', label: '4x4 BF' }, { id: '555bf', label: '5x5 BF' }, { id: '333mbf', label: '3x3 Multi-BF' }
        ];
        const EVENT_OPTION_GROUPS = [
            { label: 'NxN Cubes', ids: ['222', '333', '444', '555', '666', '777'] },
            { label: '3x3 Disciplines', ids: ['333oh', '333fm'] },
            { label: 'Side Events', ids: ['clock', 'minx', 'pyram', 'skewb', 'sq1'] },
            { label: 'Blindfolded', ids: ['333bf', '444bf', '555bf', '333mbf'] }
        ];
        function groupedEventOptions(selected = '', allowedIds = null) {
            const allowed = allowedIds ? new Set(allowedIds) : null;
            return EVENT_OPTION_GROUPS.map(group => {
                const options = group.ids
                    .map(id => MAIN_EVENT_OPTIONS.find(option => option.id === id))
                    .filter(option => option && (!allowed || allowed.has(option.id)));
                if (!options.length) return '';
                return `<optgroup label="${escHTML(group.label)}">${options.map(option =>
                    `<option value="${option.id}" ${selected === option.id ? 'selected' : ''}>${escHTML(option.label)}</option>`
                ).join('')}</optgroup>`;
            }).join('');
        }
        function eventLabel(id) {
            const e = MAIN_EVENT_OPTIONS.find(x => x.id === id);
            return e ? e.label : id;
        }
        // Build a social link from a handle, @handle, or full URL.
        function socialLink(platform, raw) {
            const v = String(raw || '').trim();
            if (!v) return null;
            if (/^https?:\/\//i.test(v)) return v;
            const handle = v.replace(/^@/, '');
            switch (platform) {
                case 'youtube':   return 'https://www.youtube.com/@' + handle;
                case 'instagram': return 'https://www.instagram.com/' + handle;
                case 'twitter':   return 'https://x.com/' + handle;
                case 'tiktok':    return 'https://www.tiktok.com/@' + handle;
                case 'twitch':    return 'https://www.twitch.tv/' + handle;
            }
            return null;
        }
        // WCA ID format: YYYYNAME## (4 digits + 4 letters + 2 digits)
        function validWcaId(id) { return /^\d{4}[A-Z]{4}\d{2}$/.test(String(id || '').trim()); }
        function escHTML(s) {
            return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        }
        function formatWholeNumber(value) {
            const number = Number(value);
            return Number.isFinite(number) ? Math.round(number).toLocaleString() : '0';
        }
        async function copyText(text) {
            const value = String(text == null ? '' : text).trim();
            if (!value) return false;
            try {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(value);
                    return true;
                }
            } catch (_) {}
            try {
                const ta = document.createElement('textarea');
                ta.value = value;
                ta.setAttribute('readonly', '');
                ta.style.position = 'fixed';
                ta.style.left = '-9999px';
                ta.style.top = '0';
                document.body.appendChild(ta);
                ta.focus();
                ta.select();
                const ok = document.execCommand('copy');
                ta.remove();
                return !!ok;
            } catch (_) {}
            return false;
        }

        let statsFilter = statsFilterDefault();   // 'all' | one of PUZZLES_FOR_STATS
        let algMasteryCube = LS.get('algMasteryCube', 'all');

        // ============================================================
        //   XP + Level system
        //   XP comes from:
        //     • Timer activity: solve XP scales from 1x to 3x as totals grow
        //     • Quest completion: XP shown on each quest card
        //       - Permanent quests (borders/milestones): computed live from conditions
        //       - Daily quests: awarded once per day, stored in profile.dailyQuestLog
        //   Level thresholds scale upward so later levels take more work.
        // ============================================================
        function solveActivityXp(totalSolves) {
            const firstBand = Math.min(totalSolves, 500);
            const secondBand = Math.min(Math.max(totalSolves - 500, 0), 1500);
            const finalBand = Math.max(totalSolves - 2000, 0);
            return firstBand + secondBand * 2 + finalBand * 3;
        }
        function computeXp() {
            const q = questDef();
            const actXp = solveActivityXp(totalSolvesAll());
            // Permanent quest XP (battles unlock + border milestones) — deterministic
            const permanentXp = [...q.battles, ...q.borders].reduce((sum, quest) => {
                const done = (quest.extraDone !== undefined) ? quest.extraDone : (quest.have >= quest.need);
                return sum + (done ? quest.xp : 0);
            }, 0);
            // Daily quest XP — stored in profile
            const dailyXp = Object.values((profile && profile.dailyQuestLog) || {})
                .reduce((a, b) => a + b, 0);
            return actXp + permanentXp + dailyXp;
        }
        function xpForLevel(n) {
            if (n <= 1) return 0;
            let total = 0;
            for (let level = 1; level < n; level++) {
                total += 180 + ((level - 1) * 10);
            }
            return total;
        }
        function levelFromXp(xp) {
            let level = 1;
            while (xp >= xpForLevel(level + 1)) level++;
            return level;
        }
        function levelProgress() {
            const xp = computeXp();
            const lvl = levelFromXp(xp);
            const base = xpForLevel(lvl);
            const next = xpForLevel(lvl + 1);
            const pct = ((xp - base) / (next - base)) * 100;
            return { xp, level: lvl, base, next, pct, into: xp - base, span: next - base };
        }
        function formatXp(value) {
            return `${formatWholeNumber(Math.max(0, Math.round(Number(value) || 0)))} XP`;
        }
        function xpRemaining(progress) {
            return Math.max(0, progress.span - progress.into);
        }
        function xpToNextLevel(progress) {
            return `${formatXp(xpRemaining(progress))} to Level ${progress.level + 1}`;
        }
        function levelName(n) {
            if (n >= 50) return 'Absurd';
            if (n >= 45) return 'Legend';
            if (n >= 40) return 'Champion';
            if (n >= 35) return 'Master';
            if (n >= 30) return 'Elite';
            if (n >= 25) return 'Expert';
            if (n >= 20) return 'Sharpshooter';
            if (n >= 15) return 'Speedcuber';
            if (n >= 10) return 'Competitor';
            if (n >= 5) return 'Solver';
            return 'Rookie';
        }
        // Award daily quest XP (call from renderQuests). Idempotent per day-questId pair.
        function awardDailyQuests(quests) {
            const today = new Date().toISOString().slice(0, 10);
            const awarded = [];
            if (!profile.dailyQuestLog) profile.dailyQuestLog = {};
            quests.forEach(quest => {
                const done = quest.have >= quest.need;
                const key = today + '-' + quest.id;
                if (done && !profile.dailyQuestLog[key]) {
                    profile.dailyQuestLog[key] = quest.xp;
                    awarded.push(quest);
                }
            });
            if (awarded.length) saveProfile();
            return awarded;
        }

        // ============================================================
        //   Quests page
        // ============================================================
        function todaysSolvesAcrossPuzzles() {
            const today = new Date(); today.setHours(0,0,0,0);
            const t0 = today.getTime();
            let n = 0;
            for (const pid of PUZZLES_FOR_STATS) {
                n += getPuzzleAllSolves(pid).filter(s => (s.date || 0) >= t0).length;
            }
            return n;
        }
        function questDef() {
            const totalSolves = totalSolvesAll();
            const today = todaysSolvesAcrossPuzzles();
            const wcaOk = !!(profile && profile.wca_verified);
            const hasMain = !!(profile && profile.main_event);
            const battlesWon = (profile && profile.battlesWon) || 0;
            return {
                daily: [
                    { id:'d-solve-5',    title:'Warm up with 3 solves',       have: today, need: 3,  xp: 4,
                      spotlight:'A quick start that counts on busy days.' },
                    { id:'d-solve-12',   title:'Complete a 10-solve session', have: today, need: 10, xp: 10,
                      spotlight:'Build a useful session without overdoing it.' },
                    { id:'d-solve-25',   title:'Log 20 solves today',         have: today, need: 20, xp: 20,
                      spotlight:'A realistic stretch goal for focused practice.' }
                ],
                battles: [
                    { id:'q-solves-50',  title:'Build a 50-solve foundation',    have: totalSolves, need: 50, xp: 40 },
                    { id:'q-solves-150', title:'Reach 150 total solves',         have: totalSolves, need: 150, xp: 100,
                      desc:'Unlocks the Battles arena.' },
                    { id:'q-wca-link',   title:'Link your WCA profile',          have: wcaOk ? 1 : 0, need: 1, xp: 40 },
                    { id:'q-main-event', title:'Set your main event in Profile', have: hasMain ? 1 : 0, need: 1, xp: 20 }
                ],
                borders: [
                    { id:'b-bronze',    title:'Unlock the Bronze border',     have: totalSolves, need: 25,   xp: 25,   tier:'bronze' },
                    { id:'b-silver',    title:'Unlock the Silver border',     have: totalSolves, need: 100,  xp: 50,   tier:'silver' },
                    { id:'b-gold',      title:'Unlock the Gold border',       have: totalSolves, need: 500,  xp: 150,  tier:'gold' },
                    { id:'b-rainbow',   title:'Unlock the Rainbow border',    have: totalSolves, need: 1000, xp: 300,  tier:'rainbow' },
                    { id:'b-legendary', title:'Unlock the Legendary border',  have: totalSolves, need: 5000, xp: 750,  tier:'legendary',
                      desc:'Earned through 5000 timed solves.', extraDone: totalSolves >= 5000 },
                    { id:'b-win-battle',title:'Win your first battle',        have: battlesWon, need: 1, xp: 50, tier:'battle-champ' }
                ]
            };
        }
        function questTypeLabel(q) {
            if (q.id?.startsWith('d-')) return 'Daily quest';
            if (q.tier) return 'Profile frame';
            return 'Milestone';
        }
        function questMomentumText(q, done) {
            if (done) return 'Completed';
            if (q.have <= 0) return 'Ready to start';
            if (q.need === 1) return 'Not completed yet';
            const left = Math.max(0, q.need - q.have);
            if (left <= 3) return `Closing in: ${left} left`;
            if ((q.have / q.need) >= 0.8) return 'Nearly there';
            return `${left} left`;
        }
        function questIcon(q, done) {
            if (done) return '✓';
            if (q.tier === 'legendary') return '✦';
            if (q.tier === 'rainbow') return '◈';
            if (q.tier === 'gold') return '★';
            if (q.tier === 'silver') return '◆';
            if (q.tier === 'bronze') return '●';
            if (q.id?.includes('battle')) return '⚔';
            if (q.id?.includes('alg')) return '⌁';
            return '⚡';
        }
        function questCard(q) {
            const done = (q.extraDone !== undefined) ? q.extraDone : (q.have >= q.need);
            const pct = Math.min(100, Math.max(0, (q.have / q.need) * 100));
            const haveDisplay = (q.need === 1) ? (done ? '✓' : '–') : `${Math.min(q.have, q.need)} / ${q.need}`;
            return `<div class="quest-card ${done ? 'is-done' : ''}" style="--quest-progress:${pct.toFixed(1)}%">
                <div class="quest-card-head">
                    <div class="quest-card-identity">
                        <span class="quest-card-icon" aria-hidden="true">${questIcon(q, done)}</span>
                        <div>
                            <div class="quest-type">${questTypeLabel(q)}</div>
                            <span class="quest-title">${q.title}</span>
                        </div>
                    </div>
                    <span class="quest-reward">+${formatXp(q.xp)}</span>
                </div>
                ${q.desc ? `<div class="quest-desc">${q.desc}</div>` : ''}
                <div class="quest-progress">
                    <div class="quest-bar"><div class="quest-bar-fill" style="width:${pct.toFixed(1)}%"></div></div>
                    <div class="quest-count">${haveDisplay}</div>
                </div>
                <div class="quest-foot">
                    <span class="quest-momentum">${questMomentumText(q, done)}</span>
                    <span class="quest-percent">${Math.round(pct)}%</span>
                </div>
            </div>`;
        }
        function renderCompactQuestPanels() {
            const q = questDef();
            awardDailyQuests(q.daily);
            const level = levelProgress();
            const active = q.daily.find(quest => quest.have < quest.need) || q.daily[q.daily.length - 1];
            const percent = active ? Math.min(100, (active.have / active.need) * 100) : 100;
            const markup = (context) => `<div class="compact-quest-head"><span>Level ${level.level} · ${levelName(level.level)}</span><button type="button" class="compact-quest-open" data-open-quests>All quests</button></div>
                <div class="compact-quest-title">${active ? escHTML(active.title) : 'Daily quests cleared'}</div>
                <div class="compact-quest-meta"><span>${active ? `${Math.min(active.have, active.need)} / ${active.need}` : '✓'}</span><span>${active ? `+${formatXp(active.xp)}` : xpToNextLevel(level)}</span></div>
                <div class="compact-quest-bar"><i style="width:${percent.toFixed(1)}%"></i></div>
                <div class="compact-quest-tip">${context === 'battle' ? 'Timer solves level you up and unlock the arena.' : 'Every solve moves your level forward.'}</div>`;
            const timerPanel = document.getElementById('timer-quest-panel');
            const battlePanel = document.getElementById('battle-quest-panel');
            if (timerPanel) timerPanel.innerHTML = markup('timer');
            if (battlePanel) battlePanel.innerHTML = markup('battle');
            const rankCard = document.querySelector('.academy-rank-card');
            if (rankCard) {
                const rankName = rankCard.querySelector('.academy-rank-copy strong');
                const rankNote = rankCard.querySelector('.academy-rank-copy small');
                const rankLevel = rankCard.querySelector('.academy-rank-level');
                if (rankName) rankName.textContent = levelName(level.level);
                if (rankNote) rankNote.textContent = level.level >= 50 ? 'Absurd rank achieved' : xpToNextLevel(level);
                if (rankLevel) rankLevel.textContent = level.level;
            }
            document.querySelectorAll('[data-open-quests]').forEach(button => {
                button.onclick = () => activateMode('quests');
            });
        }
        function renderQuests() {
            const q = questDef();
            // Award any newly-completed daily quests before computing XP
            const newAwards = awardDailyQuests(q.daily);
            const lp = levelProgress();
            const nextName = levelName(lp.level + 1);
            const currentName = levelName(lp.level);
            const nextLevelLabel = nextName === currentName
                ? `Level ${lp.level + 1}`
                : `${nextName} · Level ${lp.level + 1}`;

            // XP breakdown for tooltip/display
            const actXp = solveActivityXp(totalSolvesAll());
            const permanentXp = [...q.battles, ...q.borders].reduce((sum, quest) => {
                const done = (quest.extraDone !== undefined) ? quest.extraDone : (quest.have >= quest.need);
                return sum + (done ? quest.xp : 0);
            }, 0);
            const dailyXpTotal = Object.values((profile && profile.dailyQuestLog) || {})
                .reduce((a, b) => a + b, 0);
            const totalXpSources = actXp + permanentXp + dailyXpTotal;
            const timerShare = totalXpSources ? Math.round((actXp / totalXpSources) * 100) : 0;
            const questShare = totalXpSources ? 100 - timerShare : 0;
            const featuredDaily = q.daily.find(quest => {
                return !((quest.extraDone !== undefined) ? quest.extraDone : (quest.have >= quest.need));
            }) || q.daily[q.daily.length - 1];
            const completedPermanent = [...q.battles, ...q.borders]
                .filter(quest => (quest.extraDone !== undefined) ? quest.extraDone : (quest.have >= quest.need)).length;
            const completedDaily = q.daily.filter(quest => (quest.extraDone !== undefined) ? quest.extraDone : (quest.have >= quest.need)).length;
            const totalTracked = q.daily.length + q.battles.length + q.borders.length;
            const totalCompleted = completedPermanent + completedDaily;
            const dailyPercent = featuredDaily ? Math.min(100, Math.max(0, (featuredDaily.have / featuredDaily.need) * 100)) : 0;

            const section = (title, sub, items) => `
                <div class="train-panel quest-section">
                    <div class="panel-title">
                        <span>${title}</span>
                        ${sub ? `<span class="heatmap-sub">${sub}</span>` : ''}
                    </div>
                    <div class="quest-grid">${items.map(questCard).join('')}</div>
                </div>`;

            questsView.innerHTML = `
                <div class="app-page-shell">
                    ${appPageHeading('Quests', 'Build consistent habits with quick daily goals and long-term milestones.')}
                <div class="quests-grid-outer ${newAwards.length ? 'has-new-awards' : ''}">
                    <div class="quest-particles" aria-hidden="true">
                        ${Array.from({length: 14}, (_, i) => `<i style="--i:${i}"></i>`).join('')}
                    </div>
                    <div class="train-panel quest-hero">
                        <div class="quest-cubey-stage" aria-hidden="true">
                            <div class="quest-cubey-orbit"><i></i><i></i><i></i></div>
                            <div class="quest-cubey">
                                <img class="quest-cubey-art" src="assets/cubey.svg" alt="">
                            </div>
                        </div>
                        <div class="quest-hero-head">
                            <div>
                                <div class="quest-hero-eyebrow">Your Progress</div>
                                <div class="quest-hero-level">
                                    <span class="quest-lvl-num">Level ${lp.level}</span>
                                    <span class="quest-lvl-name">${levelName(lp.level)}</span>
                                </div>
                            </div>
                            <div style="text-align:right;">
                                <div class="quest-hero-xp">${formatWholeNumber(lp.into)} / ${formatXp(lp.span)}</div>
                                <div class="quest-xp-next">${formatXp(xpRemaining(lp))} remaining</div>
                            </div>
                        </div>
                        <div class="xp-bar large"><div class="xp-bar-fill" style="width:${Math.min(100,Math.max(0,lp.pct)).toFixed(1)}%"></div></div>
                        <div class="quest-hero-foot">
                            <span>Progress to <b>${nextLevelLabel}</b></span>
                            <span class="quest-xp-breakdown">
                                <span title="Share of progress earned from timer activity">From timer: ${timerShare}%</span>
                                <span title="Share of progress earned from completed quests">From quests: ${questShare}%</span>
                            </span>
                        </div>
                    </div>
                    <div class="quest-highlight-grid">
                        <div class="train-panel quest-spotlight">
                            <div class="quest-spotlight-top">
                                <span class="quest-spotlight-label">Featured Daily</span>
                                ${featuredDaily ? `<span class="quest-reward">+${formatXp(featuredDaily.xp)}</span>` : ''}
                            </div>
                            ${featuredDaily ? `
                                <div class="quest-spotlight-title">${featuredDaily.title}</div>
                                <div class="quest-spotlight-desc">${featuredDaily.spotlight || featuredDaily.desc || 'Stay in motion and keep the streak alive.'}</div>
                                <div class="quest-spotlight-progress">
                                    <div class="quest-bar"><div class="quest-bar-fill" style="width:${dailyPercent.toFixed(1)}%"></div></div>
                                    <div class="quest-count">${featuredDaily.need === 1 ? (((featuredDaily.extraDone !== undefined) ? featuredDaily.extraDone : (featuredDaily.have >= featuredDaily.need)) ? '✓' : '–') : `${Math.min(featuredDaily.have, featuredDaily.need)} / ${featuredDaily.need}`}</div>
                                </div>
                                <div class="quest-spotlight-tip">${questMomentumText(featuredDaily, (featuredDaily.extraDone !== undefined) ? featuredDaily.extraDone : (featuredDaily.have >= featuredDaily.need))}</div>
                            ` : `<div class="quest-spotlight-desc">No daily quests loaded right now.</div>`}
                        </div>
                        <div class="quest-stat-grid">
                            <div class="train-panel quest-stat-card">
                                <div class="quest-stat-label">Quest Clears</div>
                                <div class="quest-stat-value">${totalCompleted}<span>/${totalTracked}</span></div>
                                <div class="quest-stat-note">Completed across daily, milestone, and border tracks.</div>
                            </div>
                            <div class="train-panel quest-stat-card">
                                <div class="quest-stat-label">Today&apos;s Momentum</div>
                                <div class="quest-stat-value">${completedDaily}<span>/${q.daily.length}</span></div>
                                <div class="quest-stat-note">Daily quests already cashed in for XP.</div>
                            </div>
                            <div class="train-panel quest-stat-card">
                                <div class="quest-stat-label">Big Unlocks</div>
                                <div class="quest-stat-value">${completedPermanent}</div>
                                <div class="quest-stat-note">Permanent milestones and cosmetics earned so far.</div>
                            </div>
                        </div>
                    </div>
                    ${section('Daily Quests', 'Auto-awarded at completion', q.daily)}
                    ${section('Milestones', 'Permanent progress rewards', q.battles)}
                    ${section('Border Unlocks', 'Cosmetic profile frames', q.borders)}
                </div>
                </div>
            `;
            renderCompactQuestPanels();
        }

        // ---- Solve frequency heatmap (last 12 months, GitHub-style grid) ----
        function aggregateSolvesByDay() {
            const byDay = {};
            for (const pid of PUZZLES_FOR_STATS) {
                for (const s of getPuzzleAllSolves(pid)) {
                    if (!s.date) continue;
                    const d = new Date(s.date);
                    d.setHours(0, 0, 0, 0);
                    const key = d.getTime();
                    byDay[key] = (byDay[key] || 0) + 1;
                }
            }
            return byDay;
        }
        function buildSolveHeatmap() {
            const byDay = aggregateSolvesByDay();
            const today = new Date(); today.setHours(0,0,0,0);
            // Start 52 weeks ago, snapped to Sunday for column alignment
            const start = new Date(today);
            start.setDate(start.getDate() - 364);
            const dayOfWeek = start.getDay();   // 0 = Sunday
            start.setDate(start.getDate() - dayOfWeek);   // Snap to Sunday

            // Determine max count for color scaling
            let maxCount = 0;
            for (const k in byDay) if (byDay[k] > maxCount) maxCount = byDay[k];

            // Build 53 columns × 7 rows
            const weeks = 53;
            let html = '<div class="heatmap-grid">';
            for (let w = 0; w < weeks; w++) {
                html += '<div class="heatmap-col">';
                for (let d = 0; d < 7; d++) {
                    const date = new Date(start);
                    date.setDate(start.getDate() + w * 7 + d);
                    if (date > today) {
                        html += '<div class="heatmap-cell future"></div>';
                        continue;
                    }
                    const c = byDay[date.getTime()] || 0;
                    let lvl = 0;
                    if (c > 0) {
                        if (maxCount <= 1) lvl = 1;
                        else if (c >= maxCount * 0.75) lvl = 4;
                        else if (c >= maxCount * 0.5)  lvl = 3;
                        else if (c >= maxCount * 0.25) lvl = 2;
                        else lvl = 1;
                    }
                    const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
                    html += `<div class="heatmap-cell lvl-${lvl}" title="${dateStr}: ${c} solve${c === 1 ? '' : 's'}"></div>`;
                }
                html += '</div>';
            }
            html += '</div>';
            // Legend
            html += '<div class="heatmap-legend"><span>Less</span>'
                + '<span class="heatmap-cell lvl-0"></span>'
                + '<span class="heatmap-cell lvl-1"></span>'
                + '<span class="heatmap-cell lvl-2"></span>'
                + '<span class="heatmap-cell lvl-3"></span>'
                + '<span class="heatmap-cell lvl-4"></span>'
                + '<span>More</span></div>';
            return html;
        }

        function appPageHeading(title, sub, actions = '') {
            return `<div class="page-heading app-page-heading">
                <div>
                    <h1 class="page-title">${escHTML(title)}</h1>
                    <p class="page-sub">${escHTML(sub)}</p>
                </div>
                ${actions ? `<div class="app-page-actions">${actions}</div>` : ''}
            </div>`;
        }
        function bindLeaderboardControls() {
            function refreshLeaderboardFromControls() {
                leaderboardPrefs.event = document.getElementById('leaderboard-event')?.value || '333';
                leaderboardPrefs.type = document.getElementById('leaderboard-type')?.value || 'single';
                leaderboardPrefs.country = (document.getElementById('leaderboard-country')?.value || '').trim();
                saveLeaderboardPrefs();
                loadWcaLeaderboard();
            }
            document.getElementById('leaderboard-refresh')?.addEventListener('click', refreshLeaderboardFromControls);
            document.getElementById('leaderboard-event')?.addEventListener('change', refreshLeaderboardFromControls);
            document.getElementById('leaderboard-type')?.addEventListener('change', refreshLeaderboardFromControls);
            document.getElementById('leaderboard-country')?.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    refreshLeaderboardFromControls();
                }
            });
        }
        function assistantKeySource() {
            return openRouterConfig?.apiKey ? 'config' : (getAssistantApiKey() ? 'browser' : 'missing');
        }
        function assistantBackendUrl() {
            return String(openRouterConfig?.backendUrl || '/api/assistant').trim();
        }
        function leaderboardBackendUrl() {
            return String(openRouterConfig?.leaderboardBackendUrl || '/api/leaderboard').trim();
        }
        function wcaMetaBackendUrl() {
            return String(openRouterConfig?.wcaMetaBackendUrl || '/api/wca-meta').trim();
        }
        function leaderboardDirectBaseUrl() {
            return String(openRouterConfig?.leaderboardDirectBaseUrl || 'https://raw.githubusercontent.com/robiningelbrecht/wca-rest-api/refs/heads/v1').trim().replace(/\/$/, '');
        }
        function assistantModelLabel(id) {
            return ASSISTANT_MODELS.find(m => m.id === id)?.label || id;
        }
        function assistantKeyStatusText() {
            const source = assistantKeySource();
            if (source === 'config') return 'Cubey is connected and ready.';
            if (source === 'browser') return 'Cubey is connected on this device.';
            return 'Cubey will work once your assistant connection is set up.';
        }
        function slugifyCompetitionName(value) {
            return String(value || '')
                .toLowerCase()
                .replace(/&/g, ' and ')
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '')
                .slice(0, 90);
        }
        function competitionCommandText(comp) {
            const wcaId = String(profile.wca_id || '').trim().toUpperCase();
            const slug = slugifyCompetitionName(comp?.name || comp?.id || 'competition');
            return `/competition:${slug}:${wcaId}`;
        }
        function isCompetitionCommand(value) {
            return /^\/(?:competition|competion)(?=\s|:|$)/i.test(String(value || '').trim());
        }
        function normalizeCompetitionCommand(value) {
            return String(value || '').replace(/^\/competion(?=\s|:|$)/i, '/competition');
        }
        function parseCompetitionCommand(value) {
            const normalized = normalizeCompetitionCommand(value).trim();
            const match = normalized.match(/^\/competition(?:\:([^:\s]+))?(?:\:([A-Za-z0-9]+))?(?:\s|$)/i);
            return match ? {
                slug: String(match[1] || '').toLowerCase(),
                wcaId: String(match[2] || '').toUpperCase()
            } : null;
        }
        function competitionEventSummary(comp) {
            const registered = Array.isArray(comp?.registered_event_ids) ? comp.registered_event_ids : [];
            if (registered.length) return registered.join(', ');
            const status = String(comp?.registration_status || '').toLowerCase();
            if (status.includes('wait')) return 'Waitlisted · events not publicly available';
            if (status.includes('pending')) return 'Registration pending · events not publicly available';
            return 'Registered events unavailable';
        }
        function competitionOverviewText(comps) {
            if (!Array.isArray(comps) || !comps.length) {
                return 'No upcoming registered WCA competitions were found for your linked WCA ID.';
            }
            return [
                '**Your upcoming WCA competitions**',
                ...comps.slice(0, 8).map((comp, index) => {
                    const location = [comp.city, comp.country_iso2].filter(Boolean).join(', ');
                    return `${index + 1}. **${comp.name || 'Competition'}** — ${comp.start_date || 'date TBA'}${location ? ` · ${location}` : ''} · ${competitionEventSummary(comp)}`;
                }),
                '',
                'Choose a competition card to ask Cubey for event-specific preparation.'
            ].join('\n');
        }
        function competitionCommandHint(comp) {
            return `${comp?.name || 'Competition'} · ${competitionEventSummary(comp)}`;
        }
        function regionMetaCandidates() {
            const countries = Array.isArray(window.__ucWcaMeta?.countries) ? window.__ucWcaMeta.countries : [];
            const continents = Array.isArray(window.__ucWcaMeta?.continents) ? window.__ucWcaMeta.continents : [];
            return { countries, continents };
        }
        function normalizeRegionKey(value) {
            return String(value || '')
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/&/g, 'and')
                .replace(/[^a-z0-9]+/g, '');
        }
        function buildRegionAliasMap() {
            const map = new Map();
            map.set('world', 'world');
            map.set('worldwide', 'world');
            map.set('global', 'world');

            const continentAliases = {
                africa: ['africa'],
                asia: ['asia'],
                europe: ['europe'],
                oceania: ['oceania'],
                'north-america': ['northamerica', 'north-america', 'north america', 'na'],
                'south-america': ['southamerica', 'south-america', 'south america', 'sa']
            };
            Object.entries(continentAliases).forEach(([target, aliases]) => {
                aliases.forEach(alias => map.set(normalizeRegionKey(alias), target));
            });

            const countryAliases = {
                US: ['usa', 'unitedstates', 'unitedstatesofamerica', 'america'],
                GB: ['uk', 'unitedkingdom', 'greatbritain', 'britain'],
                AE: ['uae', 'unitedarabemirates'],
                KR: ['southkorea', 'republicofkorea'],
                KP: ['northkorea', 'democraticpeoplesrepublicofkorea'],
                CZ: ['czechia', 'czechrepublic'],
                TW: ['taiwan', 'chinesetaipei'],
                HK: ['hongkong'],
                MO: ['macao', 'macau'],
                RU: ['russia', 'russianfederation'],
                VN: ['vietnam'],
                LA: ['laos', 'laopeoplesdemocraticrepublic'],
                VE: ['venezuela', 'bolivarianrepublicofvenezuela'],
                IR: ['iran', 'islamicrepublicofiran'],
                SY: ['syria', 'syrianarabrepublic'],
                TZ: ['tanzania', 'unitedrepublicoftanzania'],
                MD: ['moldova', 'republicofmoldova'],
                BO: ['bolivia', 'plurinationalstateofbolivia'],
                BN: ['brunei', 'bruneidarussalam']
            };
            Object.entries(countryAliases).forEach(([target, aliases]) => {
                aliases.forEach(alias => map.set(normalizeRegionKey(alias), target));
            });

            const { countries, continents } = regionMetaCandidates();
            continents.forEach(item => {
                const id = String(item.id || '').trim();
                const name = String(item.name || '').trim();
                if (!id) return;
                [id, name].filter(Boolean).forEach(alias => map.set(normalizeRegionKey(alias), id.toLowerCase()));
            });
            countries.forEach(item => {
                const id = String(item.id || '').trim().toUpperCase();
                const name = String(item.name || '').trim();
                const iso2 = String(item.iso2 || item.id || '').trim().toUpperCase();
                [id, iso2, name].filter(Boolean).forEach(alias => map.set(normalizeRegionKey(alias), id));
            });
            return map;
        }
        function leaderboardRegionValue() {
            const raw = String(leaderboardPrefs.country || '').trim();
            if (!raw) return 'world';
            const aliasMap = buildRegionAliasMap();
            const normalized = normalizeRegionKey(raw);
            if (aliasMap.has(normalized)) return aliasMap.get(normalized);
            if (/^[a-z]{2}$/i.test(raw)) return raw.toUpperCase();
            return raw.toLowerCase();
        }
        function formatWcaRankValue(raw, type) {
            const n = Number(raw);
            if (!Number.isFinite(n) || n <= 0) return '—';
            if (type === 'single' || type === 'average') return (n / 100).toFixed(2);
            return String(n);
        }
        function formatRankCell(raw) {
            const n = Number(raw);
            return Number.isFinite(n) && n > 0 ? String(n) : '—';
        }
        function countryDisplayName(code) {
            const raw = String(code || '').trim();
            if (!raw) return '—';
            const countries = Array.isArray(window.__ucWcaMeta?.countries) ? window.__ucWcaMeta.countries : [];
            const match = countries.find(item => String(item.id || '').toUpperCase() === raw.toUpperCase() || String(item.iso2 || '').toUpperCase() === raw.toUpperCase());
            return match ? `${match.name} (${match.id})` : raw;
        }
        function continentDisplayName(id) {
            const raw = String(id || '').trim();
            if (!raw) return 'World';
            const continents = Array.isArray(window.__ucWcaMeta?.continents) ? window.__ucWcaMeta.continents : [];
            const match = continents.find(item => String(item.id || '').toLowerCase() === raw.toLowerCase());
            return match?.name || raw;
        }
        function leaderboardRankScope(region) {
            const raw = String(region || '').trim().toLowerCase();
            if (!raw || raw === 'world') return 'world';
            if (['africa', 'asia', 'europe', 'north-america', 'south-america', 'oceania'].includes(raw)) return 'continent';
            return 'country';
        }
        function leaderboardPrimaryRankLabel(region) {
            const scope = leaderboardRankScope(region);
            if (scope === 'world') return 'WR';
            if (scope === 'continent') return 'CR';
            return 'NR';
        }
        function leaderboardRegionLabel(region) {
            const scope = leaderboardRankScope(region);
            if (scope === 'world') return 'World';
            if (scope === 'continent') return continentDisplayName(region);
            return countryDisplayName(region);
        }
        async function fetchLeaderboardDirect(region) {
            const base = leaderboardDirectBaseUrl();
            const rankUrl = `${base}/rank/${encodeURIComponent(region)}/${encodeURIComponent(leaderboardPrefs.type)}/${encodeURIComponent(leaderboardPrefs.event)}.json`;
            const resp = await fetch(rankUrl);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            const top = Array.isArray(data?.items) ? data.items.slice(0, 250) : [];
            const rankScope = leaderboardRankScope(region);
            const normalizedRegion = String(region || '').trim().toUpperCase();
            const people = await Promise.all(top.map(async (item) => {
                try {
                    const personResp = await fetch(`${base}/persons/${encodeURIComponent(item.personId)}.json`);
                    if (!personResp.ok) return null;
                    const person = await personResp.json();
                    return {
                        id: item.personId,
                        name: person?.name || item.personId,
                        country: person?.country || '',
                        wcaUrl: `https://www.worldcubeassociation.org/persons/${encodeURIComponent(item.personId)}`
                    };
                } catch (_) {
                    return null;
                }
            }));
            const personMap = new Map(people.filter(Boolean).map(p => [p.id, p]));
            return top.map(item => {
                const person = personMap.get(item.personId);
                const worldRank = formatRankCell(item?.rank?.world);
                const continentRank = formatRankCell(item?.rank?.continent);
                const countryRank = formatRankCell(item?.rank?.country);
                return {
                    rank: rankScope === 'world' ? worldRank : (rankScope === 'continent' ? continentRank : countryRank),
                    worldRank,
                    continentRank,
                    countryRank,
                    result: formatWcaRankValue(item.best, leaderboardPrefs.type),
                    person: person?.name || item.personId,
                    country: person?.country || '',
                    personId: item.personId,
                    wcaUrl: person?.wcaUrl || `https://www.worldcubeassociation.org/persons/${encodeURIComponent(item.personId)}`
                };
            }).filter(row => rankScope !== 'country' || String(row.country || '').trim().toUpperCase() === normalizedRegion);
        }
        async function fetchWcaMetaDirect() {
            const base = leaderboardDirectBaseUrl();
            const [countriesResp, continentsResp, eventsResp] = await Promise.all([
                fetch(`${base}/countries.json`),
                fetch(`${base}/continents.json`),
                fetch(`${base}/events.json`)
            ]);
            if (!countriesResp.ok || !continentsResp.ok || !eventsResp.ok) {
                throw new Error('Could not load WCA metadata.');
            }
            const [countriesData, continentsData, eventsData] = await Promise.all([
                countriesResp.json(),
                continentsResp.json(),
                eventsResp.json()
            ]);
            return {
                countries: Array.isArray(countriesData?.items) ? countriesData.items.map(item => ({
                    id: String(item?.id || item?.iso2 || item?.iso2Code || '').trim(),
                    name: String(item?.name || '').trim(),
                    iso2: String(item?.iso2 || item?.iso2Code || item?.id || '').trim()
                })).filter(item => item.id && item.name) : [],
                continents: Array.isArray(continentsData?.items) ? continentsData.items.map(item => ({
                    id: String(item?.id || '').trim(),
                    name: String(item?.name || '').trim()
                })).filter(item => item.id && item.name) : [],
                events: Array.isArray(eventsData?.items) ? eventsData.items.map(item => ({
                    id: String(item?.id || '').trim(),
                    name: String(item?.name || '').trim()
                })).filter(item => item.id && item.name) : []
            };
        }
        function applyWcaMetaToLeaderboard() {
            const list = document.getElementById('leaderboard-region-list');
            if (!list) return;
            const { countries, continents } = regionMetaCandidates();
            const staticOptions = [
                { value: 'world', label: 'World' },
                ...continents.map(item => ({ value: item.name, label: `${item.name} (${item.id})` })),
                ...countries.map(item => ({ value: item.name, label: `${item.name} (${item.id})` }))
            ];
            list.innerHTML = staticOptions.map(item =>
                `<option value="${escHTML(item.value)}">${escHTML(item.label)}</option>`
            ).join('');
        }
        async function ensureWcaMetaLoaded() {
            if (window.__ucWcaMeta) {
                applyWcaMetaToLeaderboard();
                return window.__ucWcaMeta;
            }
            try {
                const resp = await fetch(wcaMetaBackendUrl());
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                window.__ucWcaMeta = await resp.json();
            } catch (_) {
                window.__ucWcaMeta = await fetchWcaMetaDirect();
            }
            applyWcaMetaToLeaderboard();
            return window.__ucWcaMeta;
        }
        function bindAssistantComposer(renderFn) {
            renderAssistantHistory();
            const assistantInput = document.getElementById('assistant-input');
            const assistantStatus = document.getElementById('assistant-key-status');
            if (assistantStatus) assistantStatus.textContent = assistantKeyStatusText();
            function updateCompetitionPicker() {
                const box = document.getElementById('assistant-comp-picker');
                if (!box || !assistantInput) return;
                const raw = assistantInput.value || '';
                const wantsComp = isCompetitionCommand(raw);
                const comps = Array.isArray(window.__ucUpcomingComps) ? window.__ucUpcomingComps : [];
                if (!wantsComp) {
                    box.style.display = 'none';
                    box.innerHTML = '';
                    return;
                }
                box.style.display = '';
                if (!profile.wca_id) {
                    box.innerHTML = `<div class="assistant-comp-picker-empty">Link your WCA account first to use competition-specific prep.</div>`;
                    return;
                }
                if (window.__ucUpcomingCompsLoading) {
                    box.innerHTML = `<div class="assistant-comp-picker-empty">Checking your upcoming WCA competitions…</div>`;
                    return;
                }
                if (!comps.length) {
                    box.innerHTML = `<div class="assistant-comp-picker-empty">${escHTML(window.__ucUpcomingCompsError || 'No upcoming registered competitions found for your linked WCA account yet.')}</div>`;
                    return;
                }
                box.innerHTML = `
                    <div class="assistant-comp-picker-head">
                        <span>Choose a competition</span>
                        <span class="assistant-model-pill">WCA linked</span>
                    </div>
                    <div class="assistant-comp-picker-grid">
                        ${comps.map(comp => `
                            <button class="assistant-comp-card" data-comp-command="${escHTML(competitionCommandText(comp))}">
                                <span class="assistant-comp-card-name">${escHTML(comp.name || 'Competition')}</span>
                                <span class="assistant-comp-card-meta">${escHTML((comp.start_date || '').slice(0, 10))}${comp.city ? ` · ${escHTML(comp.city)}` : ''}</span>
                                <span class="assistant-comp-card-events">${escHTML(competitionEventSummary(comp))}</span>
                            </button>
                        `).join('')}
                    </div>
                `;
                box.querySelectorAll('[data-comp-command]').forEach(btn => {
                    btn.addEventListener('click', () => {
                        assistantInput.value = `${btn.getAttribute('data-comp-command') || '/competition'} `;
                        assistantInput.focus();
                        assistantInput.setSelectionRange(assistantInput.value.length, assistantInput.value.length);
                        updateCompetitionPicker();
                    });
                });
            }
            document.querySelectorAll('[data-assistant-starter]').forEach(btn => {
                btn.addEventListener('click', () => {
                    if (!assistantInput) return;
                    assistantInput.value = btn.getAttribute('data-assistant-starter') || '';
                    assistantInput.focus();
                    assistantInput.setSelectionRange(assistantInput.value.length, assistantInput.value.length);
                    updateCompetitionPicker();
                });
            });
            document.getElementById('assistant-model-select')?.addEventListener('change', (e) => {
                assistantPrefs.model = e.target.value || DEFAULT_ASSISTANT_MODEL;
                saveAssistantPrefs();
                renderFn();
            });
            document.getElementById('assistant-set-key')?.addEventListener('click', async () => {
                const current = getAssistantApiKey() || openRouterConfig?.apiKey || '';
                const next = await window.ucPrompt('Paste your OpenRouter API key. It will be stored locally in this browser unless you use openrouter-config.js.', current || '', { title: 'OpenRouter API key', secret: true, confirmLabel: 'Save key' });
                if (next == null) return;
                setAssistantApiKey(next);
                renderFn();
            });
            document.getElementById('assistant-clear-chat')?.addEventListener('click', () => {
                assistantPrefs.history = [];
                saveAssistantPrefs();
                renderAssistantHistory();
            });
            async function submitAssistantPrompt() {
                if (!assistantInput) return;
                const raw = normalizeCompetitionCommand(assistantInput.value.trim());
                if (!raw) return;
                assistantPrefs.history.push({ role: 'user', content: raw });
                assistantPrefs.history = assistantPrefs.history.slice(-10);
                saveAssistantPrefs();
                assistantPending = true;
                renderAssistantHistory();
                assistantInput.value = '';
                updateCompetitionPicker();
                const sendBtn = document.getElementById('assistant-send');
                if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = 'Thinking'; }
                try {
                    let reply;
                    const command = parseCompetitionCommand(raw);
                    if (command?.wcaId && command.wcaId !== String(profile.wca_id || '').toUpperCase()) {
                        reply = 'That command belongs to a different WCA account. Type /competition and choose a competition from your own linked account.';
                    } else if (isCompetitionCommand(raw) && !profile.wca_id) {
                        reply = 'Link and verify your WCA ID in Profile first. Then `/competition` can check your upcoming registered competitions.';
                    } else if (isCompetitionCommand(raw) && !currentCompetitionChoice(raw)) {
                        const comps = await loadUpcomingComps(profile.wca_id);
                        const selected = currentCompetitionChoice(raw);
                        if (selected) reply = await askCubingAssistant(raw);
                        else {
                            reply = comps === null
                                ? (window.__ucUpcomingCompsError || 'I could not check WCA competitions right now. Please try again in a moment.')
                                : competitionOverviewText(comps);
                        }
                    } else {
                        reply = await askCubingAssistant(raw);
                    }
                    assistantPrefs.history.push({ role: 'assistant', content: reply });
                    assistantPrefs.history = assistantPrefs.history.slice(-10);
                    saveAssistantPrefs();
                } catch (err) {
                    assistantPrefs.history.push({ role: 'assistant', content: `Error: ${err.message || err}` });
                    saveAssistantPrefs();
                } finally {
                    assistantPending = false;
                    renderAssistantHistory();
                    if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = 'Send'; }
                }
            }
            document.getElementById('assistant-send')?.addEventListener('click', submitAssistantPrompt);
            assistantInput?.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    submitAssistantPrompt();
                }
            });
            assistantInput?.addEventListener('input', updateCompetitionPicker);
            updateCompetitionPicker();
        }
        function renderLeaderboardPage() {
            leaderboardView.innerHTML = `
                <div class="app-page-shell">
                    ${appPageHeading('WCA Leaderboard', 'Browse current WCA rankings by event, result type, and region.')}
                    <div class="train-panel stats-leaderboard stats-fullwidth">
                        <div class="panel-title">
                            <span>Official Rankings</span>
                            <span class="assistant-model-pill">WCA</span>
                        </div>
                        <div class="leaderboard-toolbar">
                            <select id="leaderboard-event" class="stats-filter-select">
                                ${groupedEventOptions(leaderboardPrefs.event, MAIN_EVENT_OPTIONS.filter(o => o.id !== '333mbf').map(o => o.id))}
                            </select>
                            <select id="leaderboard-type" class="stats-filter-select">
                                <option value="single" ${leaderboardPrefs.type === 'single' ? 'selected' : ''}>Single</option>
                                <option value="average" ${leaderboardPrefs.type === 'average' ? 'selected' : ''}>Average / Mean</option>
                            </select>
                            <input id="leaderboard-country" class="pe-input leaderboard-country" type="text" maxlength="32" list="leaderboard-region-list" placeholder="world, europe, India, US..." value="${escHTML(leaderboardPrefs.country || '')}">
                            <datalist id="leaderboard-region-list"></datalist>
                            <button class="train-quick-btn" id="leaderboard-refresh">Refresh</button>
                        </div>
                        <div id="wca-leaderboard-body"></div>
                    </div>
                </div>
            `;
            bindLeaderboardControls();
            ensureWcaMetaLoaded().catch(() => {});
            loadWcaLeaderboard();
        }
        function renderAssistantPage() {
            const recentSolveCount = recentSolveSummary(150).length;
            const learnedCount = learnedSet.size;
            const activeGoalCount = (plannerData.algGoals || []).length + (plannerData.plans || []).length;
            assistantView.innerHTML = `
                <div class="app-page-shell assistant-page-shell">
                    <div class="assistant-chat-shell">
                        <div class="assistant-chat-head assistant-hero-card">
                            <div class="assistant-hero-main">
                                <div class="assistant-empty-mark assistant-hero-orb">C</div>
                                <div>
                                    <div class="assistant-chat-title">Cubey <span class="assistant-beta-badge">Beta</span></div>
                                    <div class="assistant-chat-sub">Ask for solve reviews, comp prep, nerves help, packing lists, and practice plans built from your cubing data.</div>
                                </div>
                            </div>
                            <div class="assistant-hero-stats">
                                <span><b>${recentSolveCount}</b> recent solves</span>
                                <span><b>${learnedCount}</b> algs learned</span>
                                <span><b>${activeGoalCount}</b> active goals</span>
                            </div>
                        </div>
                        <div class="assistant-toolbar assistant-chat-toolbar">
                            <span class="assistant-command-hint">Type <code>/competition</code> to choose an upcoming comp</span>
                            <button class="train-quick-btn" id="assistant-clear-chat">Clear Chat</button>
                        </div>
                        <div class="assistant-key-status" id="assistant-key-status"></div>
                        <div class="assistant-chat-panel">
                            <div class="assistant-history assistant-chat-history" id="cubing-assistant-history"></div>
                            <div class="assistant-compose assistant-chat-compose">
                                <div class="assistant-compose-main">
                                    <textarea id="assistant-input" class="pe-input assistant-input assistant-chat-input" rows="2" placeholder="Message Cubey, or type /competition to choose a comp..."></textarea>
                                    <div class="assistant-comp-picker" id="assistant-comp-picker" style="display:none;"></div>
                                    <div class="assistant-compose-actions">
                                        <span class="assistant-compose-model">Cubey is AI and can make mistakes.</span>
                                        <button class="train-cta assistant-send-btn" id="assistant-send">Send</button>
                                    </div>
                                </div>
                                <div class="assistant-suggestion-row">
                                    <button class="assistant-suggestion-pill" data-assistant-starter="Review my recent 3x3 solves and tell me my top 3 priorities.">Review Solves</button>
                                    <button class="assistant-suggestion-pill" data-assistant-starter="Build me a focused 30 minute practice session for today.">Build Practice</button>
                                    <button class="assistant-suggestion-pill" data-assistant-starter="Help me choose what alg set to improve next.">Alg Focus</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            bindAssistantComposer(renderAssistantPage);
            if (profile.wca_id) {
                loadUpcomingComps(profile.wca_id).then(() => {
                    document.getElementById('assistant-input')?.dispatchEvent(new Event('input'));
                });
            }
        }
        function socialModeActive() {
            return socialView && socialView.style.display !== 'none';
        }
        function updateSocialNotificationDot() {
            const dot = document.getElementById('social-notification-dot');
            if (!dot) return;
            const count = (socialHubState.incoming?.length || 0) +
                (socialHubState.invites?.length || 0) +
                Number(socialHubState.unreadChatCount || 0) +
                Number(socialHubState.incomingCallCount || 0);
            dot.hidden = !fbSync.getUser() || count === 0;
            dot.dataset.count = count > 9 ? '9+' : String(count);
            dot.setAttribute('aria-label', `${count} new social notification${count === 1 ? '' : 's'}`);
        }
        function socialSelectedFriendUid() {
            const valid = (socialHubState.friends || []).some(item => item.id === socialPrefs.selectedFriendUid);
            if (!valid) socialPrefs.selectedFriendUid = socialHubState.friends?.[0]?.id || '';
            return socialPrefs.selectedFriendUid || '';
        }
        function socialAvatarMarkup(profileData, size = 'md') {
            const src = escHTML(profileData?.photoURL || 'default-user-image.png');
            const label = escHTML((profileData?.displayName || 'U').slice(0, 1).toUpperCase());
            return `<div class="social-avatar ${size} ${profileData?.isOnline ? 'online' : ''}"><img src="${src}" alt="" onerror="this.style.display='none'; this.parentNode.classList.add('fallback');"><span>${label}</span></div>`;
        }
        function socialFriendlyTime(ms) {
            if (!ms) return 'just now';
            const diff = Math.max(0, Date.now() - ms);
            if (diff < 60000) return 'just now';
            if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`;
            if (diff < 86400000) return `${Math.round(diff / 3600000)}h ago`;
            return `${Math.round(diff / 86400000)}d ago`;
        }
        function formatFriendCode(value) {
            const code = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
            return code.match(/.{1,4}/g)?.join('-') || '';
        }
        function stopSocialHubListener() {
            if (socialHubUnsub) { try { socialHubUnsub(); } catch (_) {} socialHubUnsub = null; }
        }
        function stopSocialChatListener() {
            if (socialChatUnsub) { try { socialChatUnsub(); } catch (_) {} socialChatUnsub = null; }
            socialChatState = { friend: null, me: null, chatId: null, chat: null, messages: [], call: null };
        }
        function ensureSocialHubListener() {
            if (socialHubUnsub || !fbSync.getUser()) return;
            socialHubUnsub = social.listenSocialHub((state) => {
                socialHubState = state;
                updateSocialNotificationDot();
                socialSelectedFriendUid();
                saveSocialPrefs();
                ensureSocialChatListener();
                if (socialModeActive()) renderSocialPage();
            });
        }
        function ensureSocialChatListener() {
            const friendUid = socialSelectedFriendUid();
            if (!friendUid || !fbSync.getUser()) { stopSocialChatListener(); return; }
            if (socialChatState.friend?.uid === friendUid && socialChatUnsub) return;
            stopSocialChatListener();
            socialChatUnsub = social.listenDirectChat(friendUid, (state) => {
                socialChatState = state;
                const user = fbSync.getUser();
                const readAt = Number(state.chat?.readAtByUid?.[user?.uid] || 0);
                if (socialModeActive() && state.chat?.lastSenderUid &&
                    state.chat.lastSenderUid !== user?.uid &&
                    Number(state.chat.lastMessageAtMs || 0) > readAt) {
                    social.markDirectChatRead(friendUid).catch(() => {});
                }
                if (socialModeActive()) renderSocialPage();
            });
        }
        function socialCallBanner() {
            const call = socialChatState.call;
            const me = fbSync.getUser();
            if (!call || !me) return '';
            const incoming = call.status === 'ringing' && call.callerUid && call.callerUid !== me.uid;
            const active = call.status === 'active';
            const ringingOut = call.status === 'ringing' && call.callerUid === me.uid;
            return `<div class="social-call-banner ${active ? 'active' : ''}">
                <div>
                    <div class="social-call-title">${active ? 'Voice chat live' : (incoming ? 'Incoming voice call' : 'Calling friend...')}</div>
                    <div class="social-call-sub">${active ? 'Your DM is connected by voice.' : (incoming ? 'Accept to join the cubing voice chat.' : 'Waiting for your friend to pick up.')}</div>
                </div>
                <div class="social-call-actions">
                    ${incoming ? `<button class="train-cta" id="social-accept-call">Join VC</button>` : ''}
                    ${ringingOut || active || incoming ? `<button class="train-quick-btn" id="social-end-call">${active ? 'Leave VC' : 'Cancel'}</button>` : ''}
                </div>
            </div>`;
        }
        function renderSocialPage() {
            const user = fbSync.getUser();
            if (!user) {
                socialView.innerHTML = `
                    <div class="app-page-shell">
                        ${appPageHeading('Social', 'Your cube squad, DMs, battle invites, and voice chat.')}
                        <div class="train-panel social-signin-panel">
                            <div class="social-signin-title">Sign in to unlock Social</div>
                            <div class="social-signin-sub">Bring your friends, chats, invites, and voice rooms together in one place.</div>
                            <button class="train-cta" id="social-signin-btn">Sign in with Google</button>
                        </div>
                    </div>
                `;
                document.getElementById('social-signin-btn')?.addEventListener('click', () => openSigninModal());
                stopSocialHubListener();
                stopSocialChatListener();
                return;
            }
            ensureSocialHubListener();
            ensureSocialChatListener();
            const selectedFriendUid = socialSelectedFriendUid();
            const selectedFriend = socialHubState.friends.find(item => item.id === selectedFriendUid)?.profile || socialChatState.friend;
            const closeFriendUids = new Set(Array.isArray(socialPrefs.closeFriendUids) ? socialPrefs.closeFriendUids : []);
            const sortedFriends = [...(socialHubState.friends || [])].sort((a, b) => Number(closeFriendUids.has(b.id)) - Number(closeFriendUids.has(a.id)));
            const msgs = socialChatState.messages || [];
            const onlineCount = (socialHubState.friends || []).filter(item => item.profile?.isOnline).length;
            socialView.innerHTML = `
                <div class="app-page-shell social-page-shell">
                    ${appPageHeading('Social', 'Build your cube squad with friend requests, DMs, voice rooms, and one-click battle invites.')}
                    <div class="social-status-strip">
                        <div class="social-status-card"><span>${(socialHubState.friends || []).length}</span><label>Friends</label></div>
                        <div class="social-status-card"><span>${onlineCount}</span><label>Online</label></div>
                        <div class="social-status-card"><span>${(socialHubState.incoming || []).length}</span><label>Requests</label></div>
                        <div class="social-status-card"><span>${(socialHubState.invites || []).length}</span><label>Battle invites</label></div>
                    </div>
                    <div class="social-shell">
                        <aside class="train-panel social-left">
                            <div class="social-me-card">
                                ${socialAvatarMarkup(socialHubState.me || { displayName: user.displayName || 'You', photoURL: user.photoURL || '', isOnline: true }, 'lg')}
                                <div class="social-me-meta">
                                    <div class="social-me-name">${escHTML(socialHubState.me?.displayName || user.displayName || user.email || 'You')}</div>
                                    <div class="social-me-code">Friend code: <code>${escHTML(formatFriendCode(socialHubState.me?.friendCode || ''))}</code></div>
                                </div>
                                <button class="train-quick-btn" id="social-copy-code" type="button">Copy code</button>
                            </div>
                            <div class="social-add-card">
                                <div class="panel-title"><span>Add Friend</span><span class="social-add-hint">Paste a code, then send</span></div>
                                <div class="social-add-row">
                                    <input type="text" id="social-friend-code" class="pe-input social-code-input" placeholder="ABCD-EFGH" value="${escHTML(formatFriendCode(socialPrefs.friendCodeInput || ''))}" maxlength="15" autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false" inputmode="text" aria-label="Friend code">
                                    <button class="train-quick-btn" id="social-paste-code" type="button">Paste</button>
                                    <button class="train-cta" id="social-add-friend" type="button" ${socialBusy ? 'disabled' : ''}>${socialBusy ? 'Sending...' : 'Send request'}</button>
                                </div>
                                <div class="social-add-feedback ${socialActionNotice.tone || ''}" id="social-add-feedback" role="status">${escHTML(socialActionNotice.message || 'Your friend can find their code in this same card.')}</div>
                            </div>
                            <div class="social-left-section">
                                <div class="panel-title"><span>Requests</span><span class="assistant-model-pill">${(socialHubState.incoming || []).length}</span></div>
                                <div class="social-request-list">
                                    ${(socialHubState.incoming || []).length ? socialHubState.incoming.map(req => `
                                        <div class="social-request-card">
                                            <div class="social-request-main">
                                                ${socialAvatarMarkup(req.profile)}
                                                <div>
                                                    <div class="social-request-name">${escHTML(req.profile?.displayName || 'Friend')}</div>
                                                    <div class="social-request-sub">Incoming request</div>
                                                </div>
                                            </div>
                                            <div class="social-request-actions">
                                                <button class="train-quick-btn social-req-accept" data-request-id="${escHTML(req.id)}">Accept</button>
                                                <button class="train-quick-btn social-req-decline" data-request-id="${escHTML(req.id)}">Decline</button>
                                            </div>
                                        </div>`).join('') : `<div class="social-empty-small">No pending requests.</div>`}
                                </div>
                            </div>
                            <div class="social-left-section">
                                <div class="panel-title"><span>Chats</span><span class="assistant-model-pill">${(socialHubState.friends || []).length}</span></div>
                                <div class="social-friend-list">
                                    ${sortedFriends.length ? sortedFriends.map(item => `
                                        <button class="social-friend-row ${item.id === selectedFriendUid ? 'active' : ''} ${closeFriendUids.has(item.id) ? 'is-close' : ''}" data-friend-uid="${escHTML(item.id)}">
                                            ${socialAvatarMarkup(item.profile)}
                                            <div class="social-friend-meta">
                                                <div class="social-friend-name">${escHTML(item.profile?.displayName || 'Friend')} ${closeFriendUids.has(item.id) ? '<span class="social-close-badge">★ Close</span>' : ''}</div>
                                                <div class="social-friend-status">${item.profile?.isOnline ? 'Online' : `Last seen ${escHTML(socialFriendlyTime(item.profile?.lastSeenAt))}`}</div>
                                            </div>
                                        </button>
                                    `).join('') : `<div class="social-empty-small">Add a friend to start chatting.</div>`}
                                </div>
                            </div>
                        </aside>
                        <section class="train-panel social-center">
                            ${selectedFriend ? `
                                <div class="social-chat-head">
                                    <div class="social-chat-head-main">
                                        ${socialAvatarMarkup(selectedFriend, 'lg')}
                                        <div>
                                            <div class="social-chat-name">${escHTML(selectedFriend.displayName || 'Friend')}</div>
                                            <div class="social-chat-sub">${selectedFriend.isOnline ? 'Online now' : `Offline · ${escHTML(socialFriendlyTime(selectedFriend.lastSeenAt))}`}</div>
                                        </div>
                                    </div>
                                    <div class="social-chat-head-actions">
                                        <button class="train-quick-btn" id="social-start-call">VC</button>
                                        <button class="train-quick-btn social-close-toggle ${closeFriendUids.has(selectedFriendUid) ? 'active' : ''}" id="social-toggle-close">${closeFriendUids.has(selectedFriendUid) ? '★ Close Friend' : '☆ Add Close Friend'}</button>
                                        <button class="train-quick-btn" id="social-remove-friend">Remove Friend</button>
                                    </div>
                                </div>
                                ${socialCallBanner()}
                                <div class="social-message-list" id="social-message-list">
                                    ${msgs.length ? msgs.map(msg => `
                                        <div class="social-message-row ${msg.authorUid === user.uid ? 'me' : ''}">
                                            ${socialAvatarMarkup({ displayName: msg.authorName || 'U', photoURL: msg.authorUid === user.uid ? (user.photoURL || '') : (selectedFriend.photoURL || ''), isOnline: msg.authorUid === user.uid || selectedFriend.isOnline })}
                                            <div class="social-message-bubble">
                                                <div class="social-message-meta">${escHTML(msg.authorUid === user.uid ? 'You' : (msg.authorName || selectedFriend.displayName || 'Friend'))} · ${escHTML(socialFriendlyTime(msg.createdAtMs))}</div>
                                                <div class="social-message-text">${escHTML(msg.text || '').replace(/\n/g, '<br>')}</div>
                                            </div>
                                        </div>`).join('') : `<div class="social-empty-chat">No messages yet. Start the squad chat.</div>`}
                                </div>
                                <div class="social-compose">
                                    <textarea id="social-message-input" class="pe-input social-message-input" rows="2" placeholder="Message ${escHTML(selectedFriend.displayName || 'your friend')}..."></textarea>
                                    <button class="train-cta" id="social-send-message">Send</button>
                                </div>
                            ` : `
                                <div class="social-empty-large">
                                    <div class="social-empty-large-title">Pick a friend to open chat</div>
                                    <div class="social-empty-large-sub">Your DMs, battle invites, and VC controls live here.</div>
                                </div>
                            `}
                        </section>
                        <aside class="train-panel social-right">
                            <div class="panel-title"><span>Battle Invite</span><span class="assistant-model-pill">1v1</span></div>
                            ${selectedFriend ? `
                                <div class="social-battle-form">
                                    <select id="social-battle-event" class="stats-filter-select">
                                        ${groupedEventOptions(socialPrefs.battleEvent, ['222', '333', 'pyram'])}
                                    </select>
                                    <select id="social-battle-mode" class="stats-filter-select">
                                        <option value="ao5" ${socialPrefs.battleMode === 'ao5' ? 'selected' : ''}>Ao5</option>
                                        <option value="sets" ${socialPrefs.battleMode === 'sets' ? 'selected' : ''}>Sets</option>
                                        <option value="infinite" ${socialPrefs.battleMode === 'infinite' ? 'selected' : ''}>Infinite</option>
                                    </select>
                                    <select id="social-battle-target" class="stats-filter-select" ${socialPrefs.battleMode === 'sets' ? '' : 'disabled'}>
                                        <option value="3" ${String(socialPrefs.battleTarget) === '3' ? 'selected' : ''}>First to 3</option>
                                        <option value="5" ${String(socialPrefs.battleTarget) === '5' ? 'selected' : ''}>First to 5</option>
                                        <option value="7" ${String(socialPrefs.battleTarget) === '7' ? 'selected' : ''}>First to 7</option>
                                    </select>
                                    <button class="train-cta" id="social-send-battle">Invite ${escHTML(selectedFriend.displayName || 'Friend')} to Battle</button>
                                </div>
                            ` : `<div class="social-empty-small">Select a friend first.</div>`}
                            <div class="social-right-section">
                                <div class="panel-title"><span>Battle Inbox</span><span class="assistant-model-pill">${(socialHubState.invites || []).length}</span></div>
                                <div class="social-invite-list">
                                    ${(socialHubState.invites || []).length ? socialHubState.invites.map(invite => `
                                        <div class="social-invite-card">
                                            <div class="social-invite-title">${escHTML(invite.fromProfile?.displayName || 'Friend')} invited you</div>
                                            <div class="social-invite-sub">${escHTML(({ '222':'2x2', '333':'3x3', 'pyram':'Pyraminx' }[invite.puzzle] || invite.puzzle))} · ${escHTML(invite.mode)}</div>
                                            <div class="social-request-actions">
                                                <button class="train-quick-btn social-invite-accept" data-invite-id="${escHTML(invite.id)}">Join</button>
                                                <button class="train-quick-btn social-invite-decline" data-invite-id="${escHTML(invite.id)}">Decline</button>
                                            </div>
                                        </div>
                                    `).join('') : `<div class="social-empty-small">No battle invites waiting.</div>`}
                                </div>
                            </div>
                            <div class="social-right-section">
                                <div class="panel-title"><span>Outgoing Requests</span></div>
                                <div class="social-outgoing-list">
                                    ${(socialHubState.outgoing || []).length ? socialHubState.outgoing.map(req => `
                                        <div class="social-outgoing-card">
                                            ${socialAvatarMarkup(req.profile)}
                                            <div>
                                                <div class="social-request-name">${escHTML(req.profile?.displayName || 'Friend')}</div>
                                                <div class="social-request-sub">Pending</div>
                                            </div>
                                        </div>
                                    `).join('') : `<div class="social-empty-small">No pending outgoing requests.</div>`}
                                </div>
                            </div>
                        </aside>
                    </div>
                </div>
            `;
            document.getElementById('social-signin-btn')?.addEventListener('click', () => openSigninModal());
            document.getElementById('social-copy-code')?.addEventListener('click', async () => {
                const code = socialHubState.me?.friendCode || '';
                if (!code) return;
                const btn = document.getElementById('social-copy-code');
                const old = btn?.textContent || 'Copy code';
                const ok = await copyText(formatFriendCode(code));
                socialActionNotice = ok
                    ? { message: 'Friend code copied. Send it to a cuber you want to add.', tone: 'success' }
                    : { message: 'Copy is blocked here. Select the code above and copy it manually.', tone: 'error' };
                if (btn) {
                    btn.textContent = ok ? 'Copied!' : 'Copy failed';
                    setTimeout(() => { btn.textContent = old; }, 1000);
                }
            });
            const friendCodeInput = document.getElementById('social-friend-code');
            friendCodeInput?.addEventListener('input', (e) => {
                e.target.value = formatFriendCode(e.target.value);
                socialPrefs.friendCodeInput = e.target.value;
                saveSocialPrefs();
            });
            friendCodeInput?.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    document.getElementById('social-add-friend')?.click();
                }
            });
            document.getElementById('social-paste-code')?.addEventListener('click', async () => {
                const input = document.getElementById('social-friend-code');
                if (!input) return;
                try {
                    const text = await navigator.clipboard?.readText?.();
                    if (text) {
                        input.value = formatFriendCode(text);
                        socialPrefs.friendCodeInput = input.value;
                        saveSocialPrefs();
                        socialActionNotice = { message: 'Code pasted. Send the request when you are ready.', tone: 'success' };
                    } else {
                        input.focus();
                    }
                } catch (_) {
                    input.focus();
                    socialActionNotice = { message: 'Paste is blocked by this browser. Tap the code field and paste normally.', tone: 'error' };
                    const feedback = document.getElementById('social-add-feedback');
                    if (feedback) {
                        feedback.textContent = socialActionNotice.message;
                        feedback.className = 'social-add-feedback error';
                    }
                }
            });
            document.getElementById('social-add-friend')?.addEventListener('click', async () => {
                if (socialBusy) return;
                socialBusy = true;
                const submit = document.getElementById('social-add-friend');
                if (submit) {
                    submit.disabled = true;
                    submit.textContent = 'Sending...';
                }
                try {
                    const input = document.getElementById('social-friend-code');
                    const result = await social.sendFriendRequestByCode(input?.value || '');
                    socialPrefs.friendCodeInput = '';
                    saveSocialPrefs();
                    if (input) input.value = '';
                    socialActionNotice = {
                        message: result.autoAccepted
                            ? `You and ${result.target.displayName || 'your friend'} are now friends.`
                            : result.alreadyFriends
                                ? `You are already friends with ${result.target.displayName || 'this cuber'}. Your chat is ready.`
                                : `Request sent to ${result.target.displayName || 'your friend'}.`,
                        tone: 'success'
                    };
                    socialBusy = false;
                    renderSocialPage();
                } catch (e) {
                    socialActionNotice = { message: e.message || String(e), tone: 'error' };
                    socialBusy = false;
                    renderSocialPage();
                } finally {
                    socialBusy = false;
                }
            });
            socialView.querySelectorAll('.social-req-accept').forEach(btn => btn.addEventListener('click', async () => {
                try { await social.acceptFriendRequest(btn.dataset.requestId); } catch (e) { alert(e.message || e); }
            }));
            socialView.querySelectorAll('.social-req-decline').forEach(btn => btn.addEventListener('click', async () => {
                try { await social.declineFriendRequest(btn.dataset.requestId); } catch (e) { alert(e.message || e); }
            }));
            socialView.querySelectorAll('.social-friend-row').forEach(btn => btn.addEventListener('click', () => {
                socialPrefs.selectedFriendUid = btn.dataset.friendUid || '';
                saveSocialPrefs();
                ensureSocialChatListener();
                social.markDirectChatRead(socialPrefs.selectedFriendUid).catch(() => {});
                renderSocialPage();
            }));
            document.getElementById('social-remove-friend')?.addEventListener('click', async () => {
                if (!selectedFriendUid) return;
                if (!await window.ucConfirm(`Remove ${selectedFriend?.displayName || 'this friend'} from your friends list?`, { title: 'Remove friend?', confirmLabel: 'Remove', danger: true })) return;
                try {
                    await social.removeFriend(selectedFriendUid);
                    if (socialPrefs.selectedFriendUid === selectedFriendUid) socialPrefs.selectedFriendUid = '';
                    socialPrefs.closeFriendUids = (socialPrefs.closeFriendUids || []).filter(uid => uid !== selectedFriendUid);
                    saveSocialPrefs();
                } catch (e) { alert(e.message || e); }
            });
            document.getElementById('social-toggle-close')?.addEventListener('click', () => {
                const closeIds = new Set(Array.isArray(socialPrefs.closeFriendUids) ? socialPrefs.closeFriendUids : []);
                if (closeIds.has(selectedFriendUid)) closeIds.delete(selectedFriendUid);
                else closeIds.add(selectedFriendUid);
                socialPrefs.closeFriendUids = [...closeIds];
                saveSocialPrefs();
                renderSocialPage();
            });
            document.getElementById('social-send-message')?.addEventListener('click', async () => {
                const input = document.getElementById('social-message-input');
                if (!selectedFriendUid || !input) return;
                try {
                    await social.sendDirectMessage(selectedFriendUid, input.value);
                    input.value = '';
                } catch (e) { alert(e.message || e); }
            });
            document.getElementById('social-message-input')?.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    document.getElementById('social-send-message')?.click();
                }
            });
            document.getElementById('social-start-call')?.addEventListener('click', async () => {
                if (!selectedFriendUid) return;
                try { await social.startVoiceCall(selectedFriendUid); } catch (e) { alert(e.message || e); }
            });
            document.getElementById('social-accept-call')?.addEventListener('click', async () => {
                if (!socialChatState.chatId || !socialChatState.call?.id) return;
                try { await social.acceptVoiceCall(socialChatState.chatId, socialChatState.call.id); } catch (e) { alert(e.message || e); }
            });
            document.getElementById('social-end-call')?.addEventListener('click', async () => {
                const button = document.getElementById('social-end-call');
                if (button) { button.disabled = true; button.textContent = 'Leaving…'; }
                try {
                    await social.endVoiceCall(socialChatState.chatId, socialChatState.call?.id);
                    socialChatState.call = null;
                    if (socialChatState.chat) socialChatState.chat.currentCallId = null;
                    renderSocialPage();
                } catch (e) {
                    if (button) { button.disabled = false; button.textContent = 'Leave VC'; }
                    alert(e.message || e);
                }
            });
            document.getElementById('social-battle-mode')?.addEventListener('change', (e) => {
                socialPrefs.battleMode = e.target.value || 'ao5';
                saveSocialPrefs();
                renderSocialPage();
            });
            document.getElementById('social-battle-event')?.addEventListener('change', (e) => {
                socialPrefs.battleEvent = e.target.value || '333';
                saveSocialPrefs();
            });
            document.getElementById('social-battle-target')?.addEventListener('change', (e) => {
                socialPrefs.battleTarget = parseInt(e.target.value, 10) || 3;
                saveSocialPrefs();
            });
            document.getElementById('social-send-battle')?.addEventListener('click', async () => {
                if (!selectedFriendUid) return;
                try {
                    const battles = await import('./battles.js');
                    const code = await battles.createBattle({
                        puzzle: socialPrefs.battleEvent || '333',
                        maxPlayers: 2,
                        mode: socialPrefs.battleMode || 'ao5',
                        target: socialPrefs.battleTarget || 3
                    });
                    await social.createBattleInvite(selectedFriendUid, {
                        code,
                        puzzle: socialPrefs.battleEvent,
                        mode: socialPrefs.battleMode,
                        target: socialPrefs.battleMode === 'sets' ? socialPrefs.battleTarget : null
                    });
                    await social.sendDirectMessage(selectedFriendUid, `Battle invite sent. Code: ${code}`, 'system');
                    alert('Battle invite sent.');
                } catch (e) { alert(e.message || e); }
            });
            socialView.querySelectorAll('.social-invite-accept').forEach(btn => btn.addEventListener('click', async () => {
                try {
                    const invite = await social.acceptBattleInvite(btn.dataset.inviteId);
                    const battles = await import('./battles.js');
                    await battles.joinBattle(invite.battleCode);
                    battleCode = invite.battleCode;
                    showBattlesRoom();
                    attachBattleListener(invite.battleCode);
                    document.querySelector('.nav-item[data-mode="battles"]')?.click();
                } catch (e) { alert(e.message || e); }
            }));
            socialView.querySelectorAll('.social-invite-decline').forEach(btn => btn.addEventListener('click', async () => {
                try { await social.declineBattleInvite(btn.dataset.inviteId); } catch (e) { alert(e.message || e); }
            }));
            const messageList = document.getElementById('social-message-list');
            if (messageList) messageList.scrollTop = messageList.scrollHeight;
        }
        fbSync.onUserChange(() => {
            if (!fbSync.getUser()) {
                stopSocialHubListener();
                stopSocialChatListener();
                socialHubState = { me: null, friends: [], incoming: [], outgoing: [], invites: [], chats: [], unreadChatCount: 0, incomingCallCount: 0 };
                updateSocialNotificationDot();
            } else {
                ensureSocialHubListener();
            }
            if (socialModeActive()) renderSocialPage();
        });
        function renderStats() {
            // --- Personal records across all puzzles ---
            const perPuzzle = PUZZLES_FOR_STATS.map(pid => {
                const solves = getPuzzleAllSolves(pid);
                const solved = solves.filter(s => s.penalty !== 'dnf').map(statEff);
                return {
                    pid, count: solves.length,
                    best:  solved.length ? Math.min(...solved) : null,
                    ao5:   bestAoNAll(solves, 5),
                    ao12:  bestAoNAll(solves, 12),
                    ao100: bestAoNAll(solves, 100)
                };
            });

            // Headline = filtered by selected cube (or "best anywhere" when 'all')
            let headline;
            if (statsFilter === 'all') {
                headline = {
                    best:  Math.min(...perPuzzle.map(p => p.best).filter(v => v != null), Infinity),
                    ao5:   Math.min(...perPuzzle.map(p => p.ao5).filter(v => v != null), Infinity),
                    ao12:  Math.min(...perPuzzle.map(p => p.ao12).filter(v => v != null), Infinity),
                    ao100: Math.min(...perPuzzle.map(p => p.ao100).filter(v => v != null), Infinity)
                };
            } else {
                const p = perPuzzle.find(p => p.pid === statsFilter);
                headline = p
                    ? { best: p.best == null ? Infinity : p.best, ao5: p.ao5 == null ? Infinity : p.ao5,
                        ao12: p.ao12 == null ? Infinity : p.ao12, ao100: p.ao100 == null ? Infinity : p.ao100 }
                    : { best: Infinity, ao5: Infinity, ao12: Infinity, ao100: Infinity };
            }
            const totalSolves = perPuzzle.reduce((a, p) => a + p.count, 0);

            // --- Algorithm mastery: all cube libraries, optionally narrowed by cube ---
            const allAlgProg = algMasteryGroups();
            const algProg = algMasteryGroups(algMasteryCube);
            const totalLearned = allAlgProg.reduce((a, c) => a + c.learned, 0);
            const totalAlgs = allAlgProg.reduce((a, c) => a + c.total, 0);
            const shownLearned = algProg.reduce((a, c) => a + c.learned, 0);
            const shownTotal = algProg.reduce((a, c) => a + c.total, 0);

            // --- Practice distribution: TWO donuts (by cube, by session) ---
            // Donut A: by cube
            const cubeSegs = perPuzzle.filter(p => p.count > 0).map((p) => ({
                label: PUZZLE_LABEL[p.pid], count: p.count,
                color: PUZZLE_COLORS[PUZZLES_FOR_STATS.indexOf(p.pid) % PUZZLE_COLORS.length]
            }));
            // Donut B: by session name (combined across puzzles)
            const bySessionName = {};
            getAllCurrentSessions().forEach(sess => {
                const name = sess.name || 'Unnamed';
                bySessionName[name] = (bySessionName[name] || 0) + ((sess.solves && sess.solves.length) || 0);
            });
            const sessionSegs = Object.entries(bySessionName)
                .filter(([_, c]) => c > 0)
                .sort((a, b) => b[1] - a[1])
                .map(([label, count], i) => ({ label, count, color: PUZZLE_COLORS[i % PUZZLE_COLORS.length] }));

            function buildDonut(segs, total, centerNum, centerLabel) {
                const R = 60, C = 2 * Math.PI * R;
                let acc = 0;
                const denom = total || 1;
                const arcs = segs.map(seg => {
                    const len = seg.count / denom * C;
                    const arc = `<circle cx="80" cy="80" r="${R}" fill="none" stroke="${seg.color}" stroke-width="18" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-acc}" transform="rotate(-90 80 80)"/>`;
                    acc += len;
                    return arc;
                }).join('');
                return `
                    <svg viewBox="0 0 160 160" class="donut-svg">
                        <circle cx="80" cy="80" r="${R}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="18"/>
                        ${arcs}
                        <text x="80" y="78" text-anchor="middle" fill="#fff" font-family="Inter, sans-serif" font-weight="900" font-size="22">${centerNum}</text>
                        <text x="80" y="96" text-anchor="middle" fill="#aaa" font-size="9" letter-spacing="1">${centerLabel}</text>
                    </svg>`;
            }
            function buildLegend(segs, emptyMsg) {
                return segs.length
                    ? segs.map(s => `<div class="legend-row"><i style="background:${s.color}"></i><span>${escHTML(s.label)}</span><b>${s.count}</b></div>`).join('')
                    : `<div class="stats-empty">${emptyMsg}</div>`;
            }
            const cubeDonutSvg    = buildDonut(cubeSegs,    totalSolves, totalSolves, 'SOLVES');
            const sessionDonutSvg = buildDonut(sessionSegs, totalSolves, totalSolves, 'SOLVES');
            const cubeLegend    = buildLegend(cubeSegs,    'No solves recorded yet.');
            const sessionLegend = buildLegend(sessionSegs, 'No sessions used yet.');

            // Compute the active avatar frame (no auto — user picks explicitly; legacy 'auto' → 'none')
            const rawFrame = (!profile.frame || profile.frame === 'auto') ? 'none' : profile.frame;
            const rawTier = FRAME_TIERS.find(t => t.id === rawFrame) || FRAME_TIERS[FRAME_TIERS.length - 1];
            const activeFrame = frameUnlocked(rawTier, totalSolves, totalLearned) ? rawFrame : 'none';
            const avatarSrc = profile.avatar || 'default-user-image.png';
            const wcaOk = validWcaId(profile.wca_id);
            const verified = !!profile.wca_verified && wcaOk;
            const wcaLink = wcaOk
                ? `<a class="profile-wca ${verified ? 'is-verified' : ''}" href="https://www.worldcubeassociation.org/persons/${escHTML(profile.wca_id)}" target="_blank" rel="noopener">${verified ? '✓ ' : ''}WCA: ${escHTML(profile.wca_id)}</a>`
                : '';
            const socialEntries = Object.entries(profile.socials)
                .map(([p, v]) => ({ p, url: socialLink(p, v) }))
                .filter(s => s.url);
            const SOCIAL_LBL = { youtube: 'YouTube', instagram: 'Instagram', twitter: 'X', tiktok: 'TikTok', twitch: 'Twitch' };
            const socialsHTML = socialEntries.length
                ? `<div class="profile-socials">${socialEntries.map(s =>
                    `<a class="social-btn social-${s.p}" href="${s.url}" target="_blank" rel="noopener">${SOCIAL_LBL[s.p]}</a>`
                  ).join('')}</div>`
                : '';
            const activeTheme = LS.get('appColor', 'orange');
            const activeFrameMeta = FRAME_TIERS.find(t => t.id === activeFrame) || FRAME_TIERS[FRAME_TIERS.length - 1];

            statsView.innerHTML = `
                <div class="app-page-shell">
                    ${appPageHeading('Profile', 'Your cubing identity, official WCA profile, progress, and practice trends.')}
                <div class="stats-grid-outer">
                    <div class="train-panel stats-profile">
                        <div class="panel-title">
                            <span>Profile</span>
                            <button class="train-quick-btn" id="open-profile-edit">Edit profile</button>
                        </div>
                        <div class="profile-row">
                            <div class="profile-avatar pfp-frame frame-${activeFrame}">
                                <div class="pfp-inner">
                                    <img src="${escHTML(avatarSrc)}" alt="" onerror="this.src='default-user-image.png'">
                                </div>
                            </div>
                            <div class="profile-meta">
                                <div class="profile-name" id="profile-name">Cuber</div>
                                <div class="profile-sub">${totalSolves} solves · ${totalLearned} algs learned</div>
                                ${(() => {
                                    const lp = levelProgress();
                                    return `<div class="profile-xp">
                                        <span class="lvl-pill">LVL ${lp.level}</span>
                                        <span class="lvl-name-pill">${levelName(lp.level)}</span>
                                        <div class="xp-bar"><div class="xp-bar-fill" style="width:${Math.min(100,Math.max(0,lp.pct)).toFixed(1)}%"></div></div>
                                        <span class="xp-text">${formatWholeNumber(lp.into)} / ${formatXp(lp.span)} · ${formatXp(xpRemaining(lp))} remaining</span>
                                    </div>`;
                                })()}
                                ${wcaLink}
                            </div>
                            <div class="profile-auth" id="profile-auth"></div>
                        </div>
                        <div class="profile-tags">
                            <span class="profile-tag"><i>Main</i> ${escHTML(eventLabel(profile.main_event))}</span>
                            ${profile.main_cubes ? `<span class="profile-tag"><i>Cubes</i> ${escHTML(profile.main_cubes)}</span>` : ''}
                        </div>
                        ${profile.bio
                            ? `<div class="profile-bio">${escHTML(profile.bio)}</div>`
                            : `<div class="profile-stub" id="profile-stub">Click <b>Edit profile</b> to add a bio, main event, cubes, socials, and link your WCA account.</div>`
                        }
                        ${socialsHTML}
                    </div>

                    <div class="train-panel stats-appearance">
                        <div class="panel-title">
                            <span>Appearance</span>
                            <button class="train-quick-btn" id="open-profile-edit-appearance">Edit avatar & frame</button>
                        </div>
                        <div class="profile-appearance-row">
                            <div class="profile-avatar pfp-frame frame-${activeFrame}">
                                <div class="pfp-inner">
                                    <img src="${escHTML(avatarSrc)}" alt="" onerror="this.src='default-user-image.png'">
                                </div>
                            </div>
                            <div class="profile-appearance-meta">
                                <div class="profile-appearance-title">Current look</div>
                                <div class="profile-appearance-sub">Frame: ${escHTML(activeFrameMeta.label)} · Theme: ${escHTML(APP_COLORS.find(c => c.id === activeTheme)?.label || activeTheme)}</div>
                                <div class="app-color-grid profile-color-grid" id="profile-color-grid"></div>
                            </div>
                        </div>
                    </div>

                    <div class="train-panel stats-pr">
                        <div class="panel-title">
                            <span>Personal Bests <span style="font-size:0.7rem;color:var(--text-muted);font-weight:400;margin-left:4px;">in-app</span></span>
                            <select id="stats-filter-cube" class="stats-filter-select">
                                <option value="all" ${statsFilter === 'all' ? 'selected' : ''}>All Puzzles</option>
                                ${groupedEventOptions(statsFilter, PUZZLES_FOR_STATS)}
                            </select>
                        </div>
                        ${(() => {
                            const noData = headline.best === Infinity && headline.ao5 === Infinity;
                            if (noData) return `<div style="color:var(--text-muted);font-size:0.88rem;padding:6px 0;">No solves recorded yet for ${statsFilter === 'all' ? 'any puzzle' : PUZZLE_LABEL[statsFilter] || statsFilter}. Head to Timer to get started!</div>`;
                            return `<div class="pr-grid">
                                <div class="pr-cell"><div class="lbl">Single</div><div class="val">${fmtTime(headline.best === Infinity ? null : headline.best)}</div></div>
                                <div class="pr-cell"><div class="lbl">Ao5</div><div class="val">${fmtTime(headline.ao5 === Infinity ? null : headline.ao5)}</div></div>
                                <div class="pr-cell"><div class="lbl">Ao12</div><div class="val">${fmtTime(headline.ao12 === Infinity ? null : headline.ao12)}</div></div>
                                <div class="pr-cell"><div class="lbl">Ao100</div><div class="val">${fmtTime(headline.ao100 === Infinity ? null : headline.ao100)}</div></div>
                            </div>`;
                        })()}
                    </div>

                    ${(profile.wca_verified && profile.wca_records && Object.keys(profile.wca_records).length) ? (() => {
                        const WCA_EVENT_LABELS = {
                            '333':'3x3', '222':'2x2', '444':'4x4', '555':'5x5', '666':'6x6', '777':'7x7',
                            '333oh':'3x3 OH', '333bf':'3BLD', '333fm':'FMC', '444bf':'4BLD', '555bf':'5BLD',
                            '333mbf':'Multi BLD', 'pyram':'Pyraminx', 'skewb':'Skewb', 'minx':'Megaminx',
                            'sq1':'Square-1', 'clock':'Clock'
                        };
                        const cells = Object.entries(profile.wca_records)
                            .filter(([, r]) => r.single != null || r.average != null)
                            .sort(([a], [b]) => {
                                const order = ['333','222','444','555','666','777','333oh','pyram','skewb','minx','sq1','clock','333bf','444bf','555bf','333fm','333mbf'];
                                return (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99);
                            })
                            .map(([ev, r]) => `
                                <div class="wca-pr-cell">
                                    <div class="wca-pr-event">${WCA_EVENT_LABELS[ev] || ev}</div>
                                    <div class="wca-pr-times">
                                        ${r.single != null ? `<div class="wca-pr-time"><span class="lbl">Single</span><span class="val">${fmtTime(r.single)}</span></div>` : ''}
                                        ${r.average != null ? `<div class="wca-pr-time"><span class="lbl">Average</span><span class="val">${fmtTime(r.average)}</span></div>` : ''}
                                    </div>
                                </div>`).join('');
                        return `<div class="train-panel stats-wca-prs stats-fullwidth">
                            <div class="panel-title">WCA Official PRs <span style="font-size:0.7rem;color:var(--text-muted);font-weight:400;margin-left:6px;">via WCA</span></div>
                            <div class="wca-pr-grid">${cells}</div>
                        </div>`;
                    })() : ''}

                    ${profile.wca_id ? `
                    <div class="train-panel stats-upcoming stats-fullwidth">
                        <div class="panel-title">Upcoming Competitions</div>
                        <div id="wca-upcoming-body"><span style="color:var(--text-muted);font-size:0.88rem;">Loading…</span></div>
                    </div>` : ''}

                    <div class="train-panel stats-dist stats-fullwidth">
                        <div class="panel-title">Practice Distribution</div>
                        <div class="dist-dual">
                            <div class="dist-half">
                                <div class="dist-half-title">By Cube</div>
                                <div class="donut-wrap">${cubeDonutSvg}</div>
                                <div class="donut-legend">${cubeLegend}</div>
                            </div>
                            <div class="dist-half">
                                <div class="dist-half-title">By Session</div>
                                <div class="donut-wrap">${sessionDonutSvg}</div>
                                <div class="donut-legend">${sessionLegend}</div>
                            </div>
                        </div>
                    </div>

                    <div class="train-panel stats-heatmap stats-fullwidth">
                        <div class="panel-title">
                            <span>Solve Frequency</span>
                            <span class="heatmap-sub">last 12 months</span>
                        </div>
                        ${buildSolveHeatmap()}
                    </div>

                    <div class="train-panel stats-progress stats-fullwidth">
                        <div class="panel-title alg-progress-title"><span>Algorithm Mastery</span>
                            <div class="alg-progress-controls">
                                <span class="alg-progress-total">${shownLearned} / ${shownTotal} learned</span>
                                <select id="stats-alg-mastery-cube" class="stats-filter-select" aria-label="Algorithm mastery cube">
                                    <option value="all" ${algMasteryCube === 'all' ? 'selected' : ''}>All cubes</option>
                                    ${groupedEventOptions(algMasteryCube, algMasteryCubeOptions().map(option => option.id))}
                                </select>
                            </div>
                        </div>
                        <div class="prog-list">
                            ${algProg.map(c => `
                                <div class="prog-row">
                                    <div class="prog-row-head">
                                        <span>${algMasteryCube === 'all' ? `${escHTML(c.cubeLabel)} · ` : ''}${escHTML(c.label)}</span>
                                        <span class="prog-count">${c.learned} / ${c.total}</span>
                                    </div>
                                    <div class="prog-bar"><div class="prog-bar-fill" style="width:${c.pct.toFixed(1)}%"></div></div>
                                </div>`).join('')}
                        </div>
                    </div>

                </div>
                </div>
            `;
            // Re-attach the auth widget into the (re-rendered) profile area
            renderAuthWidget();
            // Cube selector for Personal Records
            const filterSel = document.getElementById('stats-filter-cube');
            if (filterSel) {
                filterSel.addEventListener('change', () => {
                    statsFilter = filterSel.value;
                    LS.set('statsFilter', statsFilter);
                    renderStats();
                });
            }
            const masteryCubeSel = document.getElementById('stats-alg-mastery-cube');
            if (masteryCubeSel) {
                masteryCubeSel.addEventListener('change', () => {
                    algMasteryCube = masteryCubeSel.value || 'all';
                    LS.set('algMasteryCube', algMasteryCube);
                    renderStats();
                });
            }
            // Edit profile button
            const editBtn = document.getElementById('open-profile-edit');
            if (editBtn) editBtn.addEventListener('click', openProfileEdit);
            document.getElementById('open-profile-edit-appearance')?.addEventListener('click', () => {
                openProfileEdit();
                document.querySelector('.pe-tab[data-pe-tab="appearance"]')?.click();
            });
            buildColorSwatches('profile-color-grid');
            // Async: load upcoming competitions if wca_id is set
            if (profile.wca_id) loadUpcomingComps(profile.wca_id);
        }

        async function loadUpcomingComps(wcaId) {
            const el = document.getElementById('wca-upcoming-body');
            const cacheKey = 'wca_upcoming_v2_' + wcaId;
            let comps;
            window.__ucUpcomingCompsLoading = true;
            try {
                const cached = sessionStorage.getItem(cacheKey);
                if (cached) {
                    comps = JSON.parse(cached);
                } else {
                    comps = await fetchMyWcaCompetitions(wcaId);
                    sessionStorage.setItem(cacheKey, JSON.stringify(comps));
                }
                window.__ucUpcomingCompsError = '';
            } catch (e) {
                const message = e?.message || 'Could not load competitions — check your connection.';
                window.__ucUpcomingCompsError = message;
                if (el) el.innerHTML = `<span style="color:var(--text-muted);font-size:0.88rem;">${escHTML(message)}</span>`;
                window.__ucUpcomingComps = [];
                return null;
            } finally {
                window.__ucUpcomingCompsLoading = false;
            }
            window.__ucUpcomingComps = Array.isArray(comps) ? comps : [];
            if (!Array.isArray(comps) || !comps.length) {
                if (el) el.innerHTML = '<span style="color:var(--text-muted);font-size:0.88rem;">No upcoming registered competitions found for your WCA ID.</span>';
                return [];
            }
            function fmtCompDate(start, end) {
                const s = new Date(start + 'T00:00:00');
                const e = new Date(end + 'T00:00:00');
                const opts = { month: 'short', day: 'numeric', year: 'numeric' };
                if (start === end) return s.toLocaleDateString(undefined, opts);
                if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth())
                    return s.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + '–' + e.getDate() + ', ' + e.getFullYear();
                return s.toLocaleDateString(undefined, opts) + ' – ' + e.toLocaleDateString(undefined, opts);
            }
            const now = new Date();
            const markup = comps.map(c => {
                const startDate = new Date(c.start_date + 'T00:00:00');
                const diffDays = Math.round((startDate - now) / 86400000);
                const badge = diffDays > 0 ? `<span class="upcoming-days">${diffDays === 1 ? 'tomorrow' : 'in ' + diffDays + ' days'}</span>`
                    : diffDays === 0 ? `<span class="upcoming-days">today</span>` : '';
                const compEvents = c.registered_event_ids || [];
                const eventPips = (compEvents || []).map(e => `<span class="event-pip">${escHTML(e)}</span>`).join('');
                const registrationNote = eventPips ? '' : `<span class="event-pip">${escHTML(competitionEventSummary(c))}</span>`;
                return `<div class="upcoming-comp">
                    <div class="upcoming-comp-name"><a href="${escHTML(c.url || '#')}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none;">${escHTML(c.name)}</a></div>
                    <div class="upcoming-comp-meta">
                        ${escHTML(fmtCompDate(c.start_date, c.end_date))} &middot; ${escHTML(c.city || '')}${c.country_iso2 ? ', ' + escHTML(c.country_iso2) : ''}
                        ${badge}
                    </div>
                    <div class="upcoming-comp-events">${eventPips || registrationNote}</div>
                </div>`;
            }).join('');
            if (el) el.innerHTML = markup;
            return comps;
        }

        const ASSISTANT_MODELS = [
            { id: 'nvidia/nemotron-3-super-120b-a12b:free', label: 'Nemotron 3 Super', kind: 'nemotron', free: true },
            { id: 'qwen/qwen3-next-80b-a3b-instruct:free', label: 'Qwen3 Next 80B Free', kind: 'qwen', free: true },
            { id: 'openai/gpt-oss-120b:free', label: 'GPT-OSS 120B Free', kind: 'gpt', free: true },
            { id: 'google/gemma-4-31b-it:free', label: 'Gemma 4 31B Free', kind: 'gemma', free: true },
            { id: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B Free', kind: 'llama', free: true }
        ];
        const DEFAULT_ASSISTANT_MODEL = ASSISTANT_MODELS[0].id;
        let assistantPending = false;
        let assistantPrefs = LS.get('assistantPrefs', { history: [], model: DEFAULT_ASSISTANT_MODEL });
        if (!Array.isArray(assistantPrefs.history)) assistantPrefs.history = [];
        if (!assistantPrefs.model) assistantPrefs.model = DEFAULT_ASSISTANT_MODEL;
        if ('competitionId' in assistantPrefs) delete assistantPrefs.competitionId;
        function saveAssistantPrefs() { LS.set('assistantPrefs', assistantPrefs); }
        let socialPrefs = LS.get('socialPrefs', { friendCodeInput: '', selectedFriendUid: '', battleEvent: '333', battleMode: 'ao5', battleTarget: 3, closeFriendUids: [] });
        if (!socialPrefs || typeof socialPrefs !== 'object') socialPrefs = { friendCodeInput: '', selectedFriendUid: '', battleEvent: '333', battleMode: 'ao5', battleTarget: 3, closeFriendUids: [] };
        if (!Array.isArray(socialPrefs.closeFriendUids)) socialPrefs.closeFriendUids = [];
        function saveSocialPrefs() { LS.set('socialPrefs', socialPrefs); }
        let socialHubState = {
            me: null,
            friends: [],
            incoming: [],
            outgoing: [],
            invites: [],
            chats: [],
            unreadChatCount: 0,
            incomingCallCount: 0
        };
        let socialChatState = { friend: null, me: null, chatId: null, chat: null, messages: [], call: null };
        let socialHubUnsub = null;
        let socialChatUnsub = null;
        let socialBusy = false;
        let socialActionNotice = { message: '', tone: '' };
        let leaderboardPrefs = LS.get('leaderboardPrefs', { event: '333', type: 'single', country: '' });
        if (!leaderboardPrefs || typeof leaderboardPrefs !== 'object') leaderboardPrefs = { event: '333', type: 'single', country: '' };
        if ('gender' in leaderboardPrefs) delete leaderboardPrefs.gender;
        function saveLeaderboardPrefs() { LS.set('leaderboardPrefs', leaderboardPrefs); }
        function getAssistantApiKey() {
            if (openRouterConfig?.apiKey) return String(openRouterConfig.apiKey).trim();
            try { return localStorage.getItem('uc_openrouter_api_key') || ''; } catch (_) { return ''; }
        }
        function setAssistantApiKey(v) {
            try {
                if (v) localStorage.setItem('uc_openrouter_api_key', v.trim());
                else localStorage.removeItem('uc_openrouter_api_key');
            } catch (_) {}
        }
        function getAllCurrentSessions() {
            const globalStore = LS.get('sessions_global', null);
            if (globalStore && Array.isArray(globalStore.sessions)) return globalStore.sessions.slice();
            const sessions = [];
            for (const pid of PUZZLES_FOR_STATS) {
                const store = LS.get('sess_' + pid, null);
                if (!store || !Array.isArray(store.sessions)) continue;
                store.sessions.forEach(s => sessions.push(Object.assign({ puzzle: pid }, s)));
            }
            return sessions;
        }
        function allSolvesWithContext() {
            return getAllCurrentSessions().flatMap(sess =>
                (sess.solves || []).map(s => ({
                    puzzle: sess.puzzle || '333',
                    session: sess.name || 'Session',
                    time: s.t,
                    penalty: s.penalty || 'ok',
                    scramble: s.scramble || '',
                    note: s.note || '',
                    date: s.date || 0
                }))
            );
        }
        function recentSolveSummary(limit = 150) {
            return allSolvesWithContext()
                .sort((a, b) => (b.date || 0) - (a.date || 0))
                .slice(0, limit)
                .map((s, idx) => {
                    const label = s.penalty === 'dnf' ? 'DNF'
                        : s.penalty === '+2' ? `${fmt(s.time + 2)}+`
                        : fmt(s.time);
                    const when = s.date ? new Date(s.date).toISOString().slice(0, 10) : 'unknown-date';
                    const scramble = s.scramble ? ` | scr: ${s.scramble}` : '';
                    const note = s.note ? ` | note: ${s.note}` : '';
                    return `${idx + 1}. ${eventLabel(s.puzzle)} | ${s.session} | ${label} | ${when}${scramble}${note}`;
                });
        }
        function plannerSummary() {
            const plans = (plannerData.plans || []).map(p => {
                const done = (p.tasks || []).filter(t => t.done).length;
                const total = (p.tasks || []).length;
                return `${p.name}${p.date ? ` (target ${p.date})` : ''}: ${done}/${total} tasks complete`;
            });
            const algGoals = (plannerData.algGoals || []).map(g => {
                const checked = (g.splits || []).reduce((n, s) => n + (s.checked || []).length, 0);
                const total = (g.splits || []).filter(s => !s.isDrill).reduce((n, s) => n + (s.algs || []).length, 0);
                return `${g.name}${g.startDate ? ` (start ${g.startDate})` : ''}: ${checked}/${total} algs checked off`;
            });
            return { plans, algGoals };
        }
        function currentCompetitionChoice(userPrompt = '') {
            const command = parseCompetitionCommand(userPrompt);
            if (!command?.slug) return null;
            const comps = Array.isArray(window.__ucUpcomingComps) ? window.__ucUpcomingComps : [];
            return comps.find(comp =>
                slugifyCompetitionName(comp.name || comp.id) === command.slug ||
                String(comp.id || '').toLowerCase() === command.slug
            ) || null;
        }
        function formatCompetitionForPrompt(comp) {
            if (!comp) return 'No competition selected.';
            const registered = comp.registered_event_ids || [];
            const offered = comp.offered_event_ids || comp.event_ids || [];
            return [
                `Name: ${comp.name || 'Competition'}`,
                `Dates: ${comp.start_date || '?'} to ${comp.end_date || '?'}`,
                `City/Country: ${comp.city || ''}${comp.country_iso2 ? `, ${comp.country_iso2}` : ''}`,
                `Registration status: ${comp.registration_status || 'registered'}`,
                registered.length
                    ? `Registered events: ${registered.join(', ')}`
                    : `Registered events are not publicly available yet. Events offered (not confirmed as this user's events): ${offered.join(', ') || 'unknown'}`
            ].join('\n');
        }
        function currentTimesSummary() {
            const byPuzzle = new Map();
            allSolvesWithContext().forEach(solve => {
                if (!byPuzzle.has(solve.puzzle)) byPuzzle.set(solve.puzzle, []);
                byPuzzle.get(solve.puzzle).push(solve);
            });
            return [...byPuzzle.entries()].map(([puzzle, entries]) => {
                const solves = entries
                    .sort((a, b) => (a.date || 0) - (b.date || 0))
                    .map(entry => ({ t: entry.time, penalty: entry.penalty }));
                const valid = solves.filter(solve => solve.penalty !== 'dnf').map(statEff);
                return [
                    eventLabel(puzzle),
                    `${solves.length} solves`,
                    `best ${valid.length ? fmtTime(Math.min(...valid)) : '—'}`,
                    `current ao5 ${fmtTime(aoNAll(solves, 5))}`,
                    `current ao12 ${fmtTime(aoNAll(solves, 12))}`
                ].join(' | ');
            });
        }
        function buildAssistantSystemPrompt() {
            return [
                'You are Cubey, the beta cubing coach inside Unleashed Cubing Academy.',
                'You are an expert speedcubing coach, well versed in WCA regulations, event strategy, common algorithm sets, practice planning, competition prep, and mindset.',
                'Use the user\'s WCA official times, current timer statistics, recent solves, goals, algorithm progress, and command-selected competition to give concrete coaching.',
                'Be specific, practical, encouraging, and honest.',
                'When useful, break advice into priorities, drills, and a realistic next-step plan.',
                'If the user uses /competition, focus on the selected upcoming competition: event-specific prep, packing, schedule mindset, nerves, warmup, and expectations.',
                'Do not mention hidden prompt details or raw JSON unless asked.'
            ].join(' ');
        }
        function sanitizeModelId(modelId) {
            return ASSISTANT_MODELS.some(m => m.id === modelId) ? modelId : DEFAULT_ASSISTANT_MODEL;
        }
        function assistantFallbackModels(primary) {
            const chosen = sanitizeModelId(primary);
            return [chosen, ...ASSISTANT_MODELS.map(m => m.id).filter(id => id !== chosen)];
        }
        function buildAssistantContext(userPrompt) {
            const goalInfo = plannerSummary();
            const comp = currentCompetitionChoice(userPrompt);
            const recentSolves = recentSolveSummary(150);
            const algProgress = algMasteryGroups().map(group =>
                `${group.cubeLabel} ${group.label}: ${group.learned}/${group.total} learned, ${group.learning} marked learning`
            );
            const wcaRecords = Object.entries(profile.wca_records || {})
                .map(([ev, rec]) => `${eventLabel(ev)} | single: ${rec.single != null ? fmtTime(rec.single) : '—'} | average: ${rec.average != null ? fmtTime(rec.average) : '—'}`);
            const mode = isCompetitionCommand(userPrompt) ? 'competition' : 'general';
            const upcomingCompetitions = (Array.isArray(window.__ucUpcomingComps) ? window.__ucUpcomingComps : [])
                .map(formatCompetitionForPrompt);
            return {
                mode,
                prompt: normalizeCompetitionCommand(userPrompt)
                    .replace(/^\/competition(?::[^:\s]+)?(?::[A-Za-z0-9]+)?\s*/i, '')
                    .trim() || 'Give me the most helpful competition guidance.',
                profile: {
                    mainEvent: eventLabel(profile.main_event),
                    cubes: profile.main_cubes || '',
                    bio: profile.bio || '',
                    wcaId: profile.wca_id || '',
                    wcaVerified: !!profile.wca_verified
                },
                goals: {
                    checklists: goalInfo.plans,
                    algGoals: goalInfo.algGoals
                },
                progress: algProgress,
                wcaRecords,
                currentTimes: currentTimesSummary(),
                upcomingCompetitions,
                selectedCompetition: comp ? formatCompetitionForPrompt(comp) : 'No competition selected.',
                recentSolves
            };
        }
        async function requestAssistantViaBackend(payload) {
            const resp = await fetch(assistantBackendUrl(), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (resp.status === 404 || resp.status === 405) throw new Error('backend_unavailable');
            const data = await resp.json().catch(() => ({}));
            if (!resp.ok) throw new Error(data?.error || `Backend request failed (${resp.status})`);
            return data;
        }
        function assistantErrorMessage(message) {
            const text = String(message || '').trim();
            if (/rate-limit|rate limited|429/i.test(text)) {
                return 'Cubey is busy right now. Try again in a moment.';
            }
            if (/backend_unavailable/i.test(text)) {
                return 'Cubey is not connected yet on this deployment.';
            }
            return text || 'The assistant request failed.';
        }
        function refreshRoadmapTask(label, done) {
            const roadmap = (plannerData.plans || []).find(p => p.id === 'uc-product-roadmap');
            const task = roadmap?.tasks?.find(t => t.text === label);
            if (!task) return;
            task.done = !!done;
            savePlanner();
        }
        async function askCubingAssistant(userPrompt) {
            const context = buildAssistantContext(userPrompt);
            const payload = {
                model: sanitizeModelId(assistantPrefs.model),
                fallbackModels: assistantFallbackModels(assistantPrefs.model),
                systemPrompt: buildAssistantSystemPrompt(),
                prompt: context.prompt,
                context
            };
            try {
                const data = await requestAssistantViaBackend(payload);
                if (data?.reply) return data.reply;
            } catch (err) {
                if (!/backend_unavailable/i.test(String(err?.message || ''))) {
                    throw new Error(assistantErrorMessage(err?.message || err));
                }
            }
            const key = getAssistantApiKey();
            if (!key) throw new Error('Cubey is not connected yet.');
            let lastError = '';
            for (const model of assistantFallbackModels(assistantPrefs.model)) {
                const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${key}`,
                        'Content-Type': 'application/json',
                        'HTTP-Referer': window.location.origin || 'http://localhost',
                        'X-Title': 'Unleashed Cubing Academy'
                    },
                    body: JSON.stringify({
                        model,
                        messages: [
                            { role: 'system', content: buildAssistantSystemPrompt() },
                            { role: 'user', content: `User context:\n${JSON.stringify(context, null, 2)}\n\nUser request:\n${context.prompt}` }
                        ]
                    })
                });
                if (resp.ok) {
                    const data = await resp.json();
                    return data?.choices?.[0]?.message?.content?.trim() || 'No response returned.';
                }
                const detail = await resp.text().catch(() => '');
                lastError = `OpenRouter request failed (${resp.status})${detail ? `: ${detail.slice(0, 200)}` : ''}`;
                if (![429, 502, 503, 504].includes(resp.status)) break;
            }
            throw new Error(assistantErrorMessage(lastError));
        }
        function formatAssistantMessage(text) {
            return escHTML(text || '')
                .replace(/`([^`]+)`/g, '<code>$1</code>')
                .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
                .replace(/\n/g, '<br>');
        }
        function renderAssistantHistory() {
            const body = document.getElementById('cubing-assistant-history');
            if (!body) return;
            const panel = body.closest('.assistant-chat-panel');
            const rows = assistantPrefs.history || [];
            if (!rows.length) {
                panel?.classList.add('is-empty');
                body.innerHTML = `
                    <div class="assistant-empty-shell">
                        <div class="assistant-empty-mark">✺</div>
                        <div class="assistant-empty-title">Cubey is ready.</div>
                        <div class="assistant-empty">Ask for solve breakdowns, event strategy, comp mindset help, or a focused practice block built from your data.</div>
                        <div class="assistant-starter-grid">
                            <button class="assistant-starter" data-assistant-starter="Help me drop my 3x3 ao5 by 2 seconds.">Drop my 3x3 ao5</button>
                            <button class="assistant-starter" data-assistant-starter="Look at my recent solves and tell me the biggest weakness.">Find my biggest weakness</button>
                        </div>
                    </div>
                `;
                return;
            }
            panel?.classList.remove('is-empty');
            const historyMarkup = rows.map(row => `
                <div class="assistant-row assistant-${row.role}">
                    <div class="assistant-avatar">${row.role === 'user' ? 'Y' : 'C'}</div>
                    <div class="assistant-msg assistant-${row.role}">
                        <div class="assistant-msg-role">${row.role === 'user' ? 'You' : 'Cubey'}</div>
                        <div class="assistant-msg-body">${formatAssistantMessage(row.content)}</div>
                    </div>
                </div>
            `).join('');
            const pendingMarkup = assistantPending ? `
                <div class="assistant-row assistant-assistant">
                    <div class="assistant-avatar">C</div>
                    <div class="assistant-msg assistant-assistant assistant-thinking-msg">
                        <div class="assistant-msg-role">Cubey</div>
                        <div class="assistant-thinking-dots" aria-label="Thinking">
                            <span></span><span></span><span></span>
                        </div>
                    </div>
                </div>
            ` : '';
            body.innerHTML = historyMarkup + pendingMarkup;
            body.scrollTop = body.scrollHeight;
        }
        function leaderboardUrl() {
            const type = leaderboardPrefs.type === 'average' ? 'average' : 'single';
            const params = new URLSearchParams();
            if (leaderboardPrefs.country) params.set('region', leaderboardPrefs.country);
            const qs = params.toString();
            return `https://www.worldcubeassociation.org/results/rankings/${encodeURIComponent(leaderboardPrefs.event)}/${type}${qs ? '?' + qs : ''}`;
        }
        async function loadWcaLeaderboard() {
            const body = document.getElementById('wca-leaderboard-body');
            if (!body) return;
            body.innerHTML = `<div class="assistant-empty">Loading WCA rank data…</div>`;
            const region = leaderboardRegionValue();
            try {
                let parsed = [];
                const rankLabel = leaderboardPrimaryRankLabel(region);
                const regionLabel = leaderboardRegionLabel(region);
                try {
                    const proxyResp = await fetch(`${leaderboardBackendUrl()}?event=${encodeURIComponent(leaderboardPrefs.event)}&type=${encodeURIComponent(leaderboardPrefs.type)}&region=${encodeURIComponent(region)}`);
                    if (proxyResp.ok) {
                        const payload = await proxyResp.json();
                        parsed = Array.isArray(payload?.items) ? payload.items : [];
                    }
                } catch (_) {}
                if (!parsed.length) parsed = await fetchLeaderboardDirect(region);
                if (!parsed.length) throw new Error('Could not parse rankings.');
                body.innerHTML = `
                    <div class="leaderboard-meta">
                        <span>Region: ${escHTML(regionLabel)} · Event: ${escHTML(leaderboardPrefs.event)} · Type: ${escHTML(leaderboardPrefs.type)} · Primary rank: ${escHTML(rankLabel)} · Showing top ${parsed.length}</span>
                    </div>
                    <div class="leaderboard-table">
                        <div class="leaderboard-row leaderboard-head">
                            <span>${escHTML(rankLabel)}</span><span>Result</span><span>Cuber</span><span>Country</span><span>WCA ID</span><span>WR</span><span>CR</span><span>NR</span>
                        </div>
                        ${parsed.map(row => `
                            <div class="leaderboard-row">
                                <span>${escHTML(row.rank)}</span>
                                <span>${escHTML(row.result)}</span>
                                <span><a class="leaderboard-person-link" href="${escHTML(row.wcaUrl || `https://www.worldcubeassociation.org/persons/${row.personId}`)}" target="_blank" rel="noopener">${escHTML(row.person)}</a></span>
                                <span>${escHTML(countryDisplayName(row.country))}</span>
                                <span><a class="leaderboard-person-link subtle" href="${escHTML(row.wcaUrl || `https://www.worldcubeassociation.org/persons/${row.personId}`)}" target="_blank" rel="noopener">${escHTML(row.personId)}</a></span>
                                <span>${escHTML(row.worldRank)}</span>
                                <span>${escHTML(row.continentRank)}</span>
                                <span>${escHTML(row.countryRank)}</span>
                            </div>
                        `).join('')}
                    </div>
                `;
            } catch (e) {
                body.innerHTML = `
                    <div class="assistant-empty">Could not load the WCA leaderboard right now. Try <code>world</code>, <code>europe</code>, or a country code like <code>US</code>.</div>
                `;
            }
        }

        // ---- Training Planner ----
        plannerData = LS.get('planner', { plans: [], algGoals: [] });
        if (!plannerData.algGoals) plannerData.algGoals = [];
        if (!plannerData.plans) plannerData.plans = [];
        function savePlanner() { LS.set('planner', plannerData); }
        function genPlanId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
        function removeSeededProductRoadmapChecklist() {
            const before = plannerData.plans.length;
            plannerData.plans = plannerData.plans.filter(p => p.id !== 'uc-product-roadmap');
            if (plannerData.plans.length !== before) savePlanner();
        }
        removeSeededProductRoadmapChecklist();

        // ---- Alg Goal helpers ----
        function buildAlgGoalSplits(category, totalDays, hasDrillDay) {
            const algs = db
                .filter(it => it.category === category)
                .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
            const learnDays = (hasDrillDay && totalDays > 1) ? totalDays - 1 : totalDays;
            if (!algs.length || !learnDays) return [];
            const base = Math.floor(algs.length / learnDays);
            const extra = algs.length % learnDays;
            const splits = [];
            let idx = 0;
            for (let d = 0; d < learnDays; d++) {
                const count = d < extra ? base + 1 : base;
                splits.push({ dayNum: d + 1, isDrill: false, algs: algs.slice(idx, idx + count).map(a => a.name), checked: [] });
                idx += count;
            }
            if (hasDrillDay && totalDays > 1) {
                splits.push({ dayNum: totalDays, isDrill: true, algs: algs.map(a => a.name), checked: [] });
            }
            return splits;
        }
        function algGoalCurrentDay(goal) {
            if (!goal.startDate) return null;
            const start = new Date(goal.startDate + 'T00:00:00');
            const today = new Date(); today.setHours(0, 0, 0, 0);
            const diff = Math.round((today - start) / 86400000) + 1;
            return (diff >= 1 && diff <= goal.totalDays) ? diff : null;
        }
        function todaysAlgGoalEntries() {
            return (plannerData?.algGoals || []).flatMap(goal => {
                const day = algGoalCurrentDay(goal);
                const split = goal.splits.find(item => item.dayNum === day && !item.isDrill);
                if (!split) return [];
                return split.algs.map(name => ({
                    name,
                    category: goal.category,
                    checked: split.checked.includes(name),
                    goalName: goal.name
                }));
            });
        }
        function todaysAlgGoalNames() {
            return new Set(todaysAlgGoalEntries().filter(item => !item.checked).map(item => item.name));
        }
        function cubeForAlgCategory(category) {
            return Object.keys(CUBE_CATS).find(cube => CUBE_CATS[cube].includes(category)) || '3x3';
        }
        // Track which day rows are expanded: 'goalId-dayNum'
        const expandedDayKeys = new Set();

        // ---- Goals page render ----
        function renderPlanner() {
            const plans = plannerData.plans || [];
            const algGoals = plannerData.algGoals || [];
            const todayAlgs = todaysAlgGoalEntries();
            const now = new Date();

            function dateBadge(dateStr) {
                if (!dateStr) return '';
                const d = new Date(dateStr + 'T00:00:00');
                const diff = Math.round((d - now) / 86400000);
                const label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                const cls = diff >= 0 && diff <= 7 ? 'soon' : '';
                const countdown = diff > 0 ? ` · ${diff}d` : diff === 0 ? ' · today' : diff < 0 ? ' · done' : '';
                return `<span class="plan-date-badge ${cls}">${label}${countdown}</span>`;
            }

            // ---- Alg goal card ----
            function algGoalHTML(goal) {
                const todayDay = algGoalCurrentDay(goal);
                const totalChecked = goal.splits.reduce((n, s) => n + s.checked.length, 0);
                const totalAlgs = goal.splits.filter(s => !s.isDrill).reduce((n, s) => n + s.algs.length, 0);
                const pct = totalAlgs ? totalChecked / totalAlgs * 100 : 0;
                const started = !!goal.startDate && todayDay !== null;

                const dayStatusLabel = goal.startDate
                    ? (todayDay ? `Day ${todayDay} of ${goal.totalDays}` : (algGoalCurrentDay({...goal}) === null ? (new Date(goal.startDate + 'T00:00:00') > now ? 'Starts ' + new Date(goal.startDate + 'T00:00:00').toLocaleDateString(undefined, {month:'short',day:'numeric'}) : 'Completed') : ''))
                    : `${goal.totalDays}-day plan`;

                const daysHTML = goal.splits.map(split => {
                    const key = goal.id + '-' + split.dayNum;
                    const isToday = todayDay === split.dayNum;
                    const isPast = todayDay !== null && split.dayNum < todayDay;
                    const expanded = expandedDayKeys.has(key) || isToday;
                    const checkedCount = split.checked.length;
                    const dayDone = split.isDrill ? checkedCount > 0 : checkedCount === split.algs.length;

                    const statusDot = dayDone ? '✓' : isPast ? '○' : isToday ? '▶' : '·';
                    const statusCls = dayDone ? 'day-done' : isToday ? 'day-today' : isPast ? 'day-past' : '';

                    const algsHTML = split.isDrill
                        ? `<div class="alg-day-drill-note">Review all ${split.algs.length} ${goal.category} algs — focus on weak spots. Use the Trainer with "Only Learning" filter.</div>`
                        : split.algs.map(algName => {
                            const checked = split.checked.includes(algName);
                            return `<label class="alg-check-item ${checked ? 'is-checked' : ''}">
                                <input type="checkbox" class="plan-task-check" data-action="toggle-alg" data-goal-id="${goal.id}" data-day="${split.dayNum}" data-alg="${escHTML(algName)}" ${checked ? 'checked' : ''}>
                                <span>${escHTML(algName)}</span>
                            </label>`;
                        }).join('');

                    return `<div class="alg-day-row ${statusCls}" data-key="${key}">
                        <div class="alg-day-header" data-action="toggle-day" data-goal-id="${goal.id}" data-day="${split.dayNum}">
                            <span class="alg-day-dot">${statusDot}</span>
                            <span class="alg-day-label">
                                ${split.isDrill ? 'Drill Day' : `Day ${split.dayNum}`}
                                ${isToday ? '<span class="today-pill">Today</span>' : ''}
                            </span>
                            <span class="alg-day-count">${split.isDrill ? (checkedCount ? '✓' : '') : `${checkedCount}/${split.algs.length}`}</span>
                            <span class="alg-day-chevron">${expanded ? '▾' : '▸'}</span>
                        </div>
                        ${expanded ? `<div class="alg-day-body"><div class="alg-day-algs">${algsHTML}</div></div>` : ''}
                    </div>`;
                }).join('');

                return `<div class="train-panel plan-card alg-goal-card" data-goal-id="${goal.id}">
                    <div class="plan-card-head">
                        <span class="alg-goal-cat-badge">${escHTML(goal.category)}</span>
                        <span class="plan-card-name" style="cursor:default;">${escHTML(goal.name)}</span>
                        ${dateBadge(goal.startDate)}
                        <button class="plan-delete-btn" data-action="delete-goal" data-goal-id="${goal.id}" title="Delete goal">🗑</button>
                    </div>
                    <div class="plan-progress-wrap">
                        <div class="plan-progress-bar"><div class="plan-progress-fill ${pct >= 100 ? 'done' : ''}" style="width:${pct.toFixed(1)}%"></div></div>
                        <div class="plan-progress-label">${dayStatusLabel} · ${totalChecked}/${totalAlgs} algs drilled</div>
                    </div>
                    <div class="alg-goal-days">${daysHTML}</div>
                </div>`;
            }

            // ---- Checklist card ----
            function taskHTML(task, planId) {
                return `<div class="plan-task" data-task-id="${task.id}" data-plan-id="${planId}">
                    <input type="checkbox" class="plan-task-check" data-action="toggle-task" data-task-id="${task.id}" data-plan-id="${planId}" ${task.done ? 'checked' : ''}>
                    <span class="plan-task-text ${task.done ? 'is-done' : ''}" data-action="edit-task-text" data-task-id="${task.id}" data-plan-id="${planId}">${escHTML(task.text)}</span>
                    <button class="plan-task-del" data-action="delete-task" data-task-id="${task.id}" data-plan-id="${planId}" title="Remove task">✕</button>
                </div>`;
            }
            function planHTML(plan) {
                const done = plan.tasks.filter(t => t.done).length;
                const total = plan.tasks.length;
                const pct = total ? done / total * 100 : 0;
                const allDone = total > 0 && done === total;
                return `<div class="train-panel plan-card" data-plan-id="${plan.id}">
                    <div class="plan-card-head">
                        <span class="plan-card-name" data-action="edit-plan-name" data-plan-id="${plan.id}" title="Click to rename">${escHTML(plan.name)}</span>
                        ${dateBadge(plan.date)}
                        <button class="plan-delete-btn" data-action="delete-plan" data-plan-id="${plan.id}" title="Delete checklist">🗑</button>
                    </div>
                    <div class="plan-progress-wrap">
                        <div class="plan-progress-bar"><div class="plan-progress-fill ${allDone ? 'done' : ''}" style="width:${pct.toFixed(1)}%"></div></div>
                        <div class="plan-progress-label">${done} / ${total} ${allDone ? '✓ All done!' : 'tasks done'}</div>
                    </div>
                    <div class="plan-tasks">${plan.tasks.map(t => taskHTML(t, plan.id)).join('')}</div>
                    <div class="plan-add-row">
                        <input type="text" class="plan-add-input" placeholder="Add a task…" data-plan-id="${plan.id}" maxlength="200" autocomplete="off">
                        <button class="plan-add-btn" data-action="add-task" data-plan-id="${plan.id}" title="Add task">+</button>
                    </div>
                </div>`;
            }

            const hasAnything = algGoals.length || plans.length;
            planView.innerHTML = `<div class="app-page-shell">
                ${appPageHeading('Goals', 'Build daily alg plans, comp checklists, and longer training roadmaps.', `
                    <button class="plan-new-cta" id="plan-open-alg-goal" style="background:rgba(255,159,10,0.15);color:var(--orange);border:1px solid rgba(255,159,10,0.35);">+ Alg Goal</button>
                    <button class="plan-new-cta" id="plan-open-new">+ Checklist</button>
                `)}
                <div class="plan-outer">
                ${todayAlgs.length ? `<div class="train-panel today-training-panel">
                    <div class="panel-title"><span>Training Now</span><span class="today-training-count">${todayAlgs.filter(item => !item.checked).length} left today</span></div>
                    <div class="today-training-list">${todayAlgs.map(item => `<button class="today-training-alg ${item.checked ? 'is-done' : ''}" data-today-category="${escHTML(item.category)}" data-today-alg="${escHTML(item.name)}"><span>${item.checked ? '✓' : '→'}</span><b>${escHTML(item.name)}</b><small>${escHTML(item.category)}</small></button>`).join('')}</div>
                </div>` : ''}
                ${algGoals.length ? `<div class="goals-section-label">Alg Learning Goals</div>${algGoals.map(algGoalHTML).join('')}` : ''}
                ${plans.length ? `<div class="goals-section-label">Checklists</div>${plans.map(planHTML).join('')}` : ''}
                ${!hasAnything ? `<div class="plan-empty-state">
                    <span class="plan-empty-icon">🎯</span>
                    No goals yet.<br>
                    <span style="font-size:0.85rem;">Create an <b>Alg Goal</b> to split a set into daily practice, or a <b>Checklist</b> for comp prep and custom task lists.</span>
                </div>` : ''}
                </div>
            </div>`;

            document.getElementById('plan-open-new')?.addEventListener('click', openNewPlanModal);
            document.getElementById('plan-open-alg-goal')?.addEventListener('click', () => openAlgGoalModal());
            planView.querySelectorAll('.today-training-alg').forEach(button => button.addEventListener('click', () => {
                const category = button.dataset.todayCategory;
                activateMode('learn');
                showCubeAlgs(cubeForAlgCategory(category));
                categoryFilter.value = category;
                searchInput.value = button.dataset.todayAlg || '';
                exactAlgNameFilter = button.dataset.todayAlg || '';
                renderCards();
            }));
        }

        async function plannerClickHandler(e) {
            const action = e.target.dataset.action || e.target.closest('[data-action]')?.dataset.action;
            const el = action ? (e.target.dataset.action ? e.target : e.target.closest('[data-action]')) : null;
            if (!el) return;
            const planId = el.dataset.planId;
            const taskId = el.dataset.taskId;
            const goalId = el.dataset.goalId;
            const plan = plannerData.plans.find(p => p.id === planId);
            const goal = plannerData.algGoals.find(g => g.id === goalId);

            if (action === 'toggle-task') {
                const task = plan?.tasks.find(t => t.id === taskId);
                if (task) { task.done = el.checked; savePlanner(); renderPlanner(); }
            } else if (action === 'delete-task') {
                if (plan) { plan.tasks = plan.tasks.filter(t => t.id !== taskId); savePlanner(); renderPlanner(); }
            } else if (action === 'delete-plan') {
                if (await window.ucConfirm(`Delete "${plan?.name}"? This cannot be undone.`, { title: 'Delete checklist?', confirmLabel: 'Delete', danger: true })) {
                    plannerData.plans = plannerData.plans.filter(p => p.id !== planId);
                    savePlanner(); renderPlanner();
                }
            } else if (action === 'add-task') {
                const input = planView.querySelector(`.plan-add-input[data-plan-id="${planId}"]`);
                addTaskFromInput(input, plan);
            } else if (action === 'edit-plan-name') {
                startInlineRename(el, planId);
            } else if (action === 'edit-task-text') {
                startInlineTaskEdit(el, planId, taskId);
            } else if (action === 'toggle-day') {
                const dayNum = parseInt(el.dataset.day, 10);
                const key = goalId + '-' + dayNum;
                if (expandedDayKeys.has(key)) expandedDayKeys.delete(key);
                else expandedDayKeys.add(key);
                renderPlanner();
            } else if (action === 'toggle-alg') {
                if (!goal) return;
                const dayNum = parseInt(el.dataset.day, 10);
                const algName = el.dataset.alg;
                const split = goal.splits.find(s => s.dayNum === dayNum);
                if (!split) return;
                if (el.checked) {
                    if (!split.checked.includes(algName)) split.checked.push(algName);
                    // Also mark as learning in the alg library
                    if (!learnedSet.has(algName)) { learningSet.add(algName); saveLearning(); }
                } else {
                    split.checked = split.checked.filter(n => n !== algName);
                }
                savePlanner();
                // Update just the progress label without full re-render
                const card = planView.querySelector(`[data-goal-id="${goalId}"]`);
                if (card) {
                    const totalChecked = goal.splits.reduce((n, s) => n + s.checked.length, 0);
                    const totalAlgs = goal.splits.filter(s => !s.isDrill).reduce((n, s) => n + s.algs.length, 0);
                    const pct = totalAlgs ? totalChecked / totalAlgs * 100 : 0;
                    const fill = card.querySelector('.plan-progress-fill');
                    if (fill) { fill.style.width = pct.toFixed(1) + '%'; fill.classList.toggle('done', pct >= 100); }
                    const lbl = card.querySelector('.plan-progress-label');
                    const todayDay = algGoalCurrentDay(goal);
                    if (lbl) lbl.textContent = (goal.startDate && todayDay ? `Day ${todayDay} of ${goal.totalDays}` : `${goal.totalDays}-day plan`) + ` · ${totalChecked}/${totalAlgs} algs drilled`;
                    const countEl = card.querySelector(`.alg-day-row[data-key="${goalId}-${dayNum}"] .alg-day-count`);
                    if (countEl && !goal.splits.find(s => s.dayNum === dayNum)?.isDrill) countEl.textContent = `${split.checked.length}/${split.algs.length}`;
                }
            } else if (action === 'delete-goal') {
                if (await window.ucConfirm(`Delete this goal? This cannot be undone.`, { title: 'Delete goal?', confirmLabel: 'Delete', danger: true })) {
                    plannerData.algGoals = plannerData.algGoals.filter(g => g.id !== goalId);
                    savePlanner(); renderPlanner();
                }
            }
        }
        function plannerKeyHandler(e) {
            if (e.key === 'Enter' && e.target.classList.contains('plan-add-input')) {
                const planId = e.target.dataset.planId;
                const plan = plannerData.plans.find(p => p.id === planId);
                addTaskFromInput(e.target, plan);
            }
        }
        function addTaskFromInput(input, plan) {
            if (!input || !plan) return;
            const text = input.value.trim();
            if (!text) return;
            plan.tasks.push({ id: genPlanId(), text, done: false });
            savePlanner();
            renderPlanner();
            const newInput = planView.querySelector(`.plan-add-input[data-plan-id="${plan.id}"]`);
            if (newInput) newInput.focus();
        }
        function startInlineRename(nameEl, pid) {
            const plan = plannerData.plans.find(p => p.id === pid);
            if (!plan) return;
            const inp = document.createElement('input');
            inp.type = 'text'; inp.className = 'plan-card-name-input';
            inp.value = plan.name; inp.maxLength = 60;
            nameEl.replaceWith(inp); inp.focus(); inp.select();
            function commit() { const v = inp.value.trim(); if (v) plan.name = v; savePlanner(); renderPlanner(); }
            inp.addEventListener('blur', commit);
            inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } else if (e.key === 'Escape') renderPlanner(); });
        }
        function startInlineTaskEdit(textEl, pid, tid) {
            const plan = plannerData.plans.find(p => p.id === pid);
            const task = plan?.tasks.find(t => t.id === tid);
            if (!task) return;
            const inp = document.createElement('input');
            inp.type = 'text'; inp.className = 'plan-task-text-input';
            inp.value = task.text; inp.maxLength = 200;
            textEl.replaceWith(inp); inp.focus(); inp.select();
            function commit() { const v = inp.value.trim(); if (v) task.text = v; savePlanner(); renderPlanner(); }
            inp.addEventListener('blur', commit);
            inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } else if (e.key === 'Escape') renderPlanner(); });
        }

        // Goals event delegation (wired once)
        planView.addEventListener('click', plannerClickHandler);
        planView.addEventListener('keydown', plannerKeyHandler);

        // ---- Alg Goal modal ----
        const algGoalModal = document.getElementById('alg-goal-modal');
        function updateAlgGoalPreview() {
            const cat = document.getElementById('alg-goal-cat').value;
            const days = parseInt(document.getElementById('alg-goal-days').value, 10) || 0;
            const drill = document.getElementById('alg-goal-drill').checked;
            const prev = document.getElementById('alg-goal-preview');
            if (!prev) return;
            if (!cat || days < 1) { prev.textContent = 'Choose a set and number of days.'; return; }
            const algs = db.filter(it => it.category === cat);
            const learnDays = drill && days > 1 ? days - 1 : days;
            const perDay = learnDays ? Math.ceil(algs.length / learnDays) : 0;
            const minPerDay = learnDays ? Math.floor(algs.length / learnDays) : 0;
            const drillNote = drill && days > 1 ? ` + 1 drill/review day` : '';
            prev.innerHTML = `<b>${algs.length} algs</b> split across <b>${learnDays} learning days</b>${drillNote}<br>
                ${minPerDay === perDay ? `${perDay} algs per day` : `${minPerDay}–${perDay} algs per day`}`;
        }
        function openAlgGoalModal(preselect) {
            const catSel = document.getElementById('alg-goal-cat');
            catSel.innerHTML = Object.entries(CUBE_CATS).map(([cube, categories]) => {
                const options = ONBOARD_ALGSETS.filter(item => categories.includes(item.category));
                if (!options.length) return '';
                return `<optgroup label="${escHTML(cube)}">${options.map(item =>
                    `<option value="${escHTML(item.category)}" ${preselect === item.category ? 'selected' : ''}>${escHTML(item.label)} (${db.filter(alg => alg.category === item.category).length})</option>`
                ).join('')}</optgroup>`;
            }).join('');
            document.getElementById('alg-goal-days').value = '7';
            document.getElementById('alg-goal-drill').checked = true;
            document.getElementById('alg-goal-start').value = new Date().toISOString().slice(0, 10);
            updateAlgGoalPreview();
            algGoalModal.style.display = 'flex';
        }
        function closeAlgGoalModal() { algGoalModal.style.display = 'none'; }
        document.getElementById('alg-goal-close')?.addEventListener('click', closeAlgGoalModal);
        document.getElementById('alg-goal-cancel')?.addEventListener('click', closeAlgGoalModal);
        algGoalModal?.addEventListener('click', e => { if (e.target === algGoalModal) closeAlgGoalModal(); });
        document.getElementById('alg-goal-cat')?.addEventListener('change', updateAlgGoalPreview);
        document.getElementById('alg-goal-days')?.addEventListener('input', updateAlgGoalPreview);
        document.getElementById('alg-goal-drill')?.addEventListener('change', updateAlgGoalPreview);
        document.getElementById('alg-goal-submit')?.addEventListener('click', () => {
            const cat = document.getElementById('alg-goal-cat').value;
            const days = parseInt(document.getElementById('alg-goal-days').value, 10);
            const drill = document.getElementById('alg-goal-drill').checked;
            const startDate = document.getElementById('alg-goal-start').value || null;
            if (!cat || !days || days < 1) return;
            const splits = buildAlgGoalSplits(cat, days, drill);
            const setLabel = ONBOARD_ALGSETS.find(a => a.category === cat)?.label || cat;
            plannerData.algGoals.unshift({
                id: genPlanId(), category: cat,
                name: `Learn ${setLabel} in ${days} days`,
                totalDays: days, startDate, drillDay: drill, splits
            });
            savePlanner(); closeAlgGoalModal();
            // Switch to Goals view if not already there
            document.querySelector('.nav-item[data-mode="plan"]')?.click();
            renderPlanner();
        });

        // ---- Checklist modal ----
        const planNewModal = document.getElementById('plan-new-modal');
        function openNewPlanModal() {
            document.getElementById('plan-new-name').value = '';
            document.getElementById('plan-new-date').value = '';
            planNewModal.style.display = 'flex';
            setTimeout(() => document.getElementById('plan-new-name')?.focus(), 50);
        }
        function closeNewPlanModal() { planNewModal.style.display = 'none'; }
        document.getElementById('plan-new-close')?.addEventListener('click', closeNewPlanModal);
        document.getElementById('plan-new-cancel')?.addEventListener('click', closeNewPlanModal);
        planNewModal?.addEventListener('click', e => { if (e.target === planNewModal) closeNewPlanModal(); });
        document.getElementById('plan-new-submit')?.addEventListener('click', () => {
            const name = (document.getElementById('plan-new-name').value || '').trim();
            if (!name) { document.getElementById('plan-new-name').focus(); return; }
            const date = document.getElementById('plan-new-date').value || null;
            plannerData.plans.unshift({ id: genPlanId(), name, date, tasks: [] });
            savePlanner();
            closeNewPlanModal();
            renderPlanner();
            setTimeout(() => planView.querySelector('.plan-add-input')?.focus(), 80);
        });
        document.getElementById('plan-new-name')?.addEventListener('keydown', e => {
            if (e.key === 'Enter') document.getElementById('plan-new-submit')?.click();
        });

        // ---- Shared stopwatch ----
        let timerPrecision = LS.get('precision', 2);   // decimal places (2 or 3)
        function fmt(t) { return t.toFixed(timerPrecision); }

        // opts: { onSolve(rawSeconds, inspectionPenalty), useInspection?, holdDelay?, hideWhileRunning? }
        function createTimer(displayEl, opts) {
            const onSolve = opts.onSolve;
            const useInspection = opts.useInspection || (() => false);
            const holdDelay = opts.holdDelay || (() => 0);
            const hideWhileRunning = opts.hideWhileRunning || (() => false);
            // states: idle, inspecting, arming, ready, inspectReady, running
            let state = 'idle', startT = 0, raf = null, inspStart = 0, pendingPenalty = 'ok';
            let holdTO = null, armTarget = 'ready', armReturn = 'idle';
            function setPhase(p) {
                displayEl.classList.remove('ready', 'running', 'inspecting', 'arming');
                if (p) displayEl.classList.add(p);
            }
            function inspText() {
                const left = 15 - (performance.now() - inspStart) / 1000;
                if (left > 0) return Math.ceil(left).toString();
                if (left > -2) return '+2';
                return 'DNF';
            }
            function inspectionPenalty() {
                const e = (performance.now() - inspStart) / 1000;
                if (e > 17) return 'dnf';
                if (e > 15) return '+2';
                return 'ok';
            }
            function tickRun() {
                displayEl.textContent = hideWhileRunning() ? 'solving' : fmt((performance.now() - startT) / 1000);
                raf = requestAnimationFrame(tickRun);
            }
            function tickInsp() {
                displayEl.textContent = inspText();
                raf = requestAnimationFrame(tickInsp);
            }
            function finishArm() {
                holdTO = null;
                state = armTarget;
                setPhase('ready');
            }
            function arm(target, returnState) {
                armTarget = target;
                armReturn = returnState;
                if (returnState === 'idle') displayEl.textContent = '0.00';
                const d = holdDelay();
                if (d <= 0) { state = 'arming'; finishArm(); }
                else { state = 'arming'; setPhase('arming'); holdTO = setTimeout(finishArm, d); }
            }
            function beginRun() {
                state = 'running';
                startT = performance.now();
                setPhase('running');
                tickRun();
            }
            return {
                getState: () => state,
                startImmediately() {
                    if (state === 'running') return;
                    if (raf) cancelAnimationFrame(raf);
                    if (holdTO) { clearTimeout(holdTO); holdTO = null; }
                    pendingPenalty = 'ok';
                    beginRun();
                },
                press() {
                    if (state === 'running') {
                        cancelAnimationFrame(raf);
                        const t = (performance.now() - startT) / 1000;
                        state = 'idle';
                        setPhase('');
                        displayEl.textContent = fmt(t);
                        const pen = pendingPenalty;
                        pendingPenalty = 'ok';
                        onSolve(t, pen);
                    } else if (state === 'idle') {
                        if (useInspection()) {
                            state = 'inspecting';
                            inspStart = performance.now();
                            setPhase('inspecting');
                            tickInsp();
                        } else {
                            arm('ready', 'idle');
                        }
                    } else if (state === 'inspecting') {
                        arm('inspectReady', 'inspecting');
                    }
                },
                release() {
                    if (state === 'arming') {
                        if (holdTO) { clearTimeout(holdTO); holdTO = null; }
                        state = armReturn;
                        if (armReturn === 'idle') { setPhase(''); displayEl.textContent = '0.00'; }
                        else setPhase('inspecting');
                    } else if (state === 'ready') {
                        beginRun();
                    } else if (state === 'inspectReady') {
                        cancelAnimationFrame(raf);
                        pendingPenalty = inspectionPenalty();
                        beginRun();
                    }
                },
                reset() {
                    if (raf) cancelAnimationFrame(raf);
                    if (holdTO) { clearTimeout(holdTO); holdTO = null; }
                    state = 'idle';
                    pendingPenalty = 'ok';
                    setPhase('');
                    displayEl.textContent = '0.00';
                }
            };
        }

        // Route Space / tap presses to whichever timer view is currently active
        const timerRegistry = [];
        function activeTimer() {
            const e = timerRegistry.find(e => e.isActive());
            return e ? e.timer : null;
        }
        function isTypingTarget(el) {
            if (!el) return false;
            const tag = el.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
            if (el.isContentEditable) return true;
            return false;
        }
        document.addEventListener('keydown', (e) => {
            if (isTypingTarget(e.target) || isTypingTarget(document.activeElement)) return;
            const t = activeTimer();
            if (!t) return;
            // If the timer is RUNNING, ANY key stops it (and consumes the event)
            if (t.getState && t.getState() === 'running') {
                e.preventDefault();
                if (e.repeat) return;
                t.press();   // press while running = stop
                return;
            }
            // Otherwise only Space drives press/release (start hold)
            if (e.code !== 'Space') return;
            e.preventDefault();
            if (e.repeat) return;
            t.press();
        });
        document.addEventListener('keyup', (e) => {
            if (e.code !== 'Space') return;
            if (isTypingTarget(e.target) || isTypingTarget(document.activeElement)) return;
            const t = activeTimer();
            if (!t) return;
            e.preventDefault();
            t.release();
        });
        function bindTap(btn, timer) {
            btn.addEventListener('pointerdown', (e) => { e.preventDefault(); timer.press(); });
            btn.addEventListener('pointerup', (e) => { e.preventDefault(); timer.release(); });
        }

        // ---- Algorithm trainer ----
        const trainSetup = document.getElementById('train-setup');
        const trainActive = document.getElementById('train-active');
        const trainCategory = document.getElementById('train-category');
        const trainCaselist = document.getElementById('train-caselist');
        const trainCube = document.getElementById('train-cube');
        const scrambleEl = document.getElementById('train-scramble');
        const revealBox = document.getElementById('train-reveal-box');

        let trainPool = [];
        let trainCurrent = null;
        let trainTimes = [];

        const AUFS = ['', 'U', "U'", 'U2'];

        let trainGroupMode = LS.get('trainGroupMode', 'category');   // 'name' | 'category'

        function buildCaselist() {
            const cat = trainCategory.value;
            const items = db.filter(it => it.category === cat);
            const order = groupOrder(cat);
            const caseHTML = (it) => {
                const learned  = learnedSet.has(it.name);
                const learning = learningSet.has(it.name);
                const cls = learned ? 'is-learned' : learning ? 'is-learning' : '';
                return `<label class="case-check ${cls}">
                    <input type="checkbox" data-case="${it.name}" checked>
                    <span>${it.name}</span>
                </label>`;
            };
            if (!order || trainGroupMode === 'name') {
                // Flat list (no defined grouping, or user picked "By Name")
                trainCaselist.innerHTML =
                    `<div class="caselist-flat">${items.map(caseHTML).join('')}</div>`;
                return;
            }
            // Group by family / shape / OLL-type
            const byGroup = {};
            items.forEach(it => {
                const g = algGroup(it);
                (byGroup[g] = byGroup[g] || []).push(it);
            });
            trainCaselist.innerHTML = order.filter(g => byGroup[g]).map(g => {
                const cases = byGroup[g];
                return `<div class="caselist-group" data-group="${g}">
                    <div class="caselist-group-head">
                        <span class="caselist-group-name">${groupLabel(cat, g)}</span>
                        <span class="caselist-group-count">${cases.length}</span>
                        <button type="button" class="caselist-group-toggle" data-group-toggle="${g}">Toggle</button>
                    </div>
                    <div class="caselist-group-body">
                        ${cases.map(caseHTML).join('')}
                    </div>
                </div>`;
            }).join('');
        }
        trainCategory.addEventListener('change', buildCaselist);

        // Trainer group-by toggle (Name / Category)
        document.querySelectorAll('.group-toggle-btn[data-train-group]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.trainGroup === trainGroupMode);
            btn.addEventListener('click', () => {
                trainGroupMode = btn.dataset.trainGroup;
                LS.set('trainGroupMode', trainGroupMode);
                document.querySelectorAll('.group-toggle-btn[data-train-group]').forEach(b =>
                    b.classList.toggle('active', b.dataset.trainGroup === trainGroupMode));
                buildCaselist();
            });
        });

        // Quick-pick buttons (All / None / Only Learning / Only Learned)
        document.querySelectorAll('.train-quick-btn[data-pick]').forEach(btn => {
            btn.addEventListener('click', () => {
                const pick = btn.dataset.pick;
                trainCaselist.querySelectorAll('input[type=checkbox]').forEach(cb => {
                    if (pick === 'all')      cb.checked = true;
                    else if (pick === 'none')     cb.checked = false;
                    else if (pick === 'learning') cb.checked = learningSet.has(cb.dataset.case);
                    else if (pick === 'learned')  cb.checked = learnedSet.has(cb.dataset.case);
                });
                if (pick === 'learning') {
                    const anyChecked = [...trainCaselist.querySelectorAll('input:checked')].length > 0;
                    if (!anyChecked) alert('No cases marked as Learning yet.\n\nGo to Algorithms, open any case, and tap "Mark Learning" to add it here.');
                }
            });
        });

        // Per-group toggle: flip every case in that group
        trainCaselist.addEventListener('click', (e) => {
            const btn = e.target.closest('.caselist-group-toggle');
            if (!btn) return;
            const group = btn.closest('.caselist-group');
            const cbs = group.querySelectorAll('input[type=checkbox]');
            const allOn = [...cbs].every(c => c.checked);
            cbs.forEach(c => c.checked = !allOn);
        });

        function invertAlg(s) {
            try { return new Alg(s).invert().toString(); } catch (e) { return inverseAlg(s); }
        }
        function invertCaseAlg(item, algText) {
            if (item.category && item.category.startsWith('Megaminx')) {
                return inverseAlg(algText, { fiveFold: true });
            }
            return invertAlg(algText);
        }
        // A scramble that leads to the case, but is not the literal setup:
        // a random inverted solution, plus random AUF for last-layer cases.
        // AUF is skipped for F2L-type cases, where a U turn changes the case.
        function genScramble(item) {
            const cands = [item.main_alg, ...item.alts].map(algText => invertCaseAlg(item, algText));
            const base = cands[Math.floor(Math.random() * cands.length)];
            const aufOk = item.category === 'OLL' || item.category === 'PLL' || item.category === 'COLL';
            if (!aufOk) return base.trim();
            const pre = AUFS[Math.floor(Math.random() * AUFS.length)];
            const post = AUFS[Math.floor(Math.random() * AUFS.length)];
            return [pre, base, post].filter(Boolean).join(' ').trim();
        }

        function trainPuzzleId(category) {
            return algCategoryPuzzleId(category);
        }
        function showScramble() {
            if (!trainPool.length) return;
            trainCurrent = trainPool[Math.floor(Math.random() * trainPool.length)];
            const scr = genScramble(trainCurrent);
            scrambleEl.textContent = scr || '(already solved)';
            const cat = trainCurrent.category;
            const isPyraLike = cat.startsWith('Pyraminx') || cat.startsWith('Megaminx');
            const isF2L  = cat === 'F2L' || cat === 'AF2L';
            const orient = (isF2L || isPyraLike) ? '' : 'z2';
            trainCube.setAttribute('puzzle', trainPuzzleId(cat));
            if (prefer2DForCategory(cat)) trainCube.setAttribute('visualization', '2D');
            else trainCube.removeAttribute('visualization');
            trainCube.setAttribute('experimental-setup-alg', applyPuzzleViewSetup(trainPuzzleId(cat), (orient ? orient + ' ' : '') + scr));
            trainCube.alg = '';
            revealBox.innerHTML = '';
        }

        function updateStats() {
            const n = trainTimes.length;
            document.getElementById('ts-count').textContent = n;
            document.getElementById('ts-last').textContent = n ? fmt(trainTimes[n - 1]) : '—';
            document.getElementById('ts-best').textContent = n ? fmt(Math.min(...trainTimes)) : '—';
            document.getElementById('ts-avg').textContent = n ? fmt(trainTimes.reduce((a, b) => a + b, 0) / n) : '—';
        }
        function revealCase() {
            if (!trainCurrent) return;
            const sol = mainChoices[trainCurrent.name] || cleanAlg(trainCurrent.main_alg);
            revealBox.innerHTML = `Case: <b>${trainCurrent.name}</b> &nbsp; ${sol}`;
        }

        const trainTimer = createTimer(document.getElementById('train-timer'), {
            onSolve: (t) => {
                trainTimes.push(t);
                updateStats();
                revealCase();
                showScramble();
            }
        });
        timerRegistry.push({
            timer: trainTimer,
            isActive: () => trainView.style.display !== 'none' && trainActive.style.display !== 'none'
        });
        // Touch-anywhere for trainer (non-mouse pointer on non-interactive areas)
        trainActive.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'mouse') return;
            if (e.target.closest('button, input, select, a, [data-act], .case-check')) return;
            trainTimer.press();
        });
        trainActive.addEventListener('pointerup', (e) => {
            if (e.pointerType === 'mouse') return;
            if (e.target.closest('button, input, select, a')) return;
            trainTimer.release();
        });

        document.getElementById('train-start').addEventListener('click', () => {
            const picked = [...trainCaselist.querySelectorAll('input:checked')].map(cb => cb.dataset.case);
            if (!picked.length) { alert('Select at least one case to practice.'); return; }
            trainPool = db.filter(it => picked.includes(it.name));
            if (trainPool.some(item => item.reference_path)) {
                alert('Megaminx is available as local PDF reference sheets in this pass, but not as case-by-case trainer scrambles yet.');
                return;
            }
            trainTimes = [];
            updateStats();
            trainSetup.style.display = 'none';
            trainActive.style.display = 'block';
            trainTimer.reset();
            showScramble();
        });
        document.getElementById('train-skip').addEventListener('click', () => {
            trainTimer.reset();
            showScramble();
        });
        document.getElementById('train-back').addEventListener('click', () => {
            trainTimer.reset();
            trainActive.style.display = 'none';
            trainSetup.style.display = 'block';
        });

        // ---- Puzzle timer (full solves — CSTimer / CubeDesk style) ----
        const PUZZLE_DISPLAY = {
            '222': '2x2x2', '333': '3x3x3', '444': '4x4x4', '555': '5x5x5',
            '666': '6x6x6', '777': '7x7x7', 'pyram': 'pyraminx', 'skewb': 'skewb',
            'minx': 'megaminx', 'sq1': 'square1', 'clock': 'clock'
        };
        const PUZZLE_HAS_CUBE = { '222': 1, '333': 1, '444': 1, '555': 1, '666': 1, '777': 1, 'pyram': 1, 'skewb': 1, 'minx': 1 };
        const puzzleSelect = document.getElementById('puzzle-select');
        const sessionSelect = document.getElementById('session-select');
        const puzzleScrambleEl = document.getElementById('puzzle-scramble');
        let puzzleCube = document.getElementById('puzzle-cube');
        const puzzleSolvesEl = document.getElementById('puzzle-solves');
        const puzzleGraph = document.getElementById('puzzle-graph');
        const puzzleHist = document.getElementById('puzzle-hist');
        const puzzleStatsGrid = document.getElementById('puzzle-stats-grid');
        const progressChartWindow = document.getElementById('progress-chart-window');
        const distributionBucket = document.getElementById('distribution-bucket');
        let timerChartPrefs = LS.get('timerChartPrefs', { window: '50', bucket: 'auto' });
        if (progressChartWindow) progressChartWindow.value = timerChartPrefs.window || '50';
        if (distributionBucket) distributionBucket.value = timerChartPrefs.bucket || 'auto';
        progressChartWindow?.addEventListener('change', (event) => {
            timerChartPrefs.window = event.target.value;
            LS.set('timerChartPrefs', timerChartPrefs);
            renderGraph();
        });
        distributionBucket?.addEventListener('change', (event) => {
            timerChartPrefs.bucket = event.target.value;
            LS.set('timerChartPrefs', timerChartPrefs);
            renderHistogram();
        });

        // Time List search wiring
        document.getElementById('time-list-search-btn')?.addEventListener('click', () => {
            const box = document.getElementById('time-list-search');
            const showing = box.style.display !== 'none';
            box.style.display = showing ? 'none' : '';
            if (!showing) {
                setTimeout(() => document.getElementById('time-list-search-input')?.focus(), 30);
            } else {
                timeListFilter = '';
                document.getElementById('time-list-search-input').value = '';
                if (typeof renderSolveList === 'function') renderSolveList();
            }
        });
        document.getElementById('time-list-search-input')?.addEventListener('input', (e) => {
            timeListFilter = e.target.value;
            if (typeof renderSolveList === 'function') renderSolveList();
        });

        let puzzleStore = null;     // { activeId, sessions: [{ id, name, solves }] }
        let puzzleStarted = false;
        let puzzleStartPromise = null;
        let currentScramble = '';
        let currentTrainingCase = null;
        const DEFAULT_TIMER_TRAINER_PREFS = Object.freeze({
            enabled: false,
            categories: [],
            cases: [],
            cubeFilter: '333'
        });
        let legacyTimerTrainerPrefs = LS.get('timerTrainerPrefs', null);
        let legacyTimerTrainerPending = !!(legacyTimerTrainerPrefs &&
            (legacyTimerTrainerPrefs.enabled || legacyTimerTrainerPrefs.categories?.length || legacyTimerTrainerPrefs.cases?.length));
        function reloadLegacyTimerTrainerPrefs() {
            legacyTimerTrainerPrefs = LS.get('timerTrainerPrefs', null);
            legacyTimerTrainerPending = !!(legacyTimerTrainerPrefs &&
                (legacyTimerTrainerPrefs.enabled || legacyTimerTrainerPrefs.categories?.length || legacyTimerTrainerPrefs.cases?.length));
        }
        function normalizeTimerTrainerPrefs(value, fallbackPuzzle = '333') {
            const raw = value && typeof value === 'object' ? value : {};
            return {
                enabled: !!raw.enabled,
                categories: Array.isArray(raw.categories) ? [...new Set(raw.categories.map(String))] : [],
                cases: Array.isArray(raw.cases) ? [...new Set(raw.cases.map(String))] : [],
                cubeFilter: raw.cubeFilter && raw.cubeFilter !== 'all' ? String(raw.cubeFilter) : fallbackPuzzle
            };
        }
        let timerTrainerPrefs = normalizeTimerTrainerPrefs(legacyTimerTrainerPrefs, '333');
        function timerTrainerCaseId(item) { return `${item.category}::${item.name}`; }
        function upgradeTimerTrainerCaseIds(prefs) {
            if (!prefs.cases.some(value => !String(value).includes('::'))) return prefs;
            const oldNames = new Set(prefs.cases);
            prefs.cases = db.filter(item => oldNames.has(item.name)).map(timerTrainerCaseId);
            return prefs;
        }
        upgradeTimerTrainerCaseIds(timerTrainerPrefs);
        function loadTimerTrainerPrefsForSession() {
            const session = puzzleStore && curSession();
            if (!session) return;
            if (legacyTimerTrainerPending) {
                if (!session.trainerPrefs) {
                    session.trainerPrefs = normalizeTimerTrainerPrefs(legacyTimerTrainerPrefs, session.puzzle || '333');
                }
                legacyTimerTrainerPending = false;
                try { localStorage.removeItem(LS.key('timerTrainerPrefs')); } catch (_) {}
            }
            session.trainerPrefs = upgradeTimerTrainerCaseIds(normalizeTimerTrainerPrefs(session.trainerPrefs, session.puzzle || '333'));
            timerTrainerPrefs = normalizeTimerTrainerPrefs(session.trainerPrefs, session.puzzle || '333');
            updateTimerTrainerStatus();
        }
        function saveTimerTrainerPrefs() {
            const session = puzzleStore && curSession();
            if (!session) return;
            session.trainerPrefs = normalizeTimerTrainerPrefs(timerTrainerPrefs, session.puzzle || '333');
            savePuzzle();
        }
        function availableTimerTrainerCategories() {
            return [...new Set(db.map(item => item.category))]
                .filter(cat => !isReferenceCategory(cat))
                .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
        }
        function timerTrainerItems() {
            const allowedCats = new Set(timerTrainerPrefs.categories || []);
            const allowedCases = new Set(timerTrainerPrefs.cases || []);
            const sessionPuzzle = puzzleStore && curSession() ? curSession().puzzle : timerTrainerPrefs.cubeFilter;
            return db.filter(item =>
                algCategoryEventId(item.category) === sessionPuzzle &&
                allowedCats.has(item.category) &&
                allowedCases.has(timerTrainerCaseId(item)) &&
                !isReferenceCategory(item.category)
            );
        }
        function timerTrainerEnabled() {
            return !!timerTrainerPrefs.enabled && timerTrainerItems().length > 0;
        }
        function timerTrainerStatusLabel() {
            if (!timerTrainerEnabled()) return 'Subset Trainer: Off';
            const items = timerTrainerItems();
            const labels = [...new Set(items.map(item => item.category.replace(/^Megaminx\s+|^Pyraminx\s+|^\d+x\d+\s+/, '')))];
            const subset = labels.length <= 2 ? labels.join(' + ') : `${labels.length} subsets`;
            return `${subset} · ${items.length} case${items.length === 1 ? '' : 's'}`;
        }
        function updateTimerTrainerStatus() {
            const statusEl = document.getElementById('timer-trainer-status');
            if (statusEl) statusEl.textContent = timerTrainerStatusLabel();
        }
        function showTimerTrainerReveal(html = '') {
            const el = document.getElementById('timer-trainer-reveal');
            if (!el) return;
            clearTimeout(showTimerTrainerReveal._t);
            if (!html) {
                el.style.display = 'none';
                el.innerHTML = '';
                return;
            }
            el.innerHTML = html;
            el.style.display = '';
            showTimerTrainerReveal._t = setTimeout(() => {
                if (el.innerHTML === html) {
                    el.style.display = 'none';
                    el.innerHTML = '';
                }
            }, 2600);
        }

        // Settings (persisted) — timerPrecision is declared in the shared section
        let inspectionEnabled = LS.get('inspection', false);
        let focusMode = LS.get('focusMode', false);
        let holdDelayMs = LS.get('holdDelay', 0);   // 0 | 300 | 550
        let sessionRailLayout = LS.get('sessionRailLayout', 'side');
        let zenMode = LS.get('zenMode', false);

        function applyZenMode() {
            timerView.classList.toggle('zen-mode', !!zenMode);
            document.body.classList.toggle('timer-zen-active', !!zenMode);
            const button = document.getElementById('timer-zen-toggle');
            if (button) {
                button.classList.toggle('on', !!zenMode);
                button.setAttribute('aria-pressed', String(!!zenMode));
                button.textContent = zenMode ? 'Exit Zen' : 'Zen';
            }
        }
        function toggleZenMode(force) {
            zenMode = typeof force === 'boolean' ? force : !zenMode;
            LS.set('zenMode', zenMode);
            applyZenMode();
        }

        function applySessionRailLayout() {
            document.body.classList.toggle('session-layout-top', sessionRailLayout === 'top');
        }
        applySessionRailLayout();

        function esc(s) {
            return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        }
        // Sessions are now GLOBAL — one list across all cubes. Each session
        // carries its own `puzzle` field (222/333/444/…). The cube selector
        // simply mirrors the active session's puzzle.
        function storeKey() { return 'sessions_global'; }
        function curSession() {
            return puzzleStore.sessions.find(s => s.id === puzzleStore.activeId) || puzzleStore.sessions[0];
        }
        function curSolves() { return curSession().solves; }
        function savePuzzle() { LS.set(storeKey(), puzzleStore); }
        function isGeneratedEmptySession(session) {
            if (!session || session.name !== 'Session 1' || (session.solves || []).length) return false;
            const extraKeys = Object.keys(session).filter(key =>
                !['id', 'name', 'puzzle', 'solves', 'trainerPrefs'].includes(key)
            );
            const prefs = session.trainerPrefs;
            const hasTrainerSetup = prefs && (
                prefs.enabled || prefs.categories?.length || prefs.cases?.length
            );
            return extraKeys.length === 0 && !hasTrainerSetup;
        }

        // Effective time in seconds, or Infinity for DNF
        function effTime(s) {
            if (s.penalty === 'dnf') return Infinity;
            return s.penalty === '+2' ? s.t + 2 : s.t;
        }
        function solveLabel(s) {
            if (s.penalty === 'dnf') return 'DNF';
            if (s.penalty === '+2') return fmt(s.t + 2) + '+';
            return fmt(s.t);
        }
        // Average of N: drop best & worst, mean the rest (a single DNF is the dropped worst)
        function aoN(solves, n) {
            if (solves.length < n) return null;
            const win = solves.slice(-n).map(effTime).sort((a, b) => a - b);
            const mid = win.slice(1, -1);
            if (mid.some(v => v === Infinity)) return Infinity;
            return mid.reduce((a, b) => a + b, 0) / mid.length;
        }
        function bestAoN(solves, n) {
            if (solves.length < n) return null;
            let best = Infinity;
            for (let i = 0; i + n <= solves.length; i++) {
                const a = aoN(solves.slice(i, i + n), n);
                if (a != null && a < best) best = a;
            }
            return best === Infinity ? null : best;
        }
        function stdDev(vals) {
            if (vals.length < 2) return null;
            const m = vals.reduce((a, b) => a + b, 0) / vals.length;
            return Math.sqrt(vals.reduce((a, b) => a + (b - m) * (b - m), 0) / vals.length);
        }
        function avgStr(v) { return v == null ? '—' : (v === Infinity ? 'DNF' : fmt(v)); }

        function updatePuzzleStats() {
            const solves = curSolves();
            const solved = solves.filter(s => s.penalty !== 'dnf').map(effTime);
            const lastSolve = solves.length ? solves[solves.length - 1] : null;
            const curSingle = lastSolve ? (lastSolve.penalty === 'dnf' ? Infinity : effTime(lastSolve)) : null;
            const bestSingle = solved.length ? Math.min(...solved) : null;
            const totalAvg = solved.length ? solved.reduce((a, b) => a + b, 0) / solved.length : null;

            const curAo5   = aoN(solves, 5);
            const curAo12  = aoN(solves, 12);
            const curAo100 = aoN(solves, 100);
            const bestAo5  = bestAoN(solves, 5);
            const bestAo12 = bestAoN(solves, 12);
            const bestAo100= bestAoN(solves, 100);

            // WCA records (from verified profile) — show single + average for the active puzzle
            const wcaRec = (profile && profile.wca_verified && profile.wca_records && profile.wca_records[puzzleSelect.value]) || null;
            const wcaSingle = wcaRec && wcaRec.single ? wcaRec.single : null;
            const wcaAvg    = wcaRec && wcaRec.average ? wcaRec.average : null;

            const showAo5   = solves.length >= 5;
            const showAo12  = solves.length >= 12;
            const showAo100 = solves.length >= 100;

            const cur = v => v == null ? '—' : (v === Infinity ? 'DNF' : fmt(v));
            const best = v => v == null ? '—' : (v === Infinity ? 'DNF' : fmt(v));
            const wcaFmt = v => v == null ? '—' : fmt(v);
            const zenStats = document.getElementById('timer-zen-stats');
            if (zenStats) {
                zenStats.innerHTML = [
                    ['Ao5', cur(curAo5)],
                    ['Ao12', cur(curAo12)],
                    ['PB', best(bestSingle)]
                ].map(([label, value]) => `<span><small>${label}</small><b>${value}</b></span>`).join('');
            }

            // Build header row + each stat as a row of [label, current, best]
            const rows = [];
            rows.push(['', 'CURRENT', 'BEST', 'hdr']);
            rows.push(['Solves', String(solves.length), '—']);
            rows.push(['Single', cur(curSingle), best(bestSingle)]);
            if (showAo5)   rows.push(['Ao5',   cur(curAo5),   best(bestAo5)]);
            if (showAo12)  rows.push(['Ao12',  cur(curAo12),  best(bestAo12)]);
            if (showAo100) rows.push(['Ao100', cur(curAo100), best(bestAo100)]);
            if (wcaSingle != null || wcaAvg != null) {
                rows.push(['WCA Single', wcaFmt(wcaSingle), '—']);
                rows.push(['WCA Avg',    wcaFmt(wcaAvg),    '—']);
            }
            // "Do more solves to show:" hint
            const pending = [];
            if (!showAo5)   pending.push('ao5');
            if (!showAo12)  pending.push('ao12');
            if (!showAo100) pending.push('ao100');

            puzzleStatsGrid.innerHTML = rows.map(([l, c, b, cls]) => {
                if (cls === 'hdr') return `<div class="stats-row stats-head"><span class="lbl"></span><span class="val">${c}</span><span class="val">${b}</span></div>`;
                return `<div class="stats-row"><span class="lbl">${l}</span><span class="val">${c}</span><span class="val">${b}</span></div>`;
            }).join('') + (pending.length ? `<div class="stats-pending">Do more solves to show: ${pending.join(', ')}</div>` : '');
        }
        let timeListFilter = '';   // current search filter for the time list
        function renderSolveList() {
            const solves = curSolves();
            if (!solves.length) {
                puzzleSolvesEl.innerHTML = '<span class="solve-list-empty">No solves yet.</span>';
                return;
            }
            const solved = solves.filter(s => s.penalty !== 'dnf').map(effTime);
            const best = solved.length ? Math.min(...solved) : null;
            // PB Ao5 = best Ao5 over the whole list
            const allAo5 = (() => {
                let b = Infinity;
                for (let i = 4; i < solves.length; i++) {
                    const v = aoN(solves.slice(0, i + 1), 5);
                    if (v != null && v !== Infinity && v < b) b = v;
                }
                return b === Infinity ? null : b;
            })();

            // Apply optional filter
            const q = timeListFilter.trim().toLowerCase();
            const matches = (s, i) => {
                if (!q) return true;
                // Special tokens
                if (q.startsWith('sub-pb')) {
                    return best != null && s.penalty !== 'dnf' && effTime(s) < best;
                }
                if (q.startsWith('sub ')) {
                    const n = parseFloat(q.slice(4));
                    return !isNaN(n) && s.penalty !== 'dnf' && effTime(s) < n;
                }
                if (q === 'dnf')   return s.penalty === 'dnf';
                if (q === '+2')    return s.penalty === '+2';
                if (q === 'pb')    return best != null && s.penalty !== 'dnf' && effTime(s) === best;
                // Default: substring match against note text
                return (s.note || '').toLowerCase().includes(q);
            };

            // Newest first; show inline ao5 / ao12 for each row
            const rows = solves.map((s, i) => {
                if (!matches(s, i)) return null;
                const isBest = s.penalty !== 'dnf' && best != null && effTime(s) === best;
                const upto = solves.slice(0, i + 1);
                const a5 = aoN(upto, 5), a12 = aoN(upto, 12);
                const cls = s.penalty === 'dnf' ? 'dnf' : (isBest ? 'best' : '');
                const noteHTML = s.note ? `<span class="solve-note" title="${esc(s.note)}">${esc(s.note)}</span>` : '';
                const singleCopy = solveLabel(s);
                const ao5Copy = a5 == null ? '' : (a5 === Infinity ? 'DNF' : fmt(a5));
                const ao12Copy = a12 == null ? '' : (a12 === Infinity ? 'DNF' : fmt(a12));
                return `<div class="solve-row ${cls}" data-idx="${i}">
                    <span class="solve-idx">${i + 1}.</span>
                    <span class="solve-time" data-copy-kind="single" data-copy-text="${esc(singleCopy)}" title="Click to copy single">${solveLabel(s)}${noteHTML}</span>
                    <span class="solve-ao" data-copy-kind="ao5" data-copy-text="${esc(ao5Copy)}" title="Click to copy ao5">${a5 == null ? '—' : (a5 === Infinity ? 'DNF' : fmt(a5))}</span>
                    <span class="solve-ao" data-copy-kind="ao12" data-copy-text="${esc(ao12Copy)}" title="Click to copy ao12">${a12 == null ? '—' : (a12 === Infinity ? 'DNF' : fmt(a12))}</span>
                </div>`;
            }).filter(Boolean).reverse().join('');
            puzzleSolvesEl.innerHTML = `
                <div class="solve-row solve-row-head">
                    <span>#</span><span>Time</span><span>ao5</span><span>ao12</span>
                </div>
                ${rows || '<span class="solve-list-empty">No matches.</span>'}`;
        }
        function solveCopyPayload(index) {
            const solves = curSolves();
            const solve = solves[index];
            if (!solve) return { single: '', ao5: '', ao12: '' };
            const upto = solves.slice(0, index + 1);
            const a5 = aoN(upto, 5);
            const a12 = aoN(upto, 12);
            return {
                single: solveLabel(solve),
                ao5: a5 == null ? '' : (a5 === Infinity ? 'DNF' : fmt(a5)),
                ao12: a12 == null ? '' : (a12 === Infinity ? 'DNF' : fmt(a12))
            };
        }
        function setSolvePopupCopyButtons(index) {
            const copyWrap = document.getElementById('solve-popup-copy-actions');
            if (!copyWrap) return;
            const payload = solveCopyPayload(index);
            copyWrap.querySelectorAll('[data-copy-act]').forEach(btn => {
                const kind = btn.dataset.copyAct;
                const text = payload[kind] || '';
                btn.dataset.copyText = text;
                btn.disabled = !text;
                btn.title = text ? `Copy ${kind}` : `No ${kind} available yet`;
            });
        }
        function renderGraph() {
            puzzleGraph._gdata = null;
            const allTimes = curSolves().filter(s => s.penalty !== 'dnf').map(effTime);
            const windowSize = timerChartPrefs.window === 'all' ? allTimes.length : parseInt(timerChartPrefs.window, 10) || 50;
            const seq = allTimes.slice(-windowSize);
            if (seq.length < 2) {
                puzzleGraph.innerHTML = `<text x="300" y="100" fill="#888" font-size="14" text-anchor="middle">Not enough solves yet</text>`;
                return;
            }
            const min = Math.min(...seq), max = Math.max(...seq), range = (max - min) || 1;
            const W = 600, H = 200;
            const padL = 50, padR = 10, padT = 14, padB = 26;
            const plotW = W - padL - padR, plotH = H - padT - padB;
            const X = i => padL + (seq.length > 1 ? i / (seq.length - 1) : 0.5) * plotW;
            const Y = v => padT + plotH - ((v - min) / range) * plotH;
            const fmtY = v => v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : Math.round(v).toString();

            // Grid step: find a nice interval giving 2–6 lines
            const gSteps = [0.25, 0.5, 1, 2, 5, 10, 20, 30, 60];
            const step = gSteps.find(s => range / s >= 2 && range / s <= 6) || (range / 4);
            const gridFirst = Math.ceil(min / step) * step;

            let svg = `<defs><linearGradient id="gAreaGrad" x1="0" y1="0" x2="0" y2="1">` +
                `<stop offset="0%" stop-color="var(--session-accent, var(--brand-accent))" stop-opacity="0.28"/>` +
                `<stop offset="100%" stop-color="var(--session-accent, var(--brand-accent))" stop-opacity="0.02"/>` +
                `</linearGradient></defs>`;

            // Horizontal grid lines + Y-axis labels
            for (let k = 0; k < 10; k++) {
                const v = Math.round((gridFirst + k * step) * 10000) / 10000;
                if (v > max + step * 0.01) break;
                const gy = Y(v);
                if (gy < padT - 2 || gy > padT + plotH + 2) continue;
                svg += `<line x1="${padL}" y1="${gy.toFixed(1)}" x2="${W - padR}" y2="${gy.toFixed(1)}" stroke="rgba(255,255,255,0.07)" stroke-width="1"/>`;
                svg += `<text x="${padL - 5}" y="${(gy + 3.5).toFixed(1)}" fill="#666" font-size="10" text-anchor="end">${fmtY(v)}</text>`;
            }

            // Area fill under time line
            const timePts = seq.map((v, i) => [X(i), Y(v)]);
            const baseY = padT + plotH;
            const areaPath = `M${timePts[0][0].toFixed(1)},${baseY} ` +
                timePts.map(([x, y]) => `L${x.toFixed(1)},${y.toFixed(1)}`).join(' ') +
                ` L${timePts[timePts.length - 1][0].toFixed(1)},${baseY} Z`;
            svg += `<path d="${areaPath}" fill="url(#gAreaGrad)"/>`;

            // PB line (dashed green)
            let run = Infinity;
            const pbPts = seq.map((v, i) => { run = Math.min(run, v); return [X(i), Y(run)]; });
            svg += `<polyline points="${pbPts.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')}" fill="none" stroke="var(--brand-accent-light)" stroke-width="1.5" stroke-dasharray="5 3" vector-effect="non-scaling-stroke"/>`;

            // Time line
            svg += `<polyline points="${timePts.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')}" fill="none" stroke="var(--session-accent, var(--brand-accent))" stroke-width="2" vector-effect="non-scaling-stroke"/>`;

            // Solve dots (skip when dense)
            if (seq.length <= 80) {
                svg += timePts.map(([cx, cy]) =>
                    `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="2.5" fill="var(--session-accent, var(--brand-accent))" stroke="rgba(0,0,0,0.35)" stroke-width="0.5"/>`
                ).join('');
            }

            // Baseline + solve-count labels
            svg += `<line x1="${padL}" y1="${baseY}" x2="${W - padR}" y2="${baseY}" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>`;
            svg += `<text x="${padL}" y="${H - 4}" fill="#555" font-size="9" text-anchor="start">1</text>`;
            if (seq.length > 2) svg += `<text x="${W - padR}" y="${H - 4}" fill="#555" font-size="9" text-anchor="end">${seq.length}</text>`;

            puzzleGraph.innerHTML = svg;
            puzzleGraph._gdata = { seq, timePts };
        }
        function renderHistogram() {
            puzzleHist._hdata = null;
            const vals = curSolves().filter(s => s.penalty !== 'dnf').map(effTime);
            if (vals.length < 3) {
                puzzleHist.innerHTML = `<text x="300" y="100" fill="#888" font-size="14" text-anchor="middle">Not enough solves yet</text>`;
                return;
            }
            const minV = Math.min(...vals), maxV = Math.max(...vals);
            const spread = maxV - minV;

            // Smart bucket size based on spread
            let bucketSize = timerChartPrefs.bucket === 'auto' ? null : parseFloat(timerChartPrefs.bucket);
            if (!bucketSize) {
                if      (spread <= 1.5)  bucketSize = 0.25;
                else if (spread <= 4)    bucketSize = 0.5;
                else if (spread <= 15)   bucketSize = 1;
                else if (spread <= 40)   bucketSize = 2;
                else if (spread <= 120)  bucketSize = 5;
                else                     bucketSize = 10;
            }

            const bucketStart = Math.floor(minV / bucketSize) * bucketSize;
            const numBuckets = Math.min(50, Math.ceil((maxV - bucketStart) / bucketSize) + 1);
            const counts = new Array(numBuckets).fill(0);
            const bucketData = Array.from({ length: numBuckets }, (_, i) => ({
                lo: bucketStart + i * bucketSize,
                hi: bucketStart + (i + 1) * bucketSize
            }));

            vals.forEach(v => {
                let b = Math.floor((v - bucketStart) / bucketSize);
                counts[Math.max(0, Math.min(numBuckets - 1, b))]++;
            });

            const maxC = Math.max(...counts);
            const peakBucket = counts.indexOf(maxC);
            const sorted = [...vals].sort((a, b) => a - b);
            const median = sorted[Math.floor(sorted.length / 2)];
            const medianBucket = Math.max(0, Math.min(numBuckets - 1, Math.floor((median - bucketStart) / bucketSize)));

            const W = 600, H = 200;
            const padL = 10, padR = 10, padT = 18, padB = 30;
            const plotW = W - padL - padR, plotH = H - padT - padB;
            const gap = numBuckets > 25 ? 1 : numBuckets > 15 ? 2 : 3;
            const bw = (plotW - gap * (numBuckets - 1)) / numBuckets;
            const labelEvery = numBuckets <= 10 ? 1 : numBuckets <= 20 ? 2 : numBuckets <= 40 ? 4 : 8;

            const fmtBkt = v => bucketSize >= 1 ? Math.round(v) + 's' : v.toFixed(bucketSize === 0.25 ? 2 : 1) + 's';

            let svg = '';

            // Baseline
            svg += `<line x1="${padL}" y1="${padT + plotH}" x2="${W - padR}" y2="${padT + plotH}" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>`;

            // Bars
            counts.forEach((c, i) => {
                if (c === 0) return;
                const barH = (c / maxC) * plotH;
                const x = padL + i * (bw + gap);
                const y = padT + plotH - barH;
                const isPeak = i === peakBucket;
                svg += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${barH.toFixed(1)}" fill="${isPeak ? 'var(--brand-accent-light)' : 'var(--session-accent, var(--brand-accent))'}" opacity="${isPeak ? 1 : 0.78}" rx="2"/>`;
                if (bw >= 14 && barH > 14) {
                    svg += `<text x="${(x + bw / 2).toFixed(1)}" y="${(y - 3).toFixed(1)}" fill="${isPeak ? 'var(--brand-accent-light)' : '#aaa'}" font-size="10" text-anchor="middle">${c}</text>`;
                }
            });

            // Median indicator line
            const mx = padL + medianBucket * (bw + gap) + bw / 2;
            svg += `<line x1="${mx.toFixed(1)}" y1="${padT}" x2="${mx.toFixed(1)}" y2="${padT + plotH}" stroke="var(--brand-accent-light)" opacity=".62" stroke-width="1.5" stroke-dasharray="3 3"/>`;
            svg += `<text x="${mx.toFixed(1)}" y="${padT - 3}" fill="var(--brand-accent-light)" font-size="9" text-anchor="middle">med</text>`;

            // X-axis labels
            for (let i = 0; i < numBuckets; i += labelEvery) {
                const x = padL + i * (bw + gap) + bw / 2;
                svg += `<text x="${x.toFixed(1)}" y="${H - 4}" fill="#666" font-size="10" text-anchor="middle">${fmtBkt(bucketData[i].lo)}</text>`;
            }

            puzzleHist.innerHTML = svg;
            puzzleHist._hdata = { counts, bucketData, bucketSize, padL, gap, bw, padT, plotH, W: 600 };
        }
        function refreshPuzzle() {
            updatePuzzleStats();
            renderSolveList();
            renderGraph();
            renderHistogram();
            renderCompactQuestPanels();
            updatePuzzleHintVisibility();
        }
        // Graph hover tooltips (wired once; read _gdata / _hdata set by render functions)
        {
            const gTip = document.getElementById('graph-tooltip');
            function showTip(e, text) {
                if (!gTip) return;
                gTip.textContent = text;
                gTip.style.display = 'block';
                gTip.style.left = (e.clientX + 14) + 'px';
                gTip.style.top  = (e.clientY - 36) + 'px';
            }
            function hideTip() { if (gTip) gTip.style.display = 'none'; }

            puzzleGraph.addEventListener('mousemove', (e) => {
                const d = puzzleGraph._gdata;
                if (!d) return hideTip();
                const rect = puzzleGraph.getBoundingClientRect();
                const svgX = (e.clientX - rect.left) / rect.width * 600;
                let best = 0, bestD = Infinity;
                d.timePts.forEach(([px], i) => { const dd = Math.abs(svgX - px); if (dd < bestD) { bestD = dd; best = i; } });
                showTip(e, `#${best + 1}: ${fmt(d.seq[best])}s`);
            });
            puzzleGraph.addEventListener('mouseleave', hideTip);

            puzzleHist.addEventListener('mousemove', (e) => {
                const d = puzzleHist._hdata;
                if (!d) return hideTip();
                const rect = puzzleHist.getBoundingClientRect();
                const svgX = (e.clientX - rect.left) / rect.width * d.W;
                let hovBucket = -1;
                for (let i = 0; i < d.counts.length; i++) {
                    const x = d.padL + i * (d.bw + d.gap);
                    if (svgX >= x && svgX <= x + d.bw) { hovBucket = i; break; }
                }
                if (hovBucket < 0 || d.counts[hovBucket] === 0) return hideTip();
                const b = d.bucketData[hovBucket];
                const fmtB = v => d.bucketSize >= 1 ? Math.round(v) + 's' : v.toFixed(d.bucketSize === 0.25 ? 2 : 1) + 's';
                const n = d.counts[hovBucket];
                showTip(e, `${fmtB(b.lo)}–${fmtB(b.hi)}: ${n} solve${n !== 1 ? 's' : ''}`);
            });
            puzzleHist.addEventListener('mouseleave', hideTip);
        }

        async function nextPuzzleScramble() {
            beginSmartScrambleLoading();
            if (timerTrainerEnabled()) {
                const items = timerTrainerItems();
                const nextCase = items[Math.floor(Math.random() * items.length)];
                currentTrainingCase = nextCase || null;
                currentScramble = genScramble(nextCase);
                puzzleScrambleEl.textContent = `${nextCase.name} · ${currentScramble}`;
                resetPuzzleCubeView(currentScramble);
                applyPuzzleCube();
                initSolvedSim(currentScramble);
                return;
            }
            const ev = puzzleSelect.value;
            currentTrainingCase = null;
            currentScramble = '';
            puzzleScrambleEl.textContent = 'Generating scramble…';
            let scr = '';
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    scr = (await getRandomScrambleForEvent(ev)).toString();
                    break;
                } catch (err) {
                    if (attempt < 2) {
                        await new Promise(r => setTimeout(r, 700 * (attempt + 1)));
                        continue;
                    }
                    console.error('Scramble generation failed after 3 attempts:', err);
                    puzzleScrambleEl.innerHTML = 'Scramble unavailable — <button id="retry-scr-btn" style="background:none;border:none;color:var(--orange);cursor:pointer;font-family:inherit;font-size:inherit;text-decoration:underline;padding:0;">retry</button>';
                    document.getElementById('retry-scr-btn')?.addEventListener('click', nextPuzzleScramble);
                    return;
                }
            }
            if (puzzleSelect.value !== ev) return; // puzzle changed while awaiting
            currentScramble = scr;
            puzzleScrambleEl.textContent = scr;
            resetPuzzleCubeView(scr);
            applyPuzzleCube();
            // Set up the solved-state simulator for smart-cube auto-stop
            initSolvedSim(scr);
        }

        function resetPuzzleCubeView(scrambleText = currentScramble) {
            const ev = puzzleSelect.value;
            if (PUZZLE_HAS_CUBE[ev]) {
                puzzleCubeWrap.dataset.supported = '1';
                puzzleCube.setAttribute('puzzle', PUZZLE_DISPLAY[ev]);
                const smartCubeActive = timerView.classList.contains('smart-cube-active');
                if (smartCubeActive) puzzleCube.setAttribute('visualization', '3D');
                else if (prefer2DForPuzzle(PUZZLE_DISPLAY[ev])) puzzleCube.setAttribute('visualization', '2D');
                else puzzleCube.removeAttribute('visualization');
                if (smartCubeActive) {
                    puzzleCube.setAttribute('tempo-scale', '5');
                    puzzleCube.setAttribute('experimental-drag-input', 'none');
                } else {
                    puzzleCube.removeAttribute('tempo-scale');
                    puzzleCube.removeAttribute('experimental-drag-input');
                }
                const setupAlg = smartCubeActive ? '' : applyPuzzleViewSetup(PUZZLE_DISPLAY[ev], scrambleText || '');
                puzzleCube.setAttribute('experimental-setup-alg', setupAlg);
                puzzleCube.setAttribute('alg', '');
                puzzleCube.alg = '';
            } else {
                puzzleCubeWrap.dataset.supported = '0';
            }
        }

        // ---- Sessions ----
        // Cube-event icons: real SVG clipart for events that have a file, text badges for the rest
        const CUBE_ICON_FILE = {
            '222': 'Cube_Clipart/222.svg',
            '333': 'Cube_Clipart/333.svg',
            '444': 'Cube_Clipart/444.svg',
            '555': 'Cube_Clipart/555.svg',
            '666': 'Cube_Clipart/666.svg',
            '777': 'Cube_Clipart/777.svg',
            'pyram': 'Cube_Clipart/pyram.svg',
            'skewb': 'Cube_Clipart/skewb.svg',
            'minx':  'Cube_Clipart/minx.svg',
            'sq1':   'Cube_Clipart/sq1.svg',
            'clock': 'Cube_Clipart/clock.svg'
        };
        const CUBE_ICON_LABEL = { 'oh':'OH', 'bld':'BLD', 'fmc':'FMC' };
        function iconHTML(raw) {
            const v = raw || '🎲';
            if (typeof v === 'string' && v.startsWith('cube:')) {
                const ev = v.slice(5);
                if (CUBE_ICON_FILE[ev]) {
                    return `<img class="cube-ic-img" src="${esc(CUBE_ICON_FILE[ev])}" alt="${esc(ev)}">`;
                }
                const lbl = CUBE_ICON_LABEL[ev] || ev.toUpperCase();
                return `<span class="cube-ic" data-ev="${esc(ev)}">${esc(lbl)}</span>`;
            }
            return esc(v);
        }

        function renderSessionSelect() {
            sessionSelect.innerHTML = puzzleStore.sessions.map(s => {
                // Native <select> can't render HTML; for cube icons fall back to puzzle-label text
                let pre = s.icon || '';
                if (pre.startsWith('cube:')) {
                    const ev = pre.slice(5);
                    pre = (typeof PUZZLE_LABEL !== 'undefined' && PUZZLE_LABEL[ev]) || CUBE_ICON_LABEL[ev] || ev.toUpperCase();
                }
                const lab = (pre ? pre + ' ' : '') + (s.name || 'Session');
                return `<option value="${s.id}" ${s.id === puzzleStore.activeId ? 'selected' : ''}>${esc(lab)}</option>`;
            }).join('');
            const active = curSession();
            const colorMap = { orange:'#FF9F0A', blue:'#5ab0ff', green:'#5fe08c', teal:'#22d3ee', purple:'#c084fc', pink:'#f472b6' };
            const c = colorMap[active && active.color] || '#FF9F0A';
            timerView.style.setProperty('--session-accent', c);
            // Mirror to topbar pill (if it exists)
            const pillIcon = document.getElementById('topbar-session-icon');
            const pillName = document.getElementById('topbar-session-name');
            if (pillIcon) pillIcon.innerHTML = iconHTML((active && active.icon) || '🎲');
            if (pillName) pillName.textContent = (active && active.name) || 'Session';

            // Session list in the settings modal — show the puzzle each session is for
            const listEl = document.getElementById('session-list');
            if (listEl) {
                const puzzleLabel = (typeof PUZZLE_LABEL !== 'undefined') ? PUZZLE_LABEL : {};
                listEl.innerHTML = puzzleStore.sessions.map(s => {
                    const isActive = s.id === puzzleStore.activeId;
                    const swatch = colorMap[s.color] || '#FF9F0A';
                    const pLabel = puzzleLabel[s.puzzle] || s.puzzle || '';
                    return `<div class="session-row ${isActive ? 'is-active' : ''}" data-sid="${s.id}">
                        <span class="session-swatch" style="background:${swatch}"></span>
                        <span class="session-icon">${iconHTML(s.icon)}</span>
                        <span class="session-name">${esc(s.name || 'Session')}</span>
                        ${pLabel ? `<span class="session-puzzle-tag">${esc(pLabel)}</span>` : ''}
                        <span class="session-count">${(s.solves || []).length}</span>
                        <button type="button" class="session-edit" data-act="edit" title="Edit session">✎</button>
                    </div>`;
                }).join('');
            }
            // Vertical session rail — active session is a tall card with rotated name + settings cog
            const railEl = document.getElementById('session-rail-list');
            if (railEl) {
                const COG_INLINE_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm9 3a1 1 0 0 0-.8-.98l-1.8-.36-.5-1.21.94-1.58a1 1 0 0 0-.16-1.2l-1.42-1.42a1 1 0 0 0-1.2-.16l-1.58.95-1.21-.5-.36-1.8A1 1 0 0 0 13 2h-2a1 1 0 0 0-.98.8l-.36 1.8-1.21.5L6.87 4.16a1 1 0 0 0-1.2.16L4.25 5.74a1 1 0 0 0-.16 1.2L5.04 8.52l-.5 1.21-1.8.36a1 1 0 0 0-.74.97v2a1 1 0 0 0 .8.98l1.8.36.5 1.21-.94 1.58a1 1 0 0 0 .16 1.2l1.42 1.42a1 1 0 0 0 1.2.16l1.58-.94 1.21.5.36 1.8A1 1 0 0 0 11 22h2a1 1 0 0 0 .98-.8l.36-1.8 1.21-.5 1.58.94a1 1 0 0 0 1.2-.16l1.42-1.42a1 1 0 0 0 .16-1.2l-.94-1.58.5-1.21 1.8-.36A1 1 0 0 0 21 13z"/></svg>';
                railEl.innerHTML = puzzleStore.sessions.map(s => {
                    const isActive = s.id === puzzleStore.activeId;
                    const swatch = colorMap[s.color] || '#FF9F0A';
                    const cog = isActive ? `<button type="button" class="session-card-cog" data-act="edit" title="Session settings" aria-label="Session settings">${COG_INLINE_SVG}</button>` : '';
                    return `<button type="button" class="session-card ${isActive ? 'is-active' : ''}" data-sid="${s.id}" title="${esc(s.name || 'Session')}" style="--c:${swatch}">
                        <span class="session-card-ic">${iconHTML(s.icon)}</span>
                        <span class="session-card-name">${esc(s.name || 'Session')}</span>
                        ${cog}
                    </button>`;
                }).join('');
            }
        }
        function loadPuzzle() {
            let store = LS.get(storeKey(), null);
            let shouldSave = false;
            if (!store || !store.sessions || !store.sessions.length) {
                // First-time / legacy migration: gather every existing `sess_*`
                // store, flatten its sessions, stamp them with their puzzle.
                const allSessions = [];
                for (const pid of PUZZLES_FOR_STATS) {
                    const legacy = LS.get('sess_' + pid, null);
                    if (legacy && Array.isArray(legacy.sessions)) {
                        for (const s of legacy.sessions) {
                            allSessions.push(Object.assign({}, s, {
                                id: s.id || ('s' + Date.now() + Math.floor(Math.random() * 1000)),
                                puzzle: pid,
                                solves: s.solves || []
                            }));
                        }
                    }
                }
                // If nothing existed, seed a starter 3x3 session
                if (!allSessions.length) {
                    allSessions.push({
                        id: 'starter-session',
                        name: 'Session 1',
                        puzzle: puzzleSelect.value || '333',
                        solves: []
                    });
                }
                store = { activeId: allSessions[0].id, sessions: allSessions };
                shouldSave = true;
            }
            puzzleStore = store;
            const generatedByPuzzle = new Map();
            const dedupedSessions = [];
            puzzleStore.sessions.forEach(session => {
                if (!isGeneratedEmptySession(session)) {
                    dedupedSessions.push(session);
                    return;
                }
                const puzzle = session.puzzle || '333';
                const existingIndex = generatedByPuzzle.get(puzzle);
                if (existingIndex == null) {
                    generatedByPuzzle.set(puzzle, dedupedSessions.length);
                    dedupedSessions.push(session);
                    return;
                }
                shouldSave = true;
                if (session.id === puzzleStore.activeId) {
                    dedupedSessions[existingIndex] = session;
                }
            });
            puzzleStore.sessions = dedupedSessions;
            if (!puzzleStore.sessions.some(session => session.id === puzzleStore.activeId)) {
                puzzleStore.activeId = puzzleStore.sessions[0].id;
                shouldSave = true;
            }
            const normalizedBefore = JSON.stringify(puzzleStore);
            puzzleStore.sessions.forEach(session => {
                session.solves = Array.isArray(session.solves) ? session.solves : [];
                if (session.trainerPrefs) {
                    session.trainerPrefs = upgradeTimerTrainerCaseIds(
                        normalizeTimerTrainerPrefs(session.trainerPrefs, session.puzzle || '333')
                    );
                }
            });
            // Sync the cube selector to the active session's puzzle
            const active = curSession();
            if (active && active.puzzle && puzzleSelect.value !== active.puzzle) {
                puzzleSelect.value = active.puzzle;
            }
            loadTimerTrainerPrefsForSession();
            if (shouldSave || JSON.stringify(puzzleStore) !== normalizedBefore) savePuzzle();
            renderSessionSelect();
            refreshPuzzle();
        }
        function startPuzzle() {
            if (puzzleStarted) return Promise.resolve();
            if (puzzleStartPromise) return puzzleStartPromise;
            puzzleStartPromise = (async () => {
                // Do not create a guest session while Firebase is still deciding
                // whether this tab belongs to a signed-in account.
                await fbSync.waitForAuth();
                if (puzzleStarted) return;
                puzzleStarted = true;
                loadPuzzle();
                puzzleTimer.reset();
                nextPuzzleScramble();
            })().finally(() => {
                puzzleStartPromise = null;
            });
            return puzzleStartPromise;
        }

        // ---- Solve feedback: yellow star (PB) OR green↑/red↓ (vs current Ao5) ----
        // PB takes precedence — the arrow only shows when it's NOT a PB.
        function showSolveFeedback({ pb = null /* 'single' | 'ao5' | 'both' | null */, arrow = null /* 'up' | 'down' | null */ }) {
            const pieces = [];
            if (pb) {
                const label = pb === 'single' ? 'PB SINGLE!' : (pb === 'ao5' ? 'PB AO5!' : 'PB SINGLE + AO5!');
                pieces.push(`<div class="fb-pb"><span class="fb-star">★</span><span class="fb-pb-label">${label}</span></div>`);
            } else if (arrow === 'up') {
                pieces.push('<span class="fb-arrow up">▲</span>');
            } else if (arrow === 'down') {
                pieces.push('<span class="fb-arrow down">▼</span>');
            }
            if (!pieces.length) return;
            const html = pieces.join('');
            // Show only the inline (next-to-timer) animation. The legacy corner
            // element is intentionally left blank to avoid showing the PB twice.
            const inline = document.getElementById('solve-feedback-inline');
            if (inline) inline.innerHTML = html;
            clearTimeout(showSolveFeedback._t);
            showSolveFeedback._t = setTimeout(() => {
                if (inline) inline.innerHTML = '';
            }, 2200);
        }

        function maybeShowSolveFeedback(priorSolves, newSolve) {
            if (newSolve.penalty === 'dnf') return;
            const tNow = newSolve.penalty === '+2' ? newSolve.t + 2 : newSolve.t;

            // PB single (across prior solves)
            const priorBest = priorSolves
                .filter(s => s.penalty !== 'dnf')
                .map(s => s.penalty === '+2' ? s.t + 2 : s.t)
                .reduce((a, b) => Math.min(a, b), Infinity);
            const isPbSingle = tNow < priorBest;

            // PB Ao5 (best ao5 in all solves so far vs prior)
            const priorBestAo5 = bestAoNAll(priorSolves, 5);
            const allBestAo5   = bestAoNAll(priorSolves.concat([newSolve]), 5);
            const isPbAo5 = (allBestAo5 != null && allBestAo5 !== Infinity) &&
                            (priorBestAo5 == null || priorBestAo5 === Infinity || allBestAo5 < priorBestAo5);

            // Current Ao5 = the running ao5 of the LAST 5 solves INCLUDING this one
            // Compare this solve's time to that rolling ao5 — if lower, it's a "good" solve.
            const currentAo5 = aoNAll(priorSolves.concat([newSolve]), 5);
            let arrow = null;
            if (currentAo5 != null && currentAo5 !== Infinity) {
                if (tNow < currentAo5)      arrow = 'up';
                else if (tNow > currentAo5) arrow = 'down';
            }

            let pb = null;
            if (isPbSingle && isPbAo5) pb = 'both';
            else if (isPbSingle)       pb = 'single';
            else if (isPbAo5)          pb = 'ao5';
            showSolveFeedback({ pb, arrow });
        }

        const puzzleTimer = createTimer(document.getElementById('puzzle-timer'), {
            useInspection: () => inspectionEnabled,
            holdDelay: () => holdDelayMs,
            hideWhileRunning: () => focusMode,
            onSolve: (t, pen) => {
                // Compute PB status BEFORE pushing this solve
                const prior = curSolves().slice();
                const newSolve = {
                    t,
                    penalty: pen || 'ok',
                    scramble: currentScramble,
                    date: Date.now(),
                    trainingCase: currentTrainingCase ? currentTrainingCase.name : '',
                    trainingCategory: currentTrainingCase ? currentTrainingCase.category : ''
                };
                curSolves().push(newSolve);
                savePuzzle();
                refreshPuzzle();
                // Celebrate PBs
                maybeShowSolveFeedback(prior, newSolve);
                if (currentTrainingCase) {
                    const chosenAlg = mainChoices[currentTrainingCase.name] || cleanAlg(currentTrainingCase.main_alg);
                    showTimerTrainerReveal(`Solved <b>${esc(currentTrainingCase.name)}</b> from <b>${esc(currentTrainingCase.category)}</b><br>${esc(chosenAlg)}`);
                } else {
                    showTimerTrainerReveal('');
                }
                nextPuzzleScramble();
            }
        });
        timerRegistry.push({
            timer: puzzleTimer,
            isActive: () => timerView.style.display !== 'none' && !timerView.classList.contains('smart-cube-active')
        });
        // Keep signed-in or guest solves in sync between tabs without creating
        // another session or writing the unchanged store back to Firestore.
        window.addEventListener('storage', (event) => {
            if (!puzzleStarted || event.key !== LS.key(storeKey()) || !event.newValue) return;
            try {
                const incoming = JSON.parse(event.newValue);
                if (!incoming || !Array.isArray(incoming.sessions) || !incoming.sessions.length) return;
                puzzleStore = incoming;
                const active = curSession();
                if (active?.puzzle) puzzleSelect.value = active.puzzle;
                loadTimerTrainerPrefsForSession();
                renderSessionSelect();
                refreshPuzzle();
            } catch (_) {}
        });
        // Touch-anywhere for puzzle timer (non-mouse pointer on non-interactive areas)
        timerView.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'mouse') return;
            if (e.target.closest('button, input, select, a, [data-act], .session-card, .solve-row, .modal-backdrop, .timer-hidden-controls')) return;
            if (inputMode !== 'timer') return;
            if (timerView.classList.contains('smart-cube-active')) return;
            puzzleTimer.press();
        });
        timerView.addEventListener('pointerup', (e) => {
            if (e.pointerType === 'mouse') return;
            if (e.target.closest('button, input, select, a, .timer-hidden-controls')) return;
            if (inputMode !== 'timer') return;
            if (timerView.classList.contains('smart-cube-active')) return;
            puzzleTimer.release();
        });

        sessionSelect.addEventListener('change', () => {
            puzzleStore.activeId = sessionSelect.value;
            const session = curSession();
            if (session?.puzzle) puzzleSelect.value = session.puzzle;
            loadTimerTrainerPrefsForSession();
            savePuzzle();
            renderSessionSelect();
            refreshPuzzle();
            nextPuzzleScramble();
        });
        // Activating a session also retargets the cube selector to its puzzle.
        function activateSessionById(sid) {
            puzzleStore.activeId = sid;
            const s = puzzleStore.sessions.find(x => x.id === sid);
            if (s && s.puzzle && puzzleSelect.value !== s.puzzle) {
                puzzleSelect.value = s.puzzle;
            }
            loadTimerTrainerPrefsForSession();
            savePuzzle();
            renderSessionSelect();
            refreshPuzzle();
            if (typeof nextPuzzleScramble === 'function') nextPuzzleScramble();
        }
        // Click any session row → activate it. Click pencil → edit it.
        document.getElementById('session-list')?.addEventListener('click', (e) => {
            const row = e.target.closest('.session-row');
            if (!row) return;
            const sid = row.dataset.sid;
            if (e.target.closest('.session-edit')) {
                openSessionEditor('edit', sid);
                return;
            }
            activateSessionById(sid);
        });
        document.getElementById('session-new').addEventListener('click', () => openSessionEditor('new'));
        document.getElementById('session-delete').addEventListener('click', async () => {
            if (puzzleStore.sessions.length <= 1) { alert('You need at least one session.'); return; }
            if (!await window.ucConfirm('Delete session "' + curSession().name + '" and all its solves?', { title: 'Delete session?', confirmLabel: 'Delete', danger: true })) return;
            puzzleStore.sessions = puzzleStore.sessions.filter(s => s.id !== puzzleStore.activeId);
            puzzleStore.activeId = puzzleStore.sessions[0].id;
            puzzleSelect.value = curSession().puzzle || '333';
            loadTimerTrainerPrefsForSession();
            savePuzzle();
            renderSessionSelect();
            refreshPuzzle();
            nextPuzzleScramble();
        });

        // ---- Settings ----
        const inspectionBtn = document.getElementById('ps-inspection');
        const focusBtn = document.getElementById('ps-focus');
        const holdBtn = document.getElementById('ps-hold');
        const precisionBtn = document.getElementById('ps-precision');
        const sessionLayoutBtn = document.getElementById('ps-session-layout');
        const puzzleHint = document.getElementById('puzzle-hint');
        function updatePuzzleHintVisibility() {
            const hidden = totalSolvesAll() >= 3;
            puzzleHint.classList.toggle('lifetime-hint-hidden', hidden);
            puzzleHint.setAttribute('aria-hidden', String(hidden));
        }
        function applySettingsUI() {
            inspectionBtn.textContent = 'Inspection: ' + (inspectionEnabled ? 'On' : 'Off');
            inspectionBtn.classList.toggle('on', inspectionEnabled);
            focusBtn.textContent = 'Focus: ' + (focusMode ? 'On' : 'Off');
            focusBtn.classList.toggle('on', focusMode);
            holdBtn.textContent = 'Hold: ' + (holdDelayMs / 1000).toFixed(2) + 's';
            holdBtn.classList.toggle('on', holdDelayMs > 0);
            precisionBtn.textContent = 'Decimals: ' + timerPrecision;
            sessionLayoutBtn.textContent = 'Sessions: ' + (sessionRailLayout === 'top' ? 'Top' : 'Side');
            sessionLayoutBtn.classList.toggle('on', sessionRailLayout === 'top');
            puzzleHint.innerHTML = inspectionEnabled
                ? 'Press <b>Space</b> to start 15s inspection, then hold &amp; release to solve'
                : 'Hold <b>Space</b> (or tap below), release to start — press again to stop';
            updatePuzzleHintVisibility();
        }
        inspectionBtn.addEventListener('click', () => {
            inspectionEnabled = !inspectionEnabled;
            LS.set('inspection', inspectionEnabled);
            applySettingsUI();
        });
        focusBtn.addEventListener('click', () => {
            focusMode = !focusMode;
            LS.set('focusMode', focusMode);
            applySettingsUI();
        });
        holdBtn.addEventListener('click', () => {
            holdDelayMs = holdDelayMs === 0 ? 300 : (holdDelayMs === 300 ? 550 : 0);
            LS.set('holdDelay', holdDelayMs);
            applySettingsUI();
        });
        precisionBtn.addEventListener('click', () => {
            timerPrecision = timerPrecision === 2 ? 3 : 2;
            LS.set('precision', timerPrecision);
            applySettingsUI();
            if (puzzleStore) refreshPuzzle();
        });
        sessionLayoutBtn.addEventListener('click', () => {
            sessionRailLayout = sessionRailLayout === 'side' ? 'top' : 'side';
            LS.set('sessionRailLayout', sessionRailLayout);
            applySessionRailLayout();
            applySettingsUI();
        });
        applySettingsUI();

        puzzleSelect.addEventListener('change', () => {
            // Picking a new cube switches to (or creates) a session for that cube.
            // The session list itself stays visible regardless of the cube.
            const cube = puzzleSelect.value;
            if (!timerTrainerEnabled()) showTimerTrainerReveal('');
            // Find an existing session for this cube
            let target = puzzleStore.sessions.find(s => s.puzzle === cube);
            if (!target) {
                target = {
                    id: 's' + Date.now(),
                    name: 'Session 1',
                    puzzle: cube,
                    solves: []
                };
                puzzleStore.sessions.push(target);
            }
            puzzleStore.activeId = target.id;
            loadTimerTrainerPrefsForSession();
            savePuzzle();
            renderSessionSelect();
            refreshPuzzle();
            puzzleTimer.reset();
            nextPuzzleScramble();
        });
        document.getElementById('puzzle-skip').addEventListener('click', () => {
            puzzleTimer.reset();
            if (!timerTrainerEnabled()) showTimerTrainerReveal('');
            nextPuzzleScramble();
        });
        document.getElementById('timer-copy-scramble')?.addEventListener('click', async (event) => {
            if (!currentScramble) return;
            const button = event.currentTarget;
            const copied = await copyText(currentScramble);
            const prior = button.textContent;
            button.textContent = copied ? 'Copied' : 'Copy failed';
            setTimeout(() => { button.textContent = prior; }, 900);
        });
        document.getElementById('timer-zen-toggle')?.addEventListener('click', () => toggleZenMode());
        applyZenMode();
        document.getElementById('puzzle-clear').addEventListener('click', async () => {
            if (!curSolves().length) return;
            if (!await window.ucConfirm('Clear all solves in this session?', { title: 'Clear solves?', confirmLabel: 'Clear', danger: true })) return;
            curSession().solves = [];
            savePuzzle();
            refreshPuzzle();
        });

        // ---- Solve popup — scramble detail, penalties, delete ----
        const solvePopup = document.getElementById('solve-popup');
        let popupIdx = -1;
        puzzleSolvesEl.addEventListener('click', async (e) => {
            const chip = e.target.closest('.solve-row');
            if (!chip || chip.classList.contains('solve-row-head')) return;
            const timeTarget = e.target.closest('.solve-time');
            const copyTarget = e.target.closest('[data-copy-kind]');
            if (copyTarget) {
                if (!timeTarget) {
                    const text = copyTarget.dataset.copyText || '';
                    if (!text) return;
                    const ok = await copyText(text);
                    const prevTitle = copyTarget.getAttribute('title') || '';
                    copyTarget.setAttribute('title', ok ? 'Copied!' : prevTitle);
                    copyTarget.classList.add('copied');
                    setTimeout(() => {
                        copyTarget.classList.remove('copied');
                        if (prevTitle) copyTarget.setAttribute('title', prevTitle);
                    }, 900);
                    return;
                }
            }
            popupIdx = parseInt(chip.dataset.idx, 10);
            const s = curSolves()[popupIdx];
            document.getElementById('solve-popup-time').textContent =
                'Solve ' + (popupIdx + 1) + ': ' + solveLabel(s);
            document.getElementById('solve-popup-date').textContent =
                s.date ? new Date(s.date).toLocaleString() : 'no date saved';
            document.getElementById('solve-popup-scramble').textContent =
                s.scramble || '(no scramble saved)';
            setSolvePopupCopyButtons(popupIdx);
            solvePopup.classList.add('open');
            const r = chip.getBoundingClientRect();
            const pw = solvePopup.offsetWidth, ph = solvePopup.offsetHeight;
            let x = r.left, y = r.bottom + 6;
            if (x + pw > window.innerWidth - 8) x = window.innerWidth - 8 - pw;
            if (y + ph > window.innerHeight - 8) y = r.top - 6 - ph;
            solvePopup.style.left = Math.max(8, x) + 'px';
            solvePopup.style.top = Math.max(8, y) + 'px';
        });
        solvePopup.addEventListener('click', (e) => {
            const copyBtn = e.target.closest('[data-copy-act]');
            if (copyBtn) {
                copyText(copyBtn.dataset.copyText || '');
                const original = copyBtn.textContent;
                copyBtn.textContent = 'Copied!';
                setTimeout(() => { copyBtn.textContent = original; }, 900);
                return;
            }
            const btn = e.target.closest('button');
            if (!btn || popupIdx < 0) return;
            const act = btn.dataset.act;
            const solves = curSolves();
            if (act === 'copy') {
                if (navigator.clipboard) navigator.clipboard.writeText(solves[popupIdx].scramble || '');
                btn.textContent = 'Copied!';
                setTimeout(() => { btn.textContent = 'Copy scramble'; }, 1000);
                return;
            }
            if (act === 'delete') solves.splice(popupIdx, 1);
            else solves[popupIdx].penalty = act;
            savePuzzle();
            refreshPuzzle();
            solvePopup.classList.remove('open');
            popupIdx = -1;
        });
        document.addEventListener('pointerdown', (e) => {
            if (solvePopup.classList.contains('open') &&
                !solvePopup.contains(e.target) && !e.target.closest('.solve-row')) {
                solvePopup.classList.remove('open');
                popupIdx = -1;
            }
        });

        // ---- Cube show/hide toggles ----
        let showTrainCube = LS.get('trainCube', true);
        let showPuzzleCube = LS.get('puzzleCube', true);
        const trainCubeWrap = document.getElementById('train-cube-wrap');
        const trainCubeToggle = document.getElementById('train-cube-toggle');
        const puzzleCubeWrap = document.getElementById('puzzle-cube-wrap');
        const puzzleCubeToggle = document.getElementById('puzzle-cube-toggle');
        function applyTrainCube() {
            trainCubeWrap.style.display = showTrainCube ? '' : 'none';
            trainCubeToggle.textContent = showTrainCube ? 'Hide cube' : 'Show cube';
        }
        function applyPuzzleCube() {
            puzzleCubeToggle.textContent = showPuzzleCube ? 'Hide cube' : 'Show cube';
            const supported = puzzleCubeWrap.dataset.supported !== '0';
            const forceLiveView = timerView.classList.contains('smart-cube-active');
            puzzleCubeWrap.style.display = ((showPuzzleCube || forceLiveView) && supported) ? '' : 'none';
        }
        trainCubeToggle.addEventListener('click', () => {
            showTrainCube = !showTrainCube;
            LS.set('trainCube', showTrainCube);
            applyTrainCube();
        });
        puzzleCubeToggle.addEventListener('click', () => {
            showPuzzleCube = !showPuzzleCube;
            LS.set('puzzleCube', showPuzzleCube);
            applyPuzzleCube();
        });
        applyTrainCube();
        applyPuzzleCube();

        // ---- Cloud-sync auth widget + on-sign-in data refresh ----
        function renderAuthWidget() {
            const user = fbSync.getUser();
            const sidebarAuth = document.getElementById('sidebar-auth');
            const profileAuth = document.getElementById('profile-auth');
            const profileName = document.getElementById('profile-name');
            const profileStub = document.getElementById('profile-stub');

            const PENCIL_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4z"/></svg>';
            const X_SVG      = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
            const html = (() => {
                if (!fbSync.enabled) {
                    return `<span class="auth-note">Cloud sync: not configured</span>`;
                }
                if (user) {
                    const name = user.displayName || user.email || 'Signed in';
                    return `<div class="auth-user"><span class="auth-dot"></span><span class="auth-text">${name}</span></div>
                            <button class="auth-btn auth-text-btn" data-auth="signout">Sign out</button>
                            <button class="auth-btn auth-icon auth-icon-btn" data-auth="signout" title="Sign out" aria-label="Sign out">${X_SVG}</button>`;
                }
                return `<button class="auth-btn auth-primary auth-text-btn" data-auth="signin">Sign in</button>
                        <button class="auth-btn auth-icon auth-primary auth-icon-btn" data-auth="signin" title="Sign in with Google" aria-label="Sign in">${PENCIL_SVG}</button>`;
            })();
            if (sidebarAuth) sidebarAuth.innerHTML = html;
            if (profileAuth) profileAuth.innerHTML = html;
            if (profileName) profileName.textContent = user ? (user.displayName || user.email || 'Cuber') : 'Cuber';
            if (profileStub) {
                if (!fbSync.enabled) {
                    profileStub.textContent = 'Edit firebase-config.js with your Firebase project credentials to enable cloud sync, accounts, and (later) 1v1 battles.';
                } else if (!user) {
                    profileStub.textContent = 'Sign in to sync your solves, learned algorithms and settings across devices.';
                }
                // When signed in, leave the existing "Click Edit profile to add a bio..." text from renderStats.
            }
        }
        // ---- Sign-in modal ----
        const signinModal  = document.getElementById('signin-modal');
        const signinClose  = document.getElementById('signin-close');
        const signinGoogle = document.getElementById('signin-google-btn');
        const signinWca    = document.getElementById('signin-wca-btn');
        const signinSkip   = document.getElementById('signin-skip-btn');
        function openSigninModal() { if (signinModal) signinModal.style.display = 'flex'; }
        function closeSigninModal() { if (signinModal) signinModal.style.display = 'none'; }
        if (signinClose)  signinClose.addEventListener('click',  closeSigninModal);
        if (signinSkip)   signinSkip.addEventListener('click',   closeSigninModal);
        if (signinModal)  signinModal.addEventListener('click', e => { if (e.target === signinModal) closeSigninModal(); });
        if (signinGoogle) signinGoogle.addEventListener('click', () => { closeSigninModal(); fbSync.signIn(); });
        if (signinWca)    signinWca.addEventListener('click', async () => {
            closeSigninModal();
            let user = fbSync.getUser();
            if (!user) user = await fbSync.signIn();
            if (!user) return;
            sessionStorage.setItem('wca_linking_uid', user.uid);
            startWcaLogin();
        });

        // Delegate sign-in / sign-out clicks
        document.addEventListener('click', (e) => {
            const b = e.target.closest('[data-auth]');
            if (!b) return;
            if (b.dataset.auth === 'signin')  openSigninModal();
            if (b.dataset.auth === 'signout') {
                clearSignedOutUserCache();
                fbSync.signOut();
            }
        });

        function clearSignedOutUserCache() {
            try {
                for (let i = localStorage.length - 1; i >= 0; i--) {
                    const key = localStorage.key(i);
                    if (!key) continue;
                    // Signed-in data uses `uc_*`; guest data is deliberately
                    // isolated under `uc_guest_*` and must survive refreshes.
                    if (key.startsWith('uc_') && !key.startsWith('uc_guest_') && key !== 'uc_openrouter_api_key') {
                        localStorage.removeItem(key);
                    }
                }
            } catch (_) {}
            clearWcaSession();
            sessionStorage.removeItem('wca_linking_uid');
            if (typeof stopStackmat === 'function') stopStackmat();
            if (typeof disconnectSmartCube === 'function') disconnectSmartCube();
            puzzleTimer.reset();
            puzzleStarted = false;
            puzzleStore = null;
            if (puzzleSolvesEl) puzzleSolvesEl.innerHTML = '<span class="solve-list-empty">Sign in again to load your synced solves.</span>';
            if (puzzleStatsGrid) puzzleStatsGrid.innerHTML = '';
        }

        // When auth state changes, reload state from (newly synced) localStorage and refresh UI.
        fbSync.onUserChange((user) => {
            if (!user && fbSync.enabled) clearSignedOutUserCache();
            // Refresh in-memory state from LS (cloud sync may have updated it)
            const freshP = LS.get('profile', {});
            Object.assign(profile, DEFAULT_PROFILE, freshP);
            profile.socials = Object.assign({}, DEFAULT_PROFILE.socials, freshP.socials || {});
            learnedSet.clear();
            LS.get('learned', []).forEach(n => learnedSet.add(n));
            learningSet.clear();
            LS.get('learning', []).forEach(n => learningSet.add(n));
            Object.keys(mainChoices).forEach(k => delete mainChoices[k]);
            Object.assign(mainChoices, LS.get('mainChoices', {}));
            plannerData = LS.get('planner', { plans: [], algGoals: [] });
            if (!plannerData || typeof plannerData !== 'object') plannerData = {};
            if (!Array.isArray(plannerData.plans)) plannerData.plans = [];
            if (!Array.isArray(plannerData.algGoals)) plannerData.algGoals = [];
            assistantPrefs = LS.get('assistantPrefs', { history: [], model: DEFAULT_ASSISTANT_MODEL });
            if (!assistantPrefs || typeof assistantPrefs !== 'object') assistantPrefs = {};
            if (!Array.isArray(assistantPrefs.history)) assistantPrefs.history = [];
            assistantPrefs.model = sanitizeModelId(assistantPrefs.model);
            if ('competitionId' in assistantPrefs) delete assistantPrefs.competitionId;
            socialPrefs = LS.get('socialPrefs', { friendCodeInput: '', selectedFriendUid: '', battleEvent: '333', battleMode: 'ao5', battleTarget: 3, closeFriendUids: [] });
            if (!socialPrefs || typeof socialPrefs !== 'object') socialPrefs = { friendCodeInput: '', selectedFriendUid: '', battleEvent: '333', battleMode: 'ao5', battleTarget: 3, closeFriendUids: [] };
            if (!Array.isArray(socialPrefs.closeFriendUids)) socialPrefs.closeFriendUids = [];
            leaderboardPrefs = LS.get('leaderboardPrefs', { event: '333', type: 'single', country: '' });
            if (!leaderboardPrefs || typeof leaderboardPrefs !== 'object') leaderboardPrefs = { event: '333', type: 'single', country: '' };
            timerChartPrefs = LS.get('timerChartPrefs', { window: '50', bucket: 'auto' });
            if (!timerChartPrefs || typeof timerChartPrefs !== 'object') timerChartPrefs = { window: '50', bucket: 'auto' };
            reloadLegacyTimerTrainerPrefs();
            inspectionEnabled = LS.get('inspection', false);
            focusMode         = LS.get('focusMode', false);
            holdDelayMs       = LS.get('holdDelay', 0);
            timerPrecision    = LS.get('precision', 2);
            algMasteryCube    = LS.get('algMasteryCube', 'all');
            sessionRailLayout = LS.get('sessionRailLayout', 'side');
            groupMode         = LS.get('groupMode', 'name');
            showTrainCube     = LS.get('trainCube', true);
            showPuzzleCube    = LS.get('puzzleCube', true);
            zenMode           = LS.get('zenMode', false);
            inputMode         = LS.get('inputMode', 'timer');
            applyAppColor(LS.get('appColor', 'orange'));

            // Re-render whatever is currently visible
            renderCards();
            if (trainCaselist.children.length) buildCaselist();
            if (puzzleStarted) loadPuzzle();
            else if (timerView.style.display !== 'none') startPuzzle();
            if (statsView.style.display !== 'none') renderStats();
            if (planView.style.display !== 'none') renderPlanner();
            if (assistantView.style.display !== 'none') renderAssistantPage();
            if (leaderboardView.style.display !== 'none') renderLeaderboardPage();
            applyTrainCube();
            applyPuzzleCube();
            applySessionRailLayout();
            applyZenMode();
            applyInputMode();
            applySettingsUI();
            if (progressChartWindow) progressChartWindow.value = timerChartPrefs.window || '50';
            if (distributionBucket) distributionBucket.value = timerChartPrefs.bucket || 'auto';
            document.querySelectorAll('.group-toggle-btn').forEach(b =>
                b.classList.toggle('active', b.dataset.group === groupMode));
            renderAuthWidget();
        });
        renderAuthWidget();   // initial render (signed-out state until auth resolves)

        // ---- Mobile: bottom-sheet for session overview + time list ----
        const mobileSideOverlay = document.getElementById('mobile-side-overlay');
        const mobileSideFab     = document.getElementById('mobile-side-fab');
        const mobileSideClose   = document.querySelector('#mobile-side-close');
        const timerSideEl       = document.querySelector('.timer-side');

        function openMobileSide() {
            if (!timerSideEl) return;
            timerSideEl.classList.add('mobile-open');
            if (mobileSideOverlay) mobileSideOverlay.style.display = 'block';
        }
        function closeMobileSide() {
            if (timerSideEl) timerSideEl.classList.remove('mobile-open');
            if (mobileSideOverlay) mobileSideOverlay.style.display = 'none';
        }
        if (mobileSideFab)     mobileSideFab.addEventListener('click',   openMobileSide);
        if (mobileSideClose)   mobileSideClose.addEventListener('click',  closeMobileSide);
        if (mobileSideOverlay) mobileSideOverlay.addEventListener('click', e => {
            if (e.target === mobileSideOverlay) closeMobileSide();
        });
        window.addEventListener('resize', () => {
            if (window.innerWidth > 640) closeMobileSide();
        });

        // ---- Timer subset trainer modal ----
        const timerTrainerModal = document.getElementById('timer-trainer-modal');
        const timerTrainerCatsEl = document.getElementById('timer-trainer-categories');
        const timerTrainerCasesEl = document.getElementById('timer-trainer-cases');
        const timerTrainerCountEl = document.getElementById('timer-trainer-count');
        const timerTrainerCubeFilterEl = document.getElementById('timer-trainer-cube-filter');
        function timerTrainerDraft() {
            if (!timerTrainerModal._draft) {
                timerTrainerModal._draft = {
                    categories: [...(timerTrainerPrefs.categories || [])],
                    cases: [...(timerTrainerPrefs.cases || [])],
                    cubeFilter: timerTrainerPrefs.cubeFilter || curSession()?.puzzle || '333'
                };
            }
            return timerTrainerModal._draft;
        }
        function renderTimerTrainerModal() {
            if (!timerTrainerModal || !timerTrainerCatsEl || !timerTrainerCasesEl) return;
            const draft = timerTrainerDraft();
            const selectedCats = new Set(draft.categories);
            const selectedCases = new Set(draft.cases);
            const cubeFilter = draft.cubeFilter || curSession()?.puzzle || '333';
            const categories = availableTimerTrainerCategories().filter(category =>
                algCategoryEventId(category) === cubeFilter
            );
            if (timerTrainerCubeFilterEl) {
                const options = algMasteryCubeOptions();
                const nxn = options.filter(option => ['222', '333', '444', '555'].includes(option.id));
                const side = options.filter(option => !['222', '333', '444', '555'].includes(option.id));
                timerTrainerCubeFilterEl.innerHTML = `
                    <optgroup label="NxN Cubes">${nxn.map(option =>
                        `<option value="${esc(option.id)}">${esc(option.label)}</option>`
                    ).join('')}</optgroup>
                    <optgroup label="Side Events">${side.map(option =>
                        `<option value="${esc(option.id)}">${esc(option.label)}</option>`
                    ).join('')}</optgroup>
                `;
                timerTrainerCubeFilterEl.value = cubeFilter;
            }
            timerTrainerCatsEl.innerHTML = `
                <div class="timer-trainer-cube-heading">${esc(eventLabel(cubeFilter))} subsets</div>
                ${categories.map(cat => {
                const count = db.filter(item => item.category === cat).length;
                return `<label class="timer-trainer-row">
                    <input type="checkbox" data-timer-trainer-category="${esc(cat)}" ${selectedCats.has(cat) ? 'checked' : ''}>
                    <span class="timer-trainer-row-main">
                        <span class="timer-trainer-row-title">${esc(cat)}</span>
                        <span class="timer-trainer-row-sub">${count} case${count === 1 ? '' : 's'}</span>
                    </span>
                </label>`;
            }).join('')}`;
            const cases = db
                .filter(item => selectedCats.has(item.category) && algCategoryEventId(item.category) === cubeFilter && !isReferenceCategory(item.category))
                .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
            const grouped = cases.reduce((map, item) => {
                (map[item.category] = map[item.category] || []).push(item);
                return map;
            }, {});
            timerTrainerCasesEl.innerHTML = Object.keys(grouped).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map(cat => `
                <div class="timer-trainer-group">
                    <div class="timer-trainer-group-title">${esc(cat)}</div>
                    ${grouped[cat].map(item => {
                        const learned = learnedSet.has(item.name);
                        const learning = learningSet.has(item.name);
                        const badge = learned ? 'Learned' : (learning ? 'Learning' : 'Unmarked');
                        const caseId = timerTrainerCaseId(item);
                        return `<label class="timer-trainer-row">
                            <input type="checkbox" data-timer-trainer-case="${esc(caseId)}" ${selectedCases.has(caseId) ? 'checked' : ''}>
                            <span class="timer-trainer-row-main">
                                <span class="timer-trainer-row-title">${esc(item.name)}</span>
                                <span class="timer-trainer-row-sub">${badge}</span>
                            </span>
                        </label>`;
                    }).join('')}
                </div>
            `).join('') || `<div class="timer-trainer-row-sub">Choose one or more categories first.</div>`;
            const caseCount = draft.cases.length;
            if (timerTrainerCountEl) timerTrainerCountEl.textContent = `${caseCount} selected`;
        }
        function openTimerTrainerModal() {
            if (!timerTrainerModal) return;
            timerTrainerModal._draft = {
                categories: [...(timerTrainerPrefs.categories || [])],
                cases: [...(timerTrainerPrefs.cases || [])],
                cubeFilter: timerTrainerPrefs.cubeFilter || curSession()?.puzzle || '333'
            };
            renderTimerTrainerModal();
            timerTrainerModal.style.display = 'flex';
        }
        function closeTimerTrainerModal() {
            if (!timerTrainerModal) return;
            timerTrainerModal.style.display = 'none';
            delete timerTrainerModal._draft;
        }
        document.getElementById('open-timer-trainer')?.addEventListener('click', openTimerTrainerModal);
        document.getElementById('close-timer-trainer')?.addEventListener('click', closeTimerTrainerModal);
        document.getElementById('timer-trainer-disable')?.addEventListener('click', () => {
            timerTrainerPrefs.enabled = false;
            timerTrainerPrefs.categories = [];
            timerTrainerPrefs.cases = [];
            saveTimerTrainerPrefs();
            updateTimerTrainerStatus();
            showTimerTrainerReveal('');
            closeTimerTrainerModal();
            nextPuzzleScramble();
        });
        document.getElementById('timer-trainer-save')?.addEventListener('click', () => {
            const draft = timerTrainerDraft();
            if (!draft.categories.length || !draft.cases.length) {
                alert('Pick at least one category and one case.');
                return;
            }
            timerTrainerPrefs = {
                enabled: true,
                categories: [...draft.categories],
                cases: [...draft.cases],
                cubeFilter: draft.cubeFilter || curSession().puzzle || '333'
            };
            curSession().puzzle = timerTrainerPrefs.cubeFilter;
            puzzleSelect.value = curSession().puzzle;
            saveTimerTrainerPrefs();
            updateTimerTrainerStatus();
            renderSessionSelect();
            refreshPuzzle();
            closeTimerTrainerModal();
            nextPuzzleScramble();
        });
        timerTrainerCatsEl?.addEventListener('change', (e) => {
            const cb = e.target.closest('[data-timer-trainer-category]');
            if (!cb) return;
            const draft = timerTrainerDraft();
            const set = new Set(draft.categories);
            if (cb.checked) set.add(cb.dataset.timerTrainerCategory);
            else set.delete(cb.dataset.timerTrainerCategory);
            draft.categories = [...set];
            const allowedCaseIds = new Set(db.filter(item => draft.categories.includes(item.category)).map(timerTrainerCaseId));
            draft.cases = draft.cases.filter(caseId => allowedCaseIds.has(caseId));
            renderTimerTrainerModal();
        });
        timerTrainerCubeFilterEl?.addEventListener('change', (e) => {
            const draft = timerTrainerDraft();
            draft.cubeFilter = e.target.value || curSession()?.puzzle || '333';
            draft.categories = [];
            draft.cases = [];
            renderTimerTrainerModal();
        });
        timerTrainerCasesEl?.addEventListener('change', (e) => {
            const cb = e.target.closest('[data-timer-trainer-case]');
            if (!cb) return;
            const draft = timerTrainerDraft();
            const set = new Set(draft.cases);
            if (cb.checked) set.add(cb.dataset.timerTrainerCase);
            else set.delete(cb.dataset.timerTrainerCase);
            draft.cases = [...set];
            if (timerTrainerCountEl) timerTrainerCountEl.textContent = `${draft.cases.length} selected`;
        });
        document.querySelectorAll('[data-timer-trainer-pick]').forEach(btn => btn.addEventListener('click', () => {
            const draft = timerTrainerDraft();
            const visibleCases = db.filter(item =>
                draft.categories.includes(item.category) &&
                algCategoryEventId(item.category) === draft.cubeFilter &&
                !isReferenceCategory(item.category)
            );
            if (btn.dataset.timerTrainerPick === 'all') draft.cases = visibleCases.map(timerTrainerCaseId);
            else if (btn.dataset.timerTrainerPick === 'none') draft.cases = [];
            else if (btn.dataset.timerTrainerPick === 'learning') draft.cases = visibleCases.filter(item => learningSet.has(item.name)).map(timerTrainerCaseId);
            else if (btn.dataset.timerTrainerPick === 'learned') draft.cases = visibleCases.filter(item => learnedSet.has(item.name)).map(timerTrainerCaseId);
            renderTimerTrainerModal();
        }));
        timerTrainerModal?.addEventListener('click', (e) => {
            if (e.target === timerTrainerModal) closeTimerTrainerModal();
        });
        updateTimerTrainerStatus();

        // ---- Timer settings modal ----
        const settingsModal = document.getElementById('timer-settings-modal');
        document.getElementById('open-timer-settings').addEventListener('click', () => {
            settingsModal.style.display = 'flex';
        });
        document.getElementById('close-timer-settings').addEventListener('click', () => {
            settingsModal.style.display = 'none';
        });
        settingsModal.addEventListener('click', (e) => {
            if (e.target === settingsModal) settingsModal.style.display = 'none';
        });
        document.addEventListener('keydown', (e) => {
            const typing = document.activeElement && ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName);
            if (e.code === 'KeyZ' && timerView.style.display !== 'none' && !typing) {
                e.preventDefault();
                toggleZenMode();
            }
            if (e.code === 'KeyN' && timerView.style.display !== 'none' && !typing && puzzleTimer.getState() === 'idle') {
                e.preventDefault();
                puzzleTimer.reset();
                nextPuzzleScramble();
            }
            if (e.code === 'Escape' && zenMode && timerView.style.display !== 'none') {
                toggleZenMode(false);
            }
            if (e.code === 'Escape' && settingsModal.style.display !== 'none') {
                settingsModal.style.display = 'none';
            }
            // 'W' on the Timer tab: toggle stat cards row (when not typing in an input)
            if (e.code === 'KeyW' && timerView.style.display !== 'none' &&
                document.activeElement && !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)) {
                const row = document.getElementById('widgets-row');
                if (row) {
                    const off = row.style.display === 'none';
                    row.style.display = off ? '' : 'none';
                    LS.set('widgetsHidden', !off);
                }
            }
            // 'G' on the Timer tab: toggle graphs row
            if (e.code === 'KeyG' && timerView.style.display !== 'none' &&
                document.activeElement && !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)) {
                const gr = document.querySelector('.timer-graphs-row');
                if (gr) gr.style.display = gr.style.display === 'none' ? '' : 'none';
            }
            // '#' on the Timer tab: open the styled note dialog for the last solve
            if (e.key === '#' && timerView.style.display !== 'none' &&
                document.activeElement && !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)) {
                e.preventDefault();
                openSolveNoteDialog();
            }
            // '?' on ANY page: open the global algorithm Spotlight search
            if (e.key === '?' &&
                document.activeElement && !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)) {
                e.preventDefault();
                openAlgSpotlight();
            }
        });

        // Solve note dialog wiring
        function syncNoteChips() {
            const val = (document.getElementById('solve-note-input')?.value || '').toLowerCase();
            document.querySelectorAll('#solve-note-chips button[data-tag]').forEach(b => {
                b.classList.toggle('on', val.includes(b.dataset.tag.toLowerCase()));
            });
        }
        function openSolveNoteDialog() {
            const solves = curSolves();
            if (!solves.length) return;
            const last  = solves[solves.length - 1];
            const modal = document.getElementById('solve-note-modal');
            const input = document.getElementById('solve-note-input');
            const meta  = document.getElementById('solve-note-meta');
            const title = document.getElementById('solve-note-title');
            input.value = last.note || '';
            if (title) title.textContent = `Note — Solve #${solves.length}`;
            meta.innerHTML = `<span class="solve-note-time">${solveLabel(last)}</span>
                              <span class="solve-note-date">${last.scramble ? last.scramble.slice(0, 40) + (last.scramble.length > 40 ? '…' : '') : 'no scramble'}</span>`;
            syncNoteChips();
            modal.style.display = 'flex';
            setTimeout(() => input.focus(), 30);
        }
        function closeSolveNoteDialog() {
            document.getElementById('solve-note-modal').style.display = 'none';
        }
        function saveSolveNote() {
            const solves = curSolves();
            if (!solves.length) { closeSolveNoteDialog(); return; }
            const last = solves[solves.length - 1];
            const val = document.getElementById('solve-note-input').value.trim().slice(0, 120);
            last.note = val;
            savePuzzle();
            refreshPuzzle();
            closeSolveNoteDialog();
        }
        document.getElementById('solve-note-close')?.addEventListener('click', closeSolveNoteDialog);
        document.getElementById('solve-note-save')?.addEventListener('click', saveSolveNote);
        document.getElementById('solve-note-clear')?.addEventListener('click', () => {
            const input = document.getElementById('solve-note-input');
            input.value = '';
            syncNoteChips();
            input.focus();
        });
        document.getElementById('solve-note-modal')?.addEventListener('click', (e) => {
            if (e.target.id === 'solve-note-modal') closeSolveNoteDialog();
        });
        document.getElementById('solve-note-input')?.addEventListener('keydown', (e) => {
            if (e.code === 'Enter')  { e.preventDefault(); saveSolveNote(); }
            if (e.code === 'Escape') closeSolveNoteDialog();
        });
        document.getElementById('solve-note-input')?.addEventListener('input', syncNoteChips);
        document.getElementById('solve-note-chips')?.addEventListener('click', (e) => {
            const b = e.target.closest('button[data-tag]');
            if (!b) return;
            const input = document.getElementById('solve-note-input');
            const tag   = b.dataset.tag;
            const tags  = input.value ? input.value.split(',').map(t => t.trim()).filter(Boolean) : [];
            const idx   = tags.findIndex(t => t.toLowerCase() === tag.toLowerCase());
            if (idx >= 0) tags.splice(idx, 1); else tags.push(tag);
            input.value = tags.join(', ');
            syncNoteChips();
            input.focus();
        });
        // Restore prior W toggle
        if (LS.get('widgetsHidden', false)) {
            const _row = document.getElementById('widgets-row');
            if (_row) _row.style.display = 'none';
        }

        // ---- Input methods: Timer / Typing / Stackmat ----
        let inputMode = LS.get('inputMode', 'timer');
        const puzzleHintEl   = document.getElementById('puzzle-hint');
        const puzzleTypeUI   = document.getElementById('puzzle-type-ui');
        const puzzleTypeIn   = document.getElementById('puzzle-type-input');
        const puzzleStackmatUI = document.getElementById('puzzle-stackmat-ui');
        let stackmatHandle = null;
        const stackmatInput = document.getElementById('puzzle-stackmat-input');
        const stackmatConnectButton = document.getElementById('puzzle-stackmat-connect');
        const stackmatNote = document.querySelector('.stackmat-note');

        function applyInputMode() {
            const isTimer    = inputMode === 'timer';
            const isType     = inputMode === 'type';
            const isStackmat = inputMode === 'stackmat';
            puzzleTypeUI.style.display     = isType     ? 'flex' : 'none';
            puzzleStackmatUI.style.display = isStackmat ? 'block' : 'none';
            puzzleHintEl.style.display     = isTimer    ? '' : 'none';
            document.querySelectorAll('.input-mode-btn').forEach(b =>
                b.classList.toggle('on', b.dataset.input === inputMode));
            if (!isStackmat && stackmatHandle) stopStackmat();
            if (isStackmat) refreshStackmatInputs(false).catch(() => {});
        }
        document.querySelectorAll('.input-mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                inputMode = btn.dataset.input;
                LS.set('inputMode', inputMode);
                if (inputMode !== 'timer') puzzleTimer.reset();
                applyInputMode();
            });
        });
        applyInputMode();

        // Disable the Space-driven timer when not in Timer mode
        const _origActiveTimer = activeTimer;
        activeTimer = function () {
            const t = _origActiveTimer();
            if (!t) return null;
            // If the puzzle timer is active but user is in typing/stackmat mode, ignore Space.
            if (t === puzzleTimer && inputMode !== 'timer') return null;
            return t;
        };

        // Typing mode: parse "12.34", "1:02.34", "189" => 1.89, "12345" => 1:23.45, or "DNF".
        function parseTypedTime(s) {
            s = s.trim();
            if (!s) return null;
            if (/^dnf$/i.test(s)) return { t: 0, penalty: 'dnf' };
            const colon = s.match(/^(\d+):(\d+(?:\.\d+)?)$/);
            if (colon) {
                const m = parseInt(colon[1], 10);
                const sec = parseFloat(colon[2]);
                if (isNaN(m) || isNaN(sec)) return null;
                return { t: m * 60 + sec, penalty: 'ok' };
            }
            if (/^\d+$/.test(s)) {
                const digits = s.padStart(3, '0');
                const centis = parseInt(digits.slice(-2), 10);
                const secChunk = digits.slice(0, -2);
                const secs = parseInt(secChunk.slice(-2) || '0', 10);
                const mins = parseInt(secChunk.slice(0, -2) || '0', 10);
                return { t: mins * 60 + secs + centis / 100, penalty: 'ok' };
            }
            const plain = parseFloat(s);
            if (isNaN(plain) || plain < 0) return null;
            return { t: plain, penalty: 'ok' };
        }
        function recordTypedSolve(penalty /* override */) {
            const raw = puzzleTypeIn.value;
            const parsed = parseTypedTime(raw);
            if (!parsed) { puzzleTypeIn.focus(); puzzleTypeIn.select(); return; }
            if (penalty) parsed.penalty = penalty;
            curSolves().push({
                t: parsed.t,
                penalty: parsed.penalty,
                scramble: currentScramble,
                date: Date.now()
            });
            savePuzzle();
            refreshPuzzle();
            puzzleTypeIn.value = '';
            // Show the recorded time on the big display
            const timerEl = document.getElementById('puzzle-timer');
            timerEl.classList.remove('ready', 'running', 'inspecting', 'arming');
            timerEl.textContent = parsed.penalty === 'dnf' ? 'DNF'
                                 : (parsed.penalty === '+2' ? fmt(parsed.t + 2) + '+' : fmt(parsed.t));
            nextPuzzleScramble();
        }
        document.getElementById('puzzle-type-submit').addEventListener('click', () => recordTypedSolve());
        document.getElementById('puzzle-type-dnf').addEventListener('click', () => recordTypedSolve('dnf'));
        puzzleTypeIn.addEventListener('keydown', (e) => {
            if (e.code === 'Enter') { e.preventDefault(); recordTypedSolve(); }
        });

        // ---- Ao5 share / paste ----
        const ao5ShareModal = document.getElementById('ao5-share-modal');
        const ao5ShareText = document.getElementById('ao5-share-text');
        function latestAo5Solves() {
            const solves = curSolves();
            return solves.length >= 5 ? solves.slice(-5) : [];
        }
        function formatAo5ShareBlock(solves) {
            return solves.map((s, idx) => {
                const label = s.penalty === 'dnf' ? 'DNF'
                    : (s.penalty === '+2' ? fmt(s.t + 2) + '+' : fmt(s.t));
                const scramble = (s.scramble || '').trim();
                return `${idx + 1}. ${label}${scramble ? ' - ' + scramble : ''}`;
            }).join('\n');
        }
        function parseAo5ShareBlock(text) {
            const lines = String(text || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
            const parsed = [];
            for (const line of lines) {
                const m = line.match(/^(?:\d+\.\s*)?([A-Za-z0-9:+.]+)\s*(?:[-|]\s*(.*))?$/);
                if (!m) continue;
                const timeToken = m[1].replace(/\+$/, '');
                const time = parseTypedTime(timeToken);
                if (!time) continue;
                const penalty = /(?:\+2|\+)\s*$/i.test(m[1]) ? '+2' : time.penalty;
                parsed.push({
                    t: time.t,
                    penalty,
                    scramble: (m[2] || '').trim(),
                    note: 'Imported Ao5',
                    date: Date.now() + parsed.length
                });
            }
            return parsed;
        }
        function openAo5ShareModal(prefillLatest = true) {
            if (prefillLatest) {
                const latest = latestAo5Solves();
                ao5ShareText.value = latest.length ? formatAo5ShareBlock(latest) : '';
            }
            ao5ShareModal.style.display = 'flex';
            setTimeout(() => ao5ShareText.focus(), 30);
        }
        function closeAo5ShareModal() { ao5ShareModal.style.display = 'none'; }
        document.getElementById('ao5-share-open')?.addEventListener('click', () => openAo5ShareModal(true));
        document.getElementById('ao5-share-close')?.addEventListener('click', closeAo5ShareModal);
        document.getElementById('ao5-fill-latest')?.addEventListener('click', () => {
            const latest = latestAo5Solves();
            ao5ShareText.value = latest.length ? formatAo5ShareBlock(latest) : '';
        });
        document.getElementById('ao5-copy-btn')?.addEventListener('click', async () => {
            if (!ao5ShareText.value.trim()) {
                const latest = latestAo5Solves();
                ao5ShareText.value = latest.length ? formatAo5ShareBlock(latest) : '';
            }
            if (!ao5ShareText.value.trim()) return;
            try { if (navigator.clipboard) await navigator.clipboard.writeText(ao5ShareText.value); } catch (_) {}
        });
        document.getElementById('ao5-import-btn')?.addEventListener('click', () => {
            const incoming = parseAo5ShareBlock(ao5ShareText.value);
            if (!incoming.length) {
                alert('Could not parse any solves from that Ao5 block.');
                return;
            }
            curSolves().push(...incoming);
            savePuzzle();
            refreshPuzzle();
            closeAo5ShareModal();
        });
        ao5ShareModal?.addEventListener('click', (e) => {
            if (e.target === ao5ShareModal) closeAo5ShareModal();
        });

        // ---- Profile editor modal ----
        const profileEditModal = document.getElementById('profile-edit-modal');
        let pendingAvatar = null;   // staged data URL (until Save)

        function totalSolvesAll() {
            return PUZZLES_FOR_STATS.reduce((acc, pid) => acc + getPuzzleAllSolves(pid).length, 0);
        }
        function totalLearnedAll() { return learnedSet.size; }

        function buildFramePicker() {
            const totSolves  = totalSolvesAll();
            const totLearned = totalLearnedAll();
            // If user has legacy 'auto' (no longer offered), treat as 'none' so a real tier is selected.
            const current = (!profile.frame || profile.frame === 'auto') ? 'none' : profile.frame;
            // All tiers shown the same — unlock criteria moved to Quests page.
            const opts = FRAME_TIERS.map(t => ({
                id: t.id,
                label: t.label,
                locked: !frameUnlocked(t, totSolves, totLearned)
            }));
            const el = document.getElementById('pe-frames');
            el.innerHTML = opts.map(o => {
                const cls = `pe-frame-opt frame-${o.id} ${o.locked ? 'is-locked' : ''} ${current === o.id ? 'is-selected' : ''}`;
                return `<button type="button" class="${cls}" data-frame="${o.id}" ${o.locked ? 'disabled' : ''}>
                    <span class="pe-frame-swatch pfp-frame frame-${o.id}"></span>
                    <span class="pe-frame-label">${o.label}</span>
                </button>`;
            }).join('');
            el.querySelectorAll('.pe-frame-opt').forEach(btn => {
                btn.addEventListener('click', () => {
                    if (btn.disabled) return;
                    el.querySelectorAll('.pe-frame-opt').forEach(b => b.classList.remove('is-selected'));
                    btn.classList.add('is-selected');
                    el.dataset.chosen = btn.dataset.frame;
                });
            });
            el.dataset.chosen = current;
        }

        function setAvatarPreview(src) {
            const img = document.getElementById('pe-avatar-img');
            img.src = src || 'default-user-image.png';
            const totSolves = totalSolvesAll();
            const totLearned = totalLearnedAll();
            const auto = highestUnlockedFrame(totSolves, totLearned);
            const chosen = document.getElementById('pe-frames')?.dataset.chosen || 'auto';
            const tier = chosen === 'auto' ? auto : chosen;
            const wrap = document.getElementById('pe-avatar-preview');
            wrap.className = 'pe-avatar-preview pfp-frame frame-' + tier;
        }

        function openProfileEdit() {
            const ev = document.getElementById('pe-event');
            ev.innerHTML = groupedEventOptions(profile.main_event);
            document.getElementById('pe-cubes').value = profile.main_cubes || '';
            document.getElementById('pe-bio').value   = profile.bio || '';
            document.getElementById('pe-yt').value    = profile.socials.youtube   || '';
            document.getElementById('pe-ig').value    = profile.socials.instagram || '';
            document.getElementById('pe-tw').value    = profile.socials.twitter   || '';
            document.getElementById('pe-tt').value    = profile.socials.tiktok    || '';
            document.getElementById('pe-tv').value    = profile.socials.twitch    || '';
            pendingAvatar = null;
            buildFramePicker();
            setAvatarPreview(profile.avatar || 'default-user-image.png');
            // Reset to Identity tab when opening
            document.querySelectorAll('.pe-tab').forEach(t => t.classList.toggle('on', t.dataset.peTab === 'identity'));
            document.querySelectorAll('.pe-tab-content').forEach(c => {
                c.style.display = c.dataset.peContent === 'identity' ? '' : 'none';
            });
            profileEditModal.style.display = 'flex';
        }
        // Tab switcher for the Edit Profile modal
        document.querySelectorAll('.pe-tab').forEach(t => t.addEventListener('click', () => {
            const tabId = t.dataset.peTab;
            document.querySelectorAll('.pe-tab').forEach(x => x.classList.toggle('on', x === t));
            document.querySelectorAll('.pe-tab-content').forEach(c => {
                c.style.display = c.dataset.peContent === tabId ? '' : 'none';
            });
            if (tabId === 'appearance') {
                buildColorSwatches();
            }
        }));

        // Avatar file: read & downscale to 256x256 (cap stored size)
        document.getElementById('pe-avatar-file').addEventListener('change', (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                const img = new Image();
                img.onload = () => {
                    const SIZE = 256;
                    const c = document.createElement('canvas');
                    c.width = c.height = SIZE;
                    const ctx = c.getContext('2d');
                    // Cover-fit center crop
                    const scale = Math.max(SIZE / img.width, SIZE / img.height);
                    const sw = img.width * scale, sh = img.height * scale;
                    ctx.drawImage(img, (SIZE - sw) / 2, (SIZE - sh) / 2, sw, sh);
                    pendingAvatar = c.toDataURL('image/jpeg', 0.82);
                    setAvatarPreview(pendingAvatar);
                };
                img.src = reader.result;
            };
            reader.readAsDataURL(file);
        });
        document.getElementById('pe-avatar-clear').addEventListener('click', () => {
            pendingAvatar = '';   // explicit blank → default logo
            setAvatarPreview('default-user-image.png');
        });

        // WCA verification button + status note in the Edit Profile modal
        const peWcaVerifyBtn = document.getElementById('pe-wca-verify');
        const peWcaUnlinkBtn = document.getElementById('pe-wca-unlink');
        const peWcaNote = document.getElementById('pe-wca-verified-note');
        function updateWcaVerifyNote() {
            const user = fbSync.getUser();
            const googleState = document.getElementById('pe-google-link-state');
            const wcaState = document.getElementById('pe-wca-link-state');
            if (googleState) {
                googleState.textContent = user
                    ? (user.email || user.displayName || 'Connected')
                    : 'Not connected';
            }
            if (wcaState) {
                wcaState.textContent = profile.wca_verified && profile.wca_id
                    ? `${profile.wca_name || profile.wca_id} · ${profile.wca_id}`
                    : 'Not linked';
            }
            if (peWcaUnlinkBtn) peWcaUnlinkBtn.hidden = !(profile.wca_verified && profile.wca_id);
            if (!wcaEnabled) {
                peWcaNote.textContent = 'WCA linking is not configured yet on this deployment.';
                peWcaVerifyBtn.disabled = true;
                peWcaVerifyBtn.style.opacity = '0.5';
                peWcaVerifyBtn.style.display = '';
                return;
            }
            peWcaVerifyBtn.disabled = false;
            peWcaVerifyBtn.style.opacity = '';
            if (profile.wca_verified && profile.wca_id) {
                peWcaNote.innerHTML = `Linked and verified. Reconnect if /competition says your WCA session expired.`;
                peWcaNote.style.color = '#5fe08c';
                peWcaVerifyBtn.style.display = '';
                peWcaVerifyBtn.textContent = 'Reconnect WCA';
            } else {
                peWcaNote.textContent = user
                    ? 'WCA will verify your identity directly. No manual WCA ID is needed.'
                    : 'Connect Google first, then link your WCA account.';
                peWcaNote.style.color = '';
                peWcaVerifyBtn.textContent = user ? 'Link WCA account' : 'Connect Google first';
                peWcaVerifyBtn.style.display = '';
            }
        }
        peWcaVerifyBtn.addEventListener('click', async () => {
            let user = fbSync.getUser();
            if (!user) user = await fbSync.signIn();
            if (!user) return;
            sessionStorage.setItem('wca_linking_uid', user.uid);
            startWcaLogin();
        });
        peWcaUnlinkBtn?.addEventListener('click', async () => {
            if (!profile.wca_id) return;
            if (!await window.ucConfirm('Unlink this WCA account? Your official records will be removed from UC Academy.', {
                title: 'Unlink WCA?',
                confirmLabel: 'Unlink',
                danger: true
            })) return;
            try {
                await fbSync.unlinkWcaIdentity(profile.wca_id);
                profile.wca_id = '';
                profile.wca_user_id = null;
                profile.wca_name = '';
                profile.wca_verified = false;
                profile.wca_records = {};
                clearWcaSession();
                saveProfile();
                updateWcaVerifyNote();
                if (statsView.style.display !== 'none') renderStats();
            } catch (error) {
                alert(error.message || error);
            }
        });
        // Patch the openProfileEdit flow so the note refreshes when modal opens
        const _origOpenProfileEdit = openProfileEdit;
        openProfileEdit = function () {
            _origOpenProfileEdit();
            updateWcaVerifyNote();
        };
        function closeProfileEdit() { profileEditModal.style.display = 'none'; }
        document.getElementById('close-profile-edit').addEventListener('click', closeProfileEdit);
        document.getElementById('pe-cancel').addEventListener('click', closeProfileEdit);
        profileEditModal.addEventListener('click', (e) => {
            if (e.target === profileEditModal) closeProfileEdit();
        });
        document.getElementById('pe-save').addEventListener('click', () => {
            const chosenFrame = document.getElementById('pe-frames').dataset.chosen || 'auto';
            const next = {
                ...profile,
                main_event: document.getElementById('pe-event').value,
                main_cubes: document.getElementById('pe-cubes').value.trim().slice(0, 120),
                bio:        sanitizeBio(document.getElementById('pe-bio').value),
                frame:      chosenFrame,
                avatar:     (pendingAvatar === null ? (profile.avatar || '') : pendingAvatar),
                socials: {
                    youtube:   document.getElementById('pe-yt').value.trim().slice(0, 80),
                    instagram: document.getElementById('pe-ig').value.trim().slice(0, 60),
                    twitter:   document.getElementById('pe-tw').value.trim().slice(0, 60),
                    tiktok:    document.getElementById('pe-tt').value.trim().slice(0, 60),
                    twitch:    document.getElementById('pe-tv').value.trim().slice(0, 60)
                }
            };
            profile = next;
            saveProfile();
            closeProfileEdit();
            renderStats();
        });

        // ---- Stackmat (real Web Audio decoder) ----
        async function refreshStackmatInputs(requestPermission = false) {
            const mod = await import('./stackmat-decoder.js');
            const selected = stackmatInput?.value || LS.get('stackmatInput', '');
            const devices = await mod.listAudioInputs({ requestPermission });
            if (!stackmatInput) return devices;
            stackmatInput.innerHTML = `<option value="">Default audio input</option>${devices.map(device =>
                `<option value="${esc(device.id)}">${esc(device.label)}</option>`
            ).join('')}`;
            if (devices.some(device => device.id === selected)) stackmatInput.value = selected;
            return devices;
        }
        async function startStackmat() {
            try {
                if (stackmatConnectButton) {
                    stackmatConnectButton.disabled = true;
                    stackmatConnectButton.textContent = 'Connecting...';
                }
                const mod = await import('./stackmat-decoder.js');
                stackmatHandle = await mod.startStackmat({
                    deviceId: stackmatInput?.value || '',
                    onStatus: (status) => {
                        const tEl = document.getElementById('puzzle-timer');
                        if (status === ' ') tEl.classList.add('running');
                        else tEl.classList.remove('running');
                    },
                    onSolve: (seconds) => {
                        // Treat as a recorded solve, like the typing path.
                        curSolves().push({
                            t: seconds, penalty: 'ok',
                            scramble: currentScramble, date: Date.now()
                        });
                        savePuzzle();
                        refreshPuzzle();
                        const tEl = document.getElementById('puzzle-timer');
                        tEl.classList.remove('ready', 'running', 'inspecting', 'arming');
                        tEl.textContent = fmt(seconds);
                        nextPuzzleScramble();
                    },
                    onError: (msg) => {
                        if (stackmatNote) stackmatNote.textContent = msg;
                    },
                    onSignal: (signal) => {
                        if (!stackmatNote || !stackmatHandle) return;
                        stackmatNote.textContent = signal.active
                            ? 'Audio signal detected. Start and stop the Stackmat to test decoding.'
                            : 'Listening, but no audio signal is reaching this input yet.'
                    }
                });
                await refreshStackmatInputs(false).catch(() => []);
                if (stackmatHandle.deviceId && stackmatInput) {
                    stackmatInput.value = stackmatHandle.deviceId;
                    LS.set('stackmatInput', stackmatHandle.deviceId);
                }
                if (stackmatConnectButton) {
                    stackmatConnectButton.textContent = 'Disconnect Stackmat';
                    stackmatConnectButton.dataset.connected = '1';
                }
                if (stackmatNote) stackmatNote.textContent = `Listening on ${stackmatHandle.label}. Start and stop the Stackmat to test it.`;
            } catch (e) {
                console.error(e);
                alert('Could not start Stackmat: ' + (e.message || e));
                stackmatHandle = null;
                if (stackmatConnectButton) stackmatConnectButton.textContent = 'Connect Stackmat';
            } finally {
                if (stackmatConnectButton) stackmatConnectButton.disabled = false;
            }
        }
        function stopStackmat() {
            if (stackmatHandle) { try { stackmatHandle.stop(); } catch (e) {} stackmatHandle = null; }
            if (stackmatConnectButton) {
                stackmatConnectButton.textContent = 'Connect Stackmat';
                stackmatConnectButton.dataset.connected = '';
            }
            if (stackmatNote) stackmatNote.textContent = 'Choose the Stackmat line-in or USB audio input, then press Connect.';
        }
        stackmatConnectButton?.addEventListener('click', () => {
            if (stackmatHandle) stopStackmat(); else startStackmat();
        });
        stackmatInput?.addEventListener('change', () => {
            LS.set('stackmatInput', stackmatInput.value || '');
            if (stackmatHandle) stopStackmat();
        });
        document.getElementById('puzzle-stackmat-refresh')?.addEventListener('click', async () => {
            try {
                const devices = await refreshStackmatInputs(true);
                if (stackmatNote) stackmatNote.textContent = devices.length
                    ? `Found ${devices.length} audio input${devices.length === 1 ? '' : 's'}. Choose the Stackmat input.`
                    : 'No audio inputs were found.';
            } catch (error) {
                if (stackmatNote) stackmatNote.textContent = error?.message || 'Could not list audio inputs.';
            }
        });
        navigator.mediaDevices?.addEventListener?.('devicechange', () => {
            if (!stackmatHandle) refreshStackmatInputs(false).catch(() => {});
        });

        // ---- Smart Cube (Bluetooth: GAN / GiiKER / GoCube / Rubik's Connected / HEYKUBE / QiYi) ----
        let smartCubeHandle = null;
        const smartStatusEl = document.getElementById('smart-cube-status');
        const smartBtn      = document.getElementById('smart-cube-connect');
        const smartOtherBtn = document.getElementById('smart-cube-connect-other');
        const ganAutoDetectHelpBtn = document.getElementById('gan-auto-detect-help');
        const smartCubeLive = document.getElementById('smart-cube-live');
        const smartCubeLiveStateEl = document.getElementById('smart-cube-live-state');
        const smartWidgetsRow = document.getElementById('widgets-row');
        const smartWidgetsHome = document.createComment('smart-widgets-home');
        smartWidgetsRow.parentNode?.insertBefore(smartWidgetsHome, smartWidgetsRow);
        let smartConnectedName = '';
        let smartSolvePhase = 'disconnected';
        let smartScrambleTracker = null;
        let smartScrambleSim = null;
        let smartPendingStateMoves = [];
        let smartPendingSolveMoves = [];
        let smartVisualMoves = [];
        let smartFaceletRequestTimer = 0;
        let smartSimGeneration = 0;

        function setSmartLiveState(text) {
            if (smartCubeLiveStateEl) smartCubeLiveStateEl.textContent = text;
        }

        function restoreAfter(anchor, node) {
            if (anchor?.parentNode) anchor.parentNode.insertBefore(node, anchor.nextSibling);
        }

        function arrangeSmartCubeWorkspace(connected) {
            if (connected) {
                smartCubeLive?.appendChild(smartWidgetsRow);
                return;
            }
            restoreAfter(smartWidgetsHome, smartWidgetsRow);
        }

        function prepareSmartCubePlayer() {
            puzzleCubeWrap.style.display = '';
            puzzleCube.style.width = '100%';
            puzzleCube.style.height = '100%';
            const refresh = () => {
                if (!timerView.classList.contains('smart-cube-active')) return;
                puzzleCube.setAttribute('visualization', '3D');
                puzzleCube.setAttribute('experimental-setup-alg', smartVisualMoves.join(' '));
                puzzleCube.setAttribute('alg', '');
                window.dispatchEvent(new Event('resize'));
            };
            if (customElements.get('twisty-player')) requestAnimationFrame(refresh);
            else customElements.whenDefined('twisty-player').then(() => requestAnimationFrame(refresh));
        }

        function resetSmartCubeVisual() {
            smartVisualMoves = [];
            puzzleCube.setAttribute('experimental-setup-alg', '');
            puzzleCube.setAttribute('alg', '');
            puzzleCube.alg = '';
        }

        function applySmartCubeVisualMove(moveStr) {
            smartVisualMoves.push(moveStr);
            try {
                if (typeof puzzleCube.experimentalAddMove !== 'function') throw new Error('Live move API unavailable');
                puzzleCube.experimentalAddMove(moveStr, { cancel: false });
            } catch (_) {
                puzzleCube.setAttribute('experimental-setup-alg', smartVisualMoves.join(' '));
                puzzleCube.setAttribute('alg', '');
            }
        }

        function normalScrambleLabel() {
            if (!currentScramble) return '—';
            return currentTrainingCase
                ? `${currentTrainingCase.name} · ${currentScramble}`
                : currentScramble;
        }

        function renderSmartScrambleProgress() {
            if (!timerView.classList.contains('smart-cube-active')) return;
            puzzleScrambleEl.classList.remove('smart-scramble-ready');

            if (smartSolvePhase === 'ready' || smartSolvePhase === 'solving') {
                puzzleScrambleEl.textContent = '';
                puzzleScrambleEl.classList.add('smart-scramble-ready');
                puzzleScrambleEl.setAttribute('aria-label', smartSolvePhase === 'ready'
                    ? 'Scramble complete. Start solving with your next turn.'
                    : 'Solve in progress.');
                return;
            }
            if (!smartScrambleTracker) return;

            const prefix = currentTrainingCase
                ? `<span class="smart-scramble-case">${esc(currentTrainingCase.name)} ·</span>`
                : '';
            const corrections = scrambleCorrectionMoves(smartScrambleTracker);
            const tokenParts = [];
            const correctionHtml = corrections.map((correction, index) =>
                `<span class="smart-scramble-correction${index === 0 ? ' is-current' : ''}" title="Correction move">${esc(correction.text)}</span>`
            ).join(' ');
            smartScrambleTracker.tokens.forEach((token, index) => {
                if (index === smartScrambleTracker.index && correctionHtml) {
                    tokenParts.push(`<span class="smart-scramble-fix-label">Fix</span> ${correctionHtml}`);
                }
                const needed = token.move?.quarterTurns || 1;
                const classes = ['smart-scramble-token'];
                if (token.progress >= needed) classes.push('is-done');
                else if (token.progress > 0) classes.push('is-partial');
                if (index === smartScrambleTracker.index && !corrections.length) classes.push('is-current');
                tokenParts.push(`<span class="${classes.join(' ')}">${esc(token.text)}</span>`);
            });
            if (smartScrambleTracker.index >= smartScrambleTracker.tokens.length && correctionHtml) {
                tokenParts.push(`<span class="smart-scramble-fix-label">Fix</span> ${correctionHtml}`);
            }
            puzzleScrambleEl.innerHTML = `${prefix}${tokenParts.join(' ')}`;
            puzzleScrambleEl.setAttribute('aria-label', corrections.length
                ? 'Apply the red correction move before continuing the scramble.'
                : 'Apply the highlighted scramble moves on your smart cube.');
        }

        function finishSmartScramble() {
            if (smartSolvePhase !== 'scrambling' || !scrambleTrackerComplete(smartScrambleTracker)) return false;
            smartSolvePhase = 'ready';
            completeScrambleTracker(smartScrambleTracker);
            if (smartScrambleSim) {
                solvedSim = { kp: smartScrambleSim.kp, state: smartScrambleSim.target };
            }
            timerView.classList.add('smart-cube-ready');
            timerView.classList.remove('smart-cube-solving');
            renderSmartScrambleProgress();
            return true;
        }

        function beginSmartScrambleLoading() {
            smartSimGeneration += 1;
            solvedSim = null;
            smartScrambleSim = null;
            smartScrambleTracker = null;
            smartPendingStateMoves = [];
            smartPendingSolveMoves = [];
            clearTimeout(smartFaceletRequestTimer);
            resetSmartCubeVisual();
            if (!timerView.classList.contains('smart-cube-active')) {
                smartSolvePhase = 'disconnected';
                return;
            }
            smartSolvePhase = 'loading';
            timerView.classList.remove('smart-cube-ready', 'smart-cube-solving');
            puzzleScrambleEl.classList.remove('smart-scramble-ready');
        }

        function trackSmartScrambleMove(moveStr) {
            if (smartSolvePhase !== 'scrambling') return false;
            advanceScrambleTracker(smartScrambleTracker, moveStr);
            if (smartScrambleSim && Alg) {
                try { smartScrambleSim.state = smartScrambleSim.state.applyAlg(new Alg(moveStr)); }
                catch (_) { smartScrambleTracker.hadMismatch = true; }
            } else {
                smartPendingStateMoves.push(moveStr);
            }
            const finished = finishSmartScramble();
            if (!finished) renderSmartScrambleProgress();
            return finished;
        }

        function setSmartStatus(text, connected) {
            if (smartStatusEl) smartStatusEl.textContent = text;
            smartStatusEl?.classList.toggle('connected', !!connected);
            if (smartBtn) smartBtn.textContent = connected ? 'Disconnect Cube' : 'Connect GAN / iCarry';
            if (smartOtherBtn) smartOtherBtn.disabled = !!connected;
            timerView.classList.toggle('smart-cube-active', !!connected);
            smartCubeLive?.setAttribute('aria-hidden', String(!connected));
            setSmartLiveState('Live stats');
            arrangeSmartCubeWorkspace(!!connected);
            if (connected) prepareSmartCubePlayer();
            if (connected && inputMode !== 'timer') {
                inputMode = 'timer';
                LS.set('inputMode', inputMode);
                applyInputMode();
            }
            resetPuzzleCubeView(currentScramble);
            applyPuzzleCube();
            if (connected) {
                initSolvedSim(currentScramble);
            } else {
                smartSimGeneration += 1;
                smartSolvePhase = 'disconnected';
                smartScrambleTracker = null;
                smartScrambleSim = null;
                smartPendingStateMoves = [];
                smartPendingSolveMoves = [];
                clearTimeout(smartFaceletRequestTimer);
                timerView.classList.remove('smart-cube-ready', 'smart-cube-solving');
                puzzleScrambleEl.classList.remove('smart-scramble-ready');
                puzzleScrambleEl.textContent = normalScrambleLabel();
                puzzleScrambleEl.removeAttribute('aria-label');
                if (puzzleTimer.getState() === 'running') puzzleTimer.reset();
            }
        }
        // ---- Solved-state simulator for auto-stop (3x3 & 2x2) ----
        let solvedSim = null;
        async function initSolvedSim(scrambleStr) {
            const generation = ++smartSimGeneration;
            solvedSim = null;
            smartScrambleSim = null;
            smartPendingStateMoves = [];
            smartPendingSolveMoves = [];
            smartScrambleTracker = createScrambleTracker(scrambleStr);
            if (timerView.classList.contains('smart-cube-active')) {
                smartSolvePhase = 'scrambling';
                timerView.classList.remove('smart-cube-ready', 'smart-cube-solving');
                renderSmartScrambleProgress();
            } else {
                smartSolvePhase = 'disconnected';
            }
            const pid = puzzleSelect.value;
            if (pid !== '333' && pid !== '222') return;   // only the cubes cubing.js fully solves
            try {
                const pmod = await import("https://cdn.cubing.net/v0/js/cubing/puzzles");
                if (!Alg) await cubingAlgReady;
                if (!Alg) return;
                const puzzle = pid === '333' ? pmod.cube3x3x3 : pmod.cube2x2x2;
                const kp = await puzzle.kpuzzle();
                const startState = typeof kp.defaultPattern === 'function'
                    ? kp.defaultPattern()
                    : kp.startState();
                let state = startState;
                if (scrambleStr) {
                    try { state = state.applyAlg(new Alg(scrambleStr)); }
                    catch (e) { /* unparseable scramble – skip */ }
                }
                if (generation !== smartSimGeneration) return;
                solvedSim = { kp, state };
                smartScrambleSim = { kp, state: startState, target: state };
                const queuedMoves = smartPendingStateMoves.splice(0);
                queuedMoves.forEach(move => {
                    try { smartScrambleSim.state = smartScrambleSim.state.applyAlg(new Alg(move)); }
                    catch (_) { smartScrambleTracker.hadMismatch = true; }
                });
                if (smartSolvePhase === 'solving' && replayPendingSmartSolveMoves(generation)) return;
                if (generation !== smartSimGeneration) return;
                if (!finishSmartScramble()) renderSmartScrambleProgress();
            } catch (e) {
                console.warn('solved-state simulator unavailable:', e);
            }
        }
        function checkSolvedAfterMove(moveStr) {
            if (!solvedSim) return false;
            try {
                solvedSim.state = solvedSim.state.applyAlg(new Alg(moveStr));
                const opts = { ignoreCenterOrientation: true, ignorePuzzleOrientation: true };
                const solved = solvedSim.state.experimentalIsSolved
                    ? solvedSim.state.experimentalIsSolved(opts)
                    : (solvedSim.state.isSolved ? solvedSim.state.isSolved(opts) : false);
                return !!solved;
            } catch (e) { return false; }
        }

        function stopSmartTimerForSolvedCube() {
            if (smartSolvePhase !== 'solving' || puzzleTimer.getState() !== 'running') return false;
            puzzleTimer.press();
            return true;
        }

        function replayPendingSmartSolveMoves(generation) {
            const queuedMoves = smartPendingSolveMoves.splice(0);
            for (const move of queuedMoves) {
                if (generation !== smartSimGeneration) return true;
                if (checkSolvedAfterMove(move) && stopSmartTimerForSolvedCube()) return true;
            }
            return false;
        }

        function trackSmartSolveMove(moveStr) {
            if (!solvedSim || !Alg) {
                smartPendingSolveMoves.push(moveStr);
                return false;
            }
            return checkSolvedAfterMove(moveStr) && stopSmartTimerForSolvedCube();
        }

        function smartFaceletsAreSolved(facelets) {
            const state = String(facelets || '').replace(/\s+/g, '').toUpperCase();
            if (state.length !== 54) return false;
            const centers = new Set();
            for (let offset = 0; offset < 54; offset += 9) {
                const face = state.slice(offset, offset + 9);
                if (!face || !face.split('').every(sticker => sticker === face[0])) return false;
                centers.add(face[0]);
            }
            return centers.size === 6;
        }

        function scheduleSmartFaceletCheck() {
            clearTimeout(smartFaceletRequestTimer);
            smartFaceletRequestTimer = window.setTimeout(() => {
                Promise.resolve(smartCubeHandle?.requestFacelets?.()).catch(() => {});
            }, 140);
        }

        async function connectSmartCube(provider = 'gan') {
            try {
                // GAN smart cubes are 3x3s, so keep the session and live view in sync.
                if (provider === 'gan' && puzzleSelect.value !== '333') {
                    puzzleSelect.value = '333';
                    puzzleSelect.dispatchEvent(new Event('change'));
                }
                if (smartBtn) {
                    smartBtn.disabled = true;
                    if (provider === 'gan') smartBtn.textContent = 'Pairing GAN...';
                }
                if (smartOtherBtn) {
                    smartOtherBtn.disabled = true;
                    if (provider === 'other') smartOtherBtn.textContent = 'Pairing...';
                }
                const mod = await import('./smart-cube.js?v=20260720-smart-reliable-1');
                smartCubeHandle = await mod.connectCube({
                    provider,
                    onPairingStage: message => {
                        if (smartStatusEl) {
                            smartStatusEl.textContent = message;
                            smartStatusEl.classList.remove('connected');
                        }
                    },
                    requestMacAddress: async (device) => {
                        while (true) {
                            const value = await window.ucPrompt(
                                `Chrome did not expose ${device?.name || 'this GAN cube'}'s address broadcast.\n\nFor automatic detection, cancel and use Set Up Auto-Detect.\n\nManual macOS backup: connect the cube in chrome://bluetooth-internals/#devices, then run system_profiler SPBluetoothDataType in Terminal and copy the GAN address from Connected devices.`,
                                '',
                                {
                                    title: 'Finish GAN pairing',
                                    placeholder: 'AA:BB:CC:DD:EE:FF',
                                    confirmLabel: 'Connect'
                                }
                            );
                            if (value === null) return null;
                            if (String(value).replace(/[^0-9a-f]/gi, '').length === 12) return value;
                            await window.ucAlert('Enter exactly 12 hexadecimal digits, such as AA:BB:CC:DD:EE:FF.', {
                                title: 'Check the cube address',
                                icon: 'BT'
                            });
                        }
                    },
                    onName: (name) => {
                        smartConnectedName = name;
                        setSmartStatus('Connected: ' + name, true);
                    },
                    onBattery: (level) => {
                        if (smartStatusEl && smartConnectedName) {
                            smartStatusEl.textContent = `Connected: ${smartConnectedName} · ${level}%`;
                        }
                    },
                    onFacelets: (facelets) => {
                        setSmartLiveState('Live stats');
                        if (smartFaceletsAreSolved(facelets)) stopSmartTimerForSolvedCube();
                    },
                    onMove: (moveStr) => {
                        // Every physical turn updates the 3D state. During the
                        // scramble phase it must not start or stop the timer.
                        applySmartCubeVisualMove(moveStr);
                        scheduleSmartFaceletCheck();

                        if (smartSolvePhase === 'loading') return;
                        if (smartSolvePhase === 'scrambling') {
                            trackSmartScrambleMove(moveStr);
                            return;
                        }
                        if (smartSolvePhase === 'ready' && inputMode === 'timer' && puzzleTimer.getState() === 'idle') {
                            smartSolvePhase = 'solving';
                            timerView.classList.remove('smart-cube-ready');
                            timerView.classList.add('smart-cube-solving');
                            renderSmartScrambleProgress();
                            puzzleTimer.startImmediately();
                        }
                        if (smartSolvePhase === 'solving') trackSmartSolveMove(moveStr);
                    },
                    onError: (msg) => {
                        console.warn('Smart cube error:', msg);
                        setSmartStatus('Error: ' + msg, false);
                    },
                    onDisconnect: () => {
                        smartCubeHandle = null;
                        smartConnectedName = '';
                        setSmartStatus('Disconnected', false);
                    }
                });
            } catch (e) {
                console.error(e);
                if (!smartStatusEl?.textContent?.startsWith('Error:')) {
                    setSmartStatus('Failed: ' + (e.message || e), false);
                }
                smartCubeHandle = null;
            } finally {
                if (smartBtn) smartBtn.disabled = false;
                if (smartOtherBtn) {
                    smartOtherBtn.textContent = 'Connect Other Cube';
                    smartOtherBtn.disabled = !!smartCubeHandle;
                }
            }
        }
        function disconnectSmartCube() {
            if (smartCubeHandle) {
                try { smartCubeHandle.disconnect(); } catch (e) {}
                smartCubeHandle = null;
            }
            smartConnectedName = '';
            setSmartStatus('Not connected', false);
        }
        smartBtn?.addEventListener('click', () => {
            if (smartCubeHandle) disconnectSmartCube(); else connectSmartCube('gan');
        });
        smartOtherBtn?.addEventListener('click', () => connectSmartCube('other'));
        ganAutoDetectHelpBtn?.addEventListener('click', async () => {
            const flagUrl = 'chrome://flags/#enable-experimental-web-platform-features';
            let copied = false;
            try {
                await navigator.clipboard.writeText(flagUrl);
                copied = true;
            } catch (_) {}
            await window.ucAlert(
                `${copied ? 'The Chrome setup address is copied.' : `Copy this address: ${flagUrl}`}\n\n1. Paste it into Chrome's address bar.\n2. Set Experimental Web Platform features to Enabled.\n3. Relaunch Chrome.\n4. Return here, wake the cube, and choose Connect GAN / iCarry.\n\nKeep turning the cube while the app reads its broadcast. Once found, the address is remembered for future connections.`,
                { title: 'Automatic GAN pairing', icon: 'BT' }
            );
        });
        document.getElementById('smart-cube-reset')?.addEventListener('click', () => {
            puzzleTimer.reset();
            resetPuzzleCubeView();
            applyPuzzleCube();
            initSolvedSim(currentScramble);
        });

        // ---- Battles ----
        const battlesLobby = document.getElementById('battles-lobby');
        const battlesRoom  = document.getElementById('battles-room');
        const battleScrambleEl = document.getElementById('battle-scramble');
        const battleTimerEl    = document.getElementById('battle-timer');
        const battlePlayersEl  = document.getElementById('battle-players');
        const battleStateEl    = document.getElementById('battle-state');
        const battleEventEl    = document.getElementById('battle-event');
        const battleCodeEl     = document.getElementById('battle-code');
        const battleHintEl     = document.getElementById('battle-hint');
        const battleResultEl   = document.getElementById('battle-result');
        const battleReadyBtn   = document.getElementById('battle-ready-btn');
        const battleEndBtn     = document.getElementById('battle-end-btn');
        const battleModeLine   = document.getElementById('battle-mode-line');
        const battleCountdownOverlay = document.getElementById('battle-countdown-overlay');
        const battleCountdownNumber  = document.getElementById('battle-countdown-number');
        const battlesLiveCountEl = document.getElementById('battles-live-count');

        let battleCode   = null;
        let battleData   = null;
        let battlePlayers = {};
        let battleUnsub  = null;
        let battleSubmitting = false;
        let battleCountdownTick = null;
        let battlesCountUnsub = null;

        function battleMode() { return (battleData && battleData.mode) || 'ao5'; }
        function battleTarget() { return Math.max(1, parseInt((battleData && battleData.target) || 3, 10)); }
        function battleSolveCap() { return battleMode() === 'ao5' ? 5 : null; }
        function battleModeLabel(data = battleData) {
            if (!data) return '';
            if ((data.mode || 'ao5') === 'sets') return `Sets · first to ${Math.max(1, parseInt(data.target || 3, 10))}`;
            if ((data.mode || 'ao5') === 'infinite') return 'Infinite';
            return 'Ao5';
        }
        function myBattleTimes() {
            const me = fbSync.getUser();
            return (me && battlePlayers[me.uid] && battlePlayers[me.uid].times) || [];
        }
        function myBattleFinished() {
            if (!battleData) return false;
            if ((battleData.state || '') === 'finished') return true;
            return battleMode() === 'ao5' && myBattleTimes().length >= 5;
        }
        function stopBattleCountdownLoop() {
            if (battleCountdownTick) {
                clearTimeout(battleCountdownTick);
                battleCountdownTick = null;
            }
        }
        function ensureBattleLiveCountListener() {
            if (!battlesLiveCountEl) return;
            if (!fbSync.enabled || !fbSync.getUser()) {
                battlesLiveCountEl.textContent = 'Live matches: 0';
                return;
            }
            if (battlesCountUnsub) return;
            const fs = fbSync.fs();
            const dbInst = fbSync.db();
            battlesCountUnsub = fs.onSnapshot(fs.collection(dbInst, 'battles'), (snap) => {
                const live = snap.docs.map(doc => doc.data()).filter(item => item && item.state !== 'finished').length;
                battlesLiveCountEl.textContent = `Live matches: ${live}`;
                refreshRoadmapTask('Show live battle activity count in the Battles lobby', true);
            }, () => {
                battlesLiveCountEl.textContent = 'Live matches: 0';
            });
        }
        function stopBattleLiveCountListener() {
            if (battlesCountUnsub) { try { battlesCountUnsub(); } catch (_) {} battlesCountUnsub = null; }
            if (battlesLiveCountEl) battlesLiveCountEl.textContent = 'Live matches: 0';
        }
        function updateBattleCountdownOverlay() {
            stopBattleCountdownLoop();
            if (!battleData || battleData.state !== 'countdown' || !battleData.countdownEndsAt) {
                battleCountdownOverlay.style.display = 'none';
                return;
            }
            const remaining = battleData.countdownEndsAt - Date.now();
            if (remaining <= 0) {
                battleCountdownOverlay.style.display = 'none';
                const me = fbSync.getUser();
                if (me && battleData.createdBy && battleData.createdBy.uid === me.uid) {
                    import('./battles.js').then(m => m.setBattleState(battleCode, 'racing', { countdownEndsAt: null }).catch(() => {}));
                }
                return;
            }
            battleCountdownOverlay.style.display = 'flex';
            battleCountdownNumber.textContent = remaining <= 350 ? 'BATTLE!' : String(Math.ceil(remaining / 1000));
            battleCountdownTick = setTimeout(updateBattleCountdownOverlay, 100);
        }

        const battleTimer = createTimer(battleTimerEl, {
            holdDelay: () => 500,
            onSolve: async (t, pen) => {
                if (!battleCode || battleSubmitting || myBattleFinished()) return;
                battleSubmitting = true;
                try {
                    const m = await import('./battles.js');
                    await m.addBattleSolve(battleCode, t, pen || 'ok');
                } catch (e) {
                    console.error(e);
                    alert('Could not submit time: ' + (e.message || e));
                } finally {
                    battleSubmitting = false;
                }
            }
        });
        timerRegistry.push({
            timer: battleTimer,
            isActive: () => battlesView.style.display !== 'none'
                            && battlesRoom.style.display !== 'none'
                            && battleData && battleData.state === 'racing'
                            && !myBattleFinished()
        });
        battlesRoom.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'mouse') return;
            if (!battleData || battleData.state !== 'racing') return;
            if (e.target.closest('button, input, select, a')) return;
            battleTimer.press();
        });
        battlesRoom.addEventListener('pointerup', (e) => {
            if (e.pointerType === 'mouse') return;
            if (!battleData || battleData.state !== 'racing') return;
            if (e.target.closest('button, input, select, a')) return;
            battleTimer.release();
        });

        function showBattlesLobby() {
            battlesLobby.style.display = '';
            battlesRoom.style.display = 'none';
            stopBattleCountdownLoop();
            updateBattlesGate();
            ensureBattleLiveCountListener();
            renderCompactQuestPanels();
        }

        function updateBattlesGate() {
            const total = totalSolvesAll();
            const unlocked = battlesUnlocked();
            const authReady = fbSync.isInitialAuthResolved();
            const signedIn  = !!fbSync.getUser();
            const gateEl = document.getElementById('battles-gate');
            const actionsEl = document.querySelector('#battles-lobby .battles-actions');
            const rulesEl = document.querySelector('#battles-lobby .battles-rules');
            const signinPrompt = document.getElementById('battles-signin-prompt');
            if (unlocked) {
                if (gateEl) gateEl.style.display = 'none';
                if (signedIn) {
                    if (actionsEl) actionsEl.style.display = '';
                    if (rulesEl) rulesEl.style.display = '';
                    if (signinPrompt) signinPrompt.style.display = 'none';
                } else if (authReady) {
                    if (actionsEl) actionsEl.style.display = 'none';
                    if (rulesEl) rulesEl.style.display = 'none';
                    if (signinPrompt) signinPrompt.style.display = '';
                } else {
                    if (actionsEl) actionsEl.style.display = 'none';
                    if (rulesEl) rulesEl.style.display = 'none';
                    if (signinPrompt) signinPrompt.style.display = 'none';
                }
            } else {
                if (actionsEl) actionsEl.style.display = 'none';
                if (rulesEl) rulesEl.style.display = 'none';
                if (signinPrompt) signinPrompt.style.display = 'none';
                if (gateEl) {
                    gateEl.style.display = '';
                    const pct = Math.min(100, (total / BATTLES_MIN_SOLVES) * 100);
                    gateEl.querySelector('.gate-count').textContent = `${total} / ${BATTLES_MIN_SOLVES}`;
                    gateEl.querySelector('.gate-bar-fill').style.width = pct.toFixed(1) + '%';
                }
            }
        }
        function showBattlesRoom() {
            battlesLobby.style.display = 'none';
            battlesRoom.style.display = '';
        }
        function applyBattleCreateModeUI() {
            const mode = document.getElementById('battle-create-mode').value;
            const targetSel = document.getElementById('battle-create-target');
            const targetLbl = document.getElementById('battle-target-label');
            const showTarget = mode === 'sets';
            targetSel.style.display = showTarget ? '' : 'none';
            targetLbl.style.display = showTarget ? '' : 'none';
        }
        document.getElementById('battle-create-mode')?.addEventListener('change', applyBattleCreateModeUI);
        applyBattleCreateModeUI();

        async function maybeAdvanceBattleState(me, allHere, allReady, winnerUid) {
            if (!battleData || !battleCode || !me || !battleData.createdBy || battleData.createdBy.uid !== me.uid) return;
            const state = battleData.state || 'waiting';
            if (state === 'waiting' && allHere && allReady) {
                await import('./battles.js').then(m => m.setBattleState(battleCode, 'countdown', { countdownEndsAt: Date.now() + 3100 })).catch(() => {});
                return;
            }
            if ((battleMode() === 'ao5' && Object.values(battlePlayers).every(p => (p.times || []).length >= 5)) ||
                (battleMode() === 'sets' && winnerUid)) {
                await import('./battles.js').then(m => m.setBattleState(battleCode, 'finished')).catch(() => {});
            }
        }

        function renderBattleRoom() {
            if (!battleData) return;
            battleCodeEl.textContent = battleCode;
            battleEventEl.textContent = ({ '222':'2x2', '333':'3x3', 'pyram':'Pyraminx' }[battleData.puzzle] || battleData.puzzle);
            const state = battleData.state || 'waiting';
            battleStateEl.textContent = `${state} · ${battleModeLabel()}`;
            battleModeLine.textContent = battleMode() === 'sets'
                ? `First to ${battleTarget()} set wins`
                : (battleMode() === 'infinite' ? 'No solve cap. Anyone can end the battle.' : 'Average of 5 solves');

            const me = fbSync.getUser();
            const playerList = Object.entries(battlePlayers);
            const wanted = battleData.maxPlayers || 2;
            const allHere = playerList.length >= wanted;
            const allReady = allHere && playerList.every(([_, p]) => p.ready);
            const myTimes = me && battlePlayers[me.uid] ? (battlePlayers[me.uid].times || []) : [];
            const myCount = myTimes.length;

            import('./battles.js').then(async m => {
                const setInfo = m.computeSetScores(battlePlayers);
                const winner = m.computeWinner(battlePlayers, battleData);
                const allAo5Finished = battleMode() === 'ao5' && playerList.length && playerList.every(([_, p]) => (p.times || []).length >= 5);
                if (state !== 'finished') await maybeAdvanceBattleState(me, allHere, allReady, battleMode() === 'sets' ? winner : null);

                battlePlayersEl.innerHTML = playerList.map(([uid, p]) => {
                    const isMe = me && uid === me.uid;
                    const times = p.times || [];
                    const chips = times.slice(-(battleMode() === 'infinite' ? 10 : times.length)).map(s => {
                        const lbl = s.penalty === 'dnf' ? 'DNF'
                            : (s.penalty === '+2' ? (s.t + 2).toFixed(2) + '+' : s.t.toFixed(2));
                        return `<span class="bp-chip">${lbl}</span>`;
                    }).join('');
                    let progress = `${times.length} solves`;
                    let stat = p.ready ? '<span class="bp-status ready">ready</span>' : '<span class="bp-status">waiting</span>';
                    if (battleMode() === 'ao5') {
                        progress = `${times.length} / 5`;
                        if (times.length >= 5) {
                            const avg = m.ao5(times);
                            stat = `<span class="bp-ao5">Ao5 <b>${avg === Infinity ? 'DNF' : avg.toFixed(2)}</b></span>`;
                        } else if (state === 'racing') {
                            stat = `<span class="bp-status racing">solve ${times.length + 1} / 5</span>`;
                        }
                    } else if (battleMode() === 'sets') {
                        const wins = setInfo.scores[uid] || 0;
                        progress = `${wins} / ${battleTarget()} sets`;
                        stat = `<span class="bp-status ${wins >= battleTarget() ? 'ready' : 'racing'}">rounds won: ${wins}</span>`;
                    } else if (battleMode() === 'infinite' && state === 'racing') {
                        stat = `<span class="bp-status racing">live battle</span>`;
                    }
                    return `<div class="bp-row ${isMe ? 'me' : ''}">
                        <div class="bp-row-head">
                            <span class="bp-name">${escHTML(p.name)}${isMe ? ' (you)' : ''}</span>
                            <span class="bp-prog">${progress}</span>
                            ${stat}
                        </div>
                        ${chips ? `<div class="bp-chips">${chips}</div>` : ''}
                    </div>`;
                }).join('');

                const scrList = battleData.scrambles || [];
                const myScramble = scrList[Math.min(myCount, scrList.length - 1)] || '';
                if (state === 'countdown') {
                    battleScrambleEl.textContent = myScramble ? `First scramble ready · ${myScramble}` : 'Get ready…';
                } else if (state === 'racing') {
                    if (battleMode() === 'ao5') {
                        battleScrambleEl.textContent = myCount >= 5 ? '✓ Done. Waiting for the others…' : `Solve ${myCount + 1} / 5 · ${myScramble}`;
                    } else if (battleMode() === 'sets') {
                        battleScrambleEl.textContent = `Round ${setInfo.resolvedRounds + 1} · ${myScramble}`;
                    } else {
                        battleScrambleEl.textContent = `Live scramble ${myCount + 1} · ${myScramble}`;
                    }
                } else if (state === 'finished') {
                    battleScrambleEl.textContent = battleMode() === 'infinite' ? 'Battle ended.' : 'Race complete!';
                } else {
                    battleScrambleEl.textContent = `Waiting for ${wanted} players to be ready…`;
                }

                if (state === 'racing' || state === 'countdown' || state === 'finished') {
                    battleReadyBtn.style.display = 'none';
                } else {
                    const myEntry = me ? battlePlayers[me.uid] : null;
                    battleReadyBtn.style.display = '';
                    battleReadyBtn.textContent = (myEntry && myEntry.ready) ? '✓ Ready (click to un-ready)' : 'Ready';
                    battleReadyBtn.classList.toggle('on', !!(myEntry && myEntry.ready));
                }
                battleEndBtn.style.display = battleMode() === 'infinite' && state !== 'finished' ? '' : 'none';

                if (state === 'countdown') {
                    battleHintEl.textContent = 'Hold Space now. The timer will arm with a 0.50s hold once BATTLE starts.';
                } else if (state === 'racing') {
                    if (battleMode() === 'ao5') battleHintEl.textContent = myCount >= 5 ? 'You are done.' : `Race! Hold Space for 0.50s to arm solve ${myCount + 1}.`;
                    else if (battleMode() === 'sets') battleHintEl.textContent = `Race this round. First to ${battleTarget()} set wins takes the match.`;
                    else battleHintEl.textContent = 'Infinite battle is live. Keep solving until someone ends it.';
                } else if (state === 'finished') {
                    battleHintEl.textContent = battleMode() === 'infinite' ? 'Infinite battle ended.' : 'Battle complete.';
                } else {
                    battleHintEl.textContent = 'Mark yourself Ready, then wait for everyone else.';
                }

                if (state === 'finished' || allAo5Finished || (battleMode() === 'sets' && winner)) {
                    let html = '';
                    if (winner === 'tie') html = `<div class="result-line tie">It is a tie.</div>`;
                    else if (winner === 'all-dnf') html = `<div class="result-line dnf">All DNF.</div>`;
                    else if (winner && battlePlayers[winner]) html = `<div class="result-line win">🏆 <b>${escHTML(battlePlayers[winner].name)}</b> wins!</div>`;
                    if (battleData.endedBy && battleMode() === 'infinite') {
                        html += `<div class="battle-ended-by">Ended by ${escHTML(battleData.endedBy.name || 'Player')}</div>`;
                    }
                    battleResultEl.innerHTML = html || '<div class="result-line tie">Battle finished.</div>';
                    battleResultEl.style.display = '';
                } else {
                    battleResultEl.style.display = 'none';
                }

                updateBattleCountdownOverlay();
            }).catch(console.error);
        }

        function attachBattleListener(code) {
            if (battleUnsub) { try { battleUnsub(); } catch (_) {} }
            import('./battles.js').then(m => {
                battleUnsub = m.listenBattle(code, ({ battle, players, deleted }) => {
                    if (deleted) {
                        alert('Battle was closed.');
                        leaveBattleUI();
                        return;
                    }
                    if (battle) battleData = battle;
                    if (players) battlePlayers = players;
                    renderBattleRoom();
                });
            }).catch(e => alert('Battles unavailable: ' + (e.message || e)));
        }

        function leaveBattleUI() {
            stopBattleCountdownLoop();
            if (battleUnsub) { try { battleUnsub(); } catch (_) {} battleUnsub = null; }
            if (battleCode) {
                import('./battles.js').then(m => m.leaveBattle(battleCode).catch(() => {}));
            }
            battleCode = null;
            battleData = null;
            battlePlayers = {};
            battleSubmitting = false;
            battleTimer.reset();
            battleResultEl.style.display = 'none';
            const u = new URL(window.location.href);
            u.searchParams.delete('battle');
            history.replaceState({}, document.title, u.pathname + (u.search ? u.search : ''));
            showBattlesLobby();
        }

        document.getElementById('battle-create-btn').addEventListener('click', async () => {
            try {
                const m = await import('./battles.js');
                const ev = document.getElementById('battle-create-event').value;
                const mp = parseInt(document.getElementById('battle-create-size').value, 10);
                const mode = document.getElementById('battle-create-mode').value;
                const target = parseInt(document.getElementById('battle-create-target').value, 10);
                const code = await m.createBattle({ puzzle: ev, maxPlayers: mp, mode, target });
                battleCode = code;
                battleSubmitting = false;
                showBattlesRoom();
                const u = new URL(window.location.href);
                u.searchParams.set('battle', code);
                history.replaceState({}, document.title, u.pathname + '?' + u.searchParams.toString());
                attachBattleListener(code);
            } catch (e) {
                alert(e.message || e);
            }
        });
        document.getElementById('battle-join-btn').addEventListener('click', async () => {
            const code = (document.getElementById('battle-join-code').value || '').trim().toUpperCase();
            if (code.length < 4) { alert('Enter the battle code.'); return; }
            try {
                const m = await import('./battles.js');
                await m.joinBattle(code);
                battleCode = code;
                battleSubmitting = false;
                showBattlesRoom();
                const u = new URL(window.location.href);
                u.searchParams.set('battle', code);
                history.replaceState({}, document.title, u.pathname + '?' + u.searchParams.toString());
                attachBattleListener(code);
            } catch (e) {
                alert(e.message || e);
            }
        });
        document.getElementById('battle-copy-link').addEventListener('click', () => {
            if (!battleCode) return;
            const u = new URL(window.location.href);
            u.searchParams.set('battle', battleCode);
            const link = u.origin + u.pathname + '?' + u.searchParams.toString();
            if (navigator.clipboard) navigator.clipboard.writeText(link);
            const b = document.getElementById('battle-copy-link');
            const orig = b.textContent;
            b.textContent = 'Copied!';
            setTimeout(() => b.textContent = orig, 1200);
        });
        battleEndBtn?.addEventListener('click', async () => {
            if (!battleCode) return;
            try {
                const m = await import('./battles.js');
                await m.endBattle(battleCode);
            } catch (e) { alert(e.message || e); }
        });
        document.getElementById('battle-leave').addEventListener('click', leaveBattleUI);

        document.getElementById('gate-bypass-toggle')?.addEventListener('click', () => {
            const form = document.getElementById('gate-bypass-form');
            form.style.display = form.style.display === 'none' ? 'flex' : 'none';
            if (form.style.display === 'flex') document.getElementById('gate-bypass-input').focus();
        });
        document.getElementById('gate-bypass-submit')?.addEventListener('click', () => {
            const v = (document.getElementById('gate-bypass-input').value || '').trim();
            const msg = document.getElementById('gate-bypass-msg');
            if (v === BATTLES_BYPASS_CODE) {
                LS.set('battlesBypass', true);
                msg.textContent = '✓ Unlocked. Welcome, beta tester!';
                msg.style.color = '#5fe08c';
                setTimeout(() => updateBattlesGate(), 600);
            } else {
                msg.textContent = '✗ Invalid code.';
                msg.style.color = '#ff6b6b';
            }
        });
        document.getElementById('battles-signin-btn')?.addEventListener('click', () => openSigninModal());
        fbSync.onUserChange(() => updateBattlesGate());
        fbSync.onUserChange((u) => {
            if (u) ensureBattleLiveCountListener();
            else stopBattleLiveCountListener();
        });

        battleReadyBtn.addEventListener('click', async () => {
            if (!battleCode || !fbSync.getUser()) return;
            const me = fbSync.getUser();
            const cur = !!(battlePlayers[me.uid] && battlePlayers[me.uid].ready);
            try {
                const m = await import('./battles.js');
                await m.setReady(battleCode, !cur);
            } catch (e) { alert(e.message || e); }
        });

        // Auto-join from ?battle=CODE in the URL (after sign-in resolves)
        function maybeAutoJoinBattleFromURL() {
            const code = new URL(window.location.href).searchParams.get('battle');
            if (!code) return;
            if (!fbSync.getUser()) {
                // Stash for after sign-in
                return;
            }
            // Switch to Battles tab
            document.querySelector('.nav-item[data-mode="battles"]')?.click();
            import('./battles.js').then(m => m.joinBattle(code)).then(() => {
                battleCode = code;
                showBattlesRoom();
                attachBattleListener(code);
            }).catch(e => {
                alert('Could not join battle: ' + (e.message || e));
                const u = new URL(window.location.href);
                u.searchParams.delete('battle');
                history.replaceState({}, document.title, u.pathname);
            });
        }
        fbSync.onUserChange((u) => { if (u) maybeAutoJoinBattleFromURL(); });
        // Fire once immediately in case user is already signed in
        if (fbSync.getUser()) maybeAutoJoinBattleFromURL();

        // ---- Onboarding (Welcome Quiz) — shows on first sign-in ----
        const ONBOARD_EVENTS = [
            { id: '222', label: '2×2' }, { id: '333', label: '3×3' }, { id: '444', label: '4×4' },
            { id: '555', label: '5×5' }, { id: '666', label: '6×6' }, { id: '777', label: '7×7' },
            { id: '333oh', label: '3×3 OH' }, { id: '333bf', label: '3BLD' }, { id: '333fm', label: 'FMC' },
            { id: 'pyram', label: 'Pyraminx' }, { id: 'skewb', label: 'Skewb' },
            { id: 'minx', label: 'Megaminx' }, { id: 'sq1', label: 'Square-1' }, { id: 'clock', label: 'Clock' }
        ];
        const ONBOARD_METHODS = [
            { id: 'cfop',    label: 'CFOP' },
            { id: 'roux',    label: 'Roux' },
            { id: 'zz',      label: 'ZZ' },
            { id: 'petrus',  label: 'Petrus' },
            { id: 'ortega',  label: 'Ortega (2×2)' },
            { id: 'cll',     label: 'CLL (2×2)' },
            { id: 'eg',      label: 'EG (2×2)' },
            { id: 'lbl',     label: 'Beginner / LBL' }
        ];
        const ONBOARD_ALGSETS = [
            { category: 'F2L',              label: 'F2L' },
            { category: 'AF2L',             label: 'Advanced F2L' },
            { category: 'OLL',              label: 'OLL' },
            { category: 'PLL',              label: 'PLL' },
            { category: 'COLL',             label: 'COLL' },
            { category: 'Winter Variation', label: 'Winter Variation' },
            { category: 'Summer Variation', label: 'Summer Variation' },
            { category: '2x2 Ortega OLL',   label: '2x2 Ortega OLL' },
            { category: '2x2 Ortega PBL',   label: '2x2 Ortega PBL' },
            { category: '2x2 CLL',          label: '2x2 CLL' },
            { category: '2x2 EG-1',         label: '2x2 EG-1' },
            { category: '2x2 EG-2',         label: '2x2 EG-2' },
            { category: 'Pyraminx Last Layer', label: 'Pyraminx LL' },
            { category: 'Pyraminx L4E',     label: 'Pyraminx L4E' },
            { category: 'Megaminx CO',      label: 'Megaminx CO' },
            { category: 'Megaminx EO',      label: 'Megaminx EO' },
            { category: 'Megaminx CP',      label: 'Megaminx CP' },
            { category: 'Megaminx EP',      label: 'Megaminx EP' },
            { category: '4x4 OLL Parity',   label: '4x4 OLL Parity' },
            { category: '4x4 PLL Parity',   label: '4x4 PLL Parity' },
            { category: '5x5 L2C',          label: '5x5 L2C' },
            { category: '5x5 L2E',          label: '5x5 L2E' },
        ];

        const onboardModal = document.getElementById('onboard-modal');
        let onboardStep = 1;
        const onboardSelections = { events: new Set(), methods: new Set(), algsets: new Set() };
        const ONBOARD_TOTAL_STEPS = 5;

        function renderOnboardChips() {
            const evEl = document.getElementById('onboard-events');
            evEl.innerHTML = EVENT_OPTION_GROUPS.map(group => {
                const events = group.ids.map(id => ONBOARD_EVENTS.find(event => event.id === id)).filter(Boolean);
                if (!events.length) return '';
                return `<div class="onboard-chip-group">
                    <div class="onboard-chip-group-title">${escHTML(group.label)}</div>
                    <div class="onboard-chip-group-items">${events.map(event => {
                        const on = onboardSelections.events.has(event.id);
                        return `<button type="button" class="onboard-chip ${on ? 'on' : ''}" data-onboard-event="${event.id}">${escHTML(event.label)}</button>`;
                    }).join('')}</div>
                </div>`;
            }).join('');
            const mtEl = document.getElementById('onboard-methods');
            mtEl.innerHTML = ONBOARD_METHODS.map(m => {
                const on = onboardSelections.methods.has(m.id);
                return `<button type="button" class="onboard-chip ${on ? 'on' : ''}" data-onboard-method="${m.id}">${m.label}</button>`;
            }).join('');
            const asEl = document.getElementById('onboard-algsets');
            if (asEl) asEl.innerHTML = Object.entries(CUBE_CATS).map(([cube, categories]) => {
                const algSets = ONBOARD_ALGSETS.filter(item => categories.includes(item.category));
                if (!algSets.length) return '';
                return `<div class="onboard-chip-group">
                    <div class="onboard-chip-group-title">${escHTML(cube)}</div>
                    <div class="onboard-chip-group-items">${algSets.map(item => {
                        const on = onboardSelections.algsets.has(item.category);
                        const count = db.filter(alg => alg.category === item.category).length;
                        return `<button type="button" class="onboard-chip ${on ? 'on' : ''}" data-onboard-algset="${escHTML(item.category)}">${escHTML(item.label)} <span style="opacity:0.55;font-size:0.78em">${count}</span></button>`;
                    }).join('')}</div>
                </div>`;
            }).join('');
        }
        function renderOnboardDots() {
            const dots = document.getElementById('onboard-dots');
            let s = '';
            for (let i = 1; i <= ONBOARD_TOTAL_STEPS; i++) s += `<span class="onboard-dot ${i === onboardStep ? 'active' : ''}"></span>`;
            dots.innerHTML = s;
        }
        function showOnboardStep(n) {
            onboardStep = Math.max(1, Math.min(ONBOARD_TOTAL_STEPS, n));
            onboardModal.querySelectorAll('.onboard-step').forEach(el => {
                el.style.display = (parseInt(el.dataset.step, 10) === onboardStep) ? '' : 'none';
            });
            document.getElementById('onboard-back').style.visibility = onboardStep > 1 ? 'visible' : 'hidden';
            document.getElementById('onboard-next').textContent = onboardStep === ONBOARD_TOTAL_STEPS ? 'Finish' : 'Next';
            renderOnboardDots();
        }
        function openOnboarding() {
            // Pre-fill from existing profile if any
            onboardSelections.events  = new Set((profile.events  || []).slice());
            onboardSelections.methods = new Set((profile.methods || []).slice());
            onboardSelections.algsets = new Set();
            renderOnboardChips();
            showOnboardStep(1);
            onboardModal.style.display = 'flex';
        }
        function closeOnboarding(complete) {
            if (complete) {
                profile.events     = [...onboardSelections.events];
                profile.methods    = [...onboardSelections.methods];
                profile.onboarded  = true;
                // If user picked exactly one event, set it as main_event too
                if (profile.events.length === 1) profile.main_event = profile.events[0];
                saveProfile();
                // Mark selected alg sets as fully learned
                if (onboardSelections.algsets.size > 0) {
                    onboardSelections.algsets.forEach(cat => {
                        db.filter(it => it.category === cat).forEach(it => learnedSet.add(it.name));
                    });
                    saveLearned();
                }
                if (statsView.style.display !== 'none') renderStats();
                renderCards();
            }
            onboardModal.style.display = 'none';
        }
        document.getElementById('onboard-events').addEventListener('click', (e) => {
            const b = e.target.closest('[data-onboard-event]');
            if (!b) return;
            const id = b.dataset.onboardEvent;
            if (onboardSelections.events.has(id)) onboardSelections.events.delete(id);
            else onboardSelections.events.add(id);
            renderOnboardChips();
        });
        document.getElementById('onboard-methods').addEventListener('click', (e) => {
            const b = e.target.closest('[data-onboard-method]');
            if (!b) return;
            const id = b.dataset.onboardMethod;
            if (onboardSelections.methods.has(id)) onboardSelections.methods.delete(id);
            else onboardSelections.methods.add(id);
            renderOnboardChips();
        });
        document.getElementById('onboard-algsets').addEventListener('click', (e) => {
            const b = e.target.closest('[data-onboard-algset]');
            if (!b) return;
            const cat = b.dataset.onboardAlgset;
            if (onboardSelections.algsets.has(cat)) onboardSelections.algsets.delete(cat);
            else onboardSelections.algsets.add(cat);
            renderOnboardChips();
        });
        document.getElementById('onboard-back').addEventListener('click', () => showOnboardStep(onboardStep - 1));
        document.getElementById('onboard-next').addEventListener('click', () => {
            if (onboardStep === ONBOARD_TOTAL_STEPS) { closeOnboarding(true); return; }
            showOnboardStep(onboardStep + 1);
        });
        document.getElementById('onboard-skip').addEventListener('click', () => {
            // Skipping still marks onboarded so we don't pester again
            profile.onboarded = true;
            saveProfile();
            onboardModal.style.display = 'none';
        });
        document.getElementById('onboard-wca-btn').addEventListener('click', () => {
            const user = fbSync.getUser();
            if (!user) {
                alert('Connect Google before linking WCA.');
                return;
            }
            sessionStorage.setItem('wca_linking_uid', user.uid);
            startWcaLogin();   // redirects away; on return, callback handler picks it up
        });
        // Close on backdrop click / Esc
        onboardModal.addEventListener('click', (e) => {
            if (e.target === onboardModal) {
                profile.onboarded = true; saveProfile(); onboardModal.style.display = 'none';
            }
        });

        function maybeStartOnboarding() {
            if (!fbSync.getUser()) return;                                // require sign-in
            if (profile.onboarded) return;                                // already done / skipped
            // If we're returning from a WCA OAuth redirect, do NOT pop onboarding
            // — the user has clearly used the app before.
            if (window.location.hash && window.location.hash.includes('access_token=')) {
                profile.onboarded = true; saveProfile();
                return;
            }
            // Heuristic: existing users with real data shouldn't be hassled
            const hasOldData = (profile.bio || profile.main_cubes || profile.wca_id ||
                                learnedSet.size > 0);
            if (hasOldData) {
                profile.onboarded = true; saveProfile();
                return;
            }
            // Brand-new user → show
            openOnboarding();
        }
        fbSync.onUserChange((u) => { if (u) setTimeout(maybeStartOnboarding, 400); });

        // ---- WCA OAuth callback handling (runs once on every page load) ----
        handleWcaCallback().then(async result => {
            if (!result || !result.wca_id) return;
            const user = await fbSync.waitForAuth();
            if (!user) throw new Error('Sign in with Google before linking your WCA account.');
            const expectedUid = sessionStorage.getItem('wca_linking_uid');
            if (expectedUid && expectedUid !== user.uid) {
                throw new Error('You returned with a different Google account. Sign in again and retry linking WCA.');
            }
            await fbSync.claimWcaIdentity(result.wca_id);
            sessionStorage.removeItem('wca_signin_intent');
            sessionStorage.removeItem('wca_linking_uid');
            profile.wca_id = result.wca_id;
            profile.wca_user_id = result.user_id || null;
            profile.wca_name = result.name || '';
            profile.wca_verified = true;
            // Normalize WCA personal_records into { eventId: { single, average } } in SECONDS
            if (result.personal_records) {
                const pr = {};
                Object.entries(result.personal_records).forEach(([evId, recs]) => {
                    pr[evId] = {
                        single:  recs.single  && typeof recs.single.best  === 'number' ? recs.single.best  / 100 : null,
                        average: recs.average && typeof recs.average.best === 'number' ? recs.average.best / 100 : null
                    };
                });
                profile.wca_records = pr;
            }
            saveProfile();
            // Show a toast-ish confirmation, then re-render
            if (statsView.style.display !== 'none') renderStats();
            console.info('[WCA] Verified as', result.wca_id, result.name);
            setTimeout(() => alert('WCA linked as ' + (result.name || result.wca_id)), 50);
        }).catch(e => {
            console.error('WCA verification failed:', e);
            alert(e?.code === 'wca/account-already-used'
                ? 'That WCA account is already linked to another UC Academy account.'
                : 'WCA linking failed: ' + (e.message || e));
        });

        // ============================================================
        //          Timer Widgets (re-orderable stat cards)
        // ============================================================
        const DEFAULT_WIDGETS = [
            { type: 'ao5' },
            { type: 'scramble' },
            { type: 'comparison' },
            { type: 'goal' }
        ];
        let widgets = LS.get('widgets', DEFAULT_WIDGETS).slice();
        while (widgets.length < 4) widgets.push({ type: 'empty' });
        let widgetSlotPicking = -1;

        function saveWidgets() { LS.set('widgets', widgets); }

        function widgetAo5Now() {
            return aoNAll(curSolves(), 5);   // current rolling ao5
        }
        function widgetAo5PR() {
            return bestAoNAll(curSolves(), 5);
        }
        function widgetAo12Now()  { return aoNAll(curSolves(), 12); }
        function widgetAo12PR()   { return bestAoNAll(curSolves(), 12); }
        function todaysSolveCount() {
            const today = new Date(); today.setHours(0,0,0,0);
            const t0 = today.getTime();
            return curSolves().filter(s => (s.date || 0) >= t0).length;
        }
        function consecutiveSubX(threshold) {
            const solves = curSolves();
            let n = 0;
            for (let i = solves.length - 1; i >= 0; i--) {
                const s = solves[i];
                const eff = s.penalty === 'dnf' ? Infinity : (s.penalty === '+2' ? s.t + 2 : s.t);
                if (eff < threshold) n++;
                else break;
            }
            return n;
        }
        function lastInspectionUsed() {
            // Placeholder — we don't track per-solve inspection. Show whether inspection is on.
            return inspectionEnabled ? '15s mode' : 'off';
        }

        function renderWidgetSlot(w) {
            const lbl = (s) => `<div class="widget-label">${s}</div>`;
            const val = (s) => `<div class="widget-value">${s}</div>`;
            const sub = (s) => `<div class="widget-sub">${s}</div>`;
            switch (w.type) {
                case 'ao5': {
                    const cur = widgetAo5Now(), pr = widgetAo5PR();
                    return lbl('AO5') + val(cur == null ? '—' : (cur === Infinity ? 'DNF' : fmt(cur)))
                         + sub('PR: ' + (pr == null ? '—' : (pr === Infinity ? 'DNF' : fmt(pr))));
                }
                case 'ao12': {
                    const cur = widgetAo12Now(), pr = widgetAo12PR();
                    return lbl('AO12') + val(cur == null ? '—' : (cur === Infinity ? 'DNF' : fmt(cur)))
                         + sub('PR: ' + (pr == null ? '—' : (pr === Infinity ? 'DNF' : fmt(pr))));
                }
                case 'streak': {
                    const th = w.threshold || 15;
                    const n = consecutiveSubX(th);
                    return lbl(`SUB-${th}s STREAK`) + val(String(n)) + sub(n === 1 ? 'solve' : 'solves');
                }
                case 'comparison': {
                    const cur = widgetAo5Now();
                    if (cur == null || cur === Infinity) return lbl('COMPARISON') + val('—') + sub('need 5 solves');
                    const wcaPR = (profile.wca_verified && profile.wca_records && profile.wca_records[puzzleSelect.value]) || null;
                    if (wcaPR && wcaPR.average) {
                        const delta = (cur - wcaPR.average) / wcaPR.average * 100;
                        const sign = delta < 0 ? '' : '+';
                        return lbl('COMPARISON') + val(sign + delta.toFixed(1) + '%') + sub('vs WCA PR');
                    }
                    const ao100 = aoNAll(curSolves(), 100);
                    if (ao100 != null && ao100 !== Infinity) {
                        const delta = (cur - ao100) / ao100 * 100;
                        const sign = delta < 0 ? '' : '+';
                        return lbl('COMPARISON') + val(sign + delta.toFixed(1) + '%') + sub('vs ao100');
                    }
                    return lbl('COMPARISON') + val('—') + sub('need ao100');
                }
                case 'scramble': {
                    // mini 2D cube (renders on demand below)
                    return '<div class="widget-scramble-mini" data-mini-scramble="1"></div>';
                }
                case 'goal': {
                    const today = todaysSolveCount();
                    const target = LS.get('dailyGoal', 50);
                    return lbl('DAILY GOAL') + val(`${today} / ${target}`) + sub('today');
                }
                case 'empty':
                default:
                    return '<div class="widget-empty-state"><span class="widget-plus">+</span><span class="widget-empty-label">Add widget</span></div>';
            }
        }

        let widgetDragIndex = -1;

        const COG_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm9 3a1 1 0 0 0-.8-.98l-1.8-.36-.5-1.21.94-1.58a1 1 0 0 0-.16-1.2l-1.42-1.42a1 1 0 0 0-1.2-.16l-1.58.95-1.21-.5-.36-1.8A1 1 0 0 0 13 2h-2a1 1 0 0 0-.98.8l-.36 1.8-1.21.5L6.87 4.16a1 1 0 0 0-1.2.16L4.25 5.74a1 1 0 0 0-.16 1.2L5.04 8.52l-.5 1.21-1.8.36a1 1 0 0 0-.74.97v2a1 1 0 0 0 .8.98l1.8.36.5 1.21-.94 1.58a1 1 0 0 0 .16 1.2l1.42 1.42a1 1 0 0 0 1.2.16l1.58-.94 1.21.5.36 1.8A1 1 0 0 0 11 22h2a1 1 0 0 0 .98-.8l.36-1.8 1.21-.5 1.58.94a1 1 0 0 0 1.2-.16l1.42-1.42a1 1 0 0 0 .16-1.2l-.94-1.58.5-1.21 1.8-.36A1 1 0 0 0 21 13z"/></svg>';
        const GRIP_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><circle cx="9" cy="6" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="18" r="1.4"/></svg>';

        function slotControls() {
            return '<div class="widget-controls">'
                + `<button type="button" class="widget-grip" data-act="grip" title="Drag to reorder">${GRIP_SVG}</button>`
                + `<button type="button" class="widget-cog" data-act="cog" title="Widget settings">${COG_SVG}</button>`
                + '</div>';
        }

        function renderWidgets() {
            const row = document.getElementById('widgets-row');
            if (!row) return;
            if (!puzzleStore) {
                row.innerHTML = `<div class="widget-slot is-empty" data-slot="0"><div class="widget-empty-state"><span class="widget-plus">+</span><span class="widget-empty-label">Add stat card</span></div></div>`;
                return;
            }
            // Only filled widgets render (max 4), plus exactly one trailing "+" slot when under cap.
            const MAX = 4;
            const filled = widgets.filter(w => w.type !== 'empty').slice(0, MAX);
            const parts = filled.map((w, i) =>
                `<div class="widget-slot" data-slot="${i}" draggable="true">${slotControls()}${renderWidgetSlot(w)}</div>`
            );
            if (filled.length < MAX) {
                parts.push(`<div class="widget-slot is-empty" data-slot="${filled.length}"><div class="widget-empty-state"><span class="widget-plus">+</span><span class="widget-empty-label">Add</span></div></div>`);
            }
            row.innerHTML = parts.join('');
            widgets = filled.slice();
            saveWidgets();
            row.querySelectorAll('[data-mini-scramble]').forEach(el => {
                const puzzleId = ({'333':'3x3x3','222':'2x2x2','444':'4x4x4','555':'5x5x5','666':'6x6x6','777':'7x7x7','pyram':'pyraminx','skewb':'skewb','minx':'megaminx'}[puzzleSelect.value] || '3x3x3');
                el.innerHTML = `<twisty-player puzzle="${puzzleId}" visualization="2D" alg="" experimental-setup-alg="${applyPuzzleViewSetup(puzzleId, currentScramble || '').replace(/"/g, '&quot;')}" background="none" control-panel="none" viewer-link="none" style="width:100%;height:100%;"></twisty-player>`;
            });
        }
        renderWidgets();

        // ============================================================
        //   Algorithm Spotlight (? key on Timer page)
        //   Tokenises the query, matches each token against
        //   category + case name. Any token order works.
        // ============================================================
        function openAlgSpotlight() {
            const modal = document.getElementById('alg-spotlight');
            if (!modal) return;
            modal.style.display = 'flex';
            const input = document.getElementById('alg-spotlight-input');
            input.value = '';
            renderSpotlightResults('');
            setTimeout(() => input.focus(), 30);
        }
        function closeAlgSpotlight() {
            const modal = document.getElementById('alg-spotlight');
            if (modal) modal.style.display = 'none';
        }
        function renderSpotlightResults(q) {
            const out = document.getElementById('alg-spotlight-results');
            if (!out) return;
            const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
            // Limit to first 50 to keep DOM small
            let matches;
            if (!tokens.length) {
                // Show category buckets as a default state
                const cats = [...new Set(db.map(d => d.category))];
                out.innerHTML = cats.map(c => {
                    const sample = db.filter(d => d.category === c).length;
                    return `<button type="button" class="spotlight-cat-tile" data-cat="${esc(c)}">
                        <span class="spotlight-cat-name">${esc(c)}</span>
                        <span class="spotlight-cat-count">${sample} cases</span>
                    </button>`;
                }).join('');
                return;
            }
            matches = db.filter(item => {
                const hay = (item.category + ' ' + item.name).toLowerCase();
                return tokens.every(t => hay.includes(t));
            }).slice(0, 50);

            if (!matches.length) {
                out.innerHTML = `<div class="spotlight-empty">No algorithms match “${esc(q)}”.</div>`;
                return;
            }
            out.innerHTML = matches.map(m => `
                <button type="button" class="spotlight-row" data-cat="${esc(m.category)}" data-name="${esc(m.name)}">
                    <span class="spotlight-row-cat">${esc(m.category)}</span>
                    <span class="spotlight-row-name">${esc(m.name)}</span>
                    <span class="spotlight-row-alg">${esc(m.main_alg)}</span>
                </button>
            `).join('');
        }
        function gotoCubeForCategory(cat) {
            // Map category → cube key for the algorithm view
            const cube =
                cat.startsWith('2x2 ')      ? '2x2' :
                cat.startsWith('4x4 ')      ? '4x4' :
                cat.startsWith('5x5 ')      ? '5x5' :
                cat.startsWith('Pyraminx ') ? 'Pyraminx' :
                cat.startsWith('Megaminx ') ? 'Megaminx' :
                '3x3';
            const learnTab = document.querySelector('.nav-item[data-mode="learn"]');
            if (learnTab) learnTab.click();
            showCubeAlgs(cube);
            categoryFilter.value = cat;
            renderCards();
        }
        // Wire up the spotlight modal once at module init
        const _algSpot = document.getElementById('alg-spotlight');
        if (_algSpot) {
            const inputEl = document.getElementById('alg-spotlight-input');
            const resultsEl = document.getElementById('alg-spotlight-results');
            inputEl.addEventListener('input', (e) => renderSpotlightResults(e.target.value));
            inputEl.addEventListener('keydown', (e) => {
                if (e.code === 'Escape') closeAlgSpotlight();
            });
            document.getElementById('alg-spotlight-close').addEventListener('click', closeAlgSpotlight);
            _algSpot.addEventListener('click', (e) => {
                if (e.target.id === 'alg-spotlight') closeAlgSpotlight();
            });
            resultsEl.addEventListener('click', (e) => {
                const row = e.target.closest('.spotlight-row, .spotlight-cat-tile');
                if (!row) return;
                const cat = row.dataset.cat;
                if (!cat) return;
                closeAlgSpotlight();
                gotoCubeForCategory(cat);
                if (row.classList.contains('spotlight-row')) {
                    // Optional: scroll to the case once cards have rendered
                    const name = row.dataset.name;
                    setTimeout(() => {
                        const card = document.querySelector(`#alg-grid .card[data-case="${name}"]`);
                        if (card) card.scrollIntoView({ behavior:'smooth', block:'center' });
                    }, 250);
                }
            });
        }

        function openWidgetExpanded(slotIdx) {
            const w = widgets[slotIdx];
            if (!w || w.type === 'empty') return;
            const titleEl = document.getElementById('widget-expand-title');
            const bodyEl  = document.getElementById('widget-expand-body');
            const titles = { ao5:'Average of 5', ao12:'Average of 12', streak:`Sub-${w.threshold||15}s Streak`, comparison:'Time Comparison', scramble:'Scramble Preview', goal:'Daily Goal' };
            titleEl.textContent = titles[w.type] || 'Widget';
            if (w.type === 'scramble') {
                const p = ({'333':'3x3x3','222':'2x2x2','444':'4x4x4','555':'5x5x5','666':'6x6x6','777':'7x7x7','pyram':'pyraminx','skewb':'skewb','minx':'megaminx'}[puzzleSelect.value] || '3x3x3');
                bodyEl.innerHTML = `<div class="widget-expand-scramble">${(currentScramble || '—').replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</div>
                    <div class="widget-expand-cube"><twisty-player puzzle="${p}" visualization="2D" experimental-setup-alg="${applyPuzzleViewSetup(p, currentScramble || '').replace(/"/g, '&quot;')}" background="none" control-panel="none" viewer-link="none" style="width:100%;height:280px;"></twisty-player></div>`;
            } else {
                bodyEl.innerHTML = `<div class="widget-expand-big">${renderWidgetSlot(w)}</div>`;
            }
            document.getElementById('widget-expand-modal').style.display = 'flex';
        }
        document.getElementById('widget-expand-close').addEventListener('click', () => {
            document.getElementById('widget-expand-modal').style.display = 'none';
        });
        document.getElementById('widget-expand-modal').addEventListener('click', (e) => {
            if (e.target.id === 'widget-expand-modal') document.getElementById('widget-expand-modal').style.display = 'none';
        });

        // Click on a slot:
        //   cog button → picker (settings / change widget)
        //   empty "+" slot → picker (add)
        //   grip button → consumed by drag start, no click action
        //   body → expanded view
        document.getElementById('widgets-row').addEventListener('click', (e) => {
            const slot = e.target.closest('.widget-slot');
            if (!slot) return;
            const idx = parseInt(slot.dataset.slot, 10);
            const cogBtn = e.target.closest('.widget-cog');
            const gripBtn = e.target.closest('.widget-grip');
            const isEmpty = slot.classList.contains('is-empty');
            if (gripBtn) return;
            if (cogBtn || isEmpty) {
                widgetSlotPicking = idx;
                document.getElementById('streak-thresholds').style.display = 'none';
                document.getElementById('widget-picker-modal').style.display = 'flex';
                return;
            }
            openWidgetExpanded(idx);
        });

        // Drag-and-drop reorder: any filled card is draggable any time.
        const widgetsRowEl = document.getElementById('widgets-row');
        widgetsRowEl.addEventListener('dragstart', (e) => {
            const slot = e.target.closest('.widget-slot');
            if (!slot || slot.classList.contains('is-empty')) { e.preventDefault(); return; }
            widgetDragIndex = parseInt(slot.dataset.slot, 10);
            e.dataTransfer.effectAllowed = 'move';
            try { e.dataTransfer.setData('text/plain', String(widgetDragIndex)); } catch (_) {}
            slot.classList.add('dragging');
        });
        widgetsRowEl.addEventListener('dragend', (e) => {
            const slot = e.target.closest('.widget-slot');
            if (slot) slot.classList.remove('dragging');
            widgetDragIndex = -1;
        });
        widgetsRowEl.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        });
        widgetsRowEl.addEventListener('drop', (e) => {
            if (widgetDragIndex < 0) return;
            e.preventDefault();
            const slot = e.target.closest('.widget-slot');
            if (!slot) return;
            const filled = widgets.filter(w => w.type !== 'empty');
            let toIdx = parseInt(slot.dataset.slot, 10);
            if (toIdx > filled.length - 1) toIdx = filled.length - 1;
            if (toIdx === widgetDragIndex) return;
            const moved = filled.splice(widgetDragIndex, 1)[0];
            filled.splice(toIdx, 0, moved);
            widgets = filled;
            widgetDragIndex = -1;
            saveWidgets();
            renderWidgets();
        });
        // Rearrange button in picker (kept as a quick "tap-to-reorder hint" — just closes the picker)
        document.getElementById('widget-rearrange-btn')?.addEventListener('click', () => {
            document.getElementById('widget-picker-modal').style.display = 'none';
            alert('Tap the grip handle (⋮⋮) on any card and drag to reorder.');
        });
        document.getElementById('widget-picker-close').addEventListener('click', () => {
            document.getElementById('widget-picker-modal').style.display = 'none';
        });
        document.getElementById('widget-picker-modal').addEventListener('click', (e) => {
            if (e.target.id === 'widget-picker-modal') {
                document.getElementById('widget-picker-modal').style.display = 'none';
            }
        });
        document.querySelectorAll('.widget-option').forEach(btn => {
            btn.addEventListener('click', () => {
                const type = btn.dataset.widget;
                if (type === 'streak') {
                    // Reveal threshold options
                    document.getElementById('streak-thresholds').style.display = 'flex';
                    return;
                }
                if (widgetSlotPicking >= 0) {
                    widgets[widgetSlotPicking] = { type };
                    saveWidgets();
                    renderWidgets();
                }
                document.getElementById('widget-picker-modal').style.display = 'none';
            });
        });
        document.querySelectorAll('#streak-thresholds button').forEach(btn => {
            btn.addEventListener('click', async () => {
                let th = btn.dataset.streak;
                if (th === 'custom') {
                    const v = await window.ucPrompt('Sub-X threshold in seconds:', '15', { title: 'Custom streak' });
                    if (v == null) return;
                    const n = parseFloat(v);
                    if (isNaN(n) || n <= 0) return;
                    th = n;
                } else {
                    th = parseInt(th, 10);
                }
                if (widgetSlotPicking >= 0) {
                    widgets[widgetSlotPicking] = { type: 'streak', threshold: th };
                    saveWidgets();
                    renderWidgets();
                }
                document.getElementById('widget-picker-modal').style.display = 'none';
            });
        });

        // Re-render widgets after each solve (so values update live)
        const _origRefreshPuzzle = refreshPuzzle;
        refreshPuzzle = function () {
            _origRefreshPuzzle();
            renderWidgets();
        };
        // Also after scramble changes (for the Scramble Preview widget)
        const _origNextPuzzleScramble = nextPuzzleScramble;
        nextPuzzleScramble = async function () {
            await _origNextPuzzleScramble();
            renderWidgets();
        };

        // ============================================================
        //   Vertical session rail (one icon per session, + new, ☰ settings)
        // ============================================================
        document.getElementById('session-rail-list')?.addEventListener('click', (e) => {
            const cog = e.target.closest('.session-card-cog');
            const card = e.target.closest('.session-card');
            if (!card) return;
            const sid = card.dataset.sid;
            if (!sid) return;
            if (cog) {
                openSessionEditor('edit', sid);
                return;
            }
            if (puzzleStore.activeId === sid) return;   // already active
            activateSessionById(sid);
        });
        document.getElementById('session-rail-add')?.addEventListener('click', () => openSessionEditor('new'));

        // ============================================================
        //   New Sessions System (name / description / template / icon / color theme)
        // ============================================================
        const sessionCreateModal = document.getElementById('session-create-modal');
        let scEditMode = 'new';     // 'new' | 'edit'
        let scEditId   = null;
        let scIcon     = '🎲';
        let scTheme    = 'orange';

        // Inject the inline SVG/text into cube-event buttons (one-time)
        (function fillCubeIconButtons() {
            document.querySelectorAll('#sc-icons button[data-icon^="cube:"]').forEach(b => {
                b.innerHTML = iconHTML(b.dataset.icon);
            });
        })();

        // Icon-tab switcher (General / Cube Events)
        const scTabs = document.querySelectorAll('.sc-icon-tab');
        const scIconGrid = document.getElementById('sc-icons');
        function applyIconTab(tab) {
            scTabs.forEach(t => t.classList.toggle('on', t.dataset.tab === tab));
            scIconGrid.dataset.activeTab = tab;
            scIconGrid.querySelectorAll('button[data-icon]').forEach(b => {
                b.style.display = (b.dataset.tab === tab) ? '' : 'none';
            });
        }
        scTabs.forEach(t => t.addEventListener('click', () => applyIconTab(t.dataset.tab)));

        function openSessionEditor(mode, sessionId) {
            scEditMode = mode;
            scEditId   = sessionId || null;
            const sess = (mode === 'edit' && sessionId) ? puzzleStore.sessions.find(s => s.id === sessionId) : null;

            document.getElementById('session-create-title').textContent = mode === 'new' ? 'Create Session' : 'Edit Session';
            document.getElementById('sc-save').textContent = mode === 'new' ? 'Create' : 'Save';
            document.getElementById('sc-name').value     = sess ? (sess.name || '') : '';
            document.getElementById('sc-desc').value     = sess ? (sess.description || '') : '';
            scIcon  = (sess && sess.icon)  || '🎲';
            scTheme = (sess && sess.color) || 'orange';
            // Select correct tab based on the icon
            applyIconTab(scIcon.startsWith('cube:') ? 'cubes' : 'general');
            // Highlight the selected icon + theme
            document.querySelectorAll('#sc-icons button').forEach(b => b.classList.toggle('on', b.dataset.icon === scIcon));
            document.querySelectorAll('#sc-themes button').forEach(b => b.classList.toggle('on', b.dataset.theme === scTheme));

            // CSTimer import is only meaningful when CREATING a new session.
            // Hide the import block in edit mode + clear any staged state.
            const importBlock = document.getElementById('sc-import-section');
            if (importBlock) importBlock.style.display = (mode === 'new') ? '' : 'none';
            const impStatus = document.getElementById('sc-import-status');
            const impLabel  = document.getElementById('sc-import-label');
            const impInput  = document.getElementById('sc-import-file');
            pendingImportSessions = null;
            if (impStatus) { impStatus.textContent = ''; impStatus.classList.remove('ok'); }
            if (impLabel)  impLabel.textContent = 'Click to choose a CSTimer export (.txt)';
            if (impInput)  impInput.value = '';
            const sessTableWrap = document.getElementById('sc-sessions-table-wrap');
            if (sessTableWrap) { sessTableWrap.style.display = 'none'; sessTableWrap.innerHTML = ''; }
            const identSec  = document.getElementById('sc-identity-section');
            const visualSec = document.getElementById('sc-visual-section');
            if (identSec)  identSec.style.display  = '';
            if (visualSec) visualSec.style.display = '';

            sessionCreateModal.style.display = 'flex';
            setTimeout(() => document.getElementById('sc-name').focus(), 30);
        }
        function closeSessionEditor() { sessionCreateModal.style.display = 'none'; }

        document.getElementById('session-create-close').addEventListener('click', closeSessionEditor);
        document.getElementById('sc-cancel').addEventListener('click', closeSessionEditor);
        sessionCreateModal.addEventListener('click', (e) => { if (e.target === sessionCreateModal) closeSessionEditor(); });

        document.getElementById('sc-icons').addEventListener('click', (e) => {
            const b = e.target.closest('button[data-icon]');
            if (!b) return;
            scIcon = b.dataset.icon;
            document.querySelectorAll('#sc-icons button').forEach(x => x.classList.toggle('on', x === b));
        });
        document.getElementById('sc-themes').addEventListener('click', (e) => {
            const b = e.target.closest('button[data-theme]');
            if (!b) return;
            scTheme = b.dataset.theme;
            document.querySelectorAll('#sc-themes button').forEach(x => x.classList.toggle('on', x === b));
        });

        // ---- CSTimer JSON import (session-create modal only) ----
        // CSTimer export: { "session1": [[[penCode,timeMs],scramble,comment,unixSec],...], "properties":{sessionData:"{...}"} }
        // penCode: 0=OK, 2000=+2, -1=DNF; timeMs is milliseconds.
        const SC_SCRTYPE_PUZZLE = {
            '333':'333','333oh':'333','oll':'333','pll':'333','ll':'333','f2l':'333',
            '222so':'222','222eg0':'222','222eg1':'222',
            '444wca':'444','555wca':'555','666wca':'666','777wca':'777',
            'pyrso':'pyram','skbso':'skewb','minxso':'minx','sq1so':'sq1',
            'clkso':'clock','clock':'clock'
        };
        const SC_PUZZLE_ICON = {
            '333':'cube:333','222':'cube:222','444':'cube:444','555':'cube:555',
            '666':'cube:666','777':'cube:777','pyram':'cube:pyram','skewb':'cube:skewb',
            'minx':'cube:minx','sq1':'cube:sq1','clock':'cube:clock'
        };
        const SC_THEMES_LIST = ['orange','blue','green','teal','purple','pink'];

        function parseCstimerFile(text) {
            let data;
            try { data = JSON.parse(text.trim()); } catch (e) {
                throw new Error('Not a valid CSTimer export: ' + e.message);
            }
            let sessionNames = {}, sessionScrTypes = {};
            try {
                const sd = JSON.parse((data.properties || {}).sessionData || '{}');
                for (const [k, v] of Object.entries(sd)) {
                    sessionNames[k] = v.name || ('Session ' + k);
                    sessionScrTypes[k] = ((v.opt || {}).scrType) || '333';
                }
            } catch (_) {}
            const result = [];
            let themeIdx = 0;
            Object.keys(data).filter(k => /^session\d+$/.test(k) && Array.isArray(data[k])).forEach(key => {
                const num = key.replace('session', '');
                const solves = [];
                for (const entry of data[key]) {
                    if (!Array.isArray(entry) || entry.length < 2) continue;
                    const [penArr, scramble, comment, timestamp] = entry;
                    if (!Array.isArray(penArr) || penArr.length < 2) continue;
                    const [penCode, timeMs] = penArr;
                    let t, penalty;
                    if (penCode === -1) { t = 0; penalty = 'dnf'; }
                    else { t = timeMs / 1000; penalty = penCode === 2000 ? '+2' : 'ok'; }
                    const dateMs = (typeof timestamp === 'number' && timestamp > 0) ? timestamp * 1000 : Date.now();
                    solves.push({ t, penalty, scramble: (scramble || '').trim(), note: (comment || '').trim(), date: dateMs });
                }
                if (!solves.length) return;
                const scrType = sessionScrTypes[num] || '333';
                const puzzle  = SC_SCRTYPE_PUZZLE[scrType] || '333';
                result.push({
                    name:   sessionNames[num] || ('Session ' + num),
                    puzzle, icon: SC_PUZZLE_ICON[puzzle] || '🎲',
                    color:  SC_THEMES_LIST[themeIdx++ % SC_THEMES_LIST.length],
                    solves
                });
            });
            return result;
        }

        const SC_ICON_OPTIONS = [
            ['cube:333','3×3 Cube'],['cube:222','2×2 Cube'],['cube:444','4×4 Cube'],['cube:555','5×5 Cube'],
            ['cube:666','6×6 Cube'],['cube:777','7×7 Cube'],['cube:pyram','Pyraminx'],['cube:skewb','Skewb'],
            ['cube:minx','Megaminx'],['cube:sq1','Square-1'],['cube:clock','Clock'],
            ['cube:oh','One-Handed'],['cube:bld','Blindfolded'],['cube:fmc','FMC'],
            ['🎲','Dice'],['🔥','Fire'],['⭐','Star'],['⚡','Lightning'],
            ['🎯','Target'],['👑','Crown'],['🏆','Trophy'],['🧩','Puzzle'],['💎','Diamond'],['🌙','Moon'],['☀','Sun']
        ];
        const SC_ICON_GROUPS = [
            { label: 'NxN Cubes', values: ['cube:222', 'cube:333', 'cube:444', 'cube:555', 'cube:666', 'cube:777'] },
            { label: 'Side Events', values: ['cube:pyram', 'cube:skewb', 'cube:minx', 'cube:sq1', 'cube:clock'] },
            { label: 'Disciplines', values: ['cube:oh', 'cube:bld', 'cube:fmc'] },
            { label: 'Symbols', values: SC_ICON_OPTIONS.filter(([value]) => !value.startsWith('cube:')).map(([value]) => value) }
        ];
        function groupedSessionIconOptions(selected = '') {
            return SC_ICON_GROUPS.map(group => `<optgroup label="${group.label}">${group.values.map(value => {
                const option = SC_ICON_OPTIONS.find(([id]) => id === value);
                return option ? `<option value="${option[0]}"${option[0] === selected ? ' selected' : ''}>${option[1]}</option>` : '';
            }).join('')}</optgroup>`).join('');
        }
        function buildSessionsTable(sessions) {
            const wrap = document.getElementById('sc-sessions-table-wrap');
            if (!wrap) return;
            const puzzleIds = ['222', '333', '444', '555', '666', '777', 'pyram', 'skewb', 'minx', 'sq1', 'clock'];
            const THEME_HEX = { orange:'#FF9F0A',blue:'#5ab0ff',green:'#5fe08c',teal:'#22d3ee',purple:'#c084fc',pink:'#f472b6' };
            let rows = sessions.map((sess, i) => {
                const pOpts = groupedEventOptions(sess.puzzle, puzzleIds);
                const iOpts = groupedSessionIconOptions(sess.icon);
                const dots  = Object.entries(THEME_HEX).map(([nm, hex]) =>
                    `<button type="button" class="sc-sess-cdot${nm===sess.color?' on':''}" data-theme="${nm}" style="background:${hex}" title="${nm}"></button>`
                ).join('');
                return `<tr class="sc-sess-row" data-idx="${i}">
                    <td><input type="checkbox" class="sc-sess-check" checked></td>
                    <td><input type="text" class="sc-sess-name" value="${escHTML(sess.name)}" maxlength="40"></td>
                    <td><select class="sc-sess-puzzle">${pOpts}</select></td>
                    <td><select class="sc-sess-icon">${iOpts}</select></td>
                    <td><div class="sc-sess-colors">${dots}</div></td>
                    <td class="sc-sess-solvecount">${sess.solves.length}</td>
                </tr>`;
            }).join('');
            wrap.innerHTML = `
                <div class="sc-sessions-header">
                    <span>${sessions.length} session${sessions.length===1?'':'s'} found — select which to import:</span>
                    <label class="sc-check-all-lbl"><input type="checkbox" id="sc-check-all" checked> All</label>
                </div>
                <div class="sc-sessions-scroll">
                    <table class="sc-sessions-table">
                        <thead><tr><th></th><th>Name</th><th>Cube</th><th>Icon</th><th>Color</th><th>Solves</th></tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>`;
            wrap.style.display = '';
            wrap.querySelectorAll('.sc-sess-colors').forEach(div => {
                div.querySelectorAll('.sc-sess-cdot').forEach(btn => btn.addEventListener('click', () => {
                    div.querySelectorAll('.sc-sess-cdot').forEach(b => b.classList.remove('on'));
                    btn.classList.add('on');
                }));
            });
            const checkAll = document.getElementById('sc-check-all');
            if (checkAll) checkAll.addEventListener('change', () => {
                wrap.querySelectorAll('.sc-sess-check').forEach(cb => cb.checked = checkAll.checked);
                updateScSaveLabel();
            });
            wrap.querySelectorAll('.sc-sess-check').forEach(cb => cb.addEventListener('change', updateScSaveLabel));
        }
        function updateScSaveLabel() {
            const wrap = document.getElementById('sc-sessions-table-wrap');
            const btn  = document.getElementById('sc-save');
            if (!wrap || !btn) return;
            const n = wrap.querySelectorAll('.sc-sess-check:checked').length;
            btn.textContent = n ? `Import ${n} Session${n===1?'':'s'}` : 'Import Sessions';
        }

        let pendingImportSessions = null;
        document.getElementById('sc-import-file')?.addEventListener('change', (e) => {
            const file   = e.target.files && e.target.files[0];
            const status = document.getElementById('sc-import-status');
            const label  = document.getElementById('sc-import-label');
            const identSec  = document.getElementById('sc-identity-section');
            const visualSec = document.getElementById('sc-visual-section');
            const wrap   = document.getElementById('sc-sessions-table-wrap');
            if (!file) {
                pendingImportSessions = null;
                if (wrap) { wrap.style.display = 'none'; wrap.innerHTML = ''; }
                if (identSec)  identSec.style.display  = '';
                if (visualSec) visualSec.style.display = '';
                document.getElementById('sc-save').textContent = 'Create';
                return;
            }
            const reader = new FileReader();
            reader.onload = () => {
                try {
                    const sessions = parseCstimerFile(reader.result);
                    pendingImportSessions = sessions;
                    if (label)  label.textContent = file.name;
                    if (status) { status.textContent = ''; status.classList.remove('ok'); }
                    if (identSec)  identSec.style.display  = 'none';
                    if (visualSec) visualSec.style.display = 'none';
                    buildSessionsTable(sessions);
                    updateScSaveLabel();
                } catch (err) {
                    console.error(err);
                    if (status) status.textContent = 'Could not parse file: ' + (err.message || err);
                    pendingImportSessions = null;
                }
            };
            reader.readAsText(file);
        });

        document.getElementById('sc-save').addEventListener('click', () => {
            if (scEditMode === 'new' && pendingImportSessions) {
                const wrap = document.getElementById('sc-sessions-table-wrap');
                let firstId = null, t = Date.now();
                (wrap ? wrap.querySelectorAll('.sc-sess-row') : []).forEach(row => {
                    if (!row.querySelector('.sc-sess-check')?.checked) return;
                    const idx    = parseInt(row.dataset.idx, 10);
                    const sess   = pendingImportSessions[idx];
                    if (!sess) return;
                    const name   = row.querySelector('.sc-sess-name')?.value.trim() || sess.name;
                    const puzzle = row.querySelector('.sc-sess-puzzle')?.value || sess.puzzle;
                    const icon   = row.querySelector('.sc-sess-icon')?.value || sess.icon;
                    const cdot   = row.querySelector('.sc-sess-cdot.on');
                    const color  = cdot ? cdot.dataset.theme : sess.color;
                    const id = 's' + (t++);
                    puzzleStore.sessions.push({
                        id,
                        name,
                        description: '',
                        puzzle,
                        icon,
                        color,
                        solves: sess.solves.slice(),
                        trainerPrefs: normalizeTimerTrainerPrefs(null, puzzle)
                    });
                    if (!firstId) firstId = id;
                });
                if (firstId) puzzleStore.activeId = firstId;
            } else {
                const name = document.getElementById('sc-name').value.trim() || 'Session';
                const description = document.getElementById('sc-desc').value.trim().slice(0, 160);
                if (scEditMode === 'new') {
                    const id = 's' + Date.now();
                    const puzzle = puzzleSelect.value || '333';
                    puzzleStore.sessions.push({
                        id,
                        name,
                        description,
                        puzzle,
                        icon: scIcon,
                        color: scTheme,
                        solves: [],
                        trainerPrefs: normalizeTimerTrainerPrefs(null, puzzle)
                    });
                    puzzleStore.activeId = id;
                } else if (scEditMode === 'edit' && scEditId) {
                    const s = puzzleStore.sessions.find(x => x.id === scEditId);
                    if (s) { s.name = name; s.description = description; s.icon = scIcon; s.color = scTheme; }
                }
            }
            pendingImportSessions = null;
            const imp = document.getElementById('sc-import-status');
            const lbl = document.getElementById('sc-import-label');
            const inp = document.getElementById('sc-import-file');
            const wrap = document.getElementById('sc-sessions-table-wrap');
            if (imp) { imp.textContent = ''; imp.classList.remove('ok'); }
            if (lbl) lbl.textContent = 'Click to choose a CSTimer export (.txt)';
            if (inp) inp.value = '';
            if (wrap) { wrap.style.display = 'none'; wrap.innerHTML = ''; }
            document.getElementById('sc-identity-section').style.display = '';
            document.getElementById('sc-visual-section').style.display = '';
            document.getElementById('sc-save').textContent = 'Create';
            const activeSession = curSession();
            if (activeSession?.puzzle) puzzleSelect.value = activeSession.puzzle;
            loadTimerTrainerPrefsForSession();
            savePuzzle();
            renderSessionSelect();
            refreshPuzzle();
            puzzleTimer.reset();
            nextPuzzleScramble();
            closeSessionEditor();
        });

        // Initialization — only render if a cube was previously selected
        if (LS.get('selectedCube', '')) renderCards();
        activateMode('timer');
