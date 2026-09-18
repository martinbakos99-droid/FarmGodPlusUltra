// === Ochrana podľa player ID ===
const ALLOWED_IDS = [957162, 949172]; // sem daj všetky povolené ID
const playerId = game_data?.player?.id || null;

if (!ALLOWED_IDS.includes(Number(playerId))) {
    alert('Skript nie je povolený pre tento účet. Kontaktuj ma na discorde: CaptainM4rtin :)');
    throw new Error('Unauthorized');
}
// === koniec ochrany ===

(() => {
    'use strict';

    // ============================================================
    // RESOURCE & STORAGE OVERVIEW v1.2.0
    // WIDE LAYOUT
    // Divoké kmene / Tribal Wars
    // ============================================================

    const SCRIPT_NAME = 'Resource & Storage Overview';
    const VERSION = '1.2.0';
    const PANEL_ID = 'resource-storage-overview-panel';

    // ============================================================
    // REMOVE OLD PANEL
    // ============================================================

    const oldPanel = document.getElementById(PANEL_ID);

    if (oldPanel) {
        oldPanel.remove();
    }

    // ============================================================
    // HELPERS
    // ============================================================

    function formatNumber(number) {
        return Math.round(Number(number) || 0).toLocaleString('sk-SK');
    }

    function formatPercent(number) {
        if (!Number.isFinite(number)) {
            return '0,0';
        }

        return number
            .toFixed(1)
            .replace('.', ',');
    }

    function parseGameNumber(element) {
        if (!element) {
            return 0;
        }

        const text = element.textContent || '';

        // 430.065 -> 430065
        // 1.250.000 -> 1250000
        const clean = text.replace(/[^\d]/g, '');

        return parseInt(clean, 10) || 0;
    }

    function parseStorageNumber(text) {
        if (!text) {
            return 0;
        }

        const clean = String(text)
            .replace(/[^\d]/g, '');

        return parseInt(clean, 10) || 0;
    }

    function clamp(value, min, max) {
        return Math.min(
            Math.max(value, min),
            max
        );
    }

    // ============================================================
    // DATA
    // ============================================================

    let DATA = {
        villages: 0,
        storage: 0,
        wood: 0,
        stone: 0,
        iron: 0
    };

    // ============================================================
    // CREATE PANEL
    // ============================================================

    const panel = document.createElement('div');

    panel.id = PANEL_ID;

    panel.innerHTML = `
        <style>

            /* ====================================================
               MAIN PANEL
            ==================================================== */

            #${PANEL_ID} {

                position: fixed;

                top: 55px;
                left: 50%;

                transform: translateX(-50%);

                width: 920px;

                max-width: calc(100vw - 30px);

                z-index: 999999;

                background: #f4e4bc;

                border: 2px solid #7d510f;
                border-radius: 6px;

                box-shadow:
                    0 5px 25px rgba(0,0,0,.50);

                font-family:
                    Arial,
                    sans-serif;

                color: #3b2a16;

                font-size: 13px;
            }

            #${PANEL_ID} * {
                box-sizing: border-box;
            }


            /* ====================================================
               HEADER
            ==================================================== */

            #${PANEL_ID} .rs-header {

                display: flex;

                justify-content: space-between;
                align-items: center;

                padding: 9px 12px;

                background:
                    linear-gradient(
                        #d6b86e,
                        #b9974c
                    );

                border-bottom:
                    1px solid #7d510f;

                font-weight: bold;
                font-size: 15px;

                cursor: move;

                user-select: none;
            }

            #${PANEL_ID} .rs-title-small {

                font-size: 10px;

                font-weight: normal;

                opacity: .75;

                margin-left: 6px;
            }

            #${PANEL_ID} .rs-close {

                cursor: pointer;

                width: 26px;
                height: 24px;

                line-height: 21px;

                text-align: center;

                background: #8f2f25;

                color: white;

                border:
                    1px solid #5d1812;

                border-radius: 3px;

                font-weight: bold;

                font-size: 15px;
            }

            #${PANEL_ID} .rs-close:hover {
                filter: brightness(1.15);
            }


            /* ====================================================
               BODY
            ==================================================== */

            #${PANEL_ID} .rs-body {
                padding: 9px;
            }


            /* ====================================================
               STATUS
            ==================================================== */

            #${PANEL_ID} .rs-status {

                padding: 7px 9px;

                margin-bottom: 8px;

                background: #fff6dc;

                border:
                    1px solid #c7a86b;

                border-radius: 4px;

                text-align: center;

                font-weight: bold;
            }


            /* ====================================================
               TWO COLUMN LAYOUT
            ==================================================== */

            #${PANEL_ID} .rs-columns {

                display: grid;

                grid-template-columns:
                    minmax(0, 1fr)
                    minmax(0, 1fr);

                gap: 10px;

                align-items: start;
            }

            #${PANEL_ID} .rs-column {

                min-width: 0;

                display: flex;

                flex-direction: column;

                gap: 9px;
            }


            /* ====================================================
               SECTION
            ==================================================== */

            #${PANEL_ID} .rs-section {

                border:
                    1px solid #c7a86b;

                background: #fff6dc;

                border-radius: 4px;

                overflow: hidden;
            }

            #${PANEL_ID} .rs-section-title {

                background: #d8c28b;

                padding: 7px 9px;

                font-weight: bold;

                border-bottom:
                    1px solid #c7a86b;
            }


            /* ====================================================
               ROW
            ==================================================== */

            #${PANEL_ID} .rs-row {

                display: flex;

                justify-content: space-between;
                align-items: center;

                padding: 6px 9px;

                border-bottom:
                    1px solid #ead9ae;

                gap: 10px;
            }

            #${PANEL_ID} .rs-row:last-child {
                border-bottom: none;
            }

            #${PANEL_ID} .rs-label {
                font-weight: bold;
            }

            #${PANEL_ID} .rs-value {

                text-align: right;

                font-weight: bold;

                white-space: nowrap;
            }

            #${PANEL_ID} .rs-big {
                font-size: 14px;
            }

            #${PANEL_ID} .rs-highlight {
                background: #f3dfaa;
            }


            /* ====================================================
               RESOURCE
            ==================================================== */

            #${PANEL_ID} .rs-resource {

                padding: 7px 9px;

                border-bottom:
                    1px solid #ead9ae;
            }

            #${PANEL_ID} .rs-resource:last-child {
                border-bottom: none;
            }

            #${PANEL_ID} .rs-resource-top {

                display: flex;

                justify-content: space-between;

                gap: 10px;

                margin-bottom: 5px;

                font-weight: bold;
            }

            #${PANEL_ID} .rs-resource-top span:last-child {

                text-align: right;

                white-space: nowrap;
            }


            /* ====================================================
               BARS
            ==================================================== */

            #${PANEL_ID} .rs-bar {

                height: 12px;

                background: #ddd0ae;

                border:
                    1px solid #aa9361;

                border-radius: 3px;

                overflow: hidden;
            }

            #${PANEL_ID} .rs-bar-fill {

                height: 100%;

                width: 0%;

                background:
                    linear-gradient(
                        90deg,
                        #5f8f3d,
                        #91b75f
                    );

                transition:
                    width .25s;
            }

            #${PANEL_ID} .rs-bar-fill.warning {

                background:
                    linear-gradient(
                        90deg,
                        #c18a20,
                        #e0b64f
                    );
            }

            #${PANEL_ID} .rs-bar-fill.danger {

                background:
                    linear-gradient(
                        90deg,
                        #a83b2f,
                        #d45b4b
                    );
            }


            /* ====================================================
               PACKAGE INPUT
            ==================================================== */

            #${PANEL_ID} .rs-slider-box {
                padding: 10px;
            }

            #${PANEL_ID} .rs-package-title {

                font-weight: bold;

                margin-bottom: 8px;
            }

            #${PANEL_ID} .rs-slider-row {

                display: flex;

                align-items: center;

                gap: 8px;
            }

            #${PANEL_ID} input[type="range"] {

                flex: 1;

                min-width: 100px;
            }

            #${PANEL_ID} .rs-percent-input {

                width: 68px;

                padding: 5px;

                border:
                    1px solid #9f8756;

                background: white;

                text-align: center;

                font-weight: bold;
            }

            #${PANEL_ID} .rs-note {

                margin-top: 8px;

                font-size: 11px;

                color: #6d5832;

                line-height: 1.35;
            }


            /* ====================================================
               FOOTER
            ==================================================== */

            #${PANEL_ID} .rs-footer {

                margin-top: 9px;

                display: flex;

                justify-content: center;
            }

            #${PANEL_ID} .rs-btn {

                cursor: pointer;

                min-width: 240px;

                border:
                    1px solid #6e4b17;

                border-radius: 3px;

                padding: 8px 18px;

                font-weight: bold;

                background:
                    linear-gradient(
                        #d6b86e,
                        #b9974c
                    );

                color: #2d210f;
            }

            #${PANEL_ID} .rs-btn:hover {
                filter: brightness(1.07);
            }


            /* ====================================================
               COLORS
            ==================================================== */

            #${PANEL_ID} .rs-overflow {
                color: #9d251d;
            }

            #${PANEL_ID} .rs-good {
                color: #31701f;
            }


            /* ====================================================
               SMALL SCREEN FALLBACK
            ==================================================== */

            @media(max-width: 760px) {

                #${PANEL_ID} {

                    width:
                        calc(100vw - 20px);

                    max-height:
                        calc(100vh - 20px);

                    overflow-y: auto;

                    top: 10px;
                }

                #${PANEL_ID} .rs-columns {

                    grid-template-columns:
                        1fr;
                }
            }

        </style>


        <!-- =====================================================
             HEADER
        ====================================================== -->

        <div class="rs-header">

            <div>

                📦 Prehľad skladov a surovín

                <span class="rs-title-small">
                    v${VERSION} • Wide
                </span>

            </div>


            <div
                class="rs-close"
                title="Zavrieť"
            >
                ×
            </div>

        </div>


        <!-- =====================================================
             BODY
        ====================================================== -->

        <div class="rs-body">


            <!-- STATUS -->

            <div class="rs-status">
                ⏳ Načítavam všetky dediny...
            </div>


            <!-- RESULTS -->

            <div
                class="rs-results"
                style="display:none;"
            >


                <!-- =============================================
                     TWO COLUMNS
                ============================================== -->

                <div class="rs-columns">


                    <!-- =========================================
                         LEFT COLUMN
                    ========================================== -->

                    <div class="rs-column">


                        <!-- =====================================
                             STORAGE
                        ====================================== -->

                        <div class="rs-section">

                            <div class="rs-section-title">
                                📦 Kapacita skladov
                            </div>


                            <div class="rs-row">

                                <span class="rs-label">
                                    Dediny
                                </span>

                                <span
                                    class="rs-value"
                                    id="rs-villages"
                                >
                                    0
                                </span>

                            </div>


                            <div class="rs-row">

                                <span class="rs-label">
                                    Kapacita jednej suroviny
                                </span>

                                <span
                                    class="rs-value rs-big"
                                    id="rs-storage"
                                >
                                    0
                                </span>

                            </div>


                            <div class="rs-row">

                                <span class="rs-label">
                                    Kapacita všetkých surovín
                                </span>

                                <span
                                    class="rs-value rs-big"
                                    id="rs-storage-total"
                                >
                                    0
                                </span>

                            </div>

                        </div>


                        <!-- =====================================
                             CURRENT RESOURCES
                        ====================================== -->

                        <div class="rs-section">

                            <div class="rs-section-title">
                                🌲 Aktuálne suroviny
                            </div>


                            <!-- WOOD -->

                            <div class="rs-resource">

                                <div class="rs-resource-top">

                                    <span>
                                        🪵 Drevo
                                    </span>

                                    <span id="rs-wood-text">
                                        0 / 0
                                    </span>

                                </div>


                                <div class="rs-bar">

                                    <div
                                        class="rs-bar-fill"
                                        id="rs-wood-bar"
                                    ></div>

                                </div>

                            </div>


                            <!-- STONE -->

                            <div class="rs-resource">

                                <div class="rs-resource-top">

                                    <span>
                                        🧱 Hlina
                                    </span>

                                    <span id="rs-stone-text">
                                        0 / 0
                                    </span>

                                </div>


                                <div class="rs-bar">

                                    <div
                                        class="rs-bar-fill"
                                        id="rs-stone-bar"
                                    ></div>

                                </div>

                            </div>


                            <!-- IRON -->

                            <div class="rs-resource">

                                <div class="rs-resource-top">

                                    <span>
                                        ⚙️ Železo
                                    </span>

                                    <span id="rs-iron-text">
                                        0 / 0
                                    </span>

                                </div>


                                <div class="rs-bar">

                                    <div
                                        class="rs-bar-fill"
                                        id="rs-iron-bar"
                                    ></div>

                                </div>

                            </div>


                            <!-- TOTAL -->

                            <div class="rs-row rs-highlight">

                                <span class="rs-label">
                                    Suroviny spolu
                                </span>

                                <span
                                    class="rs-value rs-big"
                                    id="rs-current-total"
                                >
                                    0
                                </span>

                            </div>


                            <div class="rs-row">

                                <span class="rs-label">
                                    Celková naplnenosť
                                </span>

                                <span
                                    class="rs-value rs-big"
                                    id="rs-current-percent"
                                >
                                    0 %
                                </span>

                            </div>


                            <div class="rs-row">

                                <span class="rs-label">
                                    Voľná kapacita
                                </span>

                                <span
                                    class="rs-value"
                                    id="rs-free-space"
                                >
                                    0
                                </span>

                            </div>

                        </div>

                    </div>


                    <!-- =========================================
                         RIGHT COLUMN
                    ========================================== -->

                    <div class="rs-column">


                        <!-- =====================================
                             PACKAGES
                        ====================================== -->

                        <div class="rs-section">

                            <div class="rs-section-title">
                                🎁 Surovinové balíčky
                            </div>


                            <div class="rs-slider-box">

                                <div class="rs-package-title">
                                    Koľko % kapacity máš v balíčkoch?
                                </div>


                                <div class="rs-slider-row">

                                    <input
                                        type="range"
                                        id="rs-package-slider"
                                        min="0"
                                        max="100"
                                        step="1"
                                        value="0"
                                    >


                                    <input
                                        type="number"
                                        id="rs-package-input"
                                        class="rs-percent-input"
                                        min="0"
                                        max="100"
                                        step="1"
                                        value="0"
                                    >


                                    <strong>
                                        %
                                    </strong>

                                </div>


                                <div class="rs-note">

                                    Percento predstavuje množstvo
                                    surovín v balíčkoch voči celkovej
                                    kapacite skladov.

                                    Pri 20 % sa k drevu, hline aj
                                    železu pripočíta 20 % kapacity
                                    jednej suroviny.

                                </div>

                            </div>

                        </div>


                        <!-- =====================================
                             AFTER PACKAGES
                        ====================================== -->

                        <div class="rs-section">

                            <div class="rs-section-title">
                                📊 Stav po započítaní balíčkov
                            </div>


                            <div class="rs-row">

                                <span class="rs-label">
                                    Balíčky / surovina
                                </span>

                                <span
                                    class="rs-value"
                                    id="rs-package-each"
                                >
                                    0
                                </span>

                            </div>


                            <div class="rs-row">

                                <span class="rs-label">
                                    Balíčky spolu
                                </span>

                                <span
                                    class="rs-value"
                                    id="rs-package-total"
                                >
                                    0
                                </span>

                            </div>


                            <!-- AFTER WOOD -->

                            <div class="rs-resource">

                                <div class="rs-resource-top">

                                    <span>
                                        🪵 Drevo
                                    </span>

                                    <span id="rs-after-wood">
                                        0
                                    </span>

                                </div>


                                <div class="rs-bar">

                                    <div
                                        class="rs-bar-fill"
                                        id="rs-after-wood-bar"
                                    ></div>

                                </div>

                            </div>


                            <!-- AFTER STONE -->

                            <div class="rs-resource">

                                <div class="rs-resource-top">

                                    <span>
                                        🧱 Hlina
                                    </span>

                                    <span id="rs-after-stone">
                                        0
                                    </span>

                                </div>


                                <div class="rs-bar">

                                    <div
                                        class="rs-bar-fill"
                                        id="rs-after-stone-bar"
                                    ></div>

                                </div>

                            </div>


                            <!-- AFTER IRON -->

                            <div class="rs-resource">

                                <div class="rs-resource-top">

                                    <span>
                                        ⚙️ Železo
                                    </span>

                                    <span id="rs-after-iron">
                                        0
                                    </span>

                                </div>


                                <div class="rs-bar">

                                    <div
                                        class="rs-bar-fill"
                                        id="rs-after-iron-bar"
                                    ></div>

                                </div>

                            </div>


                            <div class="rs-row rs-highlight">

                                <span class="rs-label">
                                    Suroviny spolu
                                </span>

                                <span
                                    class="rs-value rs-big"
                                    id="rs-after-total"
                                >
                                    0
                                </span>

                            </div>


                            <div class="rs-row">

                                <span class="rs-label">
                                    Teoretická naplnenosť
                                </span>

                                <span
                                    class="rs-value rs-big"
                                    id="rs-after-percent"
                                >
                                    0 %
                                </span>

                            </div>


                            <div class="rs-row">

                                <span class="rs-label">
                                    Nad kapacitu skladov
                                </span>

                                <span
                                    class="rs-value"
                                    id="rs-overflow"
                                >
                                    0
                                </span>

                            </div>

                        </div>

                    </div>

                </div>


                <!-- =============================================
                     FOOTER
                ============================================== -->

                <div class="rs-footer">

                    <button
                        class="rs-btn"
                        id="rs-refresh"
                    >
                        🔄 Aktualizovať údaje
                    </button>

                </div>

            </div>

        </div>
    `;


    document.body.appendChild(panel);


    // ============================================================
    // ELEMENTS
    // ============================================================

    const statusEl =
        panel.querySelector('.rs-status');

    const resultsEl =
        panel.querySelector('.rs-results');

    const closeButton =
        panel.querySelector('.rs-close');

    const refreshButton =
        panel.querySelector('#rs-refresh');

    const slider =
        panel.querySelector('#rs-package-slider');

    const percentInput =
        panel.querySelector('#rs-package-input');


    // ============================================================
    // BAR
    // ============================================================

    function setBar(element, percentage) {

        if (!element) {
            return;
        }

        const visualPercentage =
            clamp(
                percentage,
                0,
                100
            );

        element.style.width =
            `${visualPercentage}%`;


        element.classList.remove(
            'warning',
            'danger'
        );


        if (percentage >= 90) {

            element.classList.add(
                'danger'
            );

        } else if (percentage >= 75) {

            element.classList.add(
                'warning'
            );
        }
    }


    // ============================================================
    // CURRENT DATA
    // ============================================================

    function renderCurrentData() {

        const villages =
            DATA.villages;

        const storage =
            DATA.storage;

        const wood =
            DATA.wood;

        const stone =
            DATA.stone;

        const iron =
            DATA.iron;


        const maxTotal =
            storage * 3;


        const currentTotal =
            wood +
            stone +
            iron;


        const woodPercent =
            storage > 0
                ? (wood / storage) * 100
                : 0;


        const stonePercent =
            storage > 0
                ? (stone / storage) * 100
                : 0;


        const ironPercent =
            storage > 0
                ? (iron / storage) * 100
                : 0;


        const totalPercent =
            maxTotal > 0
                ? (currentTotal / maxTotal) * 100
                : 0;


        const freeSpace =
            Math.max(
                0,
                maxTotal - currentTotal
            );


        // ========================================================
        // STORAGE
        // ========================================================

        panel
            .querySelector('#rs-villages')
            .textContent =
                formatNumber(villages);


        panel
            .querySelector('#rs-storage')
            .textContent =
                formatNumber(storage);


        panel
            .querySelector('#rs-storage-total')
            .textContent =
                formatNumber(maxTotal);


        // ========================================================
        // WOOD
        // ========================================================

        panel
            .querySelector('#rs-wood-text')
            .textContent =
                `${formatNumber(wood)} / ` +
                `${formatNumber(storage)} ` +
                `(${formatPercent(woodPercent)} %)`;


        setBar(
            panel.querySelector(
                '#rs-wood-bar'
            ),
            woodPercent
        );


        // ========================================================
        // STONE
        // ========================================================

        panel
            .querySelector('#rs-stone-text')
            .textContent =
                `${formatNumber(stone)} / ` +
                `${formatNumber(storage)} ` +
                `(${formatPercent(stonePercent)} %)`;


        setBar(
            panel.querySelector(
                '#rs-stone-bar'
            ),
            stonePercent
        );


        // ========================================================
        // IRON
        // ========================================================

        panel
            .querySelector('#rs-iron-text')
            .textContent =
                `${formatNumber(iron)} / ` +
                `${formatNumber(storage)} ` +
                `(${formatPercent(ironPercent)} %)`;


        setBar(
            panel.querySelector(
                '#rs-iron-bar'
            ),
            ironPercent
        );


        // ========================================================
        // TOTAL
        // ========================================================

        panel
            .querySelector('#rs-current-total')
            .textContent =
                `${formatNumber(currentTotal)} / ` +
                `${formatNumber(maxTotal)}`;


        panel
            .querySelector('#rs-current-percent')
            .textContent =
                `${formatPercent(totalPercent)} %`;


        panel
            .querySelector('#rs-free-space')
            .textContent =
                formatNumber(freeSpace);


        renderPackages();
    }


    // ============================================================
    // PACKAGES
    // ============================================================

    function renderPackages() {

        let percentage =
            parseFloat(
                percentInput.value
            );


        if (!Number.isFinite(percentage)) {
            percentage = 0;
        }


        percentage =
            clamp(
                percentage,
                0,
                100
            );


        const storage =
            DATA.storage;


        const maxTotal =
            storage * 3;


        // ========================================================
        // PACKAGE AMOUNT
        // ========================================================

        const packageEach =
            storage *
            (percentage / 100);


        const packageTotal =
            packageEach * 3;


        // ========================================================
        // AFTER PACKAGES
        // ========================================================

        const afterWood =
            DATA.wood +
            packageEach;


        const afterStone =
            DATA.stone +
            packageEach;


        const afterIron =
            DATA.iron +
            packageEach;


        const afterTotal =
            afterWood +
            afterStone +
            afterIron;


        // ========================================================
        // PERCENTAGES
        // ========================================================

        const woodPercent =
            storage > 0
                ? (afterWood / storage) * 100
                : 0;


        const stonePercent =
            storage > 0
                ? (afterStone / storage) * 100
                : 0;


        const ironPercent =
            storage > 0
                ? (afterIron / storage) * 100
                : 0;


        const totalPercent =
            maxTotal > 0
                ? (afterTotal / maxTotal) * 100
                : 0;


        // ========================================================
        // OVERFLOW
        // ========================================================

        const overflowWood =
            Math.max(
                0,
                afterWood - storage
            );


        const overflowStone =
            Math.max(
                0,
                afterStone - storage
            );


        const overflowIron =
            Math.max(
                0,
                afterIron - storage
            );


        const totalOverflow =
            overflowWood +
            overflowStone +
            overflowIron;


        // ========================================================
        // DISPLAY
        // ========================================================

        panel
            .querySelector('#rs-package-each')
            .textContent =
                formatNumber(packageEach);


        panel
            .querySelector('#rs-package-total')
            .textContent =
                formatNumber(packageTotal);


        panel
            .querySelector('#rs-after-wood')
            .textContent =
                `${formatNumber(afterWood)} ` +
                `(${formatPercent(woodPercent)} %)`;


        panel
            .querySelector('#rs-after-stone')
            .textContent =
                `${formatNumber(afterStone)} ` +
                `(${formatPercent(stonePercent)} %)`;


        panel
            .querySelector('#rs-after-iron')
            .textContent =
                `${formatNumber(afterIron)} ` +
                `(${formatPercent(ironPercent)} %)`;


        panel
            .querySelector('#rs-after-total')
            .textContent =
                `${formatNumber(afterTotal)} / ` +
                `${formatNumber(maxTotal)}`;


        panel
            .querySelector('#rs-after-percent')
            .textContent =
                `${formatPercent(totalPercent)} %`;


        const overflowElement =
            panel.querySelector(
                '#rs-overflow'
            );


        overflowElement.textContent =
            formatNumber(totalOverflow);


        overflowElement.classList.toggle(
            'rs-overflow',
            totalOverflow > 0
        );


        overflowElement.classList.toggle(
            'rs-good',
            totalOverflow === 0
        );


        // ========================================================
        // BARS
        // ========================================================

        setBar(
            panel.querySelector(
                '#rs-after-wood-bar'
            ),
            woodPercent
        );


        setBar(
            panel.querySelector(
                '#rs-after-stone-bar'
            ),
            stonePercent
        );


        setBar(
            panel.querySelector(
                '#rs-after-iron-bar'
            ),
            ironPercent
        );
    }


    // ============================================================
    // FIND PRODUCTION TABLE
    // ============================================================

    function findProductionTable(doc) {

        const tables =
            [...doc.querySelectorAll('table')];


        console.log(
            `[${SCRIPT_NAME}] Počet tabuliek:`,
            tables.length
        );


        // Najprv podľa resource elementov
        for (const table of tables) {

            const wood =
                table.querySelector(
                    '.res.wood, span.wood'
                );


            const stone =
                table.querySelector(
                    '.res.stone, span.stone'
                );


            const iron =
                table.querySelector(
                    '.res.iron, span.iron'
                );


            if (
                wood &&
                stone &&
                iron
            ) {

                console.log(
                    `[${SCRIPT_NAME}] ` +
                    `Tabuľka produkcie nájdená podľa surovín.`
                );


                return table;
            }
        }


        // Fallback podľa textu
        for (const table of tables) {

            const text =
                table
                    .textContent
                    .toLowerCase();


            if (
                text.includes('suroviny') &&
                text.includes('sklad')
            ) {

                console.log(
                    `[${SCRIPT_NAME}] ` +
                    `Tabuľka produkcie nájdená podľa hlavičky.`
                );


                return table;
            }
        }


        return null;
    }


    // ============================================================
    // FIND STORAGE INDEX
    // ============================================================

    function findStorageIndex(table) {

        const rows =
            [...table.querySelectorAll('tr')];


        for (const row of rows) {

            const cells =
                [...row.children];


            for (
                let i = 0;
                i < cells.length;
                i++
            ) {

                const text =
                    cells[i]
                        .textContent
                        .trim()
                        .toLowerCase();


                if (
                    text === 'sklad' ||
                    text.startsWith('sklad ')
                ) {

                    console.log(
                        `[${SCRIPT_NAME}] ` +
                        `Stĺpec Sklad index:`,
                        i
                    );


                    return i;
                }
            }
        }


        return -1;
    }


    // ============================================================
    // PARSE TABLE
    // ============================================================

    function parseProductionTable(table) {

        let villages = 0;

        let totalStorage = 0;

        let totalWood = 0;
        let totalStone = 0;
        let totalIron = 0;


        const storageIndex =
            findStorageIndex(
                table
            );


        if (storageIndex === -1) {

            throw new Error(
                'Nepodarilo sa nájsť stĺpec Sklad.'
            );
        }


        const rows =
            [...table.querySelectorAll('tr')];


        console.log(
            `[${SCRIPT_NAME}] ` +
            `Počet TR riadkov:`,
            rows.length
        );


        for (const row of rows) {

            // ====================================================
            // RESOURCES
            // ====================================================

            const woodEl =
                row.querySelector(
                    '.res.wood, span.wood'
                );


            const stoneEl =
                row.querySelector(
                    '.res.stone, span.stone'
                );


            const ironEl =
                row.querySelector(
                    '.res.iron, span.iron'
                );


            if (
                !woodEl ||
                !stoneEl ||
                !ironEl
            ) {
                continue;
            }


            // ====================================================
            // CELLS
            // ====================================================

            const cells =
                [...row.children];


            if (!cells.length) {
                continue;
            }


            const storageCell =
                cells[storageIndex];


            if (!storageCell) {

                console.warn(
                    `[${SCRIPT_NAME}] ` +
                    `Riadok nemá storage cell.`,
                    row
                );


                continue;
            }


            // ====================================================
            // VALUES
            // ====================================================

            const wood =
                parseGameNumber(
                    woodEl
                );


            const stone =
                parseGameNumber(
                    stoneEl
                );


            const iron =
                parseGameNumber(
                    ironEl
                );


            const storage =
                parseStorageNumber(
                    storageCell.textContent
                );


            if (storage <= 0) {

                console.warn(
                    `[${SCRIPT_NAME}] ` +
                    `Neplatný sklad:`,
                    storageCell.textContent.trim()
                );


                continue;
            }


            // ====================================================
            // DEBUG FIRST 5
            // ====================================================

            if (villages < 5) {

                console.log(
                    `[${SCRIPT_NAME}] ` +
                    `Dedina ${villages + 1}:`,
                    {
                        wood,
                        stone,
                        iron,
                        storage
                    }
                );
            }


            // ====================================================
            // ADD
            // ====================================================

            villages++;

            totalWood +=
                wood;

            totalStone +=
                stone;

            totalIron +=
                iron;

            totalStorage +=
                storage;
        }


        const result = {

            villages,

            storage:
                totalStorage,

            wood:
                totalWood,

            stone:
                totalStone,

            iron:
                totalIron
        };


        console.log(
            `[${SCRIPT_NAME}] Výsledok parsera:`,
            result
        );


        return result;
    }


    // ============================================================
    // LOAD DATA
    // ============================================================

    async function loadData() {

        statusEl.style.display =
            'block';


        resultsEl.style.display =
            'none';


        statusEl.innerHTML =
            '⏳ Načítavam všetky dediny cez AJAX...';


        try {

            // ====================================================
            // VILLAGE ID
            // ====================================================

            const villageId =
                window.game_data?.village?.id;


            if (!villageId) {

                throw new Error(
                    'Nepodarilo sa zistiť ID aktuálnej dediny.'
                );
            }


            // ====================================================
            // URL
            // ====================================================

            const url =
                `/game.php?village=${encodeURIComponent(villageId)}` +
                `&screen=overview_villages` +
                `&mode=prod` +
                `&page=-1`;


            console.log(
                `[${SCRIPT_NAME}] AJAX URL:`,
                url
            );


            // ====================================================
            // FETCH
            // ====================================================

            const response =
                await fetch(
                    url,
                    {
                        method: 'GET',

                        credentials:
                            'same-origin',

                        headers: {

                            'X-Requested-With':
                                'XMLHttpRequest'
                        }
                    }
                );


            if (!response.ok) {

                throw new Error(
                    `HTTP chyba ${response.status}`
                );
            }


            // ====================================================
            // HTML
            // ====================================================

            const html =
                await response.text();


            console.log(
                `[${SCRIPT_NAME}] AJAX HTML length:`,
                html.length
            );


            // ====================================================
            // PARSER
            // ====================================================

            const parser =
                new DOMParser();


            const doc =
                parser.parseFromString(
                    html,
                    'text/html'
                );


            // ====================================================
            // FIND TABLE
            // ====================================================

            const table =
                findProductionTable(
                    doc
                );


            if (!table) {

                throw new Error(
                    'Nepodarilo sa nájsť tabuľku produkcie.'
                );
            }


            // ====================================================
            // PARSE
            // ====================================================

            const parsed =
                parseProductionTable(
                    table
                );


            if (!parsed.villages) {

                throw new Error(
                    'Nenašla sa žiadna dedina.'
                );
            }


            // ====================================================
            // SAVE
            // ====================================================

            DATA =
                parsed;


            console.log(
                `[${SCRIPT_NAME}] FINÁLNE DÁTA:`,
                DATA
            );


            // ====================================================
            // SUCCESS
            // ====================================================

            statusEl.innerHTML =
                `✅ Načítaných dedín: ` +
                `<b>${formatNumber(DATA.villages)}</b>`;


            resultsEl.style.display =
                'block';


            renderCurrentData();


        } catch (error) {

            console.error(
                `[${SCRIPT_NAME}]`,
                error
            );


            statusEl.innerHTML =
                `❌ Chyba: ` +
                `<b>${error.message}</b>`;


            resultsEl.style.display =
                'block';
        }
    }


    // ============================================================
    // EVENTS
    // ============================================================

    closeButton.addEventListener(
        'click',
        () => {

            panel.remove();

        }
    );


    refreshButton.addEventListener(
        'click',
        () => {

            loadData();

        }
    );


    slider.addEventListener(
        'input',
        () => {

            percentInput.value =
                slider.value;


            renderPackages();

        }
    );


    percentInput.addEventListener(
        'input',
        () => {

            let value =
                parseFloat(
                    percentInput.value
                );


            if (!Number.isFinite(value)) {
                value = 0;
            }


            value =
                clamp(
                    value,
                    0,
                    100
                );


            slider.value =
                value;


            renderPackages();

        }
    );


    // ============================================================
    // DRAG PANEL
    // ============================================================

    const header =
        panel.querySelector(
            '.rs-header'
        );


    let dragging = false;

    let offsetX = 0;
    let offsetY = 0;


    header.addEventListener(
        'mousedown',
        event => {

            if (
                event.target.closest(
                    '.rs-close'
                )
            ) {
                return;
            }


            dragging = true;


            const rect =
                panel.getBoundingClientRect();


            offsetX =
                event.clientX -
                rect.left;


            offsetY =
                event.clientY -
                rect.top;


            // Po začatí presúvania zrušíme
            // centering transform.
            panel.style.transform =
                'none';


            panel.style.left =
                `${rect.left}px`;


            panel.style.top =
                `${rect.top}px`;


            event.preventDefault();

        }
    );


    document.addEventListener(
        'mousemove',
        event => {

            if (!dragging) {
                return;
            }


            let left =
                event.clientX -
                offsetX;


            let top =
                event.clientY -
                offsetY;


            left =
                clamp(
                    left,
                    0,
                    window.innerWidth -
                    panel.offsetWidth
                );


            top =
                clamp(
                    top,
                    0,
                    window.innerHeight -
                    40
                );


            panel.style.left =
                `${left}px`;


            panel.style.top =
                `${top}px`;

        }
    );


    document.addEventListener(
        'mouseup',
        () => {

            dragging = false;

        }
    );


    // ============================================================
    // START
    // ============================================================

    console.log(
        `${SCRIPT_NAME} v${VERSION} Wide spustený.`
    );


    loadData();

})();
