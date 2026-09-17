(() => {
'use strict';

/*
=====================================================================
👑 NOBLE ROTATION v1.5.2
=====================================================================

v1.5.2:
- FIX: neznáma oddanosť (?) NIE JE prevzatá dedina.
- null / undefined / "" sa nikdy nesmie zmeniť cez Number() na 0.
- PREVZATÁ iba pri SKUTOČNE známej loyalty <= 0.
- SMART môže normálne začať útok na cieľ bez predchádzajúceho reportu.
- Po prvom dopade čaká na nový noble report.
- Opravuje starý chybný conquered stav pri ?.

v1.5.1:
- Ak pri START nie je doma noble/ram alebo escort,
  skript zostáva BEŽAŤ.
- Kontrola každých 10–20 sekúnd.

SMART:
- Max útokov / cieľ = bezpečnostné maximum.
- Na jeden cieľ neposiela ďalší noble naslepo.
- Po dopade načíta NOVÝ report.
- Loyalty > 0 = pokračuje.
- Loyalty <= 0 = PREVZATÁ.
=====================================================================
*/

const VERSION = '1.5.2';

const CONFIG = {
    UNIT_INFO_URL: '/interface.php?func=get_unit_info',

    FALLBACK_SNOB_SPEED: 34.398034398034,
    FALLBACK_RAM_SPEED: 29.484029484029,

    DEFAULT_AXE: 20,
    DEFAULT_LIGHT: 0,
    DEFAULT_ATTACKS_PER_TARGET: 4,

    DEFAULT_DELAY_MIN: 5,
    DEFAULT_DELAY_MAX: 60,

    RETRY_MIN: 10,
    RETRY_MAX: 20,

    REQUEST_DELAY_MIN: 600,
    REQUEST_DELAY_MAX: 1200,

    LOYALTY_REGEN_PER_HOUR: 1.1,

    REPORT_MAX_PAGES: 20,
    REPORT_REQUEST_DELAY_MIN: 180,
    REPORT_REQUEST_DELAY_MAX: 350
};

const STORAGE_KEY = 'NOBLE_ROTATION_V1_2_1';
const UI_STORAGE_KEY = 'NOBLE_ROTATION_UI_V1_3';

let running = false;
let busy = false;

let schedulerTimer = null;
let uiTimer = null;

let waitingInitialDistribution = false;
let initialRetryAt = null;

let state = loadState() || createDefaultState();
let uiState = loadUIState();

/*
=====================================================================
BASIC STATE
=====================================================================
*/

function createDefaultState() {
    return {
        version: VERSION,

        settings: {
            axe: CONFIG.DEFAULT_AXE,
            light: CONFIG.DEFAULT_LIGHT,

            attacksPerTarget:
                CONFIG.DEFAULT_ATTACKS_PER_TARGET,

            minReturnDelay:
                CONFIG.DEFAULT_DELAY_MIN,

            maxReturnDelay:
                CONFIG.DEFAULT_DELAY_MAX,

            dryRun: true,
            ramTest: false,
            smartMode: false,

            unitSpeed:
                CONFIG.FALLBACK_SNOB_SPEED,

            unitSpeedSource:
                'fallback'
        },

        targets: [],
        slots: [],
        log: []
    };
}

function createDefaultUIState() {
    return {
        left: null,
        top: 65,
        minimized: false
    };
}

/*
=====================================================================
v1.5.2 - STRICT LOYALTY HELPERS
=====================================================================

Toto je dôležitá oprava.

Number(null) === 0

Preto NIKDY nesmieme iba spraviť:

Number(target.loyalty) <= 0

bez toho, aby sme najskôr overili,
že loyalty skutočne existuje.
=====================================================================
*/

function hasRealLoyalty(target) {
    if (!target) {
        return false;
    }

    if (
        target.loyaltyKnown !== true
    ) {
        return false;
    }

    if (
        target.loyalty === null ||
        target.loyalty === undefined ||
        target.loyalty === ''
    ) {
        return false;
    }

    return Number.isFinite(
        Number(target.loyalty)
    );
}

function isTargetReallyConquered(target) {
    return (
        hasRealLoyalty(target) &&
        Number(target.loyalty) <= 0
    );
}

function normalizeTargetConqueredState(target) {
    if (!target) {
        return;
    }

    /*
    ? = NEZNÁMA oddanosť.

    Taká dedina NESMIE byť conquered.
    */
    if (!hasRealLoyalty(target)) {
        target.conquered = false;

        /*
        Oprava starého v1.5.1 stavu:
        ak bol cieľ omylom finished kvôli
        null -> 0, odblokujeme ho.

        Samozrejme iba pokiaľ ešte nevyčerpal
        maximum útokov.
        */
        if (
            Number(target.sent || 0) <
            Number(target.wanted || 0)
        ) {
            target.finished = false;
        }

        return;
    }

    if (
        Number(target.loyalty) <= 0
    ) {
        target.conquered = true;
        target.finished = true;
        target.waitingForLoyalty = false;

        return;
    }

    target.conquered = false;
}

/*
=====================================================================
STORAGE
=====================================================================
*/

function saveState() {
    try {
        state.version = VERSION;

        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(state)
        );

    } catch (e) {
        console.error(
            '[Noble Rotation] localStorage:',
            e
        );
    }
}

function loadState() {
    try {
        const raw =
            localStorage.getItem(
                STORAGE_KEY
            );

        if (!raw) {
            return null;
        }

        const loaded =
            JSON.parse(raw);

        loaded.version =
            VERSION;

        loaded.settings =
            loaded.settings || {};

        if (
            typeof loaded.settings.smartMode !==
            'boolean'
        ) {
            loaded.settings.smartMode =
                false;
        }

        loaded.targets =
            Array.isArray(loaded.targets)
                ? loaded.targets
                : [];

        loaded.targets =
            loaded.targets.map(
                target => {
                    /*
                    Dôležité:
                    loyalty najskôr overujeme
                    BEZ Number(null).
                    */
                    const rawLoyalty =
                        target.loyalty;

                    const loyaltyExists =
                        rawLoyalty !== null &&
                        rawLoyalty !== undefined &&
                        rawLoyalty !== '' &&
                        Number.isFinite(
                            Number(rawLoyalty)
                        );

                    const loyaltyKnown =
                        target.loyaltyKnown === true &&
                        loyaltyExists;

                    const normalized = {
                        ...target,

                        sent:
                            Number.isFinite(
                                Number(target.sent)
                            )
                                ? Number(target.sent)
                                : 0,

                        wanted:
                            Number.isFinite(
                                Number(target.wanted)
                            )
                                ? Number(target.wanted)
                                : Number(
                                    loaded.settings
                                        .attacksPerTarget ||
                                    CONFIG
                                        .DEFAULT_ATTACKS_PER_TARGET
                                ),

                        loyalty:
                            loyaltyKnown
                                ? Number(rawLoyalty)
                                : null,

                        loyaltyKnown,

                        loyaltyReportTime:
                            loyaltyKnown &&
                            target.loyaltyReportTime !== null &&
                            target.loyaltyReportTime !== undefined &&
                            Number.isFinite(
                                Number(
                                    target.loyaltyReportTime
                                )
                            )
                                ? Number(
                                    target.loyaltyReportTime
                                )
                                : null,

                        loyaltyReportId:
                            loyaltyKnown
                                ? (
                                    target.loyaltyReportId ||
                                    null
                                )
                                : null,

                        loyaltyReportUrl:
                            loyaltyKnown
                                ? (
                                    target.loyaltyReportUrl ||
                                    null
                                )
                                : null,

                        loyaltyLoading: false,

                        loyaltyError:
                            target.loyaltyError ||
                            null,

                        waitingForLoyalty:
                            Boolean(
                                target.waitingForLoyalty
                            ),

                        finished:
                            Boolean(
                                target.finished
                            ),

                        conquered: false
                    };

                    /*
                    STRICT:
                    conquered iba pri reálnej
                    loyalty <= 0.
                    */
                    if (
                        loyaltyKnown &&
                        Number(
                            normalized.loyalty
                        ) <= 0
                    ) {
                        normalized.conquered =
                            true;

                        normalized.finished =
                            true;

                        normalized.waitingForLoyalty =
                            false;

                    } else {
                        normalized.conquered =
                            false;

                        /*
                        Automatická oprava bugu
                        z predchádzajúcej verzie.

                        Ak je loyalty ?, ale target
                        bol uložený ako finished,
                        znovu ho aktivujeme, pokiaľ
                        ešte má útoky k dispozícii.
                        */
                        if (
                            !loyaltyKnown &&
                            normalized.sent <
                            normalized.wanted
                        ) {
                            normalized.finished =
                                false;
                        }
                    }

                    return normalized;
                }
            );

        loaded.slots =
            Array.isArray(loaded.slots)
                ? loaded.slots
                : [];

        loaded.log =
            Array.isArray(loaded.log)
                ? loaded.log
                : [];

        return loaded;

    } catch (e) {
        console.error(
            '[Noble Rotation] Storage:',
            e
        );

        return null;
    }
}

function resetState() {
    localStorage.removeItem(
        STORAGE_KEY
    );

    state =
        createDefaultState();

    waitingInitialDistribution =
        false;

    initialRetryAt =
        null;

    saveState();
    render();
}

function saveUIState() {
    try {
        localStorage.setItem(
            UI_STORAGE_KEY,
            JSON.stringify(uiState)
        );

    } catch (e) {
        console.error(
            '[Noble Rotation] UI storage:',
            e
        );
    }
}

function loadUIState() {
    try {
        const raw =
            localStorage.getItem(
                UI_STORAGE_KEY
            );

        if (!raw) {
            return createDefaultUIState();
        }

        return {
            ...createDefaultUIState(),
            ...JSON.parse(raw)
        };

    } catch (_) {
        return createDefaultUIState();
    }
}

/*
=====================================================================
GENERAL HELPERS
=====================================================================
*/

function sleep(ms) {
    return new Promise(
        resolve =>
            setTimeout(resolve, ms)
    );
}

function randomInt(min, max) {
    min =
        Math.ceil(Number(min));

    max =
        Math.floor(Number(max));

    if (max < min) {
        max = min;
    }

    return (
        Math.floor(
            Math.random() *
            (max - min + 1)
        ) + min
    );
}

function uid() {
    return (
        Date.now().toString(36) +
        '-' +
        Math.random()
            .toString(36)
            .slice(2)
    );
}

function formatClock(timestamp) {
    if (!timestamp) {
        return '-';
    }

    return new Date(
        timestamp
    ).toLocaleString();
}

function formatDuration(seconds) {
    if (
        seconds === null ||
        seconds === undefined ||
        !Number.isFinite(
            Number(seconds)
        )
    ) {
        return '-';
    }

    seconds =
        Math.max(
            0,
            Math.round(
                Number(seconds)
            )
        );

    const hours =
        Math.floor(
            seconds / 3600
        );

    const minutes =
        Math.floor(
            (seconds % 3600) / 60
        );

    const secs =
        seconds % 60;

    return (
        String(hours)
            .padStart(2, '0') +
        ':' +
        String(minutes)
            .padStart(2, '0') +
        ':' +
        String(secs)
            .padStart(2, '0')
    );
}

function formatCountdown(timestamp) {
    if (!timestamp) {
        return '-';
    }

    const diff =
        Math.ceil(
            (
                timestamp -
                Date.now()
            ) / 1000
        );

    if (diff <= 0) {
        return 'PRIPRAVENÝ';
    }

    return formatDuration(diff);
}

function escapeHtml(text) {
    const div =
        document.createElement(
            'div'
        );

    div.textContent =
        String(text);

    return div.innerHTML;
}

function parseCoords(text) {
    const match =
        String(text)
            .trim()
            .match(
                /^(\d{1,3})\|(\d{1,3})$/
            );

    if (!match) {
        return null;
    }

    return {
        x: Number(match[1]),
        y: Number(match[2]),

        coords:
            `${match[1]}|${match[2]}`
    };
}

function getRotationUnit() {
    return state.settings.ramTest
        ? 'ram'
        : 'snob';
}

function getRotationUnitName() {
    return state.settings.ramTest
        ? 'RAM'
        : 'NOBLE';
}

function log(
    message,
    type = 'info'
) {
    const item = {
        time: Date.now(),
        message,
        type
    };

    state.log.unshift(item);

    if (
        state.log.length > 200
    ) {
        state.log.length = 200;
    }

    saveState();

    console.log(
        '[Noble Rotation]',
        message
    );

    renderLog();
    updateLiveUI();
}

function getVillageId() {
    if (
        typeof game_data !==
            'undefined' &&
        game_data?.village?.id
    ) {
        return Number(
            game_data.village.id
        );
    }

    const params =
        new URLSearchParams(
            location.search
        );

    return Number(
        params.get('village')
    );
}

function getSourceCoords() {
    if (
        typeof game_data !==
            'undefined' &&
        game_data?.village?.coord
    ) {
        const parsed =
            parseCoords(
                game_data.village.coord
            );

        if (parsed) {
            return parsed;
        }
    }

    if (
        typeof game_data !==
            'undefined' &&
        game_data?.village?.x !==
            undefined &&
        game_data?.village?.y !==
            undefined
    ) {
        return {
            x:
                Number(
                    game_data.village.x
                ),

            y:
                Number(
                    game_data.village.y
                ),

            coords:
                `${game_data.village.x}|${game_data.village.y}`
        };
    }

    const text =
        document.body?.innerText ||
        '';

    const villageName =
        typeof game_data !==
            'undefined'
            ? game_data?.village?.name
            : null;

    if (villageName) {
        const escapedName =
            villageName.replace(
                /[.*+?^${}()|[\]\\]/g,
                '\\$&'
            );

        const regex =
            new RegExp(
                escapedName +
                '[\\s\\S]{0,100}?' +
                '\\((\\d{1,3})\\|' +
                '(\\d{1,3})\\)'
            );

        const match =
            text.match(regex);

        if (match) {
            return {
                x: Number(match[1]),
                y: Number(match[2]),

                coords:
                    `${match[1]}|${match[2]}`
            };
        }
    }

    return null;
}

async function fetchHtml(
    url,
    options = {}
) {
    const response =
        await fetch(
            url,
            {
                credentials:
                    'same-origin',

                ...options
            }
        );

    if (!response.ok) {
        throw new Error(
            `HTTP ${response.status}`
        );
    }

    const html =
        await response.text();

    const doc =
        new DOMParser()
            .parseFromString(
                html,
                'text/html'
            );

    return {
        response,
        html,
        doc
    };
}

/*
=====================================================================
LOYALTY
=====================================================================
*/

function getEstimatedLoyalty(
    target,
    now = Date.now()
) {
    /*
    v1.5.2:
    žiadny Number(null).
    */
    if (
        !hasRealLoyalty(target) ||
        target.loyaltyReportTime === null ||
        target.loyaltyReportTime === undefined ||
        !Number.isFinite(
            Number(
                target.loyaltyReportTime
            )
        )
    ) {
        return null;
    }

    const base =
        Number(target.loyalty);

    /*
    0 alebo mínus = prevzatá.
    Už neregenerujeme.
    */
    if (base <= 0) {
        return base;
    }

    const elapsedHours =
        Math.max(
            0,
            (
                now -
                Number(
                    target.loyaltyReportTime
                )
            ) /
            3600000
        );

    return Math.min(
        100,

        base +
        elapsedHours *
        CONFIG.LOYALTY_REGEN_PER_HOUR
    );
}

function getDisplayedLoyalty(
    target,
    now = Date.now()
) {
    const exact =
        getEstimatedLoyalty(
            target,
            now
        );

    return exact === null
        ? null
        : Math.round(exact);
}

function parseReportTime(
    text,
    now = new Date()
) {
    const raw =
        String(text || '')
            .replace(
                /\s+/g,
                ' '
            )
            .trim()
            .toLowerCase();

    if (!raw) {
        return null;
    }

    const timeMatch =
        raw.match(
            /(\d{1,2}):(\d{2})/
        );

    if (!timeMatch) {
        return null;
    }

    const hour =
        Number(timeMatch[1]);

    const minute =
        Number(timeMatch[2]);

    if (
        hour > 23 ||
        minute > 59
    ) {
        return null;
    }

    if (
        /\b(dnes|today)\b/.test(
            raw
        )
    ) {
        const d =
            new Date(now);

        d.setHours(
            hour,
            minute,
            0,
            0
        );

        return d.getTime();
    }

    if (
        /\b(včera|vcera|yesterday)\b/.test(
            raw
        )
    ) {
        const d =
            new Date(now);

        d.setDate(
            d.getDate() - 1
        );

        d.setHours(
            hour,
            minute,
            0,
            0
        );

        return d.getTime();
    }

    const months = {
        jan: 0,
        january: 0,
        január: 0,
        januar: 0,

        feb: 1,
        february: 1,
        február: 1,
        februar: 1,

        mar: 2,
        march: 2,
        marec: 2,

        apr: 3,
        april: 3,
        apríl: 3,

        may: 4,
        máj: 4,
        maj: 4,

        jun: 5,
        june: 5,
        jún: 5,

        jul: 6,
        july: 6,
        júl: 6,

        aug: 7,
        august: 7,

        sep: 8,
        sept: 8,
        september: 8,

        oct: 9,
        october: 9,
        okt: 9,
        október: 9,
        oktober: 9,

        nov: 10,
        november: 10,

        dec: 11,
        december: 11
    };

    let day = null;
    let month = null;

    let year =
        now.getFullYear();

    let m =
        raw.match(
            /([a-záäčďéíĺľňóôŕšťúýž]+)\s+(\d{1,2})(?:,\s*(\d{4}))?\s*,?\s*\d{1,2}:\d{2}/i
        );

    if (m) {
        month =
            months[
                m[1].toLowerCase()
            ];

        day =
            Number(m[2]);

        if (m[3]) {
            year =
                Number(m[3]);
        }
    }

    if (
        month === null ||
        month === undefined
    ) {
        m =
            raw.match(
                /(\d{1,2})[.\s]+([a-záäčďéíĺľňóôŕšťúýž]+)(?:[.\s]+(\d{4}))?.*?(\d{1,2}):(\d{2})/i
            );

        if (m) {
            day =
                Number(m[1]);

            month =
                months[
                    m[2].toLowerCase()
                ];

            if (m[3]) {
                year =
                    Number(m[3]);
            }
        }
    }

    if (
        !Number.isFinite(day) ||
        month === null ||
        month === undefined
    ) {
        return null;
    }

    let d =
        new Date(
            year,
            month,
            day,
            hour,
            minute,
            0,
            0
        );

    if (
        d.getTime() >
        now.getTime() +
        2 * 86400000
    ) {
        d =
            new Date(
                year - 1,
                month,
                day,
                hour,
                minute,
                0,
                0
            );
    }

    return Number.isFinite(
        d.getTime()
    )
        ? d.getTime()
        : null;
}

function getReportTargetCoords(row) {
    const subject =
        row.querySelector(
            '.report-subject'
        ) || row;

    const text =
        subject.textContent ||
        '';

    const coords = [
        ...text.matchAll(
            /\((\d{1,3})\|(\d{1,3})\)/g
        )
    ];

    if (!coords.length) {
        return null;
    }

    const last =
        coords[
            coords.length - 1
        ];

    return (
        `${last[1]}|${last[2]}`
    );
}

function isNobleReportRow(row) {
    return Boolean(
        row.querySelector(
            'img[src*="/command/snob."], ' +
            'img[src*="/command/snob/"]'
        )
    );
}

function getReportTimeFromRow(row) {
    const cells = [
        ...row.querySelectorAll(
            'td.nowrap'
        )
    ];

    for (
        let i =
            cells.length - 1;
        i >= 0;
        i--
    ) {
        const timestamp =
            parseReportTime(
                cells[i].textContent
            );

        if (timestamp) {
            return timestamp;
        }
    }

    const allCells = [
        ...row.querySelectorAll(
            'td'
        )
    ];

    for (
        let i =
            allCells.length - 1;
        i >= 0;
        i--
    ) {
        const timestamp =
            parseReportTime(
                allCells[i].textContent
            );

        if (timestamp) {
            return timestamp;
        }
    }

    return null;
}

function extractReportCandidates(
    doc,
    wantedCoords
) {
    const result = [];
    const seen = new Set();

    const links = [
        ...doc.querySelectorAll(
            'a.report-link' +
            '[href*="screen=report"]' +
            '[href*="view="]'
        )
    ];

    for (
        const link
        of links
    ) {
        const row =
            link.closest('tr');

        if (
            !row ||
            !isNobleReportRow(row)
        ) {
            continue;
        }

        const coords =
            getReportTargetCoords(
                row
            );

        if (
            !coords ||
            (
                wantedCoords &&
                !wantedCoords.has(
                    coords
                )
            )
        ) {
            continue;
        }

        const href =
            new URL(
                link.getAttribute(
                    'href'
                ),
                location.origin
            ).href;

        const url =
            new URL(href);

        const reportId =
            url.searchParams.get(
                'view'
            );

        const reportTime =
            getReportTimeFromRow(
                row
            );

        const key =
            reportId || href;

        if (seen.has(key)) {
            continue;
        }

        seen.add(key);

        result.push({
            coords,
            href,
            reportId,
            reportTime
        });
    }

    return result;
}

function parseLoyaltyFromReport(doc) {
    const rows = [
        ...doc.querySelectorAll(
            'tr'
        )
    ];

    for (
        const row
        of rows
    ) {
        const header =
            row.querySelector(
                'th'
            );

        if (!header) {
            continue;
        }

        const title =
            String(
                header.textContent ||
                ''
            )
                .replace(
                    /\s+/g,
                    ' '
                )
                .trim()
                .toLowerCase();

        if (
            !title.includes(
                'oddanosť'
            ) &&
            !title.includes(
                'oddanost'
            )
        ) {
            continue;
        }

        const boldValues = [
            ...row.querySelectorAll(
                'b'
            )
        ]
            .map(
                node => {
                    const raw =
                        String(
                            node.textContent ||
                            ''
                        )
                            .replace(
                                ',',
                                '.'
                            )
                            .replace(
                                /[^0-9.-]/g,
                                ''
                            );

                    if (
                        raw === '' ||
                        raw === '-' ||
                        raw === '.'
                    ) {
                        return null;
                    }

                    const number =
                        Number(raw);

                    return Number.isFinite(
                        number
                    )
                        ? number
                        : null;
                }
            )
            .filter(
                value =>
                    value !== null
            );

        if (
            boldValues.length
        ) {
            return boldValues[
                boldValues.length - 1
            ];
        }

        const cell =
            row.querySelector(
                'td'
            );

        const numbers =
            String(
                cell?.textContent ||
                ''
            ).match(
                /-?\d+(?:[.,]\d+)?/g
            );

        if (
            numbers &&
            numbers.length
        ) {
            const raw =
                numbers[
                    numbers.length - 1
                ].replace(
                    ',',
                    '.'
                );

            const value =
                Number(raw);

            if (
                Number.isFinite(
                    value
                )
            ) {
                return value;
            }
        }
    }

    /*
    null znamená:
    hodnota nebola zistená.

    NIKDY to neznamená 0.
    */
    return null;
}

async function findLatestNobleReports(
    coordsList
) {
    const wanted =
        new Set(coordsList);

    const found =
        new Map();

    const villageId =
        getVillageId();

    if (
        !villageId ||
        !wanted.size
    ) {
        return found;
    }

    for (
        let page = 0;
        page <
        CONFIG.REPORT_MAX_PAGES;
        page++
    ) {
        let url =
            `/game.php?village=${villageId}` +
            `&screen=report` +
            `&mode=all` +
            `&group_id=0`;

        if (page > 0) {
            url +=
                `&page=${page}`;
        }

        const {doc} =
            await fetchHtml(
                url,
                {
                    cache:
                        'no-store'
                }
            );

        const candidates =
            extractReportCandidates(
                doc,
                wanted
            );

        if (
            !candidates.length &&
            page > 0
        ) {
            break;
        }

        for (
            const candidate
            of candidates
        ) {
            const previous =
                found.get(
                    candidate.coords
                );

            if (
                !previous ||
                (
                    candidate.reportTime &&
                    (
                        !previous.reportTime ||
                        candidate.reportTime >
                        previous.reportTime
                    )
                )
            ) {
                found.set(
                    candidate.coords,
                    candidate
                );
            }
        }

        if (
            [...wanted].every(
                coords =>
                    found.has(coords)
            )
        ) {
            break;
        }

        const hasNext = [
            ...doc.querySelectorAll(
                'a[href*="screen=report"]'
            )
        ].some(
            a => {
                try {
                    const u =
                        new URL(
                            a.getAttribute(
                                'href'
                            ),
                            location.origin
                        );

                    return (
                        Number(
                            u.searchParams.get(
                                'page'
                            )
                        ) ===
                        page + 1
                    );

                } catch (_) {
                    return false;
                }
            }
        );

        if (!hasNext) {
            break;
        }

        await sleep(
            randomInt(
                CONFIG
                    .REPORT_REQUEST_DELAY_MIN,

                CONFIG
                    .REPORT_REQUEST_DELAY_MAX
            )
        );
    }

    return found;
}

async function applyLoyaltyReport(
    target,
    candidate
) {
    if (
        !target ||
        !candidate
    ) {
        return false;
    }

    const {doc} =
        await fetchHtml(
            candidate.href,
            {
                cache:
                    'no-store'
            }
        );

    const loyalty =
        parseLoyaltyFromReport(
            doc
        );

    /*
    STRICT v1.5.2:
    null NIE JE 0.
    */
    if (
        loyalty === null ||
        loyalty === undefined ||
        !Number.isFinite(
            Number(loyalty)
        )
    ) {
        throw new Error(
            'Oddanosť v reporte nebola nájdená.'
        );
    }

    const reportTime =
        candidate.reportTime ||
        Date.now();

    target.loyalty =
        Number(loyalty);

    target.loyaltyKnown =
        true;

    target.loyaltyReportTime =
        reportTime;

    target.loyaltyReportId =
        candidate.reportId ||
        null;

    target.loyaltyReportUrl =
        candidate.href;

    target.loyaltyError =
        null;

    /*
    PREVZATÁ iba pri skutočnej
    hodnote <= 0.
    */
    target.conquered =
        Number(loyalty) <= 0;

    if (target.conquered) {
        target.finished =
            true;

        target.waitingForLoyalty =
            false;
    }

    return true;
}

async function refreshLoyalties(
    coordsList = null,
    options = {}
) {
    const {
        silent = false
    } = options;

    const wantedTargets =
        state.targets.filter(
            target =>
                !coordsList ||
                coordsList.includes(
                    target.coords
                )
        );

    if (
        !wantedTargets.length
    ) {
        return;
    }

    for (
        const target
        of wantedTargets
    ) {
        target.loyaltyLoading =
            true;

        target.loyaltyError =
            null;
    }

    saveState();
    renderTargets();

    if (!silent) {
        log(
            `Kontrolujem oddanosť pre ` +
            `${wantedTargets.length} cieľov...`
        );
    }

    try {
        const reportMap =
            await findLatestNobleReports(
                wantedTargets.map(
                    target =>
                        target.coords
                )
            );

        for (
            const target
            of wantedTargets
        ) {
            const candidate =
                reportMap.get(
                    target.coords
                );

            /*
            =========================================================
            ŽIADNY REPORT
            =========================================================

            Toto je hlavná oprava v1.5.2.

            Žiadny report = ?
            NIE = 0
            NIE = conquered
            NIE = finished
            =========================================================
            */
            if (!candidate) {
                target.loyaltyKnown =
                    false;

                target.loyalty =
                    null;

                target.loyaltyReportTime =
                    null;

                target.loyaltyReportId =
                    null;

                target.loyaltyReportUrl =
                    null;

                target.loyaltyError =
                    'Noble report nenájdený';

                target.loyaltyLoading =
                    false;

                target.conquered =
                    false;

                if (
                    Number(
                        target.sent || 0
                    ) <
                    Number(
                        target.wanted || 0
                    )
                ) {
                    target.finished =
                        false;
                }

                continue;
            }

            try {
                await applyLoyaltyReport(
                    target,
                    candidate
                );

                target.loyaltyLoading =
                    false;

                if (!silent) {
                    const displayed =
                        getDisplayedLoyalty(
                            target
                        );

                    log(
                        `${target.coords}: ` +
                        `oddanosť ${displayed} ` +
                        `(report ${target.loyalty}, ` +
                        `${formatClock(
                            target.loyaltyReportTime
                        )})`,
                        'success'
                    );
                }

            } catch (e) {
                /*
                Ak report existuje, ale
                loyalty sa nedá prečítať,
                stále to NESMIE znamenať 0.
                */
                target.loyaltyKnown =
                    false;

                target.loyalty =
                    null;

                target.loyaltyReportTime =
                    null;

                target.loyaltyReportId =
                    null;

                target.loyaltyReportUrl =
                    null;

                target.loyaltyError =
                    e.message;

                target.loyaltyLoading =
                    false;

                target.conquered =
                    false;

                if (
                    Number(
                        target.sent || 0
                    ) <
                    Number(
                        target.wanted || 0
                    )
                ) {
                    target.finished =
                        false;
                }

                if (!silent) {
                    log(
                        `${target.coords}: ` +
                        `loyalty neznáma — ` +
                        `${e.message}`,
                        'warning'
                    );
                }
            }

            saveState();
            renderTargets();

            await sleep(
                randomInt(
                    CONFIG
                        .REPORT_REQUEST_DELAY_MIN,

                    CONFIG
                        .REPORT_REQUEST_DELAY_MAX
                )
            );
        }

    } catch (e) {
        for (
            const target
            of wantedTargets
        ) {
            target.loyaltyLoading =
                false;

            target.loyaltyError =
                e.message;

            /*
            Ani globálna chyba reportov
            nesmie označiť dedinu
            za prevzatú.
            */
            if (
                !hasRealLoyalty(target)
            ) {
                target.conquered =
                    false;
            }
        }

        log(
            `Loyalty kontrola: ` +
            `${e.message}`,
            'error'
        );
    }

    saveState();
    renderTargets();
}

async function refreshTargetLoyalty(
    coords
) {
    await refreshLoyalties(
        [coords]
    );
}

/*
=====================================================================
UNIT SPEED
=====================================================================
*/

async function loadRotationUnitSpeed() {
    const unit =
        getRotationUnit();

    try {
        const response =
            await fetch(
                CONFIG.UNIT_INFO_URL,
                {
                    credentials:
                        'same-origin',

                    cache:
                        'no-store'
                }
            );

        if (!response.ok) {
            throw new Error(
                `HTTP ${response.status}`
            );
        }

        const xmlText =
            await response.text();

        const xml =
            new DOMParser()
                .parseFromString(
                    xmlText,
                    'text/xml'
                );

        if (
            xml.querySelector(
                'parsererror'
            )
        ) {
            throw new Error(
                'XML parser error'
            );
        }

        const speedNode =
            xml.querySelector(
                `${unit} > speed`
            );

        if (!speedNode) {
            throw new Error(
                `${unit} > speed nenájdené`
            );
        }

        const speed =
            Number(
                speedNode.textContent
            );

        if (
            !Number.isFinite(speed) ||
            speed <= 0
        ) {
            throw new Error(
                'Neplatná speed.'
            );
        }

        state.settings.unitSpeed =
            speed;

        state.settings.unitSpeedSource =
            'interface';

        saveState();

        log(
            `${getRotationUnitName()} ` +
            `speed načítaná: ` +
            `${speed.toFixed(6)} min/pole`,
            'success'
        );

        return speed;

    } catch (e) {
        const fallback =
            unit === 'ram'
                ? CONFIG
                    .FALLBACK_RAM_SPEED
                : CONFIG
                    .FALLBACK_SNOB_SPEED;

        state.settings.unitSpeed =
            fallback;

        state.settings.unitSpeedSource =
            'fallback';

        saveState();

        log(
            `${getRotationUnitName()} speed ` +
            `XML zlyhalo. Používam ` +
            `fallback ${fallback}. ` +
            `${e.message}`,
            'warning'
        );

        return fallback;
    }
}

function calculateDistance(
    x1,
    y1,
    x2,
    y2
) {
    return Math.sqrt(
        Math.pow(
            x2 - x1,
            2
        ) +
        Math.pow(
            y2 - y1,
            2
        )
    );
}

function calculateTravel(
    targetCoords
) {
    const source =
        getSourceCoords();

    const target =
        parseCoords(
            targetCoords
        );

    if (!source) {
        throw new Error(
            'Zdrojové coords nenájdené.'
        );
    }

    if (!target) {
        throw new Error(
            `Neplatné coords ` +
            `${targetCoords}`
        );
    }

    const distance =
        calculateDistance(
            source.x,
            source.y,
            target.x,
            target.y
        );

    const speed =
        Number(
            state.settings.unitSpeed
        );

    if (
        !Number.isFinite(speed) ||
        speed <= 0
    ) {
        throw new Error(
            'Neplatná unit speed.'
        );
    }

    const minutes =
        distance * speed;

    const seconds =
        Math.round(
            minutes * 60
        );

    return {
        source:
            source.coords,

        target:
            target.coords,

        distance,
        minutes,
        seconds
    };
}

/*
=====================================================================
RALLY POINT
=====================================================================
*/

async function loadRallyPoint() {
    const villageId =
        getVillageId();

    if (!villageId) {
        throw new Error(
            'Village ID nenájdené.'
        );
    }

    return fetchHtml(
        `/game.php?village=${villageId}` +
        `&screen=place`
    );
}

function getUnitCountFromDoc(
    doc,
    unit
) {
    const input =
        doc.querySelector(
            `#unit_input_${unit}`
        );

    if (!input) {
        return 0;
    }

    const allCount =
        Number(
            input.dataset?.allCount
        );

    if (
        Number.isFinite(allCount)
    ) {
        return allCount;
    }

    const value =
        Number(
            input.getAttribute(
                'data-all-count'
            )
        );

    if (
        Number.isFinite(value)
    ) {
        return value;
    }

    return 0;
}

async function getAvailableUnits() {
    const {doc} =
        await loadRallyPoint();

    return {
        axe:
            getUnitCountFromDoc(
                doc,
                'axe'
            ),

        light:
            getUnitCountFromDoc(
                doc,
                'light'
            ),

        ram:
            getUnitCountFromDoc(
                doc,
                'ram'
            ),

        snob:
            getUnitCountFromDoc(
                doc,
                'snob'
            )
    };
}

function serializeForm(form) {
    const data =
        new FormData();

    const elements =
        form.querySelectorAll(
            'input,select,textarea'
        );

    for (
        const element
        of elements
    ) {
        if (
            !element.name ||
            element.disabled
        ) {
            continue;
        }

        const type =
            String(
                element.type ||
                ''
            ).toLowerCase();

        if (
            type === 'submit' ||
            type === 'button' ||
            type === 'image' ||
            type === 'file'
        ) {
            continue;
        }

        if (
            (
                type === 'checkbox' ||
                type === 'radio'
            ) &&
            !element.checked
        ) {
            continue;
        }

        data.append(
            element.name,
            element.value
        );
    }

    return data;
}

function findServerError(doc) {
    const selectors = [
        '.error',
        '.error_box',
        '.error-box',
        '#error'
    ];

    for (
        const selector
        of selectors
    ) {
        const elements =
            doc.querySelectorAll(
                selector
            );

        for (
            const element
            of elements
        ) {
            const text =
                element.textContent
                    ?.trim();

            if (text) {
                return text;
            }
        }
    }

    return null;
}

async function createConfirmation(
    targetCoords
) {
    const target =
        parseCoords(
            targetCoords
        );

    if (!target) {
        throw new Error(
            `Neplatné coords: ` +
            `${targetCoords}`
        );
    }

    const rally =
        await loadRallyPoint();

    const form =
        rally.doc.querySelector(
            '#command-data-form'
        );

    if (!form) {
        throw new Error(
            'Command form nenájdený.'
        );
    }

    const data =
        serializeForm(form);

    const unitNames = [
        'spear',
        'sword',
        'axe',
        'archer',
        'spy',
        'light',
        'marcher',
        'heavy',
        'ram',
        'catapult',
        'knight',
        'snob'
    ];

    for (
        const unit
        of unitNames
    ) {
        data.set(
            unit,
            '0'
        );
    }

    data.set(
        'axe',
        String(
            state.settings.axe
        )
    );

    data.set(
        'light',
        String(
            state.settings.light
        )
    );

    if (
        state.settings.ramTest
    ) {
        data.set(
            'ram',
            '1'
        );

        data.set(
            'snob',
            '0'
        );

    } else {
        data.set(
            'ram',
            '0'
        );

        data.set(
            'snob',
            '1'
        );
    }

    data.set(
        'x',
        String(target.x)
    );

    data.set(
        'y',
        String(target.y)
    );

    data.set(
        'input',
        target.coords
    );

    data.set(
        'target_type',
        'coord'
    );

    data.set(
        'attack',
        'Útok'
    );

    const action =
        new URL(
            form.getAttribute(
                'action'
            ),
            location.origin
        );

    const response =
        await fetch(
            action.href,
            {
                method:
                    'POST',

                body:
                    data,

                credentials:
                    'same-origin'
            }
        );

    if (!response.ok) {
        throw new Error(
            `Confirmation HTTP ` +
            `${response.status}`
        );
    }

    const html =
        await response.text();

    const doc =
        new DOMParser()
            .parseFromString(
                html,
                'text/html'
            );

    const serverError =
        findServerError(doc);

    if (serverError) {
        throw new Error(
            serverError
        );
    }

    let confirmForm =
        doc.querySelector(
            'form#command-data-form' +
            '[action*="action=command"]'
        );

    if (!confirmForm) {
        confirmForm =
            doc.querySelector(
                'form[action*="action=command"]'
            );
    }

    if (!confirmForm) {
        throw new Error(
            'Server nevrátil finálny ' +
            'confirmation formulár.'
        );
    }

    const xInput =
        confirmForm.querySelector(
            'input[name="x"]'
        );

    const yInput =
        confirmForm.querySelector(
            'input[name="y"]'
        );

    if (
        !xInput ||
        !yInput
    ) {
        throw new Error(
            'Confirmation neobsahuje x/y.'
        );
    }

    const returnedX =
        Number(
            xInput.value
        );

    const returnedY =
        Number(
            yInput.value
        );

    if (
        returnedX !== target.x ||
        returnedY !== target.y
    ) {
        throw new Error(
            `Confirmation target mismatch: ` +
            `${returnedX}|${returnedY} != ` +
            `${target.coords}`
        );
    }

    const chToken =
        confirmForm.querySelector(
            'input[name="ch"]'
        )?.value || null;

    const hToken =
        confirmForm.querySelector(
            'input[name="h"]'
        )?.value || null;

    if (!chToken) {
        console.warn(
            '[Noble Rotation] ' +
            'Confirmation nemá CH token.'
        );
    }

    if (!hToken) {
        console.log(
            '[Noble Rotation] ' +
            'Confirmation nemá samostatný H token.'
        );
    }

    function getConfirmUnit(unit) {
        return Number(
            confirmForm
                .querySelector(
                    `input[name="${unit}"]`
                )
                ?.value || 0
        );
    }

    return {
        target:
            target.coords,

        doc,

        form:
            confirmForm,

        tokens: {
            ch:
                chToken,

            h:
                hToken
        },

        units: {
            axe:
                getConfirmUnit(
                    'axe'
                ),

            light:
                getConfirmUnit(
                    'light'
                ),

            ram:
                getConfirmUnit(
                    'ram'
                ),

            snob:
                getConfirmUnit(
                    'snob'
                )
        }
    };
}

async function submitConfirmation(
    confirmation
) {
    if (
        !confirmation ||
        !confirmation.form
    ) {
        throw new Error(
            'Confirmation formulár chýba.'
        );
    }

    if (state.settings.dryRun) {
        return {
            sent: false,
            dryRun: true
        };
    }

    const form =
        confirmation.form;

    const data =
        serializeForm(form);

    const submit =
        form.querySelector(
            '[name="submit_confirm"]'
        );

    if (submit) {
        data.set(
            'submit_confirm',
            submit.value || 'Odoslať'
        );
    } else {
        data.set(
            'submit_confirm',
            'Odoslať'
        );
    }

    if (!data.has('attack')) {
        data.set(
            'attack',
            'true'
        );
    }

    const action =
        new URL(
            form.getAttribute('action') ||
            location.href,
            location.origin
        );

    const response =
        await fetch(
            action.href,
            {
                method: 'POST',
                body: data,
                credentials: 'same-origin'
            }
        );

    if (!response.ok) {
        throw new Error(
            `Final POST HTTP ${response.status}`
        );
    }

    const html =
        await response.text();

    const doc =
        new DOMParser()
            .parseFromString(
                html,
                'text/html'
            );

    const serverError =
        findServerError(doc);

    if (serverError) {
        throw new Error(
            serverError
        );
    }

    return {
        sent: true,
        dryRun: false,
        doc
    };
}

/*
=====================================================================
SEND ONE
=====================================================================
*/

async function sendOne(
    targetCoords
) {
    const available =
        await getAvailableUnits();

    const rotationUnit =
        getRotationUnit();

    if (
        Number(
            available[rotationUnit]
        ) < 1
    ) {
        return {
            success: false,
            unavailable: true,
            reason:
                `Nie je dostupný ${getRotationUnitName()}.`
        };
    }

    if (
        Number(available.axe) <
        Number(state.settings.axe)
    ) {
        return {
            success: false,
            unavailable: true,
            reason:
                'Nedostatok axe.'
        };
    }

    if (
        Number(available.light) <
        Number(state.settings.light)
    ) {
        return {
            success: false,
            unavailable: true,
            reason:
                'Nedostatok light.'
        };
    }

    const confirmation =
        await createConfirmation(
            targetCoords
        );

    const expected = {
        axe:
            Number(
                state.settings.axe
            ),

        light:
            Number(
                state.settings.light
            ),

        ram:
            state.settings.ramTest
                ? 1
                : 0,

        snob:
            state.settings.ramTest
                ? 0
                : 1
    };

    for (
        const unit of [
            'axe',
            'light',
            'ram',
            'snob'
        ]
    ) {
        if (
            Number(
                confirmation.units[unit]
            ) !==
            Number(
                expected[unit]
            )
        ) {
            throw new Error(
                `Confirmation jednotky nesedia: ` +
                `${unit}=${confirmation.units[unit]}, ` +
                `očakávané ${expected[unit]}.`
            );
        }
    }

    const travel =
        calculateTravel(
            targetCoords
        );

    const result =
        await submitConfirmation(
            confirmation
        );

    return {
        success: true,
        sent: result.sent,
        dryRun: result.dryRun,
        travel
    };
}

/*
=====================================================================
TARGET HELPERS
=====================================================================
*/

function getTarget(coords) {
    return (
        state.targets.find(
            target =>
                target.coords === coords
        ) ||
        null
    );
}

/*
=====================================================================
v1.5.2 - TARGET NEEDS ATTACK
=====================================================================

Najdôležitejšia oprava:

? = neznáma oddanosť.

Taký cieľ je normálne aktívny
a SMART naň môže poslať prvého noble.
=====================================================================
*/

function targetNeedsAttack(target) {
    if (!target) {
        return false;
    }

    /*
    Najskôr opravíme conquered stav
    podľa skutočnej loyalty.
    */
    normalizeTargetConqueredState(
        target
    );

    /*
    Iba reálna loyalty <= 0
    znamená PREVZATÁ.
    */
    if (
        isTargetReallyConquered(
            target
        )
    ) {
        target.conquered =
            true;

        target.finished =
            true;

        target.waitingForLoyalty =
            false;

        return false;
    }

    /*
    Ak loyalty nepoznáme,
    cieľ NESMIE byť conquered.
    */
    if (
        !hasRealLoyalty(
            target
        )
    ) {
        target.conquered =
            false;

        if (
            Number(
                target.sent || 0
            ) <
            Number(
                target.wanted || 0
            )
        ) {
            target.finished =
                false;
        }
    }

    if (
        target.finished ||
        target.conquered
    ) {
        return false;
    }

    /*
    SMART už jeden noble poslal
    a čaká na report.
    */
    if (
        state.settings.smartMode &&
        target.waitingForLoyalty
    ) {
        return false;
    }

    return (
        Number(
            target.sent || 0
        ) <
        Number(
            target.wanted || 0
        )
    );
}

/*
=====================================================================
SLOTS
=====================================================================
*/

function createSlot(
    targetCoords,
    travel
) {
    const sentAt =
        Date.now();

    const impactAt =
        sentAt +
        travel.seconds * 1000;

    const delay =
        randomInt(
            state.settings.minReturnDelay,
            state.settings.maxReturnDelay
        );

    const returnAt =
        sentAt +
        travel.seconds *
        2 *
        1000 +
        delay *
        1000;

    const target =
        getTarget(
            targetCoords
        );

    const slot = {
        id: uid(),

        unit:
            getRotationUnit(),

        target:
            targetCoords,

        sentAt,
        impactAt,
        returnAt,

        travelSeconds:
            travel.seconds,

        distance:
            travel.distance,

        delayAfterReturn:
            delay,

        finished:
            false,

        smart:
            Boolean(
                state.settings.smartMode &&
                !state.settings.ramTest
            ),

        /*
        Ak je loyalty ?, reportBeforeId
        bude jednoducho null.

        To je úplne validný SMART stav.
        */
        reportBeforeId:
            hasRealLoyalty(target)
                ? (
                    target.loyaltyReportId ||
                    null
                )
                : null,

        reportBeforeTime:
            hasRealLoyalty(target)
                ? (
                    target.loyaltyReportTime ||
                    null
                )
                : null,

        reportChecked:
            false,

        waitingForReport:
            false
    };

    state.slots.push(
        slot
    );

    saveState();

    return slot;
}

/*
=====================================================================
SMART MODE
=====================================================================
*/

function isNewReportForSlot(
    candidate,
    slot
) {
    if (
        !candidate ||
        !slot
    ) {
        return false;
    }

    /*
    -------------------------------------------------------------
    MALI SME STARÝ REPORT
    -------------------------------------------------------------
    */
    if (
        candidate.reportId &&
        slot.reportBeforeId &&
        String(candidate.reportId) !==
        String(slot.reportBeforeId)
    ) {
        if (
            candidate.reportTime &&
            candidate.reportTime <
            slot.sentAt - 60000
        ) {
            return false;
        }

        return true;
    }

    /*
    -------------------------------------------------------------
    PRED ÚTOKOM NEBOL ŽIADNY REPORT
    -------------------------------------------------------------

    Presne prípad:
        Oddanosť ?
        Noble report nenájdený

    Prvý report vytvorený po útoku
    je nový SMART report.
    -------------------------------------------------------------
    */
    if (
        !slot.reportBeforeId &&
        candidate.reportTime
    ) {
        return (
            candidate.reportTime >=
            slot.sentAt - 60000
        );
    }

    /*
    Ak nemáme report ID, ale máme
    starý report time, použijeme čas.
    */
    if (
        candidate.reportTime &&
        slot.reportBeforeTime
    ) {
        return (
            candidate.reportTime >
            slot.reportBeforeTime
        );
    }

    return false;
}

async function findSmartReportForSlot(
    slot
) {
    const map =
        await findLatestNobleReports(
            [slot.target]
        );

    const candidate =
        map.get(
            slot.target
        );

    if (!candidate) {
        return null;
    }

    if (
        !isNewReportForSlot(
            candidate,
            slot
        )
    ) {
        return null;
    }

    return candidate;
}

function markTargetConquered(
    target,
    loyalty
) {
    /*
    STRICT ochrana.

    Túto funkciu nesmieme použiť
    pre null / ? / undefined.
    */
    if (
        loyalty === null ||
        loyalty === undefined ||
        loyalty === '' ||
        !Number.isFinite(
            Number(loyalty)
        )
    ) {
        log(
            `${target.coords}: ` +
            `SMART nemá platnú loyalty. ` +
            `Cieľ NEBUDE označený ako prevzatý.`,
            'warning'
        );

        target.conquered =
            false;

        saveState();
        renderTargets();

        return false;
    }

    if (
        Number(loyalty) > 0
    ) {
        target.conquered =
            false;

        return false;
    }

    target.conquered =
        true;

    target.finished =
        true;

    target.waitingForLoyalty =
        false;

    target.loyaltyKnown =
        true;

    target.loyalty =
        Number(loyalty);

    target.lastError =
        null;

    /*
    Všetky sloty pre túto dedinu
    môžeme ukončiť.
    */
    for (
        const slot
        of state.slots
    ) {
        if (
            slot.target ===
            target.coords
        ) {
            slot.finished =
                true;

            slot.waitingForReport =
                false;
        }
    }

    saveState();
    renderTargets();

    log(
        `${target.coords}: ` +
        `✅ DEDINA PREVZATÁ! ` +
        `Oddanosť ${loyalty}. ` +
        `Ďalší noble sa neposiela.`,
        'success'
    );

    return true;
}

async function processSmartReport(
    slot
) {
    if (
        !slot.smart ||
        slot.finished
    ) {
        return false;
    }

    const target =
        getTarget(
            slot.target
        );

    if (!target) {
        slot.finished =
            true;

        saveState();

        return false;
    }

    /*
    v1.5.2:
    conquered overujeme striktne.
    */
    normalizeTargetConqueredState(
        target
    );

    if (
        isTargetReallyConquered(
            target
        )
    ) {
        target.conquered =
            true;

        target.finished =
            true;

        slot.finished =
            true;

        saveState();
        renderTargets();

        return true;
    }

    /*
    Ak je loyalty ?, normálne pokračujeme.
    */
    if (
        !hasRealLoyalty(
            target
        )
    ) {
        target.conquered =
            false;
    }

    /*
    Report kontrolujeme až po dopade.
    */
    if (
        Date.now() <
        Number(slot.impactAt)
    ) {
        return false;
    }

    slot.waitingForReport =
        true;

    target.waitingForLoyalty =
        true;

    saveState();
    renderTargets();

    let candidate =
        null;

    try {
        candidate =
            await findSmartReportForSlot(
                slot
            );

    } catch (e) {
        log(
            `${slot.target}: ` +
            `SMART report kontrola — ` +
            `${e.message}`,
            'warning'
        );

        return false;
    }

    /*
    Report ešte nevznikol.

    DÔLEŽITÉ:
    nič nemeníme na conquered.
    Len čakáme.
    */
    if (!candidate) {
        target.conquered =
            false;

        saveState();

        return false;
    }

    try {
        await applyLoyaltyReport(
            target,
            candidate
        );

        slot.reportChecked =
            true;

        slot.waitingForReport =
            false;

        target.waitingForLoyalty =
            false;

        /*
        Po applyLoyaltyReport musí byť
        loyalty skutočne známa.
        */
        if (
            !hasRealLoyalty(
                target
            )
        ) {
            throw new Error(
                'SMART report nemá platnú oddanosť.'
            );
        }

        const loyalty =
            Number(
                target.loyalty
            );

        log(
            `${target.coords}: ` +
            `🧠 SMART report → ` +
            `oddanosť ${loyalty}.`,
            'success'
        );

        /*
        -------------------------------------------------------------
        PREVZATÁ
        -------------------------------------------------------------
        */
        if (
            loyalty <= 0
        ) {
            markTargetConquered(
                target,
                loyalty
            );

            return true;
        }

        /*
        Loyalty > 0.
        Určite NIE JE prevzatá.
        */
        target.conquered =
            false;

        /*
        -------------------------------------------------------------
        MAXIMUM DOSIAHNUTÉ
        -------------------------------------------------------------
        */
        if (
            Number(target.sent) >=
            Number(target.wanted)
        ) {
            target.finished =
                true;

            slot.finished =
                true;

            target.waitingForLoyalty =
                false;

            saveState();
            renderTargets();

            log(
                `${target.coords}: ` +
                `SMART dosiahol maximum ` +
                `${target.sent}/${target.wanted}. ` +
                `Oddanosť je stále ${loyalty}.`,
                'warning'
            );

            return true;
        }

        /*
        Loyalty > 0 a máme ešte útoky.

        Slot ostáva aktívny.
        Po návrate noble pošleme ďalšieho.
        */
        saveState();
        renderTargets();

        return true;

    } catch (e) {
        target.waitingForLoyalty =
            false;

        target.lastError =
            e.message;

        slot.waitingForReport =
            false;

        /*
        Chyba pri reportoch NIKDY
        nesmie znamenať conquered.
        */
        if (
            !hasRealLoyalty(
                target
            )
        ) {
            target.conquered =
                false;
        }

        saveState();
        renderTargets();

        log(
            `${target.coords}: ` +
            `SMART chyba — ${e.message}`,
            'error'
        );

        return false;
    }
}

async function processSmartImpacts() {
    if (
        !running ||
        !state.settings.smartMode ||
        state.settings.ramTest
    ) {
        return;
    }

    const now =
        Date.now();

    const slots =
        state.slots
            .filter(
                slot =>
                    !slot.finished &&
                    slot.smart &&
                    !slot.reportChecked &&
                    Number(slot.impactAt) <=
                        now
            )
            .sort(
                (a, b) =>
                    Number(a.impactAt) -
                    Number(b.impactAt)
            );

    for (
        const slot
        of slots
    ) {
        if (!running) {
            break;
        }

        await processSmartReport(
            slot
        );

        await sleep(
            randomInt(
                CONFIG
                    .REPORT_REQUEST_DELAY_MIN,

                CONFIG
                    .REPORT_REQUEST_DELAY_MAX
            )
        );
    }
}

/*
=====================================================================
INITIAL AVAILABILITY RETRY
=====================================================================
*/

function scheduleInitialRetry(
    reason
) {
    const retry =
        randomInt(
            CONFIG.RETRY_MIN,
            CONFIG.RETRY_MAX
        );

    waitingInitialDistribution =
        true;

    initialRetryAt =
        Date.now() +
        retry * 1000;

    log(
        `⏳ ${reason} ` +
        `Ďalšia kontrola za ${retry}s.`,
        'warning'
    );

    updateLiveUI();

    return retry;
}

function clearInitialRetry() {
    waitingInitialDistribution =
        false;

    initialRetryAt =
        null;

    updateLiveUI();
}

/*
=====================================================================
INITIAL DISTRIBUTION
=====================================================================
*/

async function initialDistribution() {
    if (!running) {
        return {
            sentSomething: false,
            waiting: false
        };
    }

    const rotationUnit =
        getRotationUnit();

    const available =
        await getAvailableUnits();

    const unitBudget =
        Number(
            available[rotationUnit] ||
            0
        );

    /*
    NOBLE / RAM NIE JE DOMA.
    Script zostáva BEŽAŤ.
    */
    if (
        unitBudget < 1
    ) {
        scheduleInitialRetry(
            `${getRotationUnitName()} nie je doma.`
        );

        return {
            sentSomething: false,
            waiting: true
        };
    }

    const axePerAttack =
        Number(
            state.settings.axe
        );

    const lightPerAttack =
        Number(
            state.settings.light
        );

    if (
        axePerAttack > 0 &&
        Number(available.axe) <
        axePerAttack
    ) {
        scheduleInitialRetry(
            `Nie je dostatok AXE ` +
            `(${available.axe}/${axePerAttack}).`
        );

        return {
            sentSomething: false,
            waiting: true
        };
    }

    if (
        lightPerAttack > 0 &&
        Number(available.light) <
        lightPerAttack
    ) {
        scheduleInitialRetry(
            `Nie je dostatok LIGHT ` +
            `(${available.light}/${lightPerAttack}).`
        );

        return {
            sentSomething: false,
            waiting: true
        };
    }

    clearInitialRetry();

    let escortBudget =
        Infinity;

    if (
        axePerAttack > 0
    ) {
        escortBudget =
            Math.min(
                escortBudget,
                Math.floor(
                    Number(
                        available.axe || 0
                    ) /
                    axePerAttack
                )
            );
    }

    if (
        lightPerAttack > 0
    ) {
        escortBudget =
            Math.min(
                escortBudget,
                Math.floor(
                    Number(
                        available.light || 0
                    ) /
                    lightPerAttack
                )
            );
    }

    if (
        !Number.isFinite(
            escortBudget
        )
    ) {
        escortBudget =
            unitBudget;
    }

    let attackBudget =
        Math.min(
            unitBudget,
            escortBudget
        );

    if (
        attackBudget <= 0
    ) {
        scheduleInitialRetry(
            'Nie sú dostupné jednotky pre útok.'
        );

        return {
            sentSomething: false,
            waiting: true
        };
    }

    const dryRunTested =
        new Set();

    const smartInitiallySent =
        new Set();

    let cursor = 0;
    let sentSomething = false;

    while (
        running &&
        attackBudget > 0
    ) {
        const candidates =
            state.targets.filter(
                target => {
                    /*
                    Toto už správne vráti TRUE
                    aj pri loyalty ?.
                    */
                    if (
                        !targetNeedsAttack(
                            target
                        )
                    ) {
                        return false;
                    }

                    if (
                        state.settings.dryRun &&
                        dryRunTested.has(
                            target.coords
                        )
                    ) {
                        return false;
                    }

                    /*
                    SMART:
                    počas tejto distribúcie
                    maximálne jeden noble/cieľ.
                    */
                    if (
                        state.settings.smartMode &&
                        !state.settings.ramTest &&
                        smartInitiallySent.has(
                            target.coords
                        )
                    ) {
                        return false;
                    }

                    /*
                    Ak už existuje aktívny
                    SMART slot pre cieľ,
                    ďalší noble tam neposielame.
                    */
                    if (
                        state.settings.smartMode &&
                        !state.settings.ramTest &&
                        state.slots.some(
                            slot =>
                                !slot.finished &&
                                slot.smart &&
                                slot.target ===
                                    target.coords
                        )
                    ) {
                        return false;
                    }

                    return true;
                }
            );

        if (
            !candidates.length
        ) {
            break;
        }

        const target =
            candidates[
                cursor %
                candidates.length
            ];

        cursor++;

        log(
            `${
                state.settings.dryRun
                    ? 'DRY RUN'
                    : 'Odosielam'
            } ` +
            `${getRotationUnitName()} → ` +
            `${target.coords}`
        );

        try {
            const result =
                await sendOne(
                    target.coords
                );

            if (
                !result.success &&
                result.unavailable
            ) {
                scheduleInitialRetry(
                    result.reason ||
                    `${getRotationUnitName()} nie je dostupný.`
                );

                return {
                    sentSomething,
                    waiting: true
                };
            }

            if (
                !result.success
            ) {
                target.lastError =
                    result.reason ||
                    'Odoslanie zlyhalo.';

                log(
                    `${target.coords}: ` +
                    `${target.lastError}`,
                    'warning'
                );

                saveState();
                renderTargets();

                break;
            }

            if (
                state.settings.dryRun
            ) {
                dryRunTested.add(
                    target.coords
                );

                target.lastError =
                    null;

                sentSomething =
                    true;

            } else {
                target.sent =
                    Number(
                        target.sent || 0
                    ) + 1;

                target.lastError =
                    null;

                /*
                Dôležité:
                aj cieľ s ? dostane normálne
                svoj prvý SMART slot.
                */
                createSlot(
                    target.coords,
                    result.travel
                );

                sentSomething =
                    true;

                if (
                    state.settings.smartMode &&
                    !state.settings.ramTest
                ) {
                    smartInitiallySent.add(
                        target.coords
                    );

                    target.waitingForLoyalty =
                        false;

                    if (
                        hasRealLoyalty(
                            target
                        )
                    ) {
                        log(
                            `${target.coords}: ` +
                            `🧠 SMART noble ` +
                            `${target.sent}/${target.wanted} ` +
                            `odoslaný. ` +
                            `Aktuálna oddanosť ~` +
                            `${getDisplayedLoyalty(target)}. ` +
                            `Po dopade čakám na nový report.`,
                            'success'
                        );

                    } else {
                        log(
                            `${target.coords}: ` +
                            `🧠 SMART noble ` +
                            `${target.sent}/${target.wanted} ` +
                            `odoslaný. ` +
                            `Oddanosť zatiaľ neznáma (?). ` +
                            `Prvý nový report ju zistí.`,
                            'success'
                        );
                    }

                } else {
                    log(
                        `${getRotationUnitName()} ` +
                        `odoslaný → ${target.coords}. ` +
                        `Cesta ` +
                        `${formatDuration(
                            result.travel.seconds
                        )}. ` +
                        `Odoslané ` +
                        `${target.sent}/${target.wanted}.`,
                        'success'
                    );
                }
            }

            attackBudget--;

            saveState();
            renderTargets();

        } catch (e) {
            target.lastError =
                e.message;

            log(
                `${target.coords}: ` +
                `${e.message}`,
                'error'
            );

            saveState();
            renderTargets();

            if (
                state.settings.dryRun
            ) {
                dryRunTested.add(
                    target.coords
                );
            }
        }

        await sleep(
            randomInt(
                CONFIG.REQUEST_DELAY_MIN,
                CONFIG.REQUEST_DELAY_MAX
            )
        );

        if (
            state.settings.dryRun
        ) {
            const remaining =
                state.targets.some(
                    target =>
                        targetNeedsAttack(
                            target
                        ) &&
                        !dryRunTested.has(
                            target.coords
                        )
                );

            if (!remaining) {
                break;
            }
        }

        if (
            state.settings.smartMode &&
            !state.settings.ramTest
        ) {
            const remainingSmart =
                state.targets.some(
                    target =>
                        targetNeedsAttack(
                            target
                        ) &&
                        !smartInitiallySent.has(
                            target.coords
                        ) &&
                        !state.slots.some(
                            slot =>
                                !slot.finished &&
                                slot.smart &&
                                slot.target ===
                                    target.coords
                        )
                );

            if (!remainingSmart) {
                break;
            }
        }
    }

    const remainingWithoutSlot =
        state.targets.some(
            target =>
                targetNeedsAttack(
                    target
                ) &&
                !state.slots.some(
                    slot =>
                        !slot.finished &&
                        slot.target ===
                            target.coords
                )
        );

    if (
        !state.settings.dryRun &&
        remainingWithoutSlot
    ) {
        scheduleInitialRetry(
            `${getRotationUnitName()} momentálne nie je ` +
            `dostupný pre ďalší cieľ.`
        );

        return {
            sentSomething,
            waiting: true
        };
    }

    return {
        sentSomething,
        waiting: false
    };
}

/*
=====================================================================
RETRY INITIAL DISTRIBUTION
=====================================================================
*/

async function processInitialRetry() {
    if (
        !running ||
        !waitingInitialDistribution ||
        !initialRetryAt
    ) {
        return;
    }

    if (
        Date.now() <
        initialRetryAt
    ) {
        return;
    }

    waitingInitialDistribution =
        false;

    initialRetryAt =
        null;

    log(
        `🔎 Kontrolujem dostupnosť ` +
        `${getRotationUnitName()} a escort jednotiek...`
    );

    try {
        const result =
            await initialDistribution();

        if (
            result &&
            result.sentSomething
        ) {
            log(
                `✅ Dostupná jednotka nájdená. ` +
                `Rotácia pokračuje.`,
                'success'
            );
        }

    } catch (e) {
        scheduleInitialRetry(
            `Kontrola dostupnosti zlyhala: ` +
            `${e.message}.`
        );
    }
}

/*
=====================================================================
RETURNED SLOT
=====================================================================
*/

async function processReturnedSlot(
    slot
) {
    const target =
        getTarget(
            slot.target
        );

    if (!target) {
        slot.finished =
            true;

        saveState();

        return;
    }

    /*
    Strict kontrola conquered.
    */
    normalizeTargetConqueredState(
        target
    );

    if (
        isTargetReallyConquered(
            target
        )
    ) {
        target.conquered =
            true;

        target.finished =
            true;

        slot.finished =
            true;

        saveState();
        renderTargets();

        return;
    }

    /*
    ? NIE JE dôvod ukončiť slot.
    */
    if (
        !hasRealLoyalty(
            target
        )
    ) {
        target.conquered =
            false;
    }

    /*
    SMART:
    pred ďalším noble musí byť
    spracovaný report predchádzajúceho.
    */
    if (
        slot.smart &&
        !slot.reportChecked
    ) {
        const reportProcessed =
            await processSmartReport(
                slot
            );

        if (
            isTargetReallyConquered(
                target
            )
        ) {
            target.conquered =
                true;

            target.finished =
                true;

            slot.finished =
                true;

            saveState();
            renderTargets();

            return;
        }

        if (
            !reportProcessed ||
            !slot.reportChecked
        ) {
            const retry =
                randomInt(
                    CONFIG.RETRY_MIN,
                    CONFIG.RETRY_MAX
                );

            slot.returnAt =
                Date.now() +
                retry * 1000;

            log(
                `${slot.target}: ` +
                `🧠 SMART čaká na nový ` +
                `noble report. ` +
                `Kontrola znova za ${retry}s.`,
                'warning'
            );

            saveState();
            renderTargets();

            return;
        }
    }

    if (
        Number(target.sent) >=
        Number(target.wanted)
    ) {
        /*
        Ak sme SMART a report už ukázal
        > 0, maximum bolo dosiahnuté.
        */
        slot.finished =
            true;

        target.finished =
            true;

        target.waitingForLoyalty =
            false;

        saveState();
        renderTargets();

        return;
    }

    const originalRamTest =
        state.settings.ramTest;

    const slotIsRam =
        slot.unit === 'ram';

    state.settings.ramTest =
        slotIsRam;

    try {
        await loadRotationUnitSpeed();

        const available =
            await getAvailableUnits();

        const rotationUnit =
            slotIsRam
                ? 'ram'
                : 'snob';

        if (
            Number(
                available[rotationUnit] ||
                0
            ) < 1
        ) {
            const retry =
                randomInt(
                    CONFIG.RETRY_MIN,
                    CONFIG.RETRY_MAX
                );

            slot.returnAt =
                Date.now() +
                retry * 1000;

            log(
                `${slot.target}: ` +
                `${slotIsRam ? 'RAM' : 'NOBLE'} ` +
                `ešte nie je doma. ` +
                `Retry za ${retry}s.`,
                'warning'
            );

            saveState();
            renderTargets();

            return;
        }

        if (
            Number(
                available.axe || 0
            ) <
            Number(
                state.settings.axe
            )
        ) {
            const retry =
                randomInt(
                    CONFIG.RETRY_MIN,
                    CONFIG.RETRY_MAX
                );

            slot.returnAt =
                Date.now() +
                retry * 1000;

            log(
                `${slot.target}: ` +
                `nedostatok axe. ` +
                `Retry za ${retry}s.`,
                'warning'
            );

            saveState();
            renderTargets();

            return;
        }

        if (
            Number(
                available.light || 0
            ) <
            Number(
                state.settings.light
            )
        ) {
            const retry =
                randomInt(
                    CONFIG.RETRY_MIN,
                    CONFIG.RETRY_MAX
                );

            slot.returnAt =
                Date.now() +
                retry * 1000;

            log(
                `${slot.target}: ` +
                `nedostatok light. ` +
                `Retry za ${retry}s.`,
                'warning'
            );

            saveState();
            renderTargets();

            return;
        }

        /*
        Pred ďalším SMART útokom
        uložíme posledný SKUTOČNÝ report.

        Pri ? ostáva null.
        */
        if (slot.smart) {
            slot.reportBeforeId =
                hasRealLoyalty(target)
                    ? (
                        target.loyaltyReportId ||
                        null
                    )
                    : null;

            slot.reportBeforeTime =
                hasRealLoyalty(target)
                    ? (
                        target.loyaltyReportTime ||
                        null
                    )
                    : null;
        }

        log(
            `Slot ${slot.id.slice(-5)}: ` +
            `odosielam ` +
            `${slotIsRam ? 'RAM' : 'NOBLE'} ` +
            `→ ${slot.target}`
        );

        const result =
            await sendOne(
                slot.target
            );

        if (!result.success) {
            if (
                result.unavailable
            ) {
                const retry =
                    randomInt(
                        CONFIG.RETRY_MIN,
                        CONFIG.RETRY_MAX
                    );

                slot.returnAt =
                    Date.now() +
                    retry * 1000;

                log(
                    `${slot.target}: ` +
                    `${result.reason} ` +
                    `Retry za ${retry}s.`,
                    'warning'
                );

                saveState();
                renderTargets();

                return;
            }

            throw new Error(
                result.reason ||
                'Odoslanie zlyhalo.'
            );
        }

        if (
            result.dryRun
        ) {
            slot.finished =
                true;

            log(
                `Slot ${slot.id.slice(-5)} ` +
                `DRY RUN dokončený.`,
                'success'
            );

            saveState();
            renderTargets();

            return;
        }

        target.sent =
            Number(
                target.sent || 0
            ) + 1;

        target.lastError =
            null;

        const sentAt =
            Date.now();

        const impactAt =
            sentAt +
            result.travel.seconds *
            1000;

        const delay =
            randomInt(
                state.settings.minReturnDelay,
                state.settings.maxReturnDelay
            );

        const returnAt =
            sentAt +
            result.travel.seconds *
            2 *
            1000 +
            delay *
            1000;

        slot.sentAt =
            sentAt;

        slot.impactAt =
            impactAt;

        slot.returnAt =
            returnAt;

        slot.travelSeconds =
            result.travel.seconds;

        slot.distance =
            result.travel.distance;

        slot.delayAfterReturn =
            delay;

        if (slot.smart) {
            slot.reportChecked =
                false;

            slot.waitingForReport =
                false;

            target.waitingForLoyalty =
                false;

            log(
                `${slot.target}: ` +
                `🧠 SMART noble ` +
                `${target.sent}/${target.wanted} ` +
                `odoslaný. ` +
                `Po dopade skontrolujem ` +
                `nový report.`,
                'success'
            );

        } else {
            log(
                `${slotIsRam ? 'RAM' : 'NOBLE'} ` +
                `→ ${slot.target} odoslaný. ` +
                `${target.sent}/${target.wanted}. ` +
                `Ďalší slot ` +
                `${formatClock(returnAt)}.`,
                'success'
            );
        }

        /*
        SMART pri poslednom povolenom útoku
        ešte NESMIE slot ukončiť.

        Najskôr musí prísť report a až potom
        sa rozhodne:
        <=0 PREVZATÁ
        >0 LIMIT
        */
        if (
            Number(target.sent) >=
            Number(target.wanted)
        ) {
            if (slot.smart) {
                log(
                    `${slot.target}: ` +
                    `SMART odoslal maximum ` +
                    `${target.sent}/${target.wanted}. ` +
                    `Čakám na výsledný report.`,
                    'warning'
                );

            } else {
                target.finished =
                    true;

                slot.finished =
                    true;
            }
        }

        saveState();
        renderTargets();

    } catch (e) {
        target.lastError =
            e.message;

        const retry =
            randomInt(
                CONFIG.RETRY_MIN,
                CONFIG.RETRY_MAX
            );

        slot.returnAt =
            Date.now() +
            retry * 1000;

        log(
            `${slot.target}: ` +
            `${e.message}. ` +
            `Retry za ${retry}s.`,
            'error'
        );

        saveState();
        renderTargets();

    } finally {
        state.settings.ramTest =
            originalRamTest;

        saveState();
        updateLiveUI();
    }
}

/*
=====================================================================
SCHEDULER
=====================================================================
*/

async function scheduler() {
    if (
        !running ||
        busy
    ) {
        return;
    }

    busy = true;

    try {
        /*
        1. SMART report po dopade.
        */
        await processSmartImpacts();

        /*
        2. Ak nebol noble doma,
        skontrolujeme dostupnosť.
        */
        await processInitialRetry();

        /*
        3. Spracovanie vrátených slotov.
        */
        const now =
            Date.now();

        const readySlots =
            state.slots
                .filter(
                    slot =>
                        !slot.finished &&
                        Number(
                            slot.returnAt
                        ) <= now
                )
                .sort(
                    (a, b) =>
                        Number(
                            a.returnAt
                        ) -
                        Number(
                            b.returnAt
                        )
                );

        for (
            const slot
            of readySlots
        ) {
            if (!running) {
                break;
            }

            await processReturnedSlot(
                slot
            );

            await sleep(
                randomInt(
                    CONFIG.REQUEST_DELAY_MIN,
                    CONFIG.REQUEST_DELAY_MAX
                )
            );
        }

    } catch (e) {
        log(
            `Scheduler: ${e.message}`,
            'error'
        );

    } finally {
        busy = false;
    }
}

/*
=====================================================================
START
=====================================================================
*/

async function start() {
    if (running) {
        log(
            'Rotation už beží.',
            'warning'
        );

        return;
    }

    try {
        readSettingsFromUI();

        if (
            !state.targets.length
        ) {
            throw new Error(
                'Najskôr pridaj aspoň jeden cieľ.'
            );
        }

        /*
        Pred štartom opravíme staré
        conquered flagy.
        */
        for (
            const target
            of state.targets
        ) {
            normalizeTargetConqueredState(
                target
            );
        }

        saveState();
        renderTargets();

        /*
        Loyalty pred štartom.
        */
        if (
            !state.settings.ramTest
        ) {
            log(
                state.settings.smartMode
                    ? '🧠 SMART: načítavam východiskové noble reporty...'
                    : 'Pred štartom kontrolujem oddanosť z noble reportov...'
            );

            await refreshLoyalties(
                null,
                {
                    silent: true
                }
            );

            const known =
                state.targets.filter(
                    target =>
                        hasRealLoyalty(
                            target
                        )
                ).length;

            log(
                `Oddanosť načítaná: ` +
                `${known}/${state.targets.length} cieľov.`,
                known
                    ? 'success'
                    : 'warning'
            );

            /*
            STRICT:
            iba reálna loyalty <=0
            je PREVZATÁ.

            ? normálne pokračuje.
            */
            for (
                const target
                of state.targets
            ) {
                normalizeTargetConqueredState(
                    target
                );

                if (
                    isTargetReallyConquered(
                        target
                    )
                ) {
                    target.conquered =
                        true;

                    target.finished =
                        true;

                    target.waitingForLoyalty =
                        false;

                } else if (
                    !hasRealLoyalty(
                        target
                    )
                ) {
                    target.conquered =
                        false;

                    if (
                        Number(
                            target.sent || 0
                        ) <
                        Number(
                            target.wanted || 0
                        )
                    ) {
                        target.finished =
                            false;
                    }
                }
            }

            saveState();
            renderTargets();
        }

        await loadRotationUnitSpeed();

        /*
        running ešte pred dostupnosťou noble.
        */
        running = true;

        waitingInitialDistribution =
            false;

        initialRetryAt =
            null;

        log(
            `START: ` +
            `${getRotationUnitName()} / ` +
            `${
                state.settings.dryRun
                    ? 'DRY RUN'
                    : 'LIVE'
            }` +
            `${
                state.settings.smartMode &&
                !state.settings.ramTest
                    ? ' / SMART'
                    : ''
            }.`,
            'success'
        );

        if (schedulerTimer) {
            clearInterval(
                schedulerTimer
            );
        }

        schedulerTimer =
            setInterval(
                scheduler,
                1000
            );

        render();

        const result =
            await initialDistribution();

        if (
            state.settings.dryRun &&
            result &&
            !result.waiting
        ) {
            running =
                false;

            if (schedulerTimer) {
                clearInterval(
                    schedulerTimer
                );

                schedulerTimer =
                    null;
            }

            log(
                'DRY RUN dokončený. ' +
                'Finálne útoky neboli odoslané.',
                'success'
            );

            render();

            return;
        }

        await scheduler();

    } catch (e) {
        running =
            false;

        waitingInitialDistribution =
            false;

        initialRetryAt =
            null;

        if (schedulerTimer) {
            clearInterval(
                schedulerTimer
            );

            schedulerTimer =
                null;
        }

        log(
            `START chyba: ${e.message}`,
            'error'
        );

        render();
    }
}

function pause() {
    running =
        false;

    waitingInitialDistribution =
        false;

    initialRetryAt =
        null;

    if (schedulerTimer) {
        clearInterval(
            schedulerTimer
        );

        schedulerTimer =
            null;
    }

    log(
        'Rotation pozastavená.',
        'warning'
    );

    render();
}

/*
=====================================================================
TARGET MANAGEMENT
=====================================================================
*/

function addTargetsFromUI() {
    const textarea =
        document.querySelector(
            '#nr-target-input'
        );

    if (!textarea) {
        return;
    }

    const text =
        textarea.value ||
        '';

    const matches = [
        ...text.matchAll(
            /(\d{1,3})\|(\d{1,3})/g
        )
    ];

    if (!matches.length) {
        log(
            'Neboli nájdené žiadne coords.',
            'warning'
        );

        return;
    }

    let added = 0;

    for (
        const match
        of matches
    ) {
        const coords =
            `${match[1]}|${match[2]}`;

        if (
            state.targets.some(
                target =>
                    target.coords ===
                    coords
            )
        ) {
            continue;
        }

        state.targets.push({
            coords,

            sent: 0,

            wanted:
                Number(
                    state.settings
                        .attacksPerTarget
                ),

            finished: false,

            waitingForLoyalty:
                false,

            lastError:
                null,

            /*
            Nový cieľ začína ako ?.

            To NIE JE 0.
            */
            loyalty:
                null,

            loyaltyKnown:
                false,

            loyaltyReportTime:
                null,

            loyaltyReportId:
                null,

            loyaltyReportUrl:
                null,

            loyaltyLoading:
                false,

            loyaltyError:
                null,

            conquered:
                false
        });

        added++;
    }

    textarea.value = '';

    saveState();
    renderTargets();

    log(
        `Pridané ciele: ${added}.`,
        added
            ? 'success'
            : 'warning'
    );
}

function removeTarget(coords) {
    const activeSlots =
        state.slots.filter(
            slot =>
                slot.target === coords &&
                !slot.finished
        );

    if (
        activeSlots.length
    ) {
        const confirmed =
            confirm(
                `${coords} má ` +
                `${activeSlots.length} ` +
                `aktívnych slotov. ` +
                `Naozaj odstrániť cieľ ` +
                `a ukončiť tieto sloty?`
            );

        if (!confirmed) {
            return;
        }

        for (
            const slot
            of activeSlots
        ) {
            slot.finished =
                true;
        }
    }

    state.targets =
        state.targets.filter(
            target =>
                target.coords !==
                coords
        );

    saveState();
    renderTargets();

    log(
        `Cieľ ${coords} odstránený.`,
        'warning'
    );
}

/*
=====================================================================
SETTINGS
=====================================================================
*/

function readSettingsFromUI() {
    const axe =
        Number(
            document.querySelector(
                '#nr-axe'
            )?.value
        );

    const light =
        Number(
            document.querySelector(
                '#nr-light'
            )?.value
        );

    const count =
        Number(
            document.querySelector(
                '#nr-count'
            )?.value
        );

    const delayMin =
        Number(
            document.querySelector(
                '#nr-delay-min'
            )?.value
        );

    const delayMax =
        Number(
            document.querySelector(
                '#nr-delay-max'
            )?.value
        );

    const dryRun =
        Boolean(
            document.querySelector(
                '#nr-dry-run'
            )?.checked
        );

    const ramTest =
        Boolean(
            document.querySelector(
                '#nr-ram-test'
            )?.checked
        );

    const smartMode =
        Boolean(
            document.querySelector(
                '#nr-smart-mode'
            )?.checked
        );

    state.settings.axe =
        Number.isFinite(axe)
            ? Math.max(
                0,
                Math.floor(axe)
            )
            : CONFIG.DEFAULT_AXE;

    state.settings.light =
        Number.isFinite(light)
            ? Math.max(
                0,
                Math.floor(light)
            )
            : CONFIG.DEFAULT_LIGHT;

    state.settings.attacksPerTarget =
        Number.isFinite(count)
            ? Math.max(
                1,
                Math.floor(count)
            )
            : CONFIG
                .DEFAULT_ATTACKS_PER_TARGET;

    state.settings.minReturnDelay =
        Number.isFinite(delayMin)
            ? Math.max(
                0,
                Math.floor(delayMin)
            )
            : CONFIG.DEFAULT_DELAY_MIN;

    state.settings.maxReturnDelay =
        Number.isFinite(delayMax)
            ? Math.max(
                state.settings
                    .minReturnDelay,

                Math.floor(delayMax)
            )
            : CONFIG.DEFAULT_DELAY_MAX;

    state.settings.dryRun =
        dryRun;

    state.settings.ramTest =
        ramTest;

    state.settings.smartMode =
        smartMode;

    for (
        const target
        of state.targets
    ) {
        if (
            Number(
                target.sent || 0
            ) === 0 &&
            !state.slots.some(
                slot =>
                    slot.target ===
                        target.coords &&
                    !slot.finished
            )
        ) {
            target.wanted =
                state.settings
                    .attacksPerTarget;
        }

        /*
        Po každej zmene nastavení
        znovu striktne normalizujeme.
        */
        normalizeTargetConqueredState(
            target
        );
    }

    saveState();
    renderTargets();
    updateLiveUI();
}

/*
=====================================================================
UI POSITION
=====================================================================
*/

function applyWindowPosition() {
    const box =
        document.querySelector(
            '#noble-rotation-ui'
        );

    if (!box) {
        return;
    }

    box.style.position =
        'fixed';

    box.style.top =
        `${Number(uiState.top) || 65}px`;

    if (
        Number.isFinite(
            Number(uiState.left)
        )
    ) {
        box.style.left =
            `${Number(uiState.left)}px`;

        box.style.right =
            'auto';

    } else {
        box.style.right =
            '18px';

        box.style.left =
            'auto';
    }

    const content =
        box.querySelector(
            '.nr-content'
        );

    if (content) {
        content.style.display =
            uiState.minimized
                ? 'none'
                : '';
    }

    const minimize =
        box.querySelector(
            '#nr-minimize'
        );

    if (minimize) {
        minimize.textContent =
            uiState.minimized
                ? '□'
                : '—';
    }
}

function toggleMinimize() {
    uiState.minimized =
        !uiState.minimized;

    saveUIState();
    applyWindowPosition();
}

function enableDragging() {
    const box =
        document.querySelector(
            '#noble-rotation-ui'
        );

    const header =
        document.querySelector(
            '#nr-header'
        );

    if (
        !box ||
        !header
    ) {
        return;
    }

    let dragging =
        false;

    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    header.addEventListener(
        'pointerdown',
        event => {
            if (
                event.target.closest(
                    'button'
                )
            ) {
                return;
            }

            dragging =
                true;

            const rect =
                box.getBoundingClientRect();

            startX =
                event.clientX;

            startY =
                event.clientY;

            startLeft =
                rect.left;

            startTop =
                rect.top;

            box.style.left =
                `${startLeft}px`;

            box.style.top =
                `${startTop}px`;

            box.style.right =
                'auto';

            try {
                header.setPointerCapture(
                    event.pointerId
                );
            } catch (_) {}

            event.preventDefault();
        }
    );

    header.addEventListener(
        'pointermove',
        event => {
            if (!dragging) {
                return;
            }

            const nextLeft =
                startLeft +
                event.clientX -
                startX;

            const nextTop =
                startTop +
                event.clientY -
                startY;

            const maxLeft =
                Math.max(
                    0,
                    window.innerWidth -
                    box.offsetWidth
                );

            const maxTop =
                Math.max(
                    0,
                    window.innerHeight -
                    40
                );

            box.style.left =
                `${Math.max(
                    0,
                    Math.min(
                        maxLeft,
                        nextLeft
                    )
                )}px`;

            box.style.top =
                `${Math.max(
                    0,
                    Math.min(
                        maxTop,
                        nextTop
                    )
                )}px`;
        }
    );

    const finish =
        event => {
            if (!dragging) {
                return;
            }

            dragging =
                false;

            const rect =
                box.getBoundingClientRect();

            uiState.left =
                Math.round(
                    rect.left
                );

            uiState.top =
                Math.round(
                    rect.top
                );

            saveUIState();

            try {
                header.releasePointerCapture(
                    event.pointerId
                );
            } catch (_) {}
        };

    header.addEventListener(
        'pointerup',
        finish
    );

    header.addEventListener(
        'pointercancel',
        finish
    );
}

/*
=====================================================================
UI
=====================================================================
*/

function createUI() {
    const existing =
        document.querySelector(
            '#noble-rotation-ui'
        );

    if (existing) {
        existing.remove();
    }

    const box =
        document.createElement(
            'div'
        );

    box.id =
        'noble-rotation-ui';

    box.innerHTML = `
<style>
#noble-rotation-ui {
width:720px;
max-width:calc(100vw - 20px);
z-index:99999;
font-family:Verdana,Arial,sans-serif;
font-size:11px;
color:#3b2b18;
box-sizing:border-box;
filter:drop-shadow(0 5px 12px rgba(0,0,0,.42));
}

#noble-rotation-ui * {
box-sizing:border-box;
}

#nr-header {
min-height:42px;
display:flex;
align-items:center;
justify-content:space-between;
padding:6px 8px 6px 10px;
border:1px solid #3d2b17;
border-bottom:0;
border-radius:8px 8px 0 0;
background:linear-gradient(#c7a66a,#a9854d);
box-shadow:inset 0 1px rgba(255,255,255,.35);
cursor:move;
user-select:none;
touch-action:none;
}

.nr-header-left {
display:flex;
align-items:center;
gap:8px;
min-width:0;
}

.nr-logo {
width:28px;
height:28px;
display:flex;
align-items:center;
justify-content:center;
border:1px solid #4b3219;
border-radius:5px;
background:linear-gradient(#f4d68e,#bd9148);
font-size:17px;
}

.nr-title {
font-size:15px;
font-weight:bold;
color:#2c1d0d;
white-space:nowrap;
}

.nr-version {
font-size:9px;
font-weight:normal;
opacity:.70;
}

#nr-header-mini-status {
max-width:350px;
overflow:hidden;
text-overflow:ellipsis;
white-space:nowrap;
padding:3px 7px;
border:1px solid rgba(54,38,18,.35);
border-radius:10px;
background:rgba(255,255,255,.22);
font-size:9px;
font-weight:bold;
color:#4d3518;
}

.nr-header-buttons {
display:flex;
gap:4px;
}

.nr-window-btn {
width:27px;
height:25px;
padding:0;
border:1px solid #4c351d;
border-radius:4px;
background:linear-gradient(#e7cb91,#b68d4d);
color:#38240f;
font-size:15px;
font-weight:bold;
cursor:pointer;
}

.nr-content {
padding:9px;
border:1px solid #3d2b17;
border-radius:0 0 8px 8px;
background:#ead9b5;
}

#nr-status {
display:flex;
flex-wrap:wrap;
gap:5px;
margin-bottom:8px;
}

.nr-pill {
display:inline-flex;
align-items:center;
min-height:23px;
padding:3px 8px;
border:1px solid #8b744c;
border-radius:12px;
background:#ddc99f;
color:#4c3820;
font-size:9px;
font-weight:bold;
}

.nr-pill-running {
border-color:#54753c;
background:#cce2b7;
color:#345126;
}

.nr-pill-paused {
border-color:#8c6b42;
background:#e6d2a9;
color:#6b4d28;
}

.nr-pill-dry {
border-color:#80649b;
background:#ddd0ea;
color:#553c6c;
}

.nr-pill-live {
border-color:#9a4b40;
background:#edc3ba;
color:#7b2f25;
}

.nr-pill-smart {
border-color:#496f87;
background:#c9e3ef;
color:#294f64;
}

.nr-pill-waiting {
border-color:#9b7b27;
background:#f3dfa2;
color:#6b5010;
}

.nr-card {
margin-bottom:8px;
padding:8px;
border:1px solid #a78d61;
border-radius:6px;
background:rgba(255,248,226,.62);
box-shadow:inset 0 1px rgba(255,255,255,.55);
}

.nr-card-title {
margin-bottom:7px;
font-size:11px;
font-weight:bold;
color:#51391c;
}

.nr-settings {
display:grid;
grid-template-columns:repeat(5,1fr);
gap:6px;
}

.nr-field label {
display:block;
margin-bottom:3px;
font-size:9px;
font-weight:bold;
color:#675032;
}

.nr-field input {
width:100%;
height:27px;
padding:3px 5px;
border:1px solid #8d754f;
border-radius:3px;
background:#fff9e9;
color:#382819;
font-size:11px;
}

.nr-mode-grid {
display:grid;
grid-template-columns:repeat(3,1fr);
gap:7px;
}

.nr-switch-box {
display:flex;
align-items:center;
gap:7px;
min-height:55px;
padding:7px;
border:1px solid #a78d61;
border-radius:5px;
background:#f4e6c7;
cursor:pointer;
}

.nr-switch-box:hover {
background:#f8edd5;
}

.nr-switch-box input {
width:17px;
height:17px;
flex:0 0 auto;
}

.nr-switch-title {
font-weight:bold;
color:#49331b;
}

.nr-switch-description {
margin-top:2px;
font-size:9px;
color:#755c3a;
}

#nr-target-input {
width:100%;
height:62px;
resize:vertical;
padding:6px;
border:1px solid #8d754f;
border-radius:4px;
background:#fff9e9;
color:#382819;
font-family:Consolas,monospace;
font-size:11px;
}

.nr-actions {
display:flex;
flex-wrap:wrap;
gap:6px;
margin-top:7px;
}

.nr-btn {
min-height:29px;
padding:5px 10px;
border:1px solid #67491f;
border-radius:4px;
background:linear-gradient(#d9bb79,#b58d4b);
color:#38230c;
font-size:10px;
font-weight:bold;
cursor:pointer;
}

.nr-start {
border-color:#426c32;
background:linear-gradient(#b8d894,#83ad61);
color:#29491e;
}

.nr-pause {
border-color:#8c692f;
background:linear-gradient(#ead086,#c7a74d);
color:#604513;
}

.nr-reset {
border-color:#8b4439;
background:linear-gradient(#e5a79d,#c47467);
color:#65271e;
}

.nr-table-wrap {
max-height:285px;
overflow:auto;
border:1px solid #9b8258;
border-radius:4px;
background:#f7ebcf;
}

.nr-table {
width:100%;
border-collapse:collapse;
table-layout:auto;
}

.nr-table th {
position:sticky;
top:0;
z-index:2;
padding:6px 5px;
border-bottom:1px solid #8e754c;
background:linear-gradient(#d9c08a,#c1a264);
color:#493319;
font-size:9px;
text-align:left;
white-space:nowrap;
}

.nr-table td {
padding:6px 5px;
border-bottom:1px solid rgba(128,102,62,.25);
vertical-align:middle;
font-size:10px;
}

.nr-table tbody tr:nth-child(even) {
background:rgba(255,255,255,.22);
}

.nr-coords {
font-family:Consolas,monospace;
font-weight:bold;
color:#4c351c;
white-space:nowrap;
}

.nr-countdown {
font-family:Consolas,monospace;
font-size:11px;
font-weight:bold;
color:#6a321e;
white-space:nowrap;
}

.nr-clock {
margin-top:2px;
font-size:8px;
color:#806c4d;
white-space:nowrap;
}

.nr-status-text {
font-size:9px;
font-weight:bold;
white-space:nowrap;
}

.nr-status-wait {
color:#78623e;
}

.nr-status-done {
color:#397132;
}

.nr-status-error {
color:#a03025;
}

.nr-status-smart {
color:#2d6681;
}

.nr-status-conquered {
color:#247126;
font-weight:bold;
}

.nr-status-retry {
color:#9a6c12;
font-weight:bold;
}

.nr-error {
max-width:145px;
margin-top:2px;
color:#9c2f25;
font-size:8px;
line-height:1.25;
}

.nr-loyalty-value {
display:inline-block;
min-width:24px;
font-family:Consolas,monospace;
font-size:11px;
font-weight:bold;
color:#5c3d20;
text-align:right;
}

.nr-loyalty-refresh {
margin-left:3px;
padding:0 4px;
border:1px solid #8d754f;
border-radius:3px;
background:#f1dfb7;
color:#51391c;
font-size:10px;
cursor:pointer;
}

.nr-loyalty-sub {
margin-top:2px;
font-size:8px;
color:#806c4d;
white-space:nowrap;
}

.nr-remove {
width:22px;
height:22px;
padding:0;
border:1px solid #9a5046;
border-radius:3px;
background:#f2d2ca;
color:#812b20;
font-weight:bold;
cursor:pointer;
}

.nr-empty {
padding:14px;
text-align:center;
color:#755c3a;
}

#nr-log {
height:170px;
overflow-y:auto;
padding:8px;
border:1px solid #17130f;
border-radius:6px;
background:#211e19;
color:#d9d4ca;
font-family:Consolas,monospace;
font-size:10px;
line-height:1.45;
}

.nr-log-info {
color:#d9d4ca;
}

.nr-log-error {
color:#ff847a;
}

.nr-log-warning {
color:#ffd56e;
}

.nr-log-success {
color:#8fe58b;
}

.nr-footer {
margin-top:8px;
text-align:right;
font-size:8px;
color:rgba(69,46,20,.60);
}

@media (max-width:760px) {
#noble-rotation-ui {
width:calc(100vw - 14px);
}

.nr-settings {
grid-template-columns:repeat(2,1fr);
}

.nr-mode-grid {
grid-template-columns:1fr;
}
}
</style>

<div id="nr-header">

<div class="nr-header-left">

<div class="nr-logo">
👑
</div>

<div class="nr-title">
Noble Rotation
<span class="nr-version">
v${VERSION}
</span>
</div>

<div id="nr-header-mini-status">
PAUZA
</div>

</div>

<div class="nr-header-buttons">

<button
id="nr-minimize"
class="nr-window-btn"
title="Minimalizovať"
>
—
</button>

</div>

</div>

<div class="nr-content">

<div id="nr-status"></div>

<div class="nr-card">

<div class="nr-card-title">
⚙ Nastavenie útoku
</div>

<div class="nr-settings">

<div class="nr-field">
<label>Axe / útok</label>
<input
id="nr-axe"
type="number"
min="0"
>
</div>

<div class="nr-field">
<label>Light / útok</label>
<input
id="nr-light"
type="number"
min="0"
>
</div>

<div class="nr-field">
<label>Max útokov / cieľ</label>
<input
id="nr-count"
type="number"
min="1"
>
</div>

<div class="nr-field">
<label>Delay MIN</label>
<input
id="nr-delay-min"
type="number"
min="0"
>
</div>

<div class="nr-field">
<label>Delay MAX</label>
<input
id="nr-delay-max"
type="number"
min="0"
>
</div>

</div>

</div>

<div class="nr-card">

<div class="nr-card-title">
🧪 Režim
</div>

<div class="nr-mode-grid">

<label class="nr-switch-box">

<input
id="nr-dry-run"
type="checkbox"
>

<div>
<div class="nr-switch-title">
DRY RUN
</div>

<div class="nr-switch-description">
Confirmation áno, finálne odoslanie nie.
</div>
</div>

</label>

<label class="nr-switch-box">

<input
id="nr-ram-test"
type="checkbox"
>

<div>
<div class="nr-switch-title">
RAM TEST
</div>

<div class="nr-switch-description">
Namiesto noble sa používa 1 ram.
</div>
</div>

</label>

<label class="nr-switch-box">

<input
id="nr-smart-mode"
type="checkbox"
>

<div>
<div class="nr-switch-title">
🧠 SMART MODE
</div>

<div class="nr-switch-description">
Po dopade číta nový report. Pošle iba potrebné noble.
</div>
</div>

</label>

</div>

</div>

<div class="nr-card">

<div class="nr-card-title">
🎯 Ciele
</div>

<textarea
id="nr-target-input"
placeholder="434|447
433|458
431|458"
></textarea>

<div class="nr-actions">

<button
class="nr-btn"
id="nr-add"
>
+ Pridať ciele
</button>

<button
class="nr-btn"
id="nr-refresh-loyalty"
>
↻ Oddanosť
</button>

</div>

</div>

<div class="nr-card">

<div class="nr-card-title">
📋 Rotation
</div>

<div
id="nr-target-table"
class="nr-table-wrap"
></div>

</div>

<div class="nr-actions">

<button
class="nr-btn nr-start"
id="nr-start"
>
▶ SPUSTIŤ
</button>

<button
class="nr-btn nr-pause"
id="nr-pause"
>
⏸ PAUZA
</button>

<button
class="nr-btn nr-reset"
id="nr-reset"
>
🗑 RESET
</button>

</div>

<div
class="nr-card"
style="margin-top:10px"
>

<div class="nr-card-title">
📜 Log
</div>

<div id="nr-log"></div>

</div>

<div class="nr-footer">
Noble Rotation v${VERSION}
</div>

</div>
`;

    document.body.appendChild(
        box
    );

    document.querySelector(
        '#nr-add'
    ).onclick =
        addTargetsFromUI;

    document.querySelector(
        '#nr-start'
    ).onclick =
        start;

    document.querySelector(
        '#nr-refresh-loyalty'
    ).onclick =
        () =>
            refreshLoyalties();

    document.querySelector(
        '#nr-pause'
    ).onclick =
        pause;

    document.querySelector(
        '#nr-minimize'
    ).onclick =
        event => {
            event.stopPropagation();
            toggleMinimize();
        };

    document.querySelector(
        '#nr-reset'
    ).onclick =
        () => {
            if (
                confirm(
                    'Vymazať celý uložený ' +
                    'Noble Rotation stav?'
                )
            ) {
                pause();
                resetState();
            }
        };

    [
        '#nr-axe',
        '#nr-light',
        '#nr-count',
        '#nr-delay-min',
        '#nr-delay-max',
        '#nr-dry-run',
        '#nr-ram-test',
        '#nr-smart-mode'
    ].forEach(
        selector => {
            const element =
                document.querySelector(
                    selector
                );

            if (!element) {
                return;
            }

            element.addEventListener(
                'change',
                () => {
                    if (!running) {
                        readSettingsFromUI();
                    }
                }
            );
        }
    );

    applyWindowPosition();
    enableDragging();

    render();

    if (uiTimer) {
        clearInterval(
            uiTimer
        );
    }

    uiTimer =
        setInterval(
            updateLiveUI,
            1000
        );
}

/*
=====================================================================
ČASŤ 3/3 POKRAČUJE PRESNE TU
=====================================================================
*/

function render() {
    if (
        !document.querySelector(
            '#noble-rotation-ui'
        )
    ) {
        return;
    }

    const axe =
        document.querySelector(
            '#nr-axe'
        );

    const light =
        document.querySelector(
            '#nr-light'
        );

    const count =
        document.querySelector(
            '#nr-count'
        );

    const delayMin =
        document.querySelector(
            '#nr-delay-min'
        );

    const delayMax =
        document.querySelector(
            '#nr-delay-max'
        );

    const dry =
        document.querySelector(
            '#nr-dry-run'
        );

    const ram =
        document.querySelector(
            '#nr-ram-test'
        );

    const smart =
        document.querySelector(
            '#nr-smart-mode'
        );

    if (axe) {
        axe.value =
            state.settings.axe;
    }

    if (light) {
        light.value =
            state.settings.light;
    }

    if (count) {
        count.value =
            state.settings.attacksPerTarget;
    }

    if (delayMin) {
        delayMin.value =
            state.settings.minReturnDelay;
    }

    if (delayMax) {
        delayMax.value =
            state.settings.maxReturnDelay;
    }

    if (dry) {
        dry.checked =
            state.settings.dryRun;
    }

    if (ram) {
        ram.checked =
            state.settings.ramTest;
    }

    if (smart) {
        smart.checked =
            state.settings.smartMode;
    }

    renderTargets();
    renderLog();
    updateLiveUI();
}

/*
=====================================================================
TARGET TABLE
=====================================================================
*/

function renderTargets() {
    const container =
        document.querySelector(
            '#nr-target-table'
        );

    if (!container) {
        return;
    }

    if (
        state.targets.length === 0
    ) {
        container.innerHTML = `
            <div class="nr-empty">
                Zatiaľ nemáš pridané žiadne ciele.
            </div>
        `;

        return;
    }

    let html = `
        <table class="nr-table">
            <thead>
                <tr>
                    <th>Cieľ</th>
                    <th>Oddanosť</th>
                    <th>Odoslané</th>
                    <th>Sloty</th>
                    <th>Cesta</th>
                    <th>Ďalšie odoslanie</th>
                    <th>Stav</th>
                    <th></th>
                </tr>
            </thead>

            <tbody>
    `;

    for (
        const target
        of state.targets
    ) {
        /*
        v1.5.2:
        pred renderom opravíme prípadný
        starý chybný conquered flag.
        */
        normalizeTargetConqueredState(
            target
        );

        const slots =
            state.slots.filter(
                slot =>
                    slot.target ===
                        target.coords &&
                    !slot.finished
            );

        let next =
            null;

        if (slots.length) {
            next =
                Math.min(
                    ...slots.map(
                        slot =>
                            Number(
                                slot.returnAt
                            )
                    )
                );
        }

        /*
        Ak čakáme na noble doma
        a cieľ zatiaľ nemá slot,
        ukážeme initial retry.
        */
        if (
            !next &&
            running &&
            waitingInitialDistribution &&
            initialRetryAt &&
            targetNeedsAttack(target) &&
            !slots.length
        ) {
            next =
                initialRetryAt;
        }

        let travel =
            '-';

        try {
            travel =
                formatDuration(
                    calculateTravel(
                        target.coords
                    ).seconds
                );

        } catch (_) {}

        let status =
            'ČAKÁ';

        let statusClass =
            'nr-status-wait';

        /*
        =============================================================
        STRICT STATUS
        =============================================================

        PREVZATÁ iba:
        loyaltyKnown === true
        + skutočná číselná loyalty
        + loyalty <= 0

        ? nikdy nebude PREVZATÁ.
        =============================================================
        */

        if (
            isTargetReallyConquered(
                target
            )
        ) {
            status =
                '☑ PREVZATÁ';

            statusClass =
                'nr-status-conquered';

        } else if (
            target.waitingForLoyalty &&
            state.settings.smartMode &&
            !state.settings.ramTest
        ) {
            status =
                '🧠 ČAKÁ NA REPORT';

            statusClass =
                'nr-status-smart';

        } else if (
            target.finished
        ) {
            status =
                'HOTOVO';

            statusClass =
                'nr-status-done';

        } else if (
            target.lastError
        ) {
            status =
                'CHYBA';

            statusClass =
                'nr-status-error';

        } else if (
            running &&
            waitingInitialDistribution &&
            !slots.length &&
            targetNeedsAttack(target)
        ) {
            status =
                `⏳ ČAKÁ NA ${getRotationUnitName()}`;

            statusClass =
                'nr-status-retry';

        } else if (
            slots.length &&
            state.settings.smartMode &&
            !state.settings.ramTest
        ) {
            status =
                '🧠 SMART';

            statusClass =
                'nr-status-smart';

        } else if (
            slots.length
        ) {
            status =
                'ROTÁCIA';

            statusClass =
                'nr-status-done';
        }

        const displayedLoyalty =
            getDisplayedLoyalty(
                target
            );

        html += `
            <tr>

                <td>
                    <span class="nr-coords">
                        ${target.coords}
                    </span>
                </td>

                <td>

                    <span
                        class="nr-loyalty-value"
                        data-loyalty-coords="${target.coords}"
                    >
                        ${
                            target.loyaltyLoading
                                ? '…'
                                : (
                                    displayedLoyalty === null
                                        ? '?'
                                        : displayedLoyalty
                                )
                        }
                    </span>

                    <button
                        class="nr-loyalty-refresh"
                        data-refresh-loyalty="${target.coords}"
                        title="Obnoviť oddanosť"
                        ${
                            target.loyaltyLoading
                                ? 'disabled'
                                : ''
                        }
                    >
                        ↻
                    </button>

                    ${
                        hasRealLoyalty(target) &&
                        target.loyaltyReportTime
                            ? `
                                <div class="nr-loyalty-sub">
                                    report ${target.loyalty} ·
                                    ${
                                        new Date(
                                            target.loyaltyReportTime
                                        ).toLocaleTimeString(
                                            [],
                                            {
                                                hour:
                                                    '2-digit',

                                                minute:
                                                    '2-digit'
                                            }
                                        )
                                    }
                                </div>
                            `
                            : (
                                target.loyaltyError
                                    ? `
                                        <div class="nr-loyalty-sub">
                                            ${
                                                escapeHtml(
                                                    target.loyaltyError
                                                )
                                            }
                                        </div>
                                    `
                                    : `
                                        <div class="nr-loyalty-sub">
                                            Oddanosť neznáma
                                        </div>
                                    `
                            )
                    }

                </td>

                <td>
                    ${target.sent}/${target.wanted}
                </td>

                <td>
                    ${slots.length}
                </td>

                <td>
                    ${travel}
                </td>

                <td>

                    ${
                        next
                            ? `
                                <div
                                    class="nr-countdown"
                                    data-countdown="${next}"
                                >
                                    ${formatCountdown(next)}
                                </div>

                                <div class="nr-clock">
                                    ${formatClock(next)}
                                </div>
                            `
                            : '-'
                    }

                </td>

                <td>

                    <span class="
                        nr-status-text
                        ${statusClass}
                    ">
                        ${status}
                    </span>

                    ${
                        target.lastError
                            ? `
                                <div class="nr-error">
                                    ${
                                        escapeHtml(
                                            target.lastError
                                        )
                                    }
                                </div>
                            `
                            : ''
                    }

                </td>

                <td>

                    <button
                        class="nr-remove"
                        data-remove="${target.coords}"
                        title="Odstrániť cieľ"
                    >
                        ×
                    </button>

                </td>

            </tr>
        `;
    }

    html += `
            </tbody>
        </table>
    `;

    container.innerHTML =
        html;

    container
        .querySelectorAll(
            '[data-remove]'
        )
        .forEach(
            button => {
                button.onclick =
                    () => {
                        removeTarget(
                            button.dataset.remove
                        );
                    };
            }
        );

    container
        .querySelectorAll(
            '[data-refresh-loyalty]'
        )
        .forEach(
            button => {
                button.onclick =
                    () => {
                        refreshTargetLoyalty(
                            button.dataset
                                .refreshLoyalty
                        );
                    };
            }
        );

    updateCountdownElements();
    updateLoyaltyElements();
}

/*
=====================================================================
LOG
=====================================================================
*/

function renderLog() {
    const container =
        document.querySelector(
            '#nr-log'
        );

    if (!container) {
        return;
    }

    container.innerHTML =
        state.log
            .map(
                item => `
                    <div class="nr-log-${item.type}">
                        [${
                            new Date(
                                item.time
                            ).toLocaleTimeString()
                        }]
                        ${
                            escapeHtml(
                                item.message
                            )
                        }
                    </div>
                `
            )
            .join('');
}

/*
=====================================================================
LIVE LOYALTY
=====================================================================
*/

function updateLoyaltyElements() {
    document
        .querySelectorAll(
            '[data-loyalty-coords]'
        )
        .forEach(
            element => {
                const target =
                    getTarget(
                        element.dataset
                            .loyaltyCoords
                    );

                if (!target) {
                    return;
                }

                /*
                Ak loyalty nie je skutočne
                známa, vždy zobrazíme ?.
                */
                if (
                    !hasRealLoyalty(
                        target
                    )
                ) {
                    element.textContent =
                        target.loyaltyLoading
                            ? '…'
                            : '?';

                    return;
                }

                if (
                    target.loyaltyLoading
                ) {
                    element.textContent =
                        '…';

                    return;
                }

                const value =
                    getDisplayedLoyalty(
                        target
                    );

                element.textContent =
                    value === null
                        ? '?'
                        : String(value);
            }
        );
}

/*
=====================================================================
COUNTDOWN
=====================================================================
*/

function updateCountdownElements() {
    document
        .querySelectorAll(
            '[data-countdown]'
        )
        .forEach(
            element => {
                const timestamp =
                    Number(
                        element.dataset
                            .countdown
                    );

                element.textContent =
                    formatCountdown(
                        timestamp
                    );
            }
        );
}

function getNextActiveSlot() {
    const active =
        state.slots
            .filter(
                slot =>
                    !slot.finished &&
                    Number.isFinite(
                        Number(
                            slot.returnAt
                        )
                    )
            )
            .sort(
                (a, b) =>
                    Number(
                        a.returnAt
                    ) -
                    Number(
                        b.returnAt
                    )
            );

    return (
        active[0] ||
        null
    );
}

function getNextGlobalActionTime() {
    const slot =
        getNextActiveSlot();

    const slotTime =
        slot
            ? Number(
                slot.returnAt
            )
            : null;

    const retryTime =
        (
            running &&
            waitingInitialDistribution &&
            initialRetryAt
        )
            ? Number(
                initialRetryAt
            )
            : null;

    if (
        slotTime &&
        retryTime
    ) {
        return Math.min(
            slotTime,
            retryTime
        );
    }

    return (
        slotTime ||
        retryTime ||
        null
    );
}

/*
=====================================================================
LIVE UI
=====================================================================
*/

function updateLiveUI() {
    updateCountdownElements();
    updateLoyaltyElements();

    const status =
        document.querySelector(
            '#nr-status'
        );

    const mini =
        document.querySelector(
            '#nr-header-mini-status'
        );

    const activeSlots =
        state.slots.filter(
            slot =>
                !slot.finished
        ).length;

    const unitMode =
        state.settings.ramTest
            ? '🐏 RAM TEST'
            : '👑 NOBLE';

    const sendMode =
        state.settings.dryRun
            ? '🧪 DRY RUN'
            : '🔥 LIVE';

    const smartMode =
        state.settings.smartMode &&
        !state.settings.ramTest;

    const nextAction =
        getNextGlobalActionTime();

    const nextText =
        nextAction
            ? formatCountdown(
                nextAction
            )
            : '-';

    const waitingText =
        waitingInitialDistribution
            ? `⏳ ČAKÁM NA ${getRotationUnitName()}`
            : null;

    if (status) {
        status.innerHTML = `

            <span class="
                nr-pill
                ${
                    running
                        ? 'nr-pill-running'
                        : 'nr-pill-paused'
                }
            ">
                ${
                    running
                        ? '● BEŽÍ'
                        : '● PAUZA'
                }
            </span>

            <span class="nr-pill">
                ${unitMode}
            </span>

            <span class="
                nr-pill
                ${
                    state.settings.dryRun
                        ? 'nr-pill-dry'
                        : 'nr-pill-live'
                }
            ">
                ${sendMode}
            </span>

            ${
                smartMode
                    ? `
                        <span class="
                            nr-pill
                            nr-pill-smart
                        ">
                            🧠 SMART
                        </span>
                    `
                    : ''
            }

            ${
                waitingText
                    ? `
                        <span class="
                            nr-pill
                            nr-pill-waiting
                        ">
                            ${waitingText}
                        </span>
                    `
                    : ''
            }

            <span class="nr-pill">
                Sloty: ${activeSlots}
            </span>

            <span class="nr-pill">
                Najbližšie: ${nextText}
            </span>
        `;
    }

    if (mini) {
        mini.textContent =
            `${
                running
                    ? '● BEŽÍ'
                    : '● PAUZA'
            }` +

            `${
                smartMode
                    ? ' · 🧠 SMART'
                    : ''
            }` +

            `${
                waitingInitialDistribution
                    ? ` · ⏳ ${getRotationUnitName()}`
                    : ''
            }` +

            ` · Sloty ${activeSlots}` +

            (
                nextAction
                    ? ` · ${nextText}`
                    : ''
            );
    }
}

/*
=====================================================================
BOOT NORMALIZATION
=====================================================================
*/

state.version =
    VERSION;

if (
    typeof state.settings.smartMode !==
    'boolean'
) {
    state.settings.smartMode =
        false;
}

/*
=====================================================================
TARGET MIGRATION / BUG FIX
=====================================================================

v1.5.1 mohla uložiť napríklad:

loyaltyKnown = false
loyalty = null
conquered = true
finished = true

v1.5.2 to pri načítaní automaticky opraví.
=====================================================================
*/

for (
    const target
    of state.targets
) {
    if (
        !Number.isFinite(
            Number(
                target.sent
            )
        )
    ) {
        target.sent =
            0;
    }

    if (
        !Number.isFinite(
            Number(
                target.wanted
            )
        )
    ) {
        target.wanted =
            state.settings
                .attacksPerTarget;
    }

    if (
        typeof target.finished !==
        'boolean'
    ) {
        target.finished =
            false;
    }

    if (
        typeof target
            .waitingForLoyalty !==
        'boolean'
    ) {
        target.waitingForLoyalty =
            false;
    }

    /*
    loyaltyKnown musí znamenať,
    že skutočne existuje číslo.
    */
    const loyaltyActuallyExists =
        target.loyalty !== null &&
        target.loyalty !== undefined &&
        target.loyalty !== '' &&
        Number.isFinite(
            Number(
                target.loyalty
            )
        );

    if (
        target.loyaltyKnown !== true ||
        !loyaltyActuallyExists
    ) {
        target.loyaltyKnown =
            false;

        target.loyalty =
            null;

        target.loyaltyReportTime =
            null;

        target.loyaltyReportId =
            null;

        target.loyaltyReportUrl =
            null;

        /*
        HLAVNÁ OPRAVA:
        ? = NIE JE PREVZATÁ.
        */
        target.conquered =
            false;

        if (
            Number(
                target.sent || 0
            ) <
            Number(
                target.wanted || 0
            )
        ) {
            target.finished =
                false;
        }

    } else {
        target.loyalty =
            Number(
                target.loyalty
            );

        if (
            target.loyalty <= 0
        ) {
            target.conquered =
                true;

            target.finished =
                true;

            target.waitingForLoyalty =
                false;

        } else {
            target.conquered =
                false;
        }
    }

    target.loyaltyLoading =
        false;

    if (
        target.loyaltyError ===
        undefined
    ) {
        target.loyaltyError =
            null;
    }

    normalizeTargetConqueredState(
        target
    );
}

/*
=====================================================================
SLOT MIGRATION
=====================================================================
*/

for (
    const slot
    of state.slots
) {
    if (
        typeof slot.smart !==
        'boolean'
    ) {
        slot.smart =
            false;
    }

    if (
        typeof slot.reportChecked !==
        'boolean'
    ) {
        slot.reportChecked =
            false;
    }

    if (
        typeof slot.waitingForReport !==
        'boolean'
    ) {
        slot.waitingForReport =
            false;
    }

    if (
        slot.reportBeforeId ===
        undefined
    ) {
        slot.reportBeforeId =
            null;
    }

    if (
        slot.reportBeforeTime ===
        undefined
    ) {
        slot.reportBeforeTime =
            null;
    }

    /*
    Starší slot nemusí mať impactAt.
    */
    if (
        !Number.isFinite(
            Number(
                slot.impactAt
            )
        ) &&
        Number.isFinite(
            Number(
                slot.sentAt
            )
        ) &&
        Number.isFinite(
            Number(
                slot.travelSeconds
            )
        )
    ) {
        slot.impactAt =
            Number(
                slot.sentAt
            ) +
            Number(
                slot.travelSeconds
            ) *
            1000;
    }
}

/*
Runtime retry po novom vložení
skriptu začína čistý.
*/

waitingInitialDistribution =
    false;

initialRetryAt =
    null;

saveState();

/*
=====================================================================
CREATE UI
=====================================================================
*/

createUI();

log(
    `Noble Rotation v${VERSION} načítaný.`,
    'success'
);

updateLiveUI();

/*
=====================================================================
PUBLIC API
=====================================================================
*/

window.NobleRotation = {
    version:
        VERSION,

    getState:
        () =>
            JSON.parse(
                JSON.stringify(
                    state
                )
            ),

    getUIState:
        () =>
            JSON.parse(
                JSON.stringify(
                    uiState
                )
            ),

    getLoyalty:
        coords => {
            const target =
                getTarget(
                    coords
                );

            if (!target) {
                return null;
            }

            return {
                known:
                    hasRealLoyalty(
                        target
                    ),

                base:
                    hasRealLoyalty(
                        target
                    )
                        ? target.loyalty
                        : null,

                reportTime:
                    hasRealLoyalty(
                        target
                    )
                        ? target.loyaltyReportTime
                        : null,

                reportId:
                    hasRealLoyalty(
                        target
                    )
                        ? target.loyaltyReportId
                        : null,

                exact:
                    getEstimatedLoyalty(
                        target
                    ),

                displayed:
                    getDisplayedLoyalty(
                        target
                    ),

                conquered:
                    isTargetReallyConquered(
                        target
                    )
            };
        },

    getWaitingState:
        () => ({
            waiting:
                waitingInitialDistribution,

            retryAt:
                initialRetryAt,

            retryIn:
                initialRetryAt
                    ? Math.max(
                        0,
                        Math.ceil(
                            (
                                initialRetryAt -
                                Date.now()
                            ) /
                            1000
                        )
                    )
                    : null
        }),

    refreshLoyalty:
        coords =>
            coords
                ? refreshTargetLoyalty(
                    coords
                )
                : refreshLoyalties(),

    start,
    pause
};

/*
=====================================================================
CONSOLE INFO
=====================================================================
*/

console.log(
    `%c Noble Rotation v${VERSION} `,
    'background:#7a5429;' +
    'color:#fff3d2;' +
    'font-weight:bold;' +
    'padding:3px 6px;' +
    'border-radius:3px;'
);

console.log(
    '[Noble Rotation] Mode:',
    state.settings.ramTest
        ? 'RAM TEST'
        : 'NOBLE',
    '|',
    state.settings.dryRun
        ? 'DRY RUN'
        : 'LIVE',
    '|',
    state.settings.smartMode
        ? 'SMART'
        : 'FIX'
);

console.log(
    '[Noble Rotation] Targets:',
    state.targets.length,
    '| Slots:',
    state.slots.length
);

/*
=====================================================================
v1.5.2 LOGIC SUMMARY
=====================================================================

UNKNOWN TARGET:

    loyaltyKnown = false
    loyalty = null
    UI = ?

    => conquered = false
    => finished = false
    => SMART môže poslať prvého noble


KNOWN TARGET:

    loyalty = 80
    => pokračuje

    loyalty = 4
    => pokračuje

    loyalty = 1
    => pokračuje

    loyalty = 0
    => PREVZATÁ

    loyalty = -4
    => PREVZATÁ

    loyalty = -20
    => PREVZATÁ


SMART FLOW:

    ?
      ↓
    pošle 1 noble
      ↓
    dopad
      ↓
    čaká na NOVÝ report
      ↓
    napr. 74
      ↓
    čaká na návrat noble
      ↓
    pošle ďalšieho
      ↓
    nový report
      ↓
    napr. 47
      ↓
    ďalší noble
      ↓
    napr. 19
      ↓
    ďalší noble
      ↓
    napr. -7
      ↓
    ☑ PREVZATÁ
      ↓
    STOP pre tento cieľ


Ak noble nie je doma:

    SPUSTIŤ
      ↓
    script zostane BEŽÍ
      ↓
    kontrola 10–20 sekúnd
      ↓
    stále 0 noble
      ↓
    ďalších 10–20 sekúnd
      ↓
    noble doma
      ↓
    automaticky odošle


Max útokov / cieľ:

    V SMART režime ide o bezpečnostný limit.

    Napríklad MAX = 5:

    Ak dedinu prevezme tretí noble:
        ďalší sa neposiela.

    Ak po piatom noble zostane loyalty > 0:
        ďalší sa neposiela,
        pretože bol dosiahnutý limit.

=====================================================================
*/

console.log(
    '[Noble Rotation] v1.5.2 ready.'
);

/*
=====================================================================
FINAL SAFETY CHECK
=====================================================================

Ešte raz odstránime akýkoľvek starý
falošný conquered stav pri neznámej loyalty.

Toto je úmyselne redundantné.
=====================================================================
*/

let repairedUnknownTargets =
    0;

for (
    const target
    of state.targets
) {
    if (
        !hasRealLoyalty(
            target
        ) &&
        target.conquered
    ) {
        target.conquered =
            false;

        if (
            Number(
                target.sent || 0
            ) <
            Number(
                target.wanted || 0
            )
        ) {
            target.finished =
                false;
        }

        repairedUnknownTargets++;
    }
}

if (
    repairedUnknownTargets > 0
) {
    saveState();
    renderTargets();

    log(
        `v1.5.2 opravila ` +
        `${repairedUnknownTargets} ` +
        `cieľov, ktoré mali neznámu ` +
        `oddanosť (?) a boli nesprávne ` +
        `označené ako prevzaté.`,
        'success'
    );
}

/*
=====================================================================
END
=====================================================================
*/

})();
