// FarmGod - automatickĂ© opakovanie (opravenĂ© plnĂ© naÄŤĂ­tanie kaĹľdĂ˝ cyklus)
// + blacklist + limit bodov

window.FarmGod = {};
window.FarmGod.Library = (function() {
    if (typeof window.twLib === 'undefined') {
        window.twLib = {
            queues: null,
            init: function() {
                if (this.queues === null) {
                    this.queues = this.queueLib.createQueues(5);
                }
            },
            queueLib: {
                maxAttempts: 3,
                Item: function(action, arg, promise = null) {
                    this.action = action;
                    this.arguments = arg;
                    this.promise = promise;
                    this.attempts = 0;
                },
                Queue: function() {
                    this.list = [];
                    this.working = false;
                    this.length = 0;
                    this.doNext = function() {
                        let item = this.dequeue();
                        let self = this;
                        if (item.action == 'openWindow') {
                            window.open(...item.arguments).addEventListener('DOMContentLoaded', function() {
                                self.start();
                            });
                        } else {
                            $[item.action](...item.arguments).done(function() {
                                item.promise.resolve.apply(null, arguments);
                                self.start();
                            }).fail(function() {
                                item.attempts += 1;
                                if (item.attempts < twLib.queueLib.maxAttempts) {
                                    self.enqueue(item, true);
                                } else {
                                    item.promise.reject.apply(null, arguments);
                                }
                                self.start();
                            });
                        }
                    };
                    this.start = function() {
                        if (this.length) {
                            this.working = true;
                            this.doNext();
                        } else {
                            this.working = false;
                        }
                    };
                    this.dequeue = function() {
                        this.length -= 1;
                        return this.list.shift();
                    };
                    this.enqueue = function(item, front = false) {
                        (front) ? this.list.unshift(item) : this.list.push(item);
                        this.length += 1;
                        if (!this.working) {
                            this.start();
                        }
                    };
                },
                createQueues: function(amount) {
                    let arr = [];
                    for (let i = 0; i < amount; i++) {
                        arr[i] = new twLib.queueLib.Queue();
                    }
                    return arr;
                },
                addItem: function(item) {
                    let leastBusyQueue = twLib.queues.map(q => q.length).reduce((next, curr) => (curr < next) ? curr : next, 0);
                    twLib.queues[leastBusyQueue].enqueue(item);
                },
                orchestrator: function(type, arg) {
                    let promise = $.Deferred();
                    let item = new twLib.queueLib.Item(type, arg, promise);
                    twLib.queueLib.addItem(item);
                    return promise;
                }
            },
            ajax: function() { return twLib.queueLib.orchestrator('ajax', arguments); },
            get:   function() { return twLib.queueLib.orchestrator('get',   arguments); },
            post:  function() { return twLib.queueLib.orchestrator('post',  arguments); },
            openWindow: function() {
                let item = new twLib.queueLib.Item('openWindow', arguments);
                twLib.queueLib.addItem(item);
            }
        };
        twLib.init();
    }

    const setUnitSpeeds = function() {
        let unitSpeeds = {};
        $.when($.get('/interface.php?func=get_unit_info')).then((xml) => {
            $(xml).find('config').children().map((i, el) => {
                unitSpeeds[$(el).prop('nodeName')] = $(el).find('speed').text().toNumber();
            });
            localStorage.setItem('FarmGod_unitSpeeds', JSON.stringify(unitSpeeds));
        });
    };

    const getUnitSpeeds = function() {
        return JSON.parse(localStorage.getItem('FarmGod_unitSpeeds')) || false;
    };

    if (!getUnitSpeeds()) setUnitSpeeds();

    const determineNextPage = function(page, $html) {
        let villageLength = ($html.find('#scavenge_mass_screen').length > 0) ? $html.find('tr[id*="scavenge_village"]').length : $html.find('tr.row_a, tr.row_ax, tr.row_b, tr.row_bx').length;
        let navSelect = $html.find('.paged-nav-item').first().closest('td').find('select').first();
        let navLength = ($html.find('#am_widget_Farm').length > 0) ? parseInt($('#plunder_list_nav').first().find('a.paged-nav-item, strong.paged-nav-item')[$('#plunder_list_nav').first().find('a.paged-nav-item, strong.paged-nav-item').length - 1].textContent.replace(/\D/g, '')) - 1 : ((navSelect.length > 0) ? navSelect.find('option').length - 1 : $html.find('.paged-nav-item').not('[href*="page=-1"]').length);
        let pageSize = ($('#mobileHeader').length > 0) ? 10 : parseInt($html.find('input[name="page_size"]').val());
        if (page == -1 && villageLength == 1000) {
            return Math.floor(1000 / pageSize);
        } else if (page < navLength) {
            return page + 1;
        }
        return false;
    };

    const processPage = function(url, page, wrapFn) {
        let pageText = (url.match('am_farm')) ? `&Farm_page=${page}` : `&page=${page}`;
        return twLib.ajax({ url: url + pageText }).then((html) => {
            return wrapFn(page, $(html));
        });
    };

    const processAllPages = function(url, processorFn) {
        let page = (url.match('am_farm') || url.match('scavenge_mass')) ? 0 : -1;
        let wrapFn = function(page, $html) {
            let dnp = determineNextPage(page, $html);
            if (dnp) {
                processorFn($html);
                return processPage(url, dnp, wrapFn);
            } else {
                return processorFn($html);
            }
        };
        return processPage(url, page, wrapFn);
    };

    const getDistance = function(origin, target) {
        let a = origin.toCoord(true).x - target.toCoord(true).x;
        let b = origin.toCoord(true).y - target.toCoord(true).y;
        return Math.hypot(a, b);
    };

    const subtractArrays = function(array1, array2) {
        let result = array1.map((val, i) => val - array2[i]);
        return (result.some(v => v < 0)) ? false : result;
    };

    const getCurrentServerTime = function() {
        let [hour, min, sec, day, month, year] = $('#serverTime').closest('p').text().match(/\d+/g);
        return new Date(year, (month - 1), day, hour, min, sec).getTime();
    };

    const timestampFromString = function(timestr) {
        let d = $('#serverDate').text().split('/').map(x => +x);
        let todayPattern = new RegExp(window.lang['aea2b0aa9ae1534226518faaefffdaad'].replace('%s', '([\\d+|:]+)')).exec(timestr);
        let tomorrowPattern = new RegExp(window.lang['57d28d1b211fddbb7a499ead5bf23079'].replace('%s', '([\\d+|:]+)')).exec(timestr);
        let laterDatePattern = new RegExp(window.lang['0cb274c906d622fa8ce524bcfbb7552d'].replace('%1', '([\\d+|\\.]+)').replace('%2', '([\\d+|:]+)')).exec(timestr);
        let t, date;
        if (todayPattern !== null) {
            t = todayPattern[1].split(':');
            date = new Date(d[2], (d[1] - 1), d[0], t[0], t[1], t[2], (t[3] || 0));
        } else if (tomorrowPattern !== null) {
            t = tomorrowPattern[1].split(':');
            date = new Date(d[2], (d[1] - 1), (d[0] + 1), t[0], t[1], t[2], (t[3] || 0));
        } else {
            d = (laterDatePattern[1] + d[2]).split('.').map(x => +x);
            t = laterDatePattern[2].split(':');
            date = new Date(d[2], (d[1] - 1), d[0], t[0], t[1], t[2], (t[3] || 0));
        }
        return date.getTime();
    };

    String.prototype.toCoord = function(objectified) {
        let c = (this.match(/\d{1,3}\|\d{1,3}/g) || [false]).pop();
        return (c && objectified) ? {x: c.split('|')[0], y: c.split('|')[1]} : c;
    };

    String.prototype.toNumber = function() { return parseFloat(this); };
    Number.prototype.toNumber  = function() { return parseFloat(this); };

    return {
        getUnitSpeeds,
        processPage,
        processAllPages,
        getDistance,
        subtractArrays,
        getCurrentServerTime,
        timestampFromString
    };
})();

window.FarmGod.Translation = (function() {
    const msg = {
        sk_SK: {
            missingFeatures: 'Skript vyĹľaduje PU a FA!',
            options: {
                title: 'FarmGod Nastavenia',
                warning: '<b>Upozornenie:</b><br>- A aj B budu posielane na dediny ktore splnaju podmienky(poÄŤet bodov)<br>- Pred pouĹľitĂ­m skriptu skontrolujte filtre farmy',
                filterImage: 'https://scripts.cybermine.cz/farmgod.png',
                group: 'PoslaĹĄ farmy zo skupiny:',
                distance: 'Max vzdialenosĹĄ:',
                time: 'Min ÄŤas v min medzi farmami:',
                limitPoints: 'Iba barbarky do:',
                findNewBarbs: 'NĂˇjsĹĄ novĂ© barbarky',
                useBlacklist: 'PouĹľiĹĄ blacklist z poznĂˇmok',
                repeatMinutes: 'OpakovaĹĄ kaĹľdĂ˝ch (min):',
                button: 'SpustiĹĄ automaticky'
            },
            table: {
                noFarmsPlanned: 'Ĺ˝iadne farmy nemĂ´Ĺľu byĹĄ poslanĂ© s aktuĂˇlnym nastavenĂ­m.',
                origin: 'PĂ´vod',
                target: 'CieÄľ',
                points: 'Body',
                fields: 'VzdialenosĹĄ',
                farm: 'Vzor',
                goTo: 'ĂŤsĹĄ do',
                sendAll: 'BLITZKRIEG',
                loading: 'NaÄŤĂ­tavam novĂ© farmy...',
                statusRunning: 'BEĹ˝ĂŤ â€“ odosielam...',
                statusWaiting: 'ÄŚakĂˇm na ÄŹalĹˇie spustenie...',
                statusStopped: 'ZASTAVENĂ‰',
                statusLoading: 'NaÄŤĂ­tavam dĂˇta...'
            },
            messages: {
                villageChanged: 'ĂšspeĹˇne zmenenĂˇ dedina!',
                villageError: 'VĹˇetky farmy pre sĂşÄŤasnĂş dedinu boli odoslanĂ©!',
                sendError: 'Error: Farma neposlanĂˇ!'
            }
        }
    };
    const get = function() {
        let lang = (msg.hasOwnProperty(game_data.locale)) ? game_data.locale : 'sk_SK';
        return msg[lang];
    };
    return { get };
})();

window.FarmGod.Main = (function(Library, Translation) {
    const lib = Library;
    const t = Translation.get();
    let curVillage = null;
    let farmBusy = false;
    let isRunning = false;
    let repeatTimeout = null;
    let currentOptions = null;
    let specialBusy = false;
    const specialLog = (message, details) => {
        console.log(`[FarmGod / ĹˇpeciĂˇlne] ${message}`, details ?? "");
        const $log = $("#FarmGodSpecialLog");
        if ($log.length) {
            const line = $("<div>").text(`[${new Date().toLocaleTimeString()}] ${message}`);
            $log.prepend(line);
            $log.children().slice(80).remove();
        }
    };
    const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"})[c]);

    const loadBlacklist = async () => {
        let blacklist = new Set();
        try {
            console.log("[FarmGod] NaÄŤĂ­tavam blacklist z poznĂˇmok...");
            const memoHtml = await twLib.get(game_data.link_base_pure + 'memo');
            const coordRegex = /\b(\d{1,3})\s*[\|\|]\s*(\d{1,3})\b/g;
            let match;
            while ((match = coordRegex.exec(memoHtml)) !== null) {
                const x = match[1];
                const y = match[2];
                if (x >= 0 && x <= 999 && y >= 0 && y <= 999) {
                    blacklist.add(`${x}|${y}`);
                }
            }
            console.log(`[FarmGod] NaÄŤĂ­tanĂ˝ch ${blacklist.size} sĂşradnĂ­c do blacklistu`);
            return blacklist;
        } catch (e) {
            console.warn("[FarmGod] Nepodarilo sa naÄŤĂ­taĹĄ poznĂˇmky â†’ blacklist nebude pouĹľitĂ˝", e);
            return blacklist;
        }
    };

    const init = function() {
        if (!game_data.features.Premium.active || !game_data.features.FarmAssistent.active) {
            UI.ErrorMessage(t.missingFeatures);
            return;
        }
        if (game_data.screen !== 'am_farm') {
            location.href = game_data.link_base_pure + 'am_farm';
            return;
        }
        $.when(buildOptions()).then((html) => {
            Dialog.show('FarmGod', html);
            $('.optionButton').off('click').on('click', startCycle);
            $('.stopButton').off('click').on('click', stopCycle);
        });
    };

    const stopCycle = function() {
        isRunning = false;
        if (repeatTimeout) {
            clearTimeout(repeatTimeout);
            repeatTimeout = null;
        }
        updateStatus(t.table.statusStopped);
        UI.SuccessMessage('AutomatickĂ© opakovanie zastavenĂ©.');
    };

    const startCycle = function() {
        if (isRunning) return;

        currentOptions = {
            optionGroup: parseInt($('.optionGroup').val()),
            optionDistance: parseFloat($('.optionDistance').val()) || 25,
            optionTime: parseFloat($('.optionTime').val()) || 10,
            limitPoints: $('.optionLimitPoints').prop('checked'),
            maxPoints: parseInt($('.optionMaxPoints').val()) || 87,
            findNewBarbs: $('.optionFindNewBarbs').prop('checked'),
            useBlacklist: $('.optionUseBlacklist').prop('checked'),
            repeatMinutes: parseFloat($('.optionRepeatMinutes').val()) || 30,
            includeSpecial: $('.optionIncludeSpecial').prop('checked'),
            sendSpecial: $('.optionSendSpecial').prop('checked'),
            specialUnits: Object.fromEntries(['axe','spy','ram'].map(u => [u, Math.max(0, Math.floor(Number($('.optionUnit_' + u).val()) || 0))]))
        };

        if (currentOptions.sendSpecial && !currentOptions.includeSpecial) currentOptions.includeSpecial = true;
        if (currentOptions.includeSpecial && !Object.values(currentOptions.specialUnits).some(Boolean)) {
            UI.ErrorMessage('Zadaj aspoĹ jednu jednotku pre ĹˇpeciĂˇlne Ăştoky.');
            return;
        }
        localStorage.setItem('farmGod_options', JSON.stringify(currentOptions));
        specialLog('Nastavenia uloĹľenĂ©', currentOptions);
        isRunning = true;
        runOnce();
    };

    const runOnce = function() {
        if (!isRunning) return;

        // ZobraziĹĄ stav naÄŤĂ­tania
        $('.farmGodContent, .farmGodSpecial').remove();
        $('#am_widget_Farm').first().before(`
            <div class="vis farmGodContent">
                <h4>FarmGod <span id="FarmGodStatus" style="font-size:12px;color:#060;margin-left:15px;">${t.table.statusLoading}</span>
                <input type="button" class="btn stopButton" value="STOP" style="float:right;background:#c00;color:white;margin:2px 5px;"></h4>
                <div style="text-align:center;padding:30px;">
                    ${UI.Throbber[0].outerHTML}<br><br>
                    <b>NaÄŤĂ­tavam farmy a plĂˇnujem...</b>
                </div>
            </div>
        `);
        $('.stopButton').off('click').on('click', stopCycle);

        getData(currentOptions.optionGroup, currentOptions.findNewBarbs, currentOptions.useBlacklist, currentOptions.includeSpecial)
            .then((data) => {
                if (!isRunning) return;

                let plan = createPlanning(
                    currentOptions.optionDistance,
                    currentOptions.optionTime,
                    currentOptions.limitPoints,
                    currentOptions.maxPoints,
                    data
                );

                const specialPlan = currentOptions.includeSpecial ? createSpecialPlanning(data, currentOptions) : [];
                $('.farmGodContent').remove();
                $('#am_widget_Farm').first().before(buildTable(plan.farms, data) + (currentOptions.includeSpecial ? buildSpecialTable(specialPlan) : ''));
                specialLog(`NaÄŤĂ­tanĂ˝ch problĂ©movĂ˝ch cieÄľov: ${Object.keys(data.specialFarms).length}; pripravenĂ˝ch Ăştokov: ${specialPlan.length}`);
                bindEventHandlers();
                UI.InitProgressBars();
                UI.updateProgressBar($('#FarmGodProgessbar'), 0, plan.counter);
                $('#FarmGodProgessbar').data('current', 0).data('max', plan.counter);

                updateStatus(t.table.statusRunning);

                // Automaticky odoĹˇli vĹˇetko
                return autoSendAll().then(() => currentOptions.sendSpecial && isRunning ? autoSendSpecial() : undefined);
            })
            .then(() => {
                if (!isRunning) return;

                // NaplĂˇnuj ÄŹalĹˇĂ­ cyklus
                const waitMs = currentOptions.repeatMinutes * 60 * 1000;
                updateStatus(`${t.table.statusWaiting} (${currentOptions.repeatMinutes} min)`);
                console.log(`[FarmGod] ÄŽalĹˇie plnĂ© naÄŤĂ­tanie o ${currentOptions.repeatMinutes} minĂşt`);

                repeatTimeout = setTimeout(() => {
                    if (isRunning) {
                        console.log("[FarmGod] SpĂşĹˇĹĄam novĂ˝ cyklus â€“ plnĂ© naÄŤĂ­tanie dĂˇt...");
                        runOnce(); // â† vĹľdy znova celĂ© naÄŤĂ­tanie
                    }
                }, waitMs);
            })
            .catch(err => {
                console.error("Chyba pri plĂˇnovanĂ­ farmy:", err);
                UI.ErrorMessage("Nastala chyba pri naÄŤĂ­tanĂ­/plĂˇnovanĂ­ dĂˇt.");
                isRunning = false;
                updateStatus(t.table.statusStopped);
            });
    };

    const autoSendAll = function() {
        return new Promise(async (resolve) => {
            const buttons = document.getElementsByClassName('farmGod_icon');
            while (buttons.length > 0 && isRunning) {
                if (!farmBusy) {
                    buttons[0].click();
                }
                await sleep(250);
            }
            resolve();
        });
    };

    const updateStatus = function(text) {
        const $status = $('#FarmGodStatus');
        if ($status.length) {
            $status.text(text);
        }
    };

    const bindEventHandlers = function() {
        $('.specialSendOne').off('click').on('click', function() { if (!specialBusy) sendSpecial($(this)); });
        $('.specialSendAll').off('click').on('click', autoSendSpecial);
        $('.farmGod_icon').off('click').on('click', function() {
            if (game_data.market != 'nl' || $(this).data('origin') == curVillage) {
                sendFarm($(this));
            } else {
                UI.ErrorMessage(t.messages.villageError);
            }
        });
        $(document).off('keydown').on('keydown', (event) => {
            if (event.keyCode === 13) $('.farmGod_icon').first().trigger('click');
        });
        $('.switchVillage').off('click').on('click', function() {
            curVillage = $(this).data('id');
            UI.SuccessMessage(t.messages.villageChanged);
            $(this).closest('tr').remove();
        });
        $('.stopButton').off('click').on('click', stopCycle);
    };

    const buildOptions = function() {
        let options = JSON.parse(localStorage.getItem('farmGod_options')) || {
            optionGroup: 0,
            optionDistance: 25,
            optionTime: 10,
            limitPoints: true,
            maxPoints: 87,
            findNewBarbs: true,
            useBlacklist: true,
            repeatMinutes: 30,
            includeSpecial: false, sendSpecial: false, specialUnits: {axe: 0, spy: 0, ram: 0}
        };
        return $.when(buildGroupSelect(options.optionGroup)).then((groupSelect) => {
            options.specialUnits = options.specialUnits || {axe: 0, spy: 0, ram: 0};
            return `<style>#popup_box_FarmGod{text-align:center;width:580px;}</style>
<h3 class="optionTitle">${t.options.title}</h3><br>
<div class="optionsContent">
<div class="info_box" style="line-height:15px;font-size:10px;text-align:left;">
<p style="margin:0 5px;">${t.options.warning}<br><img src="${t.options.filterImage}" style="width:100%;"></p>
</div><br>
<div style="width:90%;margin:auto;background:url('graphic/index/main_bg.jpg') 100% 0% #E3D5B3;border:1px solid #7D510F;">
<table class="vis" style="width:100%;text-align:left;font-size:11px;">
    <tr><td>${t.options.group}</td><td>${groupSelect}</td></tr>
    <tr><td>${t.options.distance}</td><td><input type="text" size="5" class="optionDistance" value="${options.optionDistance}"></td></tr>
    <tr><td>${t.options.time}</td><td><input type="text" size="5" class="optionTime" value="${options.optionTime}"></td></tr>
    <tr>
        <td>${t.options.limitPoints}</td>
        <td>
            <input type="checkbox" class="optionLimitPoints" ${options.limitPoints?'checked':''}>
            <input type="number" min="1" class="optionMaxPoints" value="${options.maxPoints}" style="width:80px;"> bodov
        </td>
    </tr>
    <tr>
        <td>${t.options.findNewBarbs}</td>
        <td><input type="checkbox" class="optionFindNewBarbs" ${options.findNewBarbs?'checked':''}></td>
    </tr>
    <tr>
        <td>${t.options.useBlacklist}</td>
        <td><input type="checkbox" class="optionUseBlacklist" ${options.useBlacklist?'checked':''}></td>
    </tr>
    <tr><td>PridaĹĄ ÄŤervenĂ© a oranĹľovĂ© hlĂˇsenia</td><td><input type="checkbox" class="optionIncludeSpecial" ${options.includeSpecial?'checked':''}></td></tr>
    <tr><td>Automaticky odoslaĹĄ aj druhĂş tabuÄľku</td><td><input type="checkbox" class="optionSendSpecial" ${options.sendSpecial?'checked':''}></td></tr>
    <tr><td>Jednotky na kaĹľdĂ˝ ĹˇpeciĂˇlny Ăştok</td><td>${['axe','spy','ram'].map(u => `<label style="display:inline-flex;align-items:center;margin-right:8px;"><img width="20" height="20" src="https://dssk.innogamescdn.com/asset/e94cf8a0/graphic/unit/unit_${u}.webp" title="${u}"><input type="number" min="0" step="1" class="optionUnit_${u}" value="${Math.max(0, Number(options.specialUnits[u]) || 0)}" style="width:58px"></label>`).join('')}</td></tr>
    <tr>
        <td><b>${t.options.repeatMinutes}</b></td>
        <td><input type="number" min="5" step="1" class="optionRepeatMinutes" value="${options.repeatMinutes}" style="width:80px;"> minĂşt</td>
    </tr>
</table>
</div><br>
<p><b>Farma A aj B:</b> iba barbarky (ak je limit zapnutĂ˝) + blacklist z poznĂˇmok (ak zapnutĂ©)</p>
<p style="color:#a00;"><b>KaĹľdĂ˝ cyklus sa vĹľdy nanovo naÄŤĂ­ta a naplĂˇnuje!</b></p><br>
<input type="button" class="btn optionButton" value="${t.options.button}">
<input type="button" class="btn stopButton" value="STOP" style="background:#c00;color:white;margin-left:10px;">
</div>`;
        });
    };

    const buildGroupSelect = function(id) {
        return $.get(TribalWars.buildURL('GET', 'groups', {'ajax': 'load_group_menu'})).then((groups) => {
            let html = `<select class="optionGroup">`;
            groups.result.forEach((val) => {
                if (val.type == 'separator') {
                    html += `<option disabled=""/>`;
                } else {
                    html += `<option value="${val.group_id}" ${val.group_id == id ? 'selected' : ''}>${val.name}</option>`;
                }
            });
            html += `</select>`;
            return html;
        });
    };

    const loadVillagePoints = function(data) {
        return twLib.get('/map/village.txt').then((txt) => {
            txt.match(/[^\r\n]+/g)?.forEach(line => {
                let parts = line.split(',');
                if (parts.length < 6) return;
                let [id, name, x, y, player_id, points] = parts;
                if (player_id === '0') {
                    let coord = `${x}|${y}`;
                    if (data.farms.farms[coord]) data.farms.farms[coord].points = parseInt(points, 10) || 0;
                    if (data.specialFarms[coord]) data.specialFarms[coord].points = parseInt(points, 10) || 0;
                }
            });
            return data;
        }).catch(err => {
            console.warn("Nepodarilo sa naÄŤĂ­taĹĄ /map/village.txt â†’ body barbariek budĂş chĂ˝baĹĄ", err);
            return data;
        });
    };

    const buildTable = function(plan, data) {
        let html = `<div class="vis farmGodContent">
            <h4>FarmGod <span id="FarmGodStatus" style="font-size:12px;color:#060;margin-left:15px;">${t.table.statusRunning}</span>
            <input type="button" class="btn stopButton" value="STOP" style="float:right;background:#c00;color:white;margin:2px 5px;"></h4>
            <table class="vis" width="100%">
            <tr><div id="FarmGodProgessbar" class="progress-bar live-progress-bar progress-bar-alive" style="width:98%;margin:5px auto;"><div style="background:rgb(146,194,0);"></div><span class="label" style="margin-top:0px;"></span></div></tr>`;
        if (game_data.market == 'sk')
            html += `<tr><td colspan="5" style="background:#e7d098;"><input type="button" class="btn" value="${t.table.sendAll}" style="width:100%;" onclick="SHIT()"></td></tr>`;
        html += `<tr>
            <th style="text-align:center;">${t.table.origin}</th>
            <th style="text-align:center;">${t.table.target}</th>
            <th style="text-align:center;">${t.table.points}</th>
            <th style="text-align:center;">${t.table.fields}</th>
            <th style="text-align:center;">${t.table.farm}</th>
        </tr>`;
        if (!$.isEmptyObject(plan)) {
            for (let originCoord in plan) {
                if (game_data.market == 'nl')
                    html += `<tr><td colspan="5" style="background:#e7d098;"><input type="button" class="btn switchVillage" data-id="${plan[originCoord][0].origin.id}" value="${t.table.goTo} ${plan[originCoord][0].origin.name} (${plan[originCoord][0].origin.coord})" style="float:right;"></td></tr>`;
                plan[originCoord].forEach((val, i) => {
                    let pointsDisplay = (val.target.points !== undefined) ? val.target.points.toLocaleString('sk-SK') : '?';
                    html += `<tr class="farmRow row_${(i%2==0)?'a':'b'}">
                        <td style="text-align:center;"><a href="${game_data.link_base_pure}info_village&id=${val.origin.id}">${val.origin.name} (${val.origin.coord})</a></td>
                        <td style="text-align:center;"><a href="${game_data.link_base_pure}info_village&id=${val.target.id}">Dedina barbarov (${val.target.coord})</a></td>
                        <td style="text-align:center;font-weight:bold;">${pointsDisplay}</td>
                        <td style="text-align:center;">${val.fields.toFixed(2)}</td>
                        <td style="text-align:center;"><a href="#" data-origin="${val.origin.id}" data-target="${val.target.id}" data-template="${val.template.id}" class="farmGod_icon farm_icon farm_icon_${val.template.name}" style="margin:auto;"></a></td>
                    </tr>`;
                });
            }
        } else {
            html += `<tr><td colspan="5" style="text-align:center;">${t.table.noFarmsPlanned}</td></tr>`;
        }
        html += `</table></div>`;
        return html;
    };

    const getData = async function(group, findNewBarbs, useBlacklist, includeSpecial) {
        let data = { villages: {}, commands: {}, farms: { templates: {}, farms: {} }, blacklist: new Set(), specialFarms: {} };

        if (useBlacklist) {
            data.blacklist = await loadBlacklist();
        }

        const villagesProcessor = ($html) => {
            let skipUnits = ['ram', 'catapult', 'snob', 'militia'];
            if ($('#mobileHeader').length) {
                $html.find('.overview-container .overview-container-item').filter((i, el) => !$(el).find('.bonus_icon_33').length).each(function() {
                    let $el = $(this);
                    let $qel = $el.find('.quickedit-label').first();
                    let units = [];
                    game_data.units.forEach((unit) => {
                        if (skipUnits.includes(unit)) return;
                        let $img = $el.find(`img[src*="unit/unit_${unit}"]`);
                        units.push($img.length ? $img.next().text().toNumber() : 0);
                    });
                    data.villages[$qel.text().toCoord()] = {
                        name: $qel.data('text'),
                        id: parseInt($el.find('.quickedit-vn').first().data('id')),
                        units: units,
                        specialUnits: Object.fromEntries(['axe','spy','ram'].map(u => [u, Number($el.find(`img[src*="unit/unit_${u}"]`).first().next().text().replace(/[^\d]/g, '')) || 0]))
                    };
                });
            } else {
                $html.find('#combined_table .row_a, #combined_table .row_b').filter((i, el) => !$(el).find('.bonus_icon_33').length).each(function() {
                    let $el = $(this);
                    let $qel = $el.find('.quickedit-label').first();
                    let units = $el.find('.unit-item').filter((idx) => !skipUnits.includes(game_data.units[idx])).map((idx, el) => $(el).text().toNumber()).get();
                    data.villages[$qel.text().toCoord()] = {
                        name: $qel.data('text'),
                        id: parseInt($el.find('.quickedit-vn').first().data('id')),
                        units: units,
                        specialUnits: Object.fromEntries(['axe','spy','ram'].map(u => [u, Number($el.find('.unit-item').eq(game_data.units.indexOf(u)).text().replace(/[^\d]/g, '')) || 0]))
                    };
                });
            }
        };

        const commandsProcessor = ($html) => {
            $html.find('#commands_table .row_a, #commands_table .row_ax, #commands_table .row_b, #commands_table .row_bx').each(function() {
                let $el = $(this);
                let coord = $el.find('.quickedit-label').first().text().toCoord();
                if (coord) {
                    if (!data.commands[coord]) data.commands[coord] = [];
                    data.commands[coord].push(Math.round(lib.timestampFromString($el.find('td').eq(2).text().trim()) / 1000));
                }
            });
        };

        const farmProcessor = ($html) => {
            if ($.isEmptyObject(data.farms.templates)) {
                let unitSpeeds = lib.getUnitSpeeds();
                $html.find('form[action*="action=edit_all"] tr:has(input[name*="template"][type="hidden"])').each(function() {
                    let $el = $(this);
                    let name = $el.prev('tr').find('a.farm_icon').first().attr('class')?.match(/farm_icon_(\w+)/)?.[1];
                    if (!name) return;
                    data.farms.templates[name] = {
                        id: $el.find('input[name*="template"][name*="[id]"]').first().val().toNumber(),
                        units: $el.find('input[type="text"], input[type="number"]').map((_, el) => $(el).val().toNumber()).get(),
                        speed: Math.max(...$el.find('input[type="text"], input[type="number"]').map((_, el) => {
                            let val = $(el).val().toNumber();
                            return (val > 0) ? (unitSpeeds[$(el).attr('name').trim().split('[')[0]] || 0) : 0;
                        }).get())
                    };
                });
            }
            $html.find('#plunder_list tr[id^="village_"]').each(function() {
                let $el = $(this);
                let coord = $el.find('a[href*="screen=report&mode=all&view="]').first().text().toCoord();
                if (!coord) return;
                let colorMatch = $el.find('img[src*="graphic/dots/"]').attr('src')?.match(/dots\/(green|yellow|red|blue|red_blue|red_yellow)/);
                let color = colorMatch ? colorMatch[1] : "green";
                const farm = { id: $el.attr('id').split('_')[1].toNumber(), color };
                data.farms.farms[coord] = farm;
                if (includeSpecial && ['red','red_blue','red_yellow','yellow'].includes(color)) {
                    data.specialFarms[coord] = farm;
                    specialLog(`CieÄľ ${coord}: ${color} (${farm.id})`);
                }
            });
        };

        const addNewBarbsRespectingColors = () => {
            return twLib.get('/map/village.txt').then(txt => {
                let added = 0;
                txt.match(/[^\r\n]+/g)?.forEach(line => {
                    let [id, , x, y, player_id] = line.split(',');
                    if (player_id !== '0') return;
                    let coord = `${x}|${y}`;
                    if (data.farms.farms[coord]) return;
                    data.farms.farms[coord] = { id: parseInt(id, 10), color: 'green' };
                    added++;
                });
                console.log(`PridanĂ˝ch ${added} novĂ˝ch barbariek`);
                return data;
            });
        };

        const filterFarms = () => {
            data.farms.farms = Object.fromEntries(
                Object.entries(data.farms.farms).filter(([_, v]) =>
                    !v.color || (v.color !== 'red' && v.color !== 'red_blue' && v.color !== 'yellow')
                )
            );
            return data;
        };

        let promises = [
            lib.processAllPages(TribalWars.buildURL('GET', 'overview_villages', { mode: 'combined', group }), villagesProcessor),
            lib.processPage(TribalWars.buildURL('GET', 'overview_villages', { mode: 'commands', type: 'attack' }), -1, (page, $html) => commandsProcessor($html)),
            lib.processAllPages(TribalWars.buildURL('GET', 'am_farm'), farmProcessor)
        ];

        if (findNewBarbs) {
            promises.push(addNewBarbsRespectingColors());
        }

        return Promise.all(promises)
            .then(() => { specialLog(`NaÄŤĂ­tanĂ© dediny: ${Object.keys(data.villages).length}; farebnĂ© ciele: ${Object.keys(data.specialFarms).length}`); return data; })
            .then(filterFarms)
            .then(loadVillagePoints)
            .then(() => data);
    };

    const createPlanning = function(maxDistance, minTimeDiffMin, limitPoints, maxPoints, data) {
        let plan = { counter: 0, farms: {} };
        let serverTime = Math.round(lib.getCurrentServerTime() / 1000);
        let minTimeDiff = Math.round(minTimeDiffMin * 60);

        for (let originCoord in data.villages) {
            let orderedFarms = Object.keys(data.farms.farms)
                .map(coord => ({ coord, dis: lib.getDistance(originCoord, coord) }))
                .sort((a, b) => a.dis - b.dis);

            orderedFarms.forEach(el => {
                let farm = data.farms.farms[el.coord];
                let points = farm.points ?? 999999;

                if (data.blacklist.size > 0 && data.blacklist.has(el.coord)) return;
                if (limitPoints && points >= maxPoints) return;

                ['a', 'b'].forEach(tmplName => {
                    let template = data.farms.templates[tmplName];
                    if (!template) return;

                    let unitsLeft = lib.subtractArrays(data.villages[originCoord].units, template.units);
                    if (!unitsLeft) return;

                    let distance = el.dis;
                    if (distance >= maxDistance) return;

                    let arrival = Math.round(serverTime + (distance * template.speed * 60) + Math.round(plan.counter / 5));

                    data.commands[el.coord] = data.commands[el.coord] ?? [];
                    let timeOk = true;

                    if (!farm.color && data.commands[el.coord].length > 0) {
                        timeOk = false;
                    }

                    if (timeOk) {
                        for (let ts of data.commands[el.coord]) {
                            if (Math.abs(ts - arrival) < minTimeDiff) {
                                timeOk = false;
                                break;
                            }
                        }
                    }

                    if (timeOk) {
                        plan.counter++;
                        if (!plan.farms[originCoord]) plan.farms[originCoord] = [];
                        plan.farms[originCoord].push({
                            origin: { coord: originCoord, name: data.villages[originCoord].name, id: data.villages[originCoord].id },
                            target: { coord: el.coord, id: farm.id, points: points },
                            fields: distance,
                            template: { name: tmplName, id: template.id }
                        });
                        data.villages[originCoord].units = unitsLeft;
                        data.commands[el.coord].push(arrival);
                    }
                });
            });
        }
        return plan;
    };

    const createSpecialPlanning = (data, options) => {
        const result = [];
        const remaining = {};
        for (const [coord, village] of Object.entries(data.villages)) {
            remaining[coord] = {};
            Object.assign(remaining[coord], village.specialUnits || {});
        }
        const origins = Object.keys(data.villages);
        for (const [coord, target] of Object.entries(data.specialFarms)) {
            if (data.blacklist.has(coord)) { specialLog(`VynechanĂ˝ ${coord}: blacklist`); continue; }
            if (options.limitPoints && !(target.points < options.maxPoints)) { specialLog(`VynechanĂ˝ ${coord}: limit bodov alebo neznĂˇme body`); continue; }
            const candidates = origins.map(origin => ({origin, distance: lib.getDistance(origin, coord)}))
                .filter(x => x.distance < options.optionDistance).sort((a,b) => a.distance - b.distance);
            const chosen = candidates.find(x => Object.entries(options.specialUnits).every(([unit, count]) => remaining[x.origin][unit] >= count));
            if (!chosen) { specialLog(`VynechanĂ˝ ${coord}: vzdialenosĹĄ alebo nedostatok jednotiek`); continue; }
            Object.entries(options.specialUnits).forEach(([unit, count]) => remaining[chosen.origin][unit] -= count);
            result.push({origin: data.villages[chosen.origin], originCoord: chosen.origin, target: {...target, coord}, distance: chosen.distance, units: {...options.specialUnits}});
            specialLog(`PlĂˇn: ${chosen.origin} â†’ ${coord} (${target.color})`, options.specialUnits);
        }
        return result;
    };

    const buildSpecialTable = plan => `<div class="vis farmGodSpecial" style="margin:12px 0;padding:8px;">
        <h4>ÄŚervenĂ© a oranĹľovĂ© hlĂˇsenia (${plan.length})</h4>
        <p>AutomatickĂ© odosielanie: <b>${currentOptions.sendSpecial ? 'zapnutĂ©' : 'vypnutĂ©'}</b>. ManuĂˇlne mĂ´ĹľeĹˇ poslaĹĄ riadky tlaÄŤidlom.</p>
        <table class="vis" width="100%"><tr><th>OdkiaÄľ</th><th>CieÄľ</th><th>Bodka</th><th>VzdialenosĹĄ</th><th>Jednotky</th><th>Akcia</th></tr>
        ${plan.map(item => `<tr class="specialRow" data-origin="${item.origin.id}" data-target="${item.target.id}">
            <td>${escapeHtml(item.origin.name)} (${escapeHtml(item.originCoord)})</td>
            <td>${escapeHtml(item.target.coord)}</td><td>${escapeHtml(item.target.color)}</td>
            <td>${item.distance.toFixed(2)}</td><td>${Object.entries(item.units).map(([u,n]) => `${u}: ${n}`).join(', ')}</td>
            <td><button type="button" class="btn specialSendOne">OdoslaĹĄ</button></td></tr>`).join('') || '<tr><td colspan="6">Ĺ˝iadne vhodnĂ© ciele alebo dostupnĂ© jednotky.</td></tr>'}
        </table><button type="button" class="btn specialSendAll" style="margin:8px 0;">OdoslaĹĄ celĂş druhĂş tabuÄľku</button>
        <div id="FarmGodSpecialLog" style="max-height:150px;overflow:auto;background:#fff;padding:5px;font:11px monospace;"></div></div>`;

    const sendSpecial = async $button => {
        if (specialBusy) return false;
        specialBusy = true;
        const $row = $button.closest('.specialRow');
        const origin = Number($row.data('origin')), target = Number($row.data('target'));
        const units = currentOptions.specialUnits;
        $button.prop('disabled', true);
        try {
            specialLog(`OtvĂˇram potvrdenie: dedina ${origin} â†’ cieÄľ ${target}`, units);
            const url = TribalWars.buildURL('GET', 'place', {village: origin});
            const html = await $.get(url);
            const $page = $('<div>').append($.parseHTML(html, document, true));
            const $form = $page.find('form#command-data-form, form[action*="screen=place"]').filter((_, form) => $(form).find('[name="target"], #unit_input_axe').length).first();
            if (!$form.length) throw new Error('Nepodarilo sa nĂˇjsĹĄ formulĂˇr prĂ­kazu.');
            const payload = $form.serializeArray().filter(x => x.name !== 'target' && x.name !== 'attack' && !/^(axe|spy|ram)$/.test(x.name));
            payload.push({name:'target', value:String(target)}, {name:'attack', value:'Ăštok'});
            Object.entries(units).forEach(([name, value]) => payload.push({name, value:String(value)}));
            const formUrl = new URL($form.attr('action') || url, location.href);
            specialLog(`Pripravujem Ăştok ${origin} â†’ ${target}`, {url:formUrl.pathname + formUrl.search, units});
            const preview = await $.ajax({url:formUrl.href, type:'POST', data:$.param(payload)});
            const $preview = $('<div>').append($.parseHTML(preview, document, true));
            const $confirm = $preview.find('form#command-data-form, form[action*="action=command"]').filter((_, form) => $(form).find('[name="ch"], [name="attack"]').length).first();
            if (!$confirm.length || !$confirm.find('[name="ch"]').length) {
                throw new Error($preview.find('.error, .error_box').first().text().trim() || 'PotvrdzovacĂ­ formulĂˇr sa nenaĹˇiel; Ăştok nebol potvrdenĂ˝.');
            }
            const confirmUrl = new URL($confirm.attr('action'), location.href);
            specialLog(`Potvrdzujem Ăştok ${origin} â†’ ${target}`, {url: confirmUrl.pathname + confirmUrl.search});
            const response = await $.ajax({url:confirmUrl.href, type:'POST', data:$confirm.serialize()});
            const $result = $('<div>').append($.parseHTML(typeof response === 'string' ? response : '', document, true));
            const error = $result.find('.error, .error_box').first().text().trim();
            if (error) throw new Error(error);
            specialLog(`OdpoveÄŹ servera na Ăştok ${origin} â†’ ${target} prijatĂˇ; skontroluj odchĂˇdzajĂşce prĂ­kazy.`);
            $row.remove();
            return true;
        } catch (error) {
            specialLog(`CHYBA ${origin} â†’ ${target}: ${error.message || error}`, error);
            UI.ErrorMessage(`Ĺ peciĂˇlny Ăştok ${target}: ${error.message || error}`);
            $button.prop('disabled', false);
            return false;
        } finally { specialBusy = false; }
    };

    const autoSendSpecial = async () => {
        specialLog('SpĂşĹˇĹĄam odosielanie druhej tabuÄľky.');
        const buttons = $('.farmGodSpecial .specialSendOne').toArray();
        for (const button of buttons) {
            if (!isRunning) break;
            const ok = await sendSpecial($(button));
            if (!ok) { specialLog('Odosielanie zastavenĂ© po chybe.'); break; }
            await sleep(1000);
        }
        specialLog(`Odosielanie ukonÄŤenĂ©; zostĂˇva ${$('.farmGodSpecial .specialRow').length} riadkov.`);
    };

    const sendFarm = function($this) {
        let n = Timing.getElapsedTimeSinceLoad();
        if (farmBusy || (Accountmanager.farm.last_click && n - Accountmanager.farm.last_click < 200)) return;
        farmBusy = true;
        Accountmanager.farm.last_click = n;
        let $pb = $('#FarmGodProgessbar');

        TribalWars.post(Accountmanager.send_units_link.replace(/village=(\d+)/, 'village=' + $this.data('origin')), null, {
            target: $this.data('target'),
            template_id: $this.data('template'),
            source: $this.data('origin')
        }, function(r) {
            UI.SuccessMessage(r.success || "Ăštok odoslanĂ˝!");
            $pb.data('current', ($pb.data('current') || 0) + 1);
            UI.updateProgressBar($pb, $pb.data('current'), $pb.data('max'));
            $this.closest('.farmRow').remove();
            farmBusy = false;
        }, function(r) {
            UI.ErrorMessage(r || t.messages.sendError);
            $pb.data('current', ($pb.data('current') || 0) + 1);
            UI.updateProgressBar($pb, $pb.data('current'), $pb.data('max'));
            $this.closest('.farmRow').remove();
            farmBusy = false;
        });
    };

    return { init };
})(window.FarmGod.Library, window.FarmGod.Translation);

(() => { window.FarmGod.Main.init(); })();

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function SHIT() {
    var buttons = document.getElementsByClassName('farmGod_icon');
    while (buttons.length > 0 && !window.FarmGod.Main.farmBusy) {
        buttons[0].click();
        await sleep(200);
    }
}  
