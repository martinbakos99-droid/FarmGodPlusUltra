// === Ochrana podľa player ID ===
const ALLOWED_IDS = [829169, 949172]; // sem daj všetky povolené ID
const playerId = game_data?.player?.id || null;

if (!ALLOWED_IDS.includes(Number(playerId))) {
    alert('Skript nie je povolený pre tento účet. Kontaktuj ma na discorde: CaptainM4rtin :)');
    throw new Error('Unauthorized');
}
// === koniec ochrany ===

    let inputMs;
    let input;
    let delay;
    let arrInterval;
    let attInterval;

    let delayTime = parseInt(localStorage.delayTime);
    if (isNaN(delayTime)) {
        delayTime = 0;
        localStorage.delayTime = JSON.stringify(delayTime);
    }

    // Zabráni duplicitnému vloženiu tlačidiel
    if (document.getElementById("arrTime")) {
        console.log("Skript už je spustený.");
        return;
    }

    // Tlačidlá
    const buttons = `
        <a id="arrTime" class="btn" style="cursor:pointer;">Set arrival time</a>
        <a id="sendTime" class="btn" style="cursor:pointer;">Set send time</a>
    `;

    document
        .getElementById("troop_confirm_submit")
        .insertAdjacentHTML("afterend", buttons);

    // Tabuľka s nastaveniami
    const parentTable =
        document.getElementById("date_arrival").parentNode.parentNode;

    const offsetHtml = `
        <tr>
            <td>Offset:</td>
            <td>
                <input id="delayInput" value="${delayTime}" style="width:50px">
                <a id="delayButton" class="btn">OK</a>
            </td>
        </tr>
    `;

    const setArrivalHtml = `
        <tr>
            <td>Set arrival:</td>
            <td id="showArrTime"></td>
        </tr>
    `;

    const sendAttackHtml = `
        <tr>
            <td>Send at:</td>
            <td id="showSendTime"></td>
        </tr>
    `;

    parentTable.insertAdjacentHTML(
        "beforeend",
        offsetHtml + setArrivalHtml + sendAttackHtml
    );

    // Kontrola času príchodu
    function setArrivalTime() {
        let arrivalTime;

        arrInterval = setInterval(() => {
            arrivalTime =
                document.getElementsByClassName("relative_time")[0]
                    .textContent;

            if (arrivalTime.slice(-8) >= input) {
                setTimeout(() => {
                    document.getElementById("troop_confirm_submit").click();
                }, delay);

                clearInterval(arrInterval);
            }
        }, 5);
    }

    // Kontrola času odoslania
    function setSendTime() {
        let serverTime;

        attInterval = setInterval(() => {
            serverTime =
                document.getElementById("serverTime").textContent;

            if (serverTime >= input) {
                setTimeout(() => {
                    document.getElementById("troop_confirm_submit").click();
                }, delay);

                clearInterval(attInterval);
            }
        }, 5);
    }

    // Set arrival time
    document.getElementById("arrTime").onclick = () => {
        clearInterval(attInterval);

        const time =
            document.getElementsByClassName("relative_time")[0]
                .textContent.slice(-8);

        input = prompt("Please enter desired arrival time", time);
        if (input === null) return;

        inputMs = parseInt(
            prompt("Please enter approximate milliseconds", "000")
        );

        if (isNaN(inputMs)) inputMs = 0;

        delay = parseInt(delayTime) + parseInt(inputMs);
        if (delay < 0) delay = 0;

        document.getElementById("showArrTime").innerHTML =
            input + ":" + inputMs.toString().padStart(3, "0");

        document.getElementById("showSendTime").innerHTML = "";

        setArrivalTime();
    };

    // Set send time
    document.getElementById("sendTime").onclick = () => {
        clearInterval(arrInterval);

        const time =
            document.getElementById("serverTime").textContent;

        input = prompt("Please enter desired arrival time", time);
        if (input === null) return;

        inputMs = parseInt(
            prompt("Please enter approximate milliseconds", "000")
        );

        if (isNaN(inputMs)) inputMs = 0;

        delay = parseInt(delayTime) + parseInt(inputMs);
        if (delay < 0) delay = 0;

        document.getElementById("showSendTime").innerHTML =
            input + ":" + inputMs.toString().padStart(3, "0");

        document.getElementById("showArrTime").innerHTML = "";

        setSendTime();
    };

    // Uloženie offsetu
    document.getElementById("delayButton").onclick = () => {
        delayTime = parseInt(
            document.getElementById("delayInput").value
        );

        if (isNaN(delayTime)) delayTime = 0;

        localStorage.delayTime = JSON.stringify(delayTime);

        delay = parseInt(delayTime) + parseInt(inputMs || 0);
        if (delay < 0) delay = 0;
    };

    console.log("Set Arrival Time skript spustený.");
})();
