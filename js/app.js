        import { Alg } from "https://cdn.cubing.net/v0/js/cubing/alg";
        import { randomScrambleForEvent } from "https://cdn.cubing.net/v0/js/cubing/scramble";
        import { db } from './data.js';
        import { fbSync } from './firebase-sync.js';
        import { startWcaLogin, handleWcaCallback, wcaEnabled, fetchPublicWcaProfile } from './wca-auth.js';

        // ---- App accent colour theme ----
        const APP_COLORS = [
            { id: 'orange', label: 'Orange', main: '#FF9F0A', dark: '#FF6A00' },
            { id: 'red',    label: 'Red',    main: '#ff4e4e', dark: '#d62828' },
            { id: 'blue',   label: 'Blue',   main: '#5ab0ff', dark: '#2563EB' },
            { id: 'green',  label: 'Green',  main: '#5fe08c', dark: '#16a34a' },
            { id: 'teal',   label: 'Teal',   main: '#22d3ee', dark: '#0891b2' },
            { id: 'purple', label: 'Purple', main: '#c084fc', dark: '#9333ea' },
            { id: 'pink',   label: 'Pink',   main: '#f472b6', dark: '#ec4899' },
        ];
        function applyAppColor(id) {
            const c = APP_COLORS.find(x => x.id === id) || APP_COLORS[0];
            document.documentElement.style.setProperty('--orange',      c.main);
            document.documentElement.style.setProperty('--orange-dark', c.dark);
        }
        applyAppColor((() => { try { const v = localStorage.getItem('uc_appColor'); return v ? JSON.parse(v) : 'orange'; } catch(e) { return 'orange'; } })());

        function buildColorSwatches() {
            const grid = document.getElementById('app-color-grid');
            if (!grid) return;
            const active = LS.get('appColor', 'orange');
            grid.innerHTML = APP_COLORS.map(c => `
                <button type="button" class="app-color-swatch${c.id === active ? ' on' : ''}" data-color-id="${c.id}">
                    <div class="app-color-dot" style="background:linear-gradient(135deg,${c.main},${c.dark})"></div>
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

        // ---- Persistent user data (localStorage + optional cloud sync) ----
        const LS = {
            get(k, d) { try { const v = localStorage.getItem('uc_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
            set(k, v) {
                try { localStorage.setItem('uc_' + k, JSON.stringify(v)); } catch (e) {}
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
            wca_verified: false,
            wca_name: '',     // verified name from WCA
            wca_records: {},  // normalized { eventId: { single, average } } in seconds
            avatar: '',     // base64 data URL, or '' for default (default-user-image.png)
            frame: 'none',  // default: no border (no auto-select); user picks explicitly
            events: [],     // from onboarding: list of event ids the user cubes
            methods: [],    // from onboarding: list of method ids
            onboarded: false,
            socials: { youtube: '', instagram: '' }
        };

        // Avatar frame tiers — Discord-Nitro-style animated borders unlocked by activity
        // Each tier has: id, label, condition (returns bool given stats)
        const FRAME_TIERS = [
            { id: 'legendary', label: 'Legendary', minSolves: 5000, minLearned: 150 },
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
        // Used to auto-derive `setup` from `main_alg` when the entry has none
        // (e.g. 2x2 CLL / EG, 4x4 parity, 5x5 L2C/L2E).
        function inverseAlg(alg) {
            if (!alg || typeof alg !== 'string') return '';
            return alg.trim().split(/\s+/).filter(Boolean).reverse().map(tok => {
                // R2 (or R2') stays the same — half-turn is its own inverse
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
                card.className = `card state-${state}` + (isLearned ? ' learned' : '');
                card.dataset.case = item.name;

                // Apply a saved "main algorithm" choice, if the user picked one
                let algList = [item.main_alg, ...item.alts];
                const savedMain = mainChoices[item.name];
                let hasSavedMain = false;
                if (savedMain) {
                    const sIdx = algList.findIndex(a => cleanAlg(a) === savedMain);
                    if (sIdx > 0) {
                        algList = [algList[sIdx], ...algList.slice(0, sIdx), ...algList.slice(sIdx + 1)];
                        hasSavedMain = true;
                    }
                }

                const isF2L = item.category === 'F2L' || item.category === 'AF2L';
                const baseOrient = isF2L ? '' : 'z2';
                // If the entry has no explicit setup, derive it as the inverse
                // of the (cleaned) main algorithm. This auto-fills setups for
                // all the non-3x3 categories.
                const effectiveSetup = (item.setup && item.setup.trim())
                    ? item.setup
                    : inverseAlg(cleanAlg(item.main_alg));
                const caseSetup = baseOrient ? `${baseOrient} ${effectiveSetup}` : effectiveSetup;
                const esaFor = (yrot) => yrot ? `${caseSetup} ${yrot}` : caseSetup;

                const mainEntry = parseAlgEntry(algList[0]);
                const viewRot = mainEntry.yrot;
                const defaultEsa = esaFor(viewRot);

                // Setup row animates solved -> case, ending in the default orientation
                const setupAnim = viewRot ? `${effectiveSetup} ${viewRot}` : effectiveSetup;

                // Choose the puzzle for this case
                const cat = item.category;
                const puzzleFor =
                    cat.startsWith('2x2')      ? '2x2x2' :
                    cat.startsWith('4x4')      ? '4x4x4' :
                    cat.startsWith('5x5')      ? '5x5x5' :
                    cat.startsWith('Pyraminx') ? 'pyraminx' :
                    '3x3x3';
                // Only show the 2D LL map for 3x3 LL subsets
                const is3x3LL = cat === 'OLL' || cat === 'COLL' || cat === 'PLL';
                const showMap = is3x3LL;
                const stickering2dVal = cat === 'OLL' ? 'OLL' :
                                        cat === 'COLL' ? 'COLL' : 'full';

                let altsHTML = '';
                algList.slice(1).forEach(a => {
                    const alt = parseAlgEntry(a);
                    altsHTML += `<div class="alg alt-alg" data-player="player-${i}" data-anim="${alt.anim}" data-esa="${esaFor(alt.yrot)}">${alt.display}</div>`;
                });

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
                            alg=""
                            experimental-setup-alg="${defaultEsa}"
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
                        <div class="alg setup-alg" data-player="player-${i}" data-anim="${setupAnim}" data-esa="${baseOrient}">${effectiveSetup}</div>
                    </div>
                    <div class="alg-section">
                        <div class="alg-label">Main Algorithm</div>
                        <div class="alg main-alg ${hasSavedMain ? 'is-saved-main' : ''}" data-player="player-${i}" data-anim="${mainEntry.anim}" data-esa="${defaultEsa}">${mainEntry.display}</div>
                    </div>
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
                const matchTerm = term === '' ||
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
                    <button type="button" class="train-quick-btn cat-learn-all" id="cat-learn-all" ${allLearned ? 'disabled' : ''}>
                        ${allLearned ? '✓ All learned' : 'Learn all'}
                    </button>
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
                learnAllBtn.addEventListener('click', () => {
                    if (!confirm(`Mark all ${total} ${cat} cases as Learned?`)) return;
                    for (const it of allCases) {
                        learningSet.delete(it.name);
                        learnedSet.add(it.name);
                    }
                    saveLearned();
                    saveLearning();
                    // Refresh cards + bar
                    renderCards();
                });
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
                        player.setAttribute('experimental-setup-alg', player.getAttribute('data-default-esa') || '');
                        player.alg = '';
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
                        card.querySelectorAll('twisty-player').forEach(player => {
                            player.setAttribute('data-default-esa', cEsa);
                            player.setAttribute('experimental-setup-alg', cEsa);
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

        categoryFilter.addEventListener('change', renderCards);
        searchInput.addEventListener('input', renderCards);

        // ---- Cube-picker landing page ----
        // Map each cube tile to its category whitelist (which <option>s stay visible)
        const CUBE_CATS = {
            '3x3':      ['PLL', 'OLL', 'COLL', 'F2L', 'AF2L', 'Winter Variation', 'Summer Variation'],
            '2x2':      ['2x2 CLL', '2x2 EG-1', '2x2 EG-2', '2x2 Ortega OLL', '2x2 Ortega PBL'],
            '4x4':      ['4x4 OLL Parity', '4x4 PLL Parity'],
            '5x5':      ['5x5 L2C', '5x5 L2E'],
            'Pyraminx': ['Pyraminx L4E', 'Pyraminx Last Layer']
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
            'Pyraminx L4E':'Pyraminx L4E', 'Pyraminx Last Layer':'Pyraminx Last Layer'
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
        const planView    = document.getElementById('plan-view');
        const questsView  = document.getElementById('quests-view');
        document.querySelectorAll('.nav-item').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.nav-item').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                const mode = tab.dataset.mode;
                const views = { learn: learnView, train: trainView, timer: timerView, battles: battlesView, plan: planView, stats: statsView, quests: questsView };
                Object.entries(views).forEach(([k, v]) => {
                    const showing = (k === mode);
                    if (showing) {
                        v.style.display = '';
                        // Retrigger fade-in animation
                        v.style.animation = 'none';
                        // Force reflow then re-add
                        void v.offsetWidth;
                        v.style.animation = '';
                    } else {
                        v.style.display = 'none';
                    }
                });
                if (mode === 'train' && !trainCaselist.children.length) buildCaselist();
                if (mode === 'timer' && !puzzleStarted) startPuzzle();
                if (mode === 'stats') renderStats();
                if (mode === 'quests') renderQuests();
                if (mode === 'battles') showBattlesLobby();
                if (mode === 'plan') renderPlanner();
                // Mobile FAB: only visible on timer page; close side sheet if leaving timer
                const fab = document.getElementById('mobile-side-fab');
                if (fab) fab.style.display = (mode === 'timer') ? '' : 'none';
                if (mode !== 'timer') {
                    document.querySelector('.timer-side')?.classList.remove('mobile-open');
                    document.getElementById('mobile-side-overlay')?.style && (document.getElementById('mobile-side-overlay').style.display = 'none');
                }
            });
        });

        // Sidebar collapse toggle (persisted)
        const appSidebar = document.getElementById('app-sidebar');
        if (LS.get('sidebarCollapsed', false)) appSidebar?.classList.add('collapsed');
        document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
            const collapsed = appSidebar.classList.toggle('collapsed');
            LS.set('sidebarCollapsed', collapsed);
        });

        // ---- Stats page (personal records, distribution, algorithm progress) ----
        const PUZZLES_FOR_STATS = ['222', '333', '444', '555', '666', '777', 'pyram', 'skewb', 'minx', 'sq1', 'clock'];
        const PUZZLE_LABEL = {
            '222': '2x2', '333': '3x3', '444': '4x4', '555': '5x5', '666': '6x6', '777': '7x7',
            'pyram': 'Pyraminx', 'skewb': 'Skewb', 'minx': 'Megaminx', 'sq1': 'Square-1', 'clock': 'Clock'
        };
        const ALG_CATS = [
            { id: 'PLL', label: 'PLL' }, { id: 'OLL', label: 'OLL' }, { id: 'COLL', label: 'COLL' },
            { id: 'F2L', label: 'F2L' }, { id: 'AF2L', label: 'Advanced F2L' },
            { id: 'Winter Variation', label: 'Winter Variation' }, { id: 'Summer Variation', label: 'Summer Variation' }
        ];
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

        let statsFilter = statsFilterDefault();   // 'all' | one of PUZZLES_FOR_STATS

        // ============================================================
        //   XP + Level system
        //   XP = 1 per solve + 5 per algorithm learned + 25 per battle win
        //   Level n requires totalXp >= 50 * n * (n+1) / 2 (triangular)
        //     L1: 50, L2: 150, L3: 300, L4: 500, L5: 750, L10: 2750…
        // ============================================================
        function computeXp() {
            const solveXp = PUZZLES_FOR_STATS.reduce((acc, pid) =>
                acc + getPuzzleAllSolves(pid).length, 0);
            const algXp   = (typeof learnedSet !== 'undefined' ? learnedSet.size : 0) * 5;
            const battlesWon = (profile && profile.battlesWon) || 0;
            return solveXp + algXp + battlesWon * 25;
        }
        function xpForLevel(n) { return 50 * n * (n + 1) / 2; }
        function levelFromXp(xp) {
            let n = 1;
            while (xpForLevel(n) <= xp) n++;
            return n - 1 >= 1 ? n - 1 : 1;
        }
        function levelProgress() {
            const xp = computeXp();
            const lvl = levelFromXp(xp);
            const base = lvl === 1 ? 0 : xpForLevel(lvl);
            const next = xpForLevel(lvl + 1);
            const pct = ((xp - base) / (next - base)) * 100;
            return { xp, level: lvl, base, next, pct, into: xp - base, span: next - base };
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
            const totalLearned = totalLearnedAll();
            const today = todaysSolvesAcrossPuzzles();
            const wcaOk = !!(profile && profile.wca_verified);
            const hasMain = !!(profile && profile.main_event);
            const battlesWon = (profile && profile.battlesWon) || 0;
            return {
                daily: [
                    { id:'d-solve-20',   title:'Solve 20 times today',   have: today, need: 20, xp: 30 },
                    { id:'d-solve-50',   title:'Solve 50 times today',   have: today, need: 50, xp: 75 },
                    { id:'d-learn-1',    title:'Learn a new algorithm',  have: totalLearned, need: totalLearned + 1, xp: 20, action:'open-train' }
                ],
                battles: [
                    { id:'q-solves-150', title:'Reach 150 total solves',         have: totalSolves, need: 150, xp: 100,
                      desc:'Unlocks the Battles arena.' },
                    { id:'q-algs-25',    title:'Learn 25 algorithms',            have: totalLearned, need: 25, xp: 50 },
                    { id:'q-wca-link',   title:'Link your WCA profile',          have: wcaOk ? 1 : 0, need: 1, xp: 40 },
                    { id:'q-main-event', title:'Set your main event in Profile', have: hasMain ? 1 : 0, need: 1, xp: 20 }
                ],
                borders: [
                    { id:'b-bronze',    title:'Unlock the Bronze border',     have: totalSolves, need: 25,   xp: 25,   tier:'bronze' },
                    { id:'b-silver',    title:'Unlock the Silver border',     have: totalSolves, need: 100,  xp: 50,   tier:'silver' },
                    { id:'b-gold',      title:'Unlock the Gold border',       have: totalSolves, need: 500,  xp: 150,  tier:'gold' },
                    { id:'b-rainbow',   title:'Unlock the Rainbow border',    have: totalSolves, need: 1000, xp: 300,  tier:'rainbow' },
                    { id:'b-legendary', title:'Unlock the Legendary border',  have: totalSolves, need: 5000, xp: 750,  tier:'legendary',
                      desc:'Requires 5000+ solves & 150+ algs learned.', extraDone: totalSolves >= 5000 && totalLearned >= 150 },
                    { id:'b-win-battle',title:'Win your first battle',        have: battlesWon, need: 1, xp: 50, tier:'battle-champ' }
                ]
            };
        }
        function questCard(q) {
            const done = (q.extraDone !== undefined) ? q.extraDone : (q.have >= q.need);
            const pct = Math.min(100, Math.max(0, (q.have / q.need) * 100));
            const haveDisplay = (q.need === 1) ? (done ? '✓' : '–') : `${Math.min(q.have, q.need)} / ${q.need}`;
            return `<div class="quest-card ${done ? 'is-done' : ''}">
                <div class="quest-card-head">
                    <span class="quest-title">${q.title}</span>
                    <span class="quest-reward">+${q.xp} XP</span>
                </div>
                ${q.desc ? `<div class="quest-desc">${q.desc}</div>` : ''}
                <div class="quest-progress">
                    <div class="quest-bar"><div class="quest-bar-fill" style="width:${pct.toFixed(1)}%"></div></div>
                    <div class="quest-count">${haveDisplay}</div>
                </div>
            </div>`;
        }
        function renderQuests() {
            const q = questDef();
            const lp = levelProgress();
            const section = (title, sub, items) => `
                <div class="train-panel quest-section">
                    <div class="panel-title">
                        <span>${title}</span>
                        ${sub ? `<span class="heatmap-sub">${sub}</span>` : ''}
                    </div>
                    <div class="quest-grid">${items.map(questCard).join('')}</div>
                </div>`;
            questsView.innerHTML = `
                <div class="quests-grid-outer">
                    <div class="train-panel quest-hero">
                        <div class="quest-hero-head">
                            <div>
                                <div class="quest-hero-eyebrow">Your Progress</div>
                                <div class="quest-hero-level">Level ${lp.level}</div>
                            </div>
                            <div class="quest-hero-xp">${lp.xp} XP total</div>
                        </div>
                        <div class="xp-bar large"><div class="xp-bar-fill" style="width:${Math.min(100,Math.max(0,lp.pct)).toFixed(1)}%"></div></div>
                        <div class="quest-hero-foot">
                            <span>${lp.into} / ${lp.span} XP to level ${lp.level + 1}</span>
                        </div>
                    </div>
                    ${section('Daily Quests', 'Resets at midnight', q.daily)}
                    ${section('Unlock Battles', 'Complete to access 1v1 mode', q.battles)}
                    ${section('Border Unlocks', 'Cosmetic profile frames', q.borders)}
                </div>
            `;
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

            // --- Algorithm progress: learned / total per category ---
            const algProg = ALG_CATS.map(c => {
                const items = db.filter(it => it.category === c.id);
                const learned = items.filter(it => learnedSet.has(it.name)).length;
                return { ...c, learned, total: items.length, pct: items.length ? learned / items.length * 100 : 0 };
            });
            const totalLearned = algProg.reduce((a, c) => a + c.learned, 0);
            const totalAlgs = algProg.reduce((a, c) => a + c.total, 0);

            // --- Practice distribution: TWO donuts (by cube, by session) ---
            // Donut A: by cube
            const cubeSegs = perPuzzle.filter(p => p.count > 0).map((p) => ({
                label: PUZZLE_LABEL[p.pid], count: p.count,
                color: PUZZLE_COLORS[PUZZLES_FOR_STATS.indexOf(p.pid) % PUZZLE_COLORS.length]
            }));
            // Donut B: by session name (combined across puzzles)
            const bySessionName = {};
            PUZZLES_FOR_STATS.forEach(pid => {
                const store = LS.get('sess_' + pid, null);
                if (!store || !store.sessions) return;
                store.sessions.forEach(sess => {
                    const name = sess.name || 'Unnamed';
                    bySessionName[name] = (bySessionName[name] || 0) + ((sess.solves && sess.solves.length) || 0);
                });
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

            statsView.innerHTML = `
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
                                        <div class="xp-bar"><div class="xp-bar-fill" style="width:${Math.min(100,Math.max(0,lp.pct)).toFixed(1)}%"></div></div>
                                        <span class="xp-text">${lp.into} / ${lp.span} XP</span>
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
                            : `<div class="profile-stub" id="profile-stub">Click <b>Edit profile</b> to add a bio, main event, cubes, socials and your WCA ID.</div>`
                        }
                        ${socialsHTML}
                    </div>

                    <div class="train-panel stats-pr">
                        <div class="panel-title">
                            <span>Personal Records</span>
                            <select id="stats-filter-cube" class="stats-filter-select">
                                <option value="all" ${statsFilter === 'all' ? 'selected' : ''}>All Puzzles</option>
                                ${PUZZLES_FOR_STATS.map(pid =>
                                    `<option value="${pid}" ${statsFilter === pid ? 'selected' : ''}>${PUZZLE_LABEL[pid]}</option>`
                                ).join('')}
                            </select>
                        </div>
                        <div class="pr-grid">
                            <div class="pr-cell"><div class="lbl">Single</div><div class="val">${fmtTime(headline.best === Infinity ? null : headline.best)}</div></div>
                            <div class="pr-cell"><div class="lbl">Ao5</div><div class="val">${fmtTime(headline.ao5 === Infinity ? null : headline.ao5)}</div></div>
                            <div class="pr-cell"><div class="lbl">Ao12</div><div class="val">${fmtTime(headline.ao12 === Infinity ? null : headline.ao12)}</div></div>
                            <div class="pr-cell"><div class="lbl">Ao100</div><div class="val">${fmtTime(headline.ao100 === Infinity ? null : headline.ao100)}</div></div>
                        </div>
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
                        <div class="panel-title">Algorithm Progress
                            <span class="alg-progress-total">${totalLearned} / ${totalAlgs} learned</span>
                        </div>
                        <div class="prog-list">
                            ${algProg.map(c => `
                                <div class="prog-row">
                                    <div class="prog-row-head">
                                        <span>${c.label}</span>
                                        <span class="prog-count">${c.learned} / ${c.total}</span>
                                    </div>
                                    <div class="prog-bar"><div class="prog-bar-fill" style="width:${c.pct.toFixed(1)}%"></div></div>
                                </div>`).join('')}
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
            // Edit profile button
            const editBtn = document.getElementById('open-profile-edit');
            if (editBtn) editBtn.addEventListener('click', openProfileEdit);
            // Async: load upcoming competitions if wca_id is set
            if (profile.wca_id) loadUpcomingComps(profile.wca_id);
        }

        async function loadUpcomingComps(wcaId) {
            const el = document.getElementById('wca-upcoming-body');
            if (!el) return;
            const cacheKey = 'wca_upcomping_' + wcaId;
            let comps;
            try {
                const cached = sessionStorage.getItem(cacheKey);
                if (cached) {
                    comps = JSON.parse(cached);
                } else {
                    const resp = await fetch(`https://www.worldcubeassociation.org/api/v0/competitions?upcoming_for=${encodeURIComponent(wcaId)}&per_page=8&sort=start_date`);
                    if (!resp.ok) throw new Error('HTTP ' + resp.status);
                    comps = await resp.json();
                    sessionStorage.setItem(cacheKey, JSON.stringify(comps));
                }
            } catch (e) {
                if (el) el.innerHTML = '<span style="color:var(--text-muted);font-size:0.88rem;">Could not load competitions — check your connection.</span>';
                return;
            }
            if (!el) return;
            if (!Array.isArray(comps) || !comps.length) {
                el.innerHTML = '<span style="color:var(--text-muted);font-size:0.88rem;">No upcoming registered competitions found for your WCA ID.</span>';
                return;
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
            el.innerHTML = comps.map(c => {
                const startDate = new Date(c.start_date + 'T00:00:00');
                const diffDays = Math.round((startDate - now) / 86400000);
                const badge = diffDays > 0 ? `<span class="upcoming-days">${diffDays === 1 ? 'tomorrow' : 'in ' + diffDays + ' days'}</span>`
                    : diffDays === 0 ? `<span class="upcoming-days">today</span>` : '';
                const eventPips = (c.event_ids || []).map(e => `<span class="event-pip">${e}</span>`).join('');
                return `<div class="upcoming-comp">
                    <div class="upcoming-comp-name"><a href="${escHTML(c.url || '#')}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none;">${escHTML(c.name)}</a></div>
                    <div class="upcoming-comp-meta">
                        ${escHTML(fmtCompDate(c.start_date, c.end_date))} &middot; ${escHTML(c.city || '')}${c.country_iso2 ? ', ' + escHTML(c.country_iso2) : ''}
                        ${badge}
                    </div>
                    ${eventPips ? `<div class="upcoming-comp-events">${eventPips}</div>` : ''}
                </div>`;
            }).join('');
        }

        // ---- Training Planner ----
        let plannerData = LS.get('planner', { plans: [] });
        function savePlanner() { LS.set('planner', plannerData); }
        function genPlanId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

        function renderPlanner() {
            const plans = plannerData.plans || [];
            const now = new Date();
            function dateBadge(dateStr) {
                if (!dateStr) return '';
                const d = new Date(dateStr + 'T00:00:00');
                const diff = Math.round((d - now) / 86400000);
                const label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                const cls = diff >= 0 && diff <= 7 ? 'soon' : '';
                const countdown = diff > 0 ? ` · ${diff}d` : diff === 0 ? ' · today' : diff < 0 ? ' · done' : '';
                return `<span class="plan-date-badge ${cls}" data-date="${dateStr}">${label}${countdown}</span>`;
            }
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
            planView.innerHTML = `<div class="plan-outer">
                <div class="plan-topbar">
                    <h2 class="plan-page-title">Planner</h2>
                    <button class="plan-new-cta" id="plan-open-new">+ New Checklist</button>
                </div>
                ${plans.length ? plans.map(planHTML).join('') : `
                <div class="plan-empty-state">
                    <span class="plan-empty-icon">📋</span>
                    No checklists yet.<br>
                    <span style="font-size:0.85rem;">Create one to plan your comp prep, practice goals or weekly training.</span>
                </div>`}
            </div>`;

            document.getElementById('plan-open-new')?.addEventListener('click', openNewPlanModal);
        }

        function plannerClickHandler(e) {
            const action = e.target.dataset.action || e.target.closest('[data-action]')?.dataset.action;
            const el = action ? (e.target.dataset.action ? e.target : e.target.closest('[data-action]')) : null;
            if (!el) return;
            const planId = el.dataset.planId;
            const taskId = el.dataset.taskId;
            const plan = plannerData.plans.find(p => p.id === planId);

            if (action === 'toggle-task') {
                const task = plan?.tasks.find(t => t.id === taskId);
                if (task) { task.done = el.checked; savePlanner(); renderPlanner(); }
            } else if (action === 'delete-task') {
                if (plan) { plan.tasks = plan.tasks.filter(t => t.id !== taskId); savePlanner(); renderPlanner(); }
            } else if (action === 'delete-plan') {
                if (confirm(`Delete "${plan?.name}"? This cannot be undone.`)) {
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
            // Re-focus the add input for the same plan
            const newInput = planView.querySelector(`.plan-add-input[data-plan-id="${plan.id}"]`);
            if (newInput) newInput.focus();
        }
        function startInlineRename(nameEl, pid) {
            const plan = plannerData.plans.find(p => p.id === pid);
            if (!plan) return;
            const inp = document.createElement('input');
            inp.type = 'text';
            inp.className = 'plan-card-name-input';
            inp.value = plan.name;
            inp.maxLength = 60;
            nameEl.replaceWith(inp);
            inp.focus(); inp.select();
            function commit() {
                const v = inp.value.trim();
                if (v) plan.name = v;
                savePlanner(); renderPlanner();
            }
            inp.addEventListener('blur', commit);
            inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } else if (e.key === 'Escape') renderPlanner(); });
        }
        function startInlineTaskEdit(textEl, pid, tid) {
            const plan = plannerData.plans.find(p => p.id === pid);
            const task = plan?.tasks.find(t => t.id === tid);
            if (!task) return;
            const inp = document.createElement('input');
            inp.type = 'text';
            inp.className = 'plan-task-text-input';
            inp.value = task.text;
            inp.maxLength = 200;
            textEl.replaceWith(inp);
            inp.focus(); inp.select();
            function commit() {
                const v = inp.value.trim();
                if (v) task.text = v;
                savePlanner(); renderPlanner();
            }
            inp.addEventListener('blur', commit);
            inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } else if (e.key === 'Escape') renderPlanner(); });
        }

        // Planner event delegation (wired once)
        planView.addEventListener('click', plannerClickHandler);
        planView.addEventListener('keydown', plannerKeyHandler);

        // New plan modal
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
            // Focus the first add-task input after creating
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
            try { return new Alg(s).invert().toString(); } catch (e) { return s; }
        }
        // A scramble that leads to the case, but is not the literal setup:
        // a random inverted solution, plus random AUF for last-layer cases.
        // AUF is skipped for F2L-type cases, where a U turn changes the case.
        function genScramble(item) {
            const cands = [item.main_alg, ...item.alts].map(invertAlg);
            const base = cands[Math.floor(Math.random() * cands.length)];
            const aufOk = item.category === 'OLL' || item.category === 'PLL' || item.category === 'COLL';
            if (!aufOk) return base.trim();
            const pre = AUFS[Math.floor(Math.random() * AUFS.length)];
            const post = AUFS[Math.floor(Math.random() * AUFS.length)];
            return [pre, base, post].filter(Boolean).join(' ').trim();
        }

        function trainPuzzleId(category) {
            if (category.startsWith('2x2'))      return '2x2x2';
            if (category.startsWith('4x4'))      return '4x4x4';
            if (category.startsWith('5x5'))      return '5x5x5';
            if (category.startsWith('Pyraminx')) return 'pyraminx';
            return '3x3x3';
        }
        function showScramble() {
            if (!trainPool.length) return;
            trainCurrent = trainPool[Math.floor(Math.random() * trainPool.length)];
            const scr = genScramble(trainCurrent);
            scrambleEl.textContent = scr || '(already solved)';
            const cat = trainCurrent.category;
            const isPyra = cat.startsWith('Pyraminx');
            const isF2L  = cat === 'F2L' || cat === 'AF2L';
            const orient = (isF2L || isPyra) ? '' : 'z2';
            trainCube.setAttribute('puzzle', trainPuzzleId(cat));
            trainCube.setAttribute('experimental-setup-alg', (orient ? orient + ' ' : '') + scr);
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
        const puzzleCube = document.getElementById('puzzle-cube');
        const puzzleSolvesEl = document.getElementById('puzzle-solves');
        const puzzleGraph = document.getElementById('puzzle-graph');
        const puzzleHist = document.getElementById('puzzle-hist');
        const puzzleStatsGrid = document.getElementById('puzzle-stats-grid');

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
        let currentScramble = '';

        // Settings (persisted) — timerPrecision is declared in the shared section
        let inspectionEnabled = LS.get('inspection', false);
        let focusMode = LS.get('focusMode', false);
        let holdDelayMs = LS.get('holdDelay', 0);   // 0 | 300 | 550

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
                return `<div class="solve-row ${cls}" data-idx="${i}">
                    <span class="solve-idx">${i + 1}.</span>
                    <span class="solve-time">${solveLabel(s)}${noteHTML}</span>
                    <span class="solve-ao">${a5 == null ? '—' : (a5 === Infinity ? 'DNF' : fmt(a5))}</span>
                    <span class="solve-ao">${a12 == null ? '—' : (a12 === Infinity ? 'DNF' : fmt(a12))}</span>
                </div>`;
            }).filter(Boolean).reverse().join('');
            puzzleSolvesEl.innerHTML = `
                <div class="solve-row solve-row-head">
                    <span>#</span><span>Time</span><span>ao5</span><span>ao12</span>
                </div>
                ${rows || '<span class="solve-list-empty">No matches.</span>'}`;
        }
        function renderGraph() {
            puzzleGraph._gdata = null;
            const seq = curSolves().filter(s => s.penalty !== 'dnf').map(effTime);
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
                `<stop offset="0%" stop-color="#FF9F0A" stop-opacity="0.22"/>` +
                `<stop offset="100%" stop-color="#FF9F0A" stop-opacity="0.02"/>` +
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
            svg += `<polyline points="${pbPts.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')}" fill="none" stroke="#5fe08c" stroke-width="1.5" stroke-dasharray="5 3" vector-effect="non-scaling-stroke"/>`;

            // Time line
            svg += `<polyline points="${timePts.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')}" fill="none" stroke="#FF9F0A" stroke-width="2" vector-effect="non-scaling-stroke"/>`;

            // Solve dots (skip when dense)
            if (seq.length <= 80) {
                svg += timePts.map(([cx, cy]) =>
                    `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="2.5" fill="#FF6A00" stroke="rgba(0,0,0,0.35)" stroke-width="0.5"/>`
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
            let bucketSize;
            if      (spread <= 1.5)  bucketSize = 0.25;
            else if (spread <= 4)    bucketSize = 0.5;
            else if (spread <= 15)   bucketSize = 1;
            else if (spread <= 40)   bucketSize = 2;
            else if (spread <= 120)  bucketSize = 5;
            else                     bucketSize = 10;

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
                svg += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${barH.toFixed(1)}" fill="${isPeak ? '#FFD60A' : '#FF9F0A'}" opacity="${isPeak ? 1 : 0.78}" rx="2"/>`;
                if (bw >= 14 && barH > 14) {
                    svg += `<text x="${(x + bw / 2).toFixed(1)}" y="${(y - 3).toFixed(1)}" fill="${isPeak ? '#FFD60A' : '#aaa'}" font-size="10" text-anchor="middle">${c}</text>`;
                }
            });

            // Median indicator line
            const mx = padL + medianBucket * (bw + gap) + bw / 2;
            svg += `<line x1="${mx.toFixed(1)}" y1="${padT}" x2="${mx.toFixed(1)}" y2="${padT + plotH}" stroke="rgba(95,224,140,0.5)" stroke-width="1.5" stroke-dasharray="3 3"/>`;
            svg += `<text x="${mx.toFixed(1)}" y="${padT - 3}" fill="#5fe08c" font-size="9" text-anchor="middle">med</text>`;

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
            const ev = puzzleSelect.value;
            currentScramble = '';
            puzzleScrambleEl.textContent = 'Generating scramble…';
            let scr = '';
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    scr = (await randomScrambleForEvent(ev)).toString();
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
            if (PUZZLE_HAS_CUBE[ev]) {
                puzzleCubeWrap.dataset.supported = '1';
                puzzleCube.setAttribute('puzzle', PUZZLE_DISPLAY[ev]);
                puzzleCube.setAttribute('experimental-setup-alg', scr);
                puzzleCube.alg = '';
            } else {
                puzzleCubeWrap.dataset.supported = '0';
            }
            applyPuzzleCube();
            // Set up the solved-state simulator for smart-cube auto-stop
            initSolvedSim(scr);
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
                        id: 's' + Date.now(),
                        name: 'Session 1',
                        puzzle: puzzleSelect.value || '333',
                        solves: []
                    });
                }
                store = { activeId: allSessions[0].id, sessions: allSessions };
            }
            puzzleStore = store;
            // Sync the cube selector to the active session's puzzle
            const active = curSession();
            if (active && active.puzzle && puzzleSelect.value !== active.puzzle) {
                puzzleSelect.value = active.puzzle;
            }
            renderSessionSelect();
            refreshPuzzle();
        }
        function startPuzzle() {
            puzzleStarted = true;
            loadPuzzle();
            puzzleTimer.reset();
            nextPuzzleScramble();
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
                const newSolve = { t, penalty: pen || 'ok', scramble: currentScramble, date: Date.now() };
                curSolves().push(newSolve);
                savePuzzle();
                refreshPuzzle();
                // Celebrate PBs
                maybeShowSolveFeedback(prior, newSolve);
                nextPuzzleScramble();
            }
        });
        timerRegistry.push({
            timer: puzzleTimer,
            isActive: () => timerView.style.display !== 'none'
        });
        // Touch-anywhere for puzzle timer (non-mouse pointer on non-interactive areas)
        timerView.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'mouse') return;
            if (e.target.closest('button, input, select, a, [data-act], .session-card, .solve-row, .modal-backdrop')) return;
            if (inputMode !== 'timer') return;
            puzzleTimer.press();
        });
        timerView.addEventListener('pointerup', (e) => {
            if (e.pointerType === 'mouse') return;
            if (e.target.closest('button, input, select, a')) return;
            if (inputMode !== 'timer') return;
            puzzleTimer.release();
        });

        sessionSelect.addEventListener('change', () => {
            puzzleStore.activeId = sessionSelect.value;
            savePuzzle();
            refreshPuzzle();
        });
        // Activating a session also retargets the cube selector to its puzzle.
        function activateSessionById(sid) {
            puzzleStore.activeId = sid;
            const s = puzzleStore.sessions.find(x => x.id === sid);
            if (s && s.puzzle && puzzleSelect.value !== s.puzzle) {
                puzzleSelect.value = s.puzzle;
            }
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
        document.getElementById('session-delete').addEventListener('click', () => {
            if (puzzleStore.sessions.length <= 1) { alert('You need at least one session.'); return; }
            if (!confirm('Delete session "' + curSession().name + '" and all its solves?')) return;
            puzzleStore.sessions = puzzleStore.sessions.filter(s => s.id !== puzzleStore.activeId);
            puzzleStore.activeId = puzzleStore.sessions[0].id;
            savePuzzle();
            renderSessionSelect();
            refreshPuzzle();
        });

        // ---- Settings ----
        const inspectionBtn = document.getElementById('ps-inspection');
        const focusBtn = document.getElementById('ps-focus');
        const holdBtn = document.getElementById('ps-hold');
        const precisionBtn = document.getElementById('ps-precision');
        const puzzleHint = document.getElementById('puzzle-hint');
        function applySettingsUI() {
            inspectionBtn.textContent = 'Inspection: ' + (inspectionEnabled ? 'On' : 'Off');
            inspectionBtn.classList.toggle('on', inspectionEnabled);
            focusBtn.textContent = 'Focus: ' + (focusMode ? 'On' : 'Off');
            focusBtn.classList.toggle('on', focusMode);
            holdBtn.textContent = 'Hold: ' + (holdDelayMs / 1000).toFixed(2) + 's';
            holdBtn.classList.toggle('on', holdDelayMs > 0);
            precisionBtn.textContent = 'Decimals: ' + timerPrecision;
            puzzleHint.innerHTML = inspectionEnabled
                ? 'Press <b>Space</b> to start 15s inspection, then hold &amp; release to solve'
                : 'Hold <b>Space</b> (or tap below), release to start — press again to stop';
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
        applySettingsUI();

        puzzleSelect.addEventListener('change', () => {
            // Picking a new cube switches to (or creates) a session for that cube.
            // The session list itself stays visible regardless of the cube.
            const cube = puzzleSelect.value;
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
            savePuzzle();
            renderSessionSelect();
            refreshPuzzle();
            puzzleTimer.reset();
            nextPuzzleScramble();
        });
        document.getElementById('puzzle-skip').addEventListener('click', () => {
            puzzleTimer.reset();
            nextPuzzleScramble();
        });
        document.getElementById('puzzle-clear').addEventListener('click', () => {
            if (!curSolves().length) return;
            if (!confirm('Clear all solves in this session?')) return;
            curSession().solves = [];
            savePuzzle();
            refreshPuzzle();
        });

        // ---- Solve popup — scramble detail, penalties, delete ----
        const solvePopup = document.getElementById('solve-popup');
        let popupIdx = -1;
        puzzleSolvesEl.addEventListener('click', (e) => {
            const chip = e.target.closest('.solve-row');
            if (!chip || chip.classList.contains('solve-row-head')) return;
            popupIdx = parseInt(chip.dataset.idx, 10);
            const s = curSolves()[popupIdx];
            document.getElementById('solve-popup-time').textContent =
                'Solve ' + (popupIdx + 1) + ': ' + solveLabel(s);
            document.getElementById('solve-popup-date').textContent =
                s.date ? new Date(s.date).toLocaleString() : 'no date saved';
            document.getElementById('solve-popup-scramble').textContent =
                s.scramble || '(no scramble saved)';
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
            puzzleCubeWrap.style.display = (showPuzzleCube && supported) ? '' : 'none';
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
        if (signinWca)    signinWca.addEventListener('click',    () => {
            closeSigninModal();
            sessionStorage.setItem('wca_signin_intent', '1');
            startWcaLogin();
        });

        // Delegate sign-in / sign-out clicks
        document.addEventListener('click', (e) => {
            const b = e.target.closest('[data-auth]');
            if (!b) return;
            if (b.dataset.auth === 'signin')  openSigninModal();
            if (b.dataset.auth === 'signout') fbSync.signOut();
        });

        // When auth state changes, reload state from (newly synced) localStorage and refresh UI.
        fbSync.onUserChange((user) => {
            // Refresh in-memory state from LS (cloud sync may have updated it)
            const freshP = LS.get('profile', {});
            Object.assign(profile, DEFAULT_PROFILE, freshP);
            profile.socials = Object.assign({}, DEFAULT_PROFILE.socials, freshP.socials || {});
            learnedSet.clear();
            LS.get('learned', []).forEach(n => learnedSet.add(n));
            Object.keys(mainChoices).forEach(k => delete mainChoices[k]);
            Object.assign(mainChoices, LS.get('mainChoices', {}));
            inspectionEnabled = LS.get('inspection', false);
            focusMode         = LS.get('focusMode', false);
            holdDelayMs       = LS.get('holdDelay', 0);
            timerPrecision    = LS.get('precision', 2);
            groupMode         = LS.get('groupMode', 'name');
            showTrainCube     = LS.get('trainCube', true);
            showPuzzleCube    = LS.get('puzzleCube', true);

            // Re-render whatever is currently visible
            renderCards();
            if (trainCaselist.children.length) buildCaselist();
            if (puzzleStarted) loadPuzzle();
            if (statsView.style.display !== 'none') renderStats();
            applyTrainCube();
            applyPuzzleCube();
            applySettingsUI();
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

        function applyInputMode() {
            const isTimer    = inputMode === 'timer';
            const isType     = inputMode === 'type';
            const isStackmat = inputMode === 'stackmat';
            puzzleTypeUI.style.display     = isType     ? 'flex' : 'none';
            puzzleStackmatUI.style.display = isStackmat ? 'block' : 'none';
            puzzleHintEl.style.display     = isTimer    ? '' : 'none';
            document.querySelectorAll('.input-mode-btn').forEach(b =>
                b.classList.toggle('on', b.dataset.input === inputMode));
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

        // Typing mode: parse "12.34" or "1:02.34" (or "DNF")
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
            ev.innerHTML = MAIN_EVENT_OPTIONS.map(o =>
                `<option value="${o.id}" ${o.id === profile.main_event ? 'selected' : ''}>${o.label}</option>`
            ).join('');
            document.getElementById('pe-cubes').value = profile.main_cubes || '';
            document.getElementById('pe-bio').value   = profile.bio || '';
            document.getElementById('pe-wca').value   = profile.wca_id || '';
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
            if (tabId === 'appearance') buildColorSwatches();
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
        const peWcaNote = document.getElementById('pe-wca-verified-note');
        function updateWcaVerifyNote() {
            if (!wcaEnabled) {
                peWcaNote.textContent = 'WCA verification not configured. Edit wca-config.js to enable.';
                peWcaVerifyBtn.disabled = true;
                peWcaVerifyBtn.style.opacity = '0.5';
                peWcaVerifyBtn.style.display = '';
                return;
            }
            peWcaVerifyBtn.disabled = false;
            peWcaVerifyBtn.style.opacity = '';
            if (profile.wca_verified && profile.wca_id) {
                peWcaNote.innerHTML = `✓ Verified as <b>${escHTML(profile.wca_name || profile.wca_id)}</b>`;
                peWcaNote.style.color = '#5fe08c';
                peWcaVerifyBtn.style.display = 'none';
            } else if (profile.wca_id && profile.wca_records && Object.keys(profile.wca_records).length) {
                // Linked via public lookup (not identity-verified)
                peWcaNote.innerHTML = `Linked to <b>${escHTML(profile.wca_name || profile.wca_id)}</b> · <span style="opacity:.7">(public lookup)</span>`;
                peWcaNote.style.color = '#5fe08c';
                peWcaVerifyBtn.textContent = 'Verify identity with WCA';
                peWcaVerifyBtn.style.display = '';
            } else {
                peWcaNote.textContent = '';
                peWcaNote.style.color = '';
                peWcaVerifyBtn.textContent = 'Verify with WCA';
                peWcaVerifyBtn.style.display = '';
            }
        }
        peWcaVerifyBtn.addEventListener('click', async () => {
            // Primary path: OAuth-verified
            const wcaIdInput = (document.getElementById('pe-wca').value || '').trim().toUpperCase();
            // If the user filled in a WCA ID, try the PUBLIC endpoint first
            // (no OAuth, no CORS issues). They lose true identity verification
            // but PRs and basic profile populate immediately.
            if (/^\d{4}[A-Z]{4}\d{2}$/.test(wcaIdInput)) {
                peWcaNote.textContent = 'Loading your public WCA profile…';
                peWcaNote.style.color = '';
                try {
                    const pub = await fetchPublicWcaProfile(wcaIdInput);
                    profile.wca_id = pub.wca_id;
                    profile.wca_name = pub.name || '';
                    profile.wca_verified = false;     // public lookup, not identity-verified
                    profile.wca_records = pub.personal_records || {};
                    saveProfile();
                    peWcaNote.innerHTML = `Linked to <b>${escHTML(pub.name || pub.wca_id)}</b> (public lookup). For a verified badge, click again to sign in with WCA.`;
                    peWcaNote.style.color = '#5fe08c';
                    if (statsView.style.display !== 'none') renderStats();
                    return;
                } catch (err) {
                    console.warn('Public WCA lookup failed, falling back to OAuth:', err);
                    peWcaNote.textContent = '';
                }
            }
            // Else: full OAuth flow
            startWcaLogin();
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
                main_event: document.getElementById('pe-event').value,
                main_cubes: document.getElementById('pe-cubes').value.trim().slice(0, 120),
                bio:        sanitizeBio(document.getElementById('pe-bio').value),
                wca_id:     document.getElementById('pe-wca').value.trim().toUpperCase().slice(0, 10),
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
        let stackmatHandle = null;
        async function startStackmat() {
            try {
                const mod = await import('./stackmat-decoder.js');
                stackmatHandle = await mod.startStackmat({
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
                        const note = document.querySelector('.stackmat-note');
                        if (note) note.textContent = msg;
                    }
                });
                const btn = document.getElementById('puzzle-stackmat-connect');
                btn.textContent = '🛑 Disconnect Stackmat';
                btn.dataset.connected = '1';
                const note = document.querySelector('.stackmat-note');
                if (note) note.textContent = 'Listening on audio input. Press a pad on your Stackmat to test the signal.';
            } catch (e) {
                console.error(e);
                alert('Could not start Stackmat: ' + (e.message || e));
            }
        }
        function stopStackmat() {
            if (stackmatHandle) { try { stackmatHandle.stop(); } catch (e) {} stackmatHandle = null; }
            const btn = document.getElementById('puzzle-stackmat-connect');
            btn.textContent = '🎧 Connect Stackmat (audio jack)';
            btn.dataset.connected = '';
            const note = document.querySelector('.stackmat-note');
            if (note) note.textContent = 'Plug your Stackmat into the headphone-in / line-in port and click Connect.';
        }
        document.getElementById('puzzle-stackmat-connect').addEventListener('click', () => {
            if (stackmatHandle) stopStackmat(); else startStackmat();
        });

        // ---- Smart Cube (Bluetooth: GAN / GiiKER / GoCube / MoYu) ----
        let smartCubeHandle = null;
        const smartStatusEl = document.getElementById('smart-cube-status');
        const smartBtn      = document.getElementById('smart-cube-connect');
        function setSmartStatus(text, connected) {
            if (smartStatusEl) smartStatusEl.textContent = text;
            smartStatusEl?.classList.toggle('connected', !!connected);
            if (smartBtn) smartBtn.textContent = connected ? '🛑 Disconnect Cube' : '🔵 Connect Smart Cube';
        }
        // ---- Solved-state simulator for auto-stop (3x3 & 2x2) ----
        let solvedSim = null;
        async function initSolvedSim(scrambleStr) {
            solvedSim = null;
            const pid = puzzleSelect.value;
            if (pid !== '333' && pid !== '222') return;   // only the cubes cubing.js fully solves
            try {
                const pmod = await import("https://cdn.cubing.net/v0/js/cubing/puzzles");
                const puzzle = pid === '333' ? pmod.cube3x3x3 : pmod.cube2x2x2;
                const kp = await puzzle.kpuzzle();
                let state = kp.startState();
                if (scrambleStr) {
                    try { state = state.applyAlg(new Alg(scrambleStr)); }
                    catch (e) { /* unparseable scramble – skip */ }
                }
                solvedSim = { kp, state };
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

        async function connectSmartCube() {
            try {
                const mod = await import('./smart-cube.js');
                smartCubeHandle = await mod.connectCube({
                    onName: (name) => setSmartStatus('Connected: ' + name, true),
                    onMove: (moveStr) => {
                        // Stream moves into the on-screen 2D cube on the Timer page
                        const cube = document.getElementById('puzzle-cube');
                        try { cube.experimentalAddMove(moveStr); }
                        catch (e) {
                            // Fallback: append to current alg
                            const cur = cube.alg ? String(cube.alg) : '';
                            cube.alg = (cur + ' ' + moveStr).trim();
                        }
                        // Auto-start timer on first move (only in 'timer' input mode and only if idle)
                        if (inputMode === 'timer' && puzzleTimer.getState() === 'idle') {
                            puzzleTimer.press();     // -> ready/armed
                            puzzleTimer.release();   // -> running
                        }
                        // Auto-stop when the cube reaches solved state
                        if (checkSolvedAfterMove(moveStr) && puzzleTimer.getState() === 'running') {
                            puzzleTimer.press();     // -> stop, record solve
                        }
                    },
                    onError: (msg) => {
                        console.warn('Smart cube error:', msg);
                        setSmartStatus('Error: ' + msg, false);
                    },
                    onDisconnect: () => {
                        smartCubeHandle = null;
                        setSmartStatus('Disconnected', false);
                    }
                });
            } catch (e) {
                console.error(e);
                if (!smartStatusEl?.textContent?.startsWith('Error:')) {
                    setSmartStatus('Failed: ' + (e.message || e), false);
                }
                smartCubeHandle = null;
            }
        }
        function disconnectSmartCube() {
            if (smartCubeHandle) {
                try { smartCubeHandle.disconnect(); } catch (e) {}
                smartCubeHandle = null;
            }
            setSmartStatus('Not connected', false);
        }
        smartBtn?.addEventListener('click', () => {
            if (smartCubeHandle) disconnectSmartCube(); else connectSmartCube();
        });

        // ---- 1v1 / 1v1v1 Battles ----
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

        let battleCode   = null;
        let battleData   = null;
        let battlePlayers = {};
        let battleUnsub  = null;
        let battleSubmitting = false;     // guards a single in-flight write

        function myBattleTimes() {
            const me = fbSync.getUser();
            return (me && battlePlayers[me.uid] && battlePlayers[me.uid].times) || [];
        }
        function myBattleFinished() {
            const me = fbSync.getUser();
            return !!(me && battlePlayers[me.uid] && battlePlayers[me.uid].finished);
        }

        const battleTimer = createTimer(battleTimerEl, {
            onSolve: async (t, pen) => {
                if (!battleCode || battleSubmitting) return;
                if (myBattleFinished()) return;       // already done with all 5
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

        function showBattlesLobby() {
            battlesLobby.style.display = '';
            battlesRoom.style.display = 'none';
            updateBattlesGate();
        }

        function updateBattlesGate() {
            const total = totalSolvesAll();
            const unlocked = battlesUnlocked();
            // Wait for Firebase auth to resolve before deciding sign-in state.
            // Before resolution getUser() returns null even for signed-in users.
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
                    // Auth resolved and not signed in → show prompt
                    if (actionsEl) actionsEl.style.display = 'none';
                    if (rulesEl) rulesEl.style.display = 'none';
                    if (signinPrompt) signinPrompt.style.display = '';
                } else {
                    // Auth still loading — hide everything, will re-run when resolved
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

        function renderBattleRoom() {
            if (!battleData) return;
            battleCodeEl.textContent = battleCode;
            battleEventEl.textContent = ({ '222':'2x2', '333':'3x3', 'pyram':'Pyraminx' }[battleData.puzzle] || battleData.puzzle);
            const state = battleData.state || 'waiting';
            battleStateEl.textContent = state + ' · Ao5';

            const me = fbSync.getUser();
            const playerList = Object.entries(battlePlayers);
            const wanted = battleData.maxPlayers || 2;
            const allHere   = playerList.length >= wanted;
            const allReady    = allHere && playerList.every(([_, p]) => p.ready);
            const allFinished = allHere && playerList.every(([_, p]) => p.finished);

            // --- Player rows with mini solve list + running ao5 ---
            battlePlayersEl.innerHTML = playerList.map(([uid, p]) => {
                const isMe = me && uid === me.uid;
                const times = p.times || [];
                const progress = `${times.length} / 5`;
                const chips = times.map(s => {
                    const lbl = s.penalty === 'dnf' ? 'DNF'
                              : (s.penalty === '+2' ? (s.t + 2).toFixed(2) + '+' : s.t.toFixed(2));
                    return `<span class="bp-chip">${lbl}</span>`;
                }).join('');
                let stat;
                if (p.finished) {
                    // We need ao5 — compute locally to avoid awaiting
                    const eff = times.slice(0, 5).map(s => s.penalty === 'dnf' ? Infinity : (s.penalty === '+2' ? s.t + 2 : s.t)).sort((a,b)=>a-b).slice(1,-1);
                    const avg = eff.some(v => v === Infinity) ? null : eff.reduce((a,b)=>a+b,0)/eff.length;
                    stat = `<span class="bp-ao5">Ao5 <b>${avg == null ? 'DNF' : avg.toFixed(2)}</b></span>`;
                } else if (state === 'racing') {
                    stat = `<span class="bp-status racing">solve ${times.length + 1} / 5</span>`;
                } else {
                    stat = p.ready ? '<span class="bp-status ready">ready</span>' : '<span class="bp-status">waiting</span>';
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

            // --- Scramble: show my CURRENT one (depends on my solve count) ---
            const myTimes = me && battlePlayers[me.uid] ? (battlePlayers[me.uid].times || []) : [];
            const myCount = myTimes.length;
            const scrList = battleData.scrambles || (battleData.scramble ? [battleData.scramble] : []);
            const myScramble = scrList[myCount] || '';

            if (allFinished) {
                battleScrambleEl.textContent = 'Race complete!';
            } else if (state === 'racing') {
                battleScrambleEl.textContent = myCount >= 5
                    ? '✓ Done. Waiting for opponent…'
                    : `Solve ${myCount + 1} / 5  ·  ${myScramble}`;
            } else if (allReady) {
                if (battleData.createdBy && me && battleData.createdBy.uid === me.uid) {
                    import('./battles.js').then(m => m.setBattleState(battleCode, 'racing').catch(console.error));
                }
                battleScrambleEl.textContent = 'Starting…';
            } else {
                battleScrambleEl.textContent = `Waiting for ${wanted} players to be ready…`;
            }

            // Ready button
            const myEntry = me ? battlePlayers[me.uid] : null;
            if (state === 'racing') {
                battleReadyBtn.style.display = 'none';
            } else {
                battleReadyBtn.style.display = '';
                battleReadyBtn.textContent = (myEntry && myEntry.ready) ? '✓ Ready (click to un-ready)' : 'Ready';
                battleReadyBtn.classList.toggle('on', !!(myEntry && myEntry.ready));
            }

            // Hint
            if (state === 'racing') {
                battleHintEl.textContent = myCount >= 5
                    ? 'You\'re done — waiting for the other cuber to finish.'
                    : `Race! Press Space (or use your smart cube) to time solve ${myCount + 1} of 5.`;
            } else if (allReady) {
                battleHintEl.textContent = 'Everyone ready — starting…';
            } else {
                battleHintEl.textContent = 'Mark yourself Ready, then wait for everyone else.';
            }

            // Auto finish detection
            if (allFinished && state !== 'finished') {
                import('./battles.js').then(m => m.setBattleState(battleCode, 'finished').catch(() => {}));
            }
            if (allFinished) {
                import('./battles.js').then(m => {
                    const winner = m.computeWinner(battlePlayers);
                    let html;
                    if (winner === 'tie')      html = `<div class="result-line tie">🤝 It's a tie!</div>`;
                    else if (winner === 'all-dnf') html = `<div class="result-line dnf">All DNF.</div>`;
                    else if (winner) {
                        const p = battlePlayers[winner];
                        html = `<div class="result-line win">🏆 <b>${escHTML(p.name)}</b> wins!</div>`;
                    }
                    if (html) battleResultEl.innerHTML = html, battleResultEl.style.display = '';
                });
            } else {
                battleResultEl.style.display = 'none';
            }
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
            // Clean ?battle= from URL
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
                const code = await m.createBattle({ puzzle: ev, maxPlayers: mp });
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
        document.getElementById('battle-leave').addEventListener('click', leaveBattleUI);

        // Battles gate: beta-tester bypass code
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
        // Re-evaluate gate whenever auth state changes (sign-in / sign-out / initial resolve).
        // No view-visibility guard: must fire even when battles tab is hidden so that
        // mobile redirect sign-ins (which reload the page) still update correctly.
        fbSync.onUserChange(() => updateBattlesGate());

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
            evEl.innerHTML = ONBOARD_EVENTS.map(e => {
                const on = onboardSelections.events.has(e.id);
                return `<button type="button" class="onboard-chip ${on ? 'on' : ''}" data-onboard-event="${e.id}">${e.label}</button>`;
            }).join('');
            const mtEl = document.getElementById('onboard-methods');
            mtEl.innerHTML = ONBOARD_METHODS.map(m => {
                const on = onboardSelections.methods.has(m.id);
                return `<button type="button" class="onboard-chip ${on ? 'on' : ''}" data-onboard-method="${m.id}">${m.label}</button>`;
            }).join('');
            const asEl = document.getElementById('onboard-algsets');
            if (asEl) asEl.innerHTML = ONBOARD_ALGSETS.map(a => {
                const on = onboardSelections.algsets.has(a.category);
                const count = db.filter(it => it.category === a.category).length;
                return `<button type="button" class="onboard-chip ${on ? 'on' : ''}" data-onboard-algset="${a.category}">${a.label} <span style="opacity:0.55;font-size:0.78em">${count}</span></button>`;
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
        handleWcaCallback().then(result => {
            if (!result || !result.wca_id) return;
            sessionStorage.removeItem('wca_signin_intent');
            profile.wca_id = result.wca_id;
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
            setTimeout(() => alert('✓ WCA verified as ' + (result.name || result.wca_id)), 50);
        }).catch(e => {
            console.error('WCA verification failed:', e);
            alert('WCA verification failed: ' + (e.message || e));
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
                el.innerHTML = `<twisty-player puzzle="${({'333':'3x3x3','222':'2x2x2','444':'4x4x4','555':'5x5x5','666':'6x6x6','777':'7x7x7','pyram':'pyraminx','skewb':'skewb','minx':'megaminx'}[puzzleSelect.value] || '3x3x3')}" visualization="2D" alg="" experimental-setup-alg="${(currentScramble || '').replace(/"/g, '&quot;')}" background="none" control-panel="none" viewer-link="none" style="width:100%;height:100%;"></twisty-player>`;
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
                    <div class="widget-expand-cube"><twisty-player puzzle="${p}" visualization="2D" experimental-setup-alg="${(currentScramble || '').replace(/"/g, '&quot;')}" background="none" control-panel="none" viewer-link="none" style="width:100%;height:280px;"></twisty-player></div>`;
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
            btn.addEventListener('click', () => {
                let th = btn.dataset.streak;
                if (th === 'custom') {
                    const v = prompt('Sub-X threshold in seconds:', '15');
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
        function buildSessionsTable(sessions) {
            const wrap = document.getElementById('sc-sessions-table-wrap');
            if (!wrap) return;
            const PUZZLES = [
                ['333','3×3'],['222','2×2'],['444','4×4'],['555','5×5'],
                ['666','6×6'],['777','7×7'],['pyram','Pyraminx'],['skewb','Skewb'],
                ['minx','Megaminx'],['sq1','Sq-1'],['clock','Clock']
            ];
            const THEME_HEX = { orange:'#FF9F0A',blue:'#5ab0ff',green:'#5fe08c',teal:'#22d3ee',purple:'#c084fc',pink:'#f472b6' };
            const iconOpts = SC_ICON_OPTIONS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
            let rows = sessions.map((sess, i) => {
                const pOpts = PUZZLES.map(([v, l]) => `<option value="${v}"${v===sess.puzzle?' selected':''}>${l}</option>`).join('');
                const iOpts = SC_ICON_OPTIONS.map(([v, l]) => `<option value="${v}"${v===sess.icon?' selected':''}>${l}</option>`).join('');
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
                    puzzleStore.sessions.push({ id, name, description: '', puzzle, icon, color, solves: sess.solves.slice() });
                    if (!firstId) firstId = id;
                });
                if (firstId) puzzleStore.activeId = firstId;
            } else {
                const name = document.getElementById('sc-name').value.trim() || 'Session';
                const description = document.getElementById('sc-desc').value.trim().slice(0, 160);
                if (scEditMode === 'new') {
                    const id = 's' + Date.now();
                    puzzleStore.sessions.push({ id, name, description, puzzle: puzzleSelect.value || '333', icon: scIcon, color: scTheme, solves: [] });
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
            savePuzzle();
            renderSessionSelect();
            refreshPuzzle();
            closeSessionEditor();
        });

        // Initialization — only render if a cube was previously selected
        if (LS.get('selectedCube', '')) renderCards();

