// ============================================================
// FORBES VYNCKE - FUEL & BOILER PERFORMANCE SIMULATION
// ============================================================

// -----------------------------
// GOOGLE DRIVE CONFIG
// -----------------------------
// To make "Save to Google Drive" work you need your OWN Google OAuth
// Client ID. Steps:
//   1. Go to https://console.cloud.google.com/ and create (or pick) a project.
//   2. Enable the "Google Drive API" under APIs & Services > Library.
//   3. Go to APIs & Services > Credentials > Create Credentials >
//      OAuth Client ID > Application type: "Web application".
//   4. Under "Authorized JavaScript origins" add the exact URL(s) this
//      site is hosted at (e.g. https://yourdomain.com or
//      http://localhost:5500 while testing).
//   5. Copy the Client ID it gives you and paste it below.
const GOOGLE_DRIVE_CLIENT_ID = "YOUR_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com";

// Least-privilege scope: only lets this app see/manage files IT creates,
// not your whole Drive.
const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

let googleTokenClient = null;
let googleAccessToken = null;

function setDriveStatus(message) {
    const statusEl = document.getElementById("driveStatus");
    if (statusEl) {
        statusEl.innerHTML = message;
    }
}

function initGoogleDriveAuth() {
    if (googleTokenClient) {
        return true;
    }
    if (typeof google === "undefined" || !google.accounts || !google.accounts.oauth2) {
        return false;
    }
    googleTokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_DRIVE_CLIENT_ID,
        scope: GOOGLE_DRIVE_SCOPE,
        callback: function (tokenResponse) {
            if (tokenResponse && tokenResponse.access_token) {
                googleAccessToken = tokenResponse.access_token;
                performDriveUpload();
            } else {
                setDriveStatus("Google sign-in did not return access. Please try again.");
            }
        }
    });
    return true;
}

function getReportFieldValue(id) {
    const el = document.getElementById(id);
    return el ? (el.value || "").toString().trim() : "";
}

function buildReportPdfBlob() {
    const jsPDFCtor = window.jspdf && window.jspdf.jsPDF;
    if (!jsPDFCtor) {
        throw new Error("PDF library did not load.");
    }
    const doc = new jsPDFCtor({ unit: "pt", format: "a4" });
    const marginX = 40;
    const pageBottom = 800;
    let y = 50;

    doc.setFontSize(16);
    doc.text("Forbes Vyncke - Boiler & Fuel Performance Report", marginX, y);
    y += 20;
    doc.setFontSize(10);
    doc.text("Generated: " + new Date().toLocaleString(), marginX, y);
    y += 25;

    const rows = [
        ["1", "Primary fuel in use", getReportFieldValue("p1")],
        ["2", "GCV / NCV, kcal/kg", getReportFieldValue("p2")],
        ["3", "Carbon, %", getReportFieldValue("p3")],
        ["4", "Hydrogen, %", getReportFieldValue("p4")],
        ["5", "Moisture, %", getReportFieldValue("p5")],
        ["6", "Ash, %", getReportFieldValue("p6")],
        ["7", "Secondary fuel, if any", getReportFieldValue("p7")],
        ["8", "Date of last fuel test", getReportFieldValue("p8")],
        ["9", "Operating pressure, kg/cm2", getReportFieldValue("p9")],
        ["10", "Steam flow / load, TPH", getReportFieldValue("p10")],
        ["11", "Steam to fuel ratio achieved", getReportFieldValue("p11")],
        ["12", "Tube cleaning interval, days", getReportFieldValue("p12")],
        ["13", "Operating hours per month", getReportFieldValue("p13")],
        ["14", "Stack temperature, C", getReportFieldValue("p14")],
        ["15", "Chimney bottom cleaning, days", getReportFieldValue("p15")],
        ["16", "Grate cleaning interval, days", getReportFieldValue("p16")],
        ["17", "SPM, mg/Nm3", getReportFieldValue("p17")],
        ["18", "SOx / NOx, ppm", getReportFieldValue("p18")],
        ["19", "Dust collection", getReportFieldValue("p19")],
        ["20", "Efficiency, indirect method, %", getReportFieldValue("p20")],
        ["21", "Ash handling system", getReportFieldValue("p21")],
        ["22", "Feedwater temperature, C", getReportFieldValue("p22")],
        ["23", "Feedwater tank", getReportFieldValue("p23")],
        ["24", "Make-up water temperature, C", getReportFieldValue("p24")],
        ["25", "Water treatment / analysis", getReportFieldValue("p25")],
        ["26", "Major operational issues", getReportFieldValue("p26")],
        ["27", "Site observations", getReportFieldValue("p27")],
        ["28", "Customer feedback", getReportFieldValue("p28")]
    ];

    doc.setFontSize(9);
    rows.forEach(function (row) {
        const text = row[0] + ". " + row[1] + ": " + (row[2] || "-");
        const lines = doc.splitTextToSize(text, 515);
        lines.forEach(function (line) {
            if (y > pageBottom) {
                doc.addPage();
                y = 50;
            }
            doc.text(line, marginX, y);
            y += 14;
        });
    });

    return doc.output("blob");
}

function uploadPdfToDrive(pdfBlob, fileName, accessToken) {
    return new Promise(function (resolve, reject) {
        const reader = new FileReader();
        reader.onerror = function () {
            reject(new Error("Could not read the generated PDF."));
        };
        reader.onload = function () {
            const base64Data = reader.result.split(",")[1];
            const boundary = "forbesvyncke_report_boundary";
            const delimiter = "\r\n--" + boundary + "\r\n";
            const closeDelimiter = "\r\n--" + boundary + "--";
            const metadata = { name: fileName, mimeType: "application/pdf" };

            const requestBody =
                delimiter +
                "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
                JSON.stringify(metadata) +
                delimiter +
                "Content-Type: application/pdf\r\n" +
                "Content-Transfer-Encoding: base64\r\n\r\n" +
                base64Data +
                closeDelimiter;

            fetch(
                "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
                {
                    method: "POST",
                    headers: {
                        Authorization: "Bearer " + accessToken,
                        "Content-Type": "multipart/related; boundary=" + boundary
                    },
                    body: requestBody
                }
            )
                .then(function (response) {
                    if (!response.ok) {
                        return response.json().then(function (errBody) {
                            throw new Error(
                                (errBody && errBody.error && errBody.error.message) ||
                                    "Drive upload failed (" + response.status + ")"
                            );
                        });
                    }
                    return response.json();
                })
                .then(resolve)
                .catch(reject);
        };
        reader.readAsDataURL(pdfBlob);
    });
}

function performDriveUpload() {
    setDriveStatus("Uploading report to Google Drive...");
    let pdfBlob;
    try {
        pdfBlob = buildReportPdfBlob();
    } catch (error) {
        setDriveStatus("Could not generate the report PDF: " + error.message);
        return;
    }
    const fileName =
        "Forbes_Vyncke_Boiler_Report_" + new Date().toISOString().slice(0, 10) + ".pdf";

    uploadPdfToDrive(pdfBlob, fileName, googleAccessToken)
        .then(function (result) {
            if (result && result.id) {
                const link = result.webViewLink || ("https://drive.google.com/file/d/" + result.id + "/view");
                setDriveStatus(
                    'Saved to Google Drive: <a href="' + link + '" target="_blank" rel="noopener">Open file</a>'
                );
            } else {
                setDriveStatus("Upload finished but Drive did not return a file link.");
            }
        })
        .catch(function (error) {
            console.error(error);
            googleAccessToken = null;
            setDriveStatus("Upload failed: " + error.message + ". Please try again.");
        });
}

function saveReportToDrive() {
    if (!GOOGLE_DRIVE_CLIENT_ID || GOOGLE_DRIVE_CLIENT_ID.indexOf("YOUR_GOOGLE_OAUTH_CLIENT_ID") === 0) {
        setDriveStatus(
            "Google Drive isn't set up yet. Add your Google OAuth Client ID to GOOGLE_DRIVE_CLIENT_ID in script.js (see the comment above it)."
        );
        return;
    }
    const ready = initGoogleDriveAuth();
    if (!ready) {
        setDriveStatus("Google Sign-In is still loading. Please wait a moment and try again.");
        return;
    }
    if (googleAccessToken) {
        performDriveUpload();
    } else {
        googleTokenClient.requestAccessToken({ prompt: "consent" });
    }
}

// -----------------------------
// 4-PAGE NAVIGATION
// -----------------------------

const pageOrder = ["home", "about", "simulation", "analysis"];

const pageLabels = {
    home: "Home",
    about: "About",
    simulation: "Simulation",
    analysis: "Analysis"
};

function showPage(page) {

    // The Simulation button (nav, hero, and prev/next) should always
    // open the full standalone simulator, not the embedded section.
    if (page === "simulation") {
        window.location.href = "simulation.html";
        return;
    }

    document.querySelectorAll(".site-page").forEach(function (section) {
        section.classList.remove("active");
    });

    const selectedPage = document.getElementById(page);

    if (selectedPage) {
        selectedPage.classList.add("active");
    }

    document.querySelectorAll(".site-links button").forEach(function (button) {
        button.classList.toggle(
            "active",
            button.dataset.page === page
        );
    });

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });

    updatePageNavButtons(page);

    // Update simulation when entering Analysis
    if (page === "analysis") {
        setTimeout(function () {
            updateSimulation();
        }, 50);
    }
}


// -----------------------------
// PREV / NEXT PAGE BUTTONS
// -----------------------------

function updatePageNavButtons(page) {

    const index = pageOrder.indexOf(page);

    if (index === -1) {
        return;
    }

    const prevPage = pageOrder[(index - 1 + pageOrder.length) % pageOrder.length];
    const nextPage = pageOrder[(index + 1) % pageOrder.length];

    document.querySelectorAll(".page-nav-prev").forEach(function (button) {
        button.textContent = "← " + pageLabels[prevPage];
        button.dataset.target = prevPage;
    });

    document.querySelectorAll(".page-nav-next").forEach(function (button) {
        button.textContent = pageLabels[nextPage] + " →";
        button.dataset.target = nextPage;
    });
}

function goPrevPage(button) {
    showPage(button.dataset.target);
}

function goNextPage(button) {
    showPage(button.dataset.target);
}


// -----------------------------
// FUEL DATABASE
// -----------------------------

const fuels = {

    coal: {
        name: "Indonesian Coal",
        gcv: 6944.44,
        moisture: 28,
        ash: 8.5,
        hydrogen: 4.5
    },

    groundnut: {
        name: "Groundnut Briquette",
        gcv: 4516.67,
        moisture: 7,
        ash: 6,
        hydrogen: 6.5
    },

    rice: {
        name: "Rice Husk",
        gcv: 3241.11,
        moisture: 10,
        ash: 19,
        hydrogen: 4.15
    },

    mustard: {
        name: "Mustard Briquette",
        gcv: 4222.22,
        moisture: 10,
        ash: 8,
        hydrogen: 6
    }

};


// -----------------------------
// GLOBAL VARIABLES
// -----------------------------

let currentFuel = "coal";

let capacities = [
    5,
    10,
    15,
    20,
    30
];


// -----------------------------
// SELECT FUEL
// -----------------------------

function selectFuel(key) {

    if (!fuels[key]) {
        return;
    }

    currentFuel = key;

    const fuel = fuels[key];

    setVal("gcv", fuel.gcv);
    setVal("moisture", fuel.moisture);
    setVal("ash", fuel.ash);
    setVal("h", fuel.hydrogen);

    // Remove active class
    document
        .querySelectorAll(".fuel-btn")
        .forEach(function (button) {
            button.classList.remove("active");
        });

    // Fuel button order
    const buttonMap = {
        coal: 0,
        groundnut: 1,
        rice: 2,
        mustard: 3
    };

    const buttons = document.querySelectorAll(".fuel-btn");

    if (buttons[buttonMap[key]]) {
        buttons[buttonMap[key]].classList.add("active");
    }

    updateSimulation();
}


// -----------------------------
// SET VALUE
// -----------------------------

function setVal(type, value) {

    const slider = document.getElementById(type + "Slider");
    const numberBox = document.getElementById(type + "Value");

    if (slider) {
        slider.value = value;
    }

    if (numberBox) {
        numberBox.value = value;
    }
}


// -----------------------------
// CUSTOM FUEL
// -----------------------------

function applyCustomFuel() {

    const name =
        document.getElementById("customName")?.value ||
        "Custom Fuel";

    const gcv =
        Number(document.getElementById("customGCV")?.value);

    const moisture =
        Number(document.getElementById("customMoisture")?.value);

    const ash =
        Number(document.getElementById("customAsh")?.value);

    const hydrogen =
        Number(document.getElementById("customH")?.value);


    if (
        Number.isNaN(gcv) ||
        Number.isNaN(moisture) ||
        Number.isNaN(ash) ||
        Number.isNaN(hydrogen)
    ) {

        alert(
            "Please enter all custom fuel parameters."
        );

        return;
    }


    fuels.custom = {

        name: name,

        gcv: gcv,

        moisture: moisture,

        ash: ash,

        hydrogen: hydrogen

    };


    currentFuel = "custom";


    setVal("gcv", gcv);

    setVal("moisture", moisture);

    setVal("ash", ash);

    setVal("h", hydrogen);


    document
        .querySelectorAll(".fuel-btn")
        .forEach(function (button) {
            button.classList.remove("active");
        });


    updateSimulation();
}


// -----------------------------
// SYNCHRONIZE SLIDER + NUMBER
// -----------------------------

function sync(type) {

    const map = {

        gcv: [
            "gcvValue",
            "gcvSlider"
        ],

        moisture: [
            "moistureValue",
            "moistureSlider"
        ],

        ash: [
            "ashValue",
            "ashSlider"
        ],

        h: [
            "hValue",
            "hSlider"
        ],

        eff: [
            "effValue",
            "effSlider"
        ],

        steamH: [
            "steamHValue",
            "steamHSlider"
        ],

        feedH: [
            "feedHValue",
            "feedHSlider"
        ],

        capacity: [
            "capacityValue",
            "capacitySlider"
        ]

    };


    const ids = map[type];

    if (!ids) {
        return;
    }


    const numberBox =
        document.getElementById(ids[0]);

    const slider =
        document.getElementById(ids[1]);


    if (numberBox && slider) {

        slider.value =
            numberBox.value;

        updateSimulation();
    }
}


// -----------------------------
// READ INPUTS
// -----------------------------

function inputs() {

    const getValue = function (id) {

        const element =
            document.getElementById(id);

        return element
            ? Number(element.value)
            : 0;
    };


    return {

        gcv:
            getValue("gcvSlider"),

        moisture:
            getValue("moistureSlider"),

        ash:
            getValue("ashSlider"),

        hydrogen:
            getValue("hSlider"),

        efficiency:
            getValue("effSlider"),

        steamEnthalpy:
            getValue("steamHSlider"),

        feedEnthalpy:
            getValue("feedHSlider"),

        capacity:
            getValue("capacitySlider")

    };
}


// -----------------------------
// AS-RECEIVED GCV
// -----------------------------

function arGCV(gcv, moisture) {

    return gcv *
        (1 - moisture / 100);
}


// -----------------------------
// NCV
// -----------------------------

function ncv(gcv, moisture, hydrogen) {

    return arGCV(gcv, moisture)
        -
        587 *
        (
            9 * (hydrogen / 100)
            +
            moisture / 100
        );
}


// -----------------------------
// STEAM PER FUEL
// -----------------------------

function steamPerFuel(
    ncvValue,
    efficiency,
    steamEnthalpy,
    feedEnthalpy
) {

    const enthalpyDifference =
        steamEnthalpy -
        feedEnthalpy;


    if (enthalpyDifference <= 0) {
        return 0;
    }


    return (
        ncvValue *
        4.1868 *
        (efficiency / 100)
    ) /
    enthalpyDifference;
}


// -----------------------------
// COMBUSTIBLE MATTER
// -----------------------------

function combustibleMatter(
    moisture,
    ash
) {

    return Math.max(
        0,
        100 -
        moisture -
        ash
    );
}


// -----------------------------
// MAIN SIMULATION
// -----------------------------

function updateSimulation() {

    // Make sure simulation controls exist
    const requiredIds = [

        "gcvSlider",
        "moistureSlider",
        "ashSlider",
        "hSlider",
        "effSlider",
        "steamHSlider",
        "feedHSlider",
        "capacitySlider"

    ];


    const simulationExists =
        requiredIds.every(function (id) {

            return document.getElementById(id);

        });


    // This is important because Home/About
    // pages do not contain simulation controls.
    if (!simulationExists) {
        return;
    }


    const x = inputs();


    // -------------------------
    // CALCULATIONS
    // -------------------------

    const asReceivedGCV =
        arGCV(
            x.gcv,
            x.moisture
        );


    const calculatedNCV =
        ncv(
            x.gcv,
            x.moisture,
            x.hydrogen
        );


    const steam =
        steamPerFuel(
            calculatedNCV,
            x.efficiency,
            x.steamEnthalpy,
            x.feedEnthalpy
        );


    const fuelRequirement =
        steam > 0
            ? x.capacity / steam
            : 0;


    const combustible =
        combustibleMatter(
            x.moisture,
            x.ash
        );


    // -------------------------
    // DISPLAY INPUT VALUES
    // -------------------------

    const setTextValue = function (
        id,
        value
    ) {

        const element =
            document.getElementById(id);

        if (element) {
            element.value = value;
        }

    };


    setTextValue(
        "gcvValue",
        x.gcv.toFixed(2)
    );


    setTextValue(
        "moistureValue",
        x.moisture.toFixed(1)
    );


    setTextValue(
        "ashValue",
        x.ash.toFixed(1)
    );


    setTextValue(
        "hValue",
        x.hydrogen.toFixed(2)
    );


    setTextValue(
        "effValue",
        x.efficiency.toFixed(1)
    );


    setTextValue(
        "steamHValue",
        x.steamEnthalpy
    );


    setTextValue(
        "feedHValue",
        x.feedEnthalpy
    );


    setTextValue(
        "capacityValue",
        x.capacity.toFixed(1)
    );


    // -------------------------
    // KPI DISPLAY
    // -------------------------

    const setText = function (
        id,
        value
    ) {

        const element =
            document.getElementById(id);

        if (element) {
            element.textContent = value;
        }

    };


    setText(
        "gcvResult",
        asReceivedGCV.toFixed(0)
    );


    setText(
        "ncvResult",
        calculatedNCV.toFixed(0)
    );


    setText(
        "steamResult",
        steam.toFixed(2)
    );


    setText(
        "fuelResult",
        fuelRequirement.toFixed(2)
    );


    setText(
        "combustibleResult",
        combustible.toFixed(1)
    );


    // -------------------------
    // BOILER FLOW
    // -------------------------

    const processFuel =
        document.getElementById(
            "processFuel"
        );


    const processSteam =
        document.getElementById(
            "processSteam"
        );


    if (processFuel) {

        processFuel.textContent =
            fuels[currentFuel]?.name ||
            "Custom Fuel";

    }


    if (processSteam) {

        processSteam.textContent =
            x.capacity.toFixed(1) +
            " TPH";

    }


    // -------------------------
    // NCV EXPLANATION
    // -------------------------

    const ncvExplanation =
        document.getElementById(
            "ncvExplanation"
        );


    if (ncvExplanation) {

        ncvExplanation.textContent =
            `${asReceivedGCV.toFixed(0)} − 587 × ` +
            `[9 × (${x.hydrogen.toFixed(2)}/100) + ` +
            `${x.moisture.toFixed(1)}/100] = ` +
            `${calculatedNCV.toFixed(0)} kcal/kg`;

    }


    // -------------------------
    // ASH EXPLANATION
    // -------------------------

    const ashExplanation =
        document.getElementById(
            "ashExplanation"
        );


    if (ashExplanation) {

        ashExplanation.innerHTML =

            `Combustible Matter = 100 − ` +
            `${x.moisture.toFixed(1)} − ` +
            `${x.ash.toFixed(1)} = ` +

            `<b>${combustible.toFixed(1)}%</b>` +

            `<br>` +

            `Ash = <b>${x.ash.toFixed(1)}%</b> of fuel`;

    }


    // -------------------------
    // LIVE CALCULATION
    // -------------------------

    const calculationText =
        document.getElementById(
            "calculationText"
        );


    const enthalpyDifference =
        x.steamEnthalpy -
        x.feedEnthalpy;


    const usefulEnergy =
        calculatedNCV *
        4.1868 *
        (x.efficiency / 100);


    drawNCVChart(
        calculatedNCV,
        x.efficiency,
        enthalpyDifference
    );

    syncReportFields(
        x,
        asReceivedGCV,
        calculatedNCV,
        steam
    );


    if (calculationText) {

        calculationText.innerHTML =

            `<b>Step 1: As-received GCV</b>` +

            `<br>` +

            `${x.gcv.toFixed(2)} × ` +

            `(1 − ${x.moisture.toFixed(1)}/100)` +

            ` = ` +

            `<span class="highlight">` +

            `${asReceivedGCV.toFixed(2)} kcal/kg` +

            `</span>` +

            `<br><br>` +


            `<b>Step 2: Fuel Ash & Combustible Matter</b>` +

            `<br>` +

            `Combustible Matter = 100 − Moisture − Ash` +

            ` = 100 − ${x.moisture.toFixed(1)} − ${x.ash.toFixed(1)}` +

            ` = ` +

            `<span class="highlight">` +

            `${combustible.toFixed(1)}%` +

            `</span>` +

            `<br><br>` +


            `<b>Step 3: NCV</b>` +

            `<br>` +

            `NCV = ${asReceivedGCV.toFixed(2)} − 587 × ` +

            `[9 × (${x.hydrogen.toFixed(2)}/100) + ` +

            `${x.moisture.toFixed(1)}/100]` +

            ` = ` +

            `<span class="highlight">` +

            `${calculatedNCV.toFixed(2)} kcal/kg` +

            `</span>` +

            `<br><br>` +


            `<b>Step 4: Useful boiler energy</b>` +

            `<br>` +

            `${calculatedNCV.toFixed(2)} × 4.1868 × ` +

            `${x.efficiency.toFixed(1)}%` +

            ` = ` +

            `<span class="highlight">` +

            `${usefulEnergy.toFixed(2)} kJ/kg fuel` +

            `</span>` +

            `<br><br>` +


            `<b>Step 5: Steam generation</b>` +

            `<br>` +

            `${usefulEnergy.toFixed(2)} ÷ ` +

            `(${x.steamEnthalpy} − ${x.feedEnthalpy})` +

            ` = ` +

            `<span class="highlight">` +

            `${steam.toFixed(2)} T/T` +

            `</span>` +

            `<br><br>` +


            `<b>Step 6: Fuel requirement</b>` +

            `<br>` +

            `${x.capacity.toFixed(1)} ÷ ${steam.toFixed(2)}` +

            ` = ` +

            `<span class="highlight">` +

            `${fuelRequirement.toFixed(2)} TPH` +

            `</span>`;

    }


    // -------------------------
    // TABLE + MOISTURE
    // -------------------------

    renderTable();

    renderMoisture();

}


// -----------------------------
// NCV CHART (SVG line chart)
// -----------------------------

function drawNCVChart(currentNCV, efficiency, enthalpyDifference) {

    const svg = document.getElementById("ncvChart");

    if (!svg) {
        return;
    }

    if (!(currentNCV > 0) || !(enthalpyDifference > 0)) {
        svg.innerHTML = "";
        return;
    }

    const W = 900, H = 260;
    const L = 60, R = 25, T = 20, B = 40;

    const min = Math.max(300, currentNCV * 0.5);
    const max = currentNCV * 1.5;

    const points = [];

    for (let i = 0; i <= 10; i++) {
        const ncvVal = min + (max - min) * i / 10;
        const steam = ncvVal * 4.1868 * (efficiency / 100) / enthalpyDifference;
        points.push({ ncv: ncvVal, steam: steam });
    }

    const steamValues = points.map(function (p) { return p.steam; });
    const yMin = Math.min.apply(null, steamValues);
    const yMax = Math.max.apply(null, steamValues);

    function x(v) {
        return L + (v - min) / (max - min) * (W - L - R);
    }

    function y(v) {
        const range = (yMax - yMin) || 1;
        return T + (yMax - v) / range * (H - T - B);
    }

    let html = `<rect width="${W}" height="${H}" fill="#0b1016" rx="10"/>`;

    for (let i = 0; i <= 5; i++) {
        const yy = T + i * (H - T - B) / 5;
        html += `<line x1="${L}" y1="${yy}" x2="${W - R}" y2="${yy}" stroke="#2b3440"/>`;
    }

    const path = points.map(function (p, i) {
        return (i === 0 ? "M" : "L") + x(p.ncv).toFixed(1) + "," + y(p.steam).toFixed(1);
    }).join(" ");

    html += `<path d="${path}" fill="none" stroke="#dbe2e9" stroke-width="3"/>`;

    const cx = x(currentNCV);
    const currentSteam = currentNCV * 4.1868 * (efficiency / 100) / enthalpyDifference;
    const cy = y(currentSteam);

    html += `<line x1="${cx}" y1="${T}" x2="${cx}" y2="${H - B}" stroke="#ff8a3d" stroke-width="2" stroke-dasharray="6 5"/>`;
    html += `<circle cx="${cx}" cy="${cy}" r="6" fill="#ff8a3d"/>`;

    html += `<text x="${L}" y="${T - 6}" fill="#8e9aa7" font-size="11">${max.toFixed(0)}</text>`;
    html += `<text x="${W / 2}" y="${H - 10}" fill="#8e9aa7" text-anchor="middle" font-size="12">NCV (kcal/kg)</text>`;
    html += `<text transform="rotate(-90)" x="${-H / 2}" y="16" fill="#8e9aa7" text-anchor="middle" font-size="12">Steam / Fuel (t/t)</text>`;

    svg.innerHTML = html;
}


// -----------------------------
// 28-PARAMETER REPORT SYNC
// -----------------------------

const reportFuelNames = {
    coal: "Indonesian Coal",
    groundnut: "Groundnut Briquettes",
    rice: "Rice Husk",
    mustard: "Mustard Briquettes",
    custom: "Custom Fuel"
};

function syncReportFields(x, asReceivedGCV, calculatedNCV, steam) {
    const setValue = function (id, value) {
        const element = document.getElementById(id);
        if (element) element.value = value;
    };

    const p1 = document.getElementById("p1");
    if (p1) {
        const fuel = reportFuelNames[currentFuel] || "Custom Fuel";
        const option = Array.from(p1.options || []).find(function (opt) {
            return opt.text.toLowerCase() === fuel.toLowerCase();
        });
        p1.value = option ? option.value : (p1.options[0] ? p1.options[0].value : "");
    }

    setValue("p2", asReceivedGCV.toFixed(0) + " / " + calculatedNCV.toFixed(0));
    setValue("p4", x.hydrogen.toFixed(2));
    setValue("p5", x.moisture.toFixed(1));
    setValue("p6", x.ash.toFixed(1));
    setValue("p10", x.capacity.toFixed(1));
    setValue("p11", steam > 0 ? steam.toFixed(2) : "0.00");
    setValue("p20", x.efficiency.toFixed(1));
}



// -----------------------------
// CAPACITY TABLE
// -----------------------------

function renderTable() {

    const tableBody =
        document.getElementById(
            "capacityBody"
        );


    if (!tableBody) {
        return;
    }


    const x = inputs();


    const calculatedNCV =
        ncv(
            x.gcv,
            x.moisture,
            x.hydrogen
        );


    const steam =
        steamPerFuel(
            calculatedNCV,
            x.efficiency,
            x.steamEnthalpy,
            x.feedEnthalpy
        );


    const fuelName =
        fuels[currentFuel]?.name ||
        "Custom Fuel";


    tableBody.innerHTML =

        capacities.map(
            function (capacity, index) {

                const requirement =
                    steam > 0
                        ? capacity / steam
                        : 0;


                return `

                    <tr>

                        <td data-label="Boiler Capacity (TPH)">

                            <input

                                class="capacity-input"

                                type="number"

                                step="0.1"

                                value="${capacity}"

                                onchange="
                                    changeCap(
                                        ${index},
                                        this.value
                                    )
                                "

                            >

                        </td>


                        <td data-label="Fuel">
                            ${fuelName}
                        </td>


                        <td data-label="Moisture (%)">
                            ${x.moisture.toFixed(1)}
                        </td>


                        <td data-label="NCV (kcal/kg)">
                            ${calculatedNCV.toFixed(0)}
                        </td>


                        <td data-label="Steam/Fuel (T/T)">
                            ${steam.toFixed(2)}
                        </td>


                        <td data-label="Fuel Requirement (TPH)">
                            ${requirement.toFixed(2)}
                        </td>


                        <td data-label="Action">

                            <button

                                class="remove-btn"

                                onclick="
                                    removeCap(${index})
                                "

                            >

                                Remove

                            </button>

                        </td>

                    </tr>

                `;

            }
        ).join("");

}


// -----------------------------
// CHANGE CAPACITY
// -----------------------------

function changeCap(index, value) {

    const number =
        Number(value);


    if (number > 0) {

        capacities[index] =
            number;

    }


    updateSimulation();
}


// -----------------------------
// ADD CAPACITY
// -----------------------------

function addCapacity() {

    const last =
        capacities.length
            ? capacities[capacities.length - 1]
            : 0;


    capacities.push(
        last + 5
    );


    renderTable();
}


// -----------------------------
// REMOVE CAPACITY
// -----------------------------

function removeCap(index) {

    if (capacities.length <= 1) {

        alert(
            "At least one boiler capacity is required."
        );

        return;
    }


    capacities.splice(
        index,
        1
    );


    renderTable();
}


// -----------------------------
// MOISTURE SENSITIVITY
// -----------------------------

function renderMoisture() {

    const grid =
        document.getElementById(
            "moistureGrid"
        );


    if (!grid) {
        return;
    }


    const x = inputs();


    const moistureValues = [
        5,
        10,
        15,
        20,
        25,
        30
    ];


    const values =
        moistureValues.map(
            function (moisture) {

                const calculatedNCV =
                    ncv(
                        x.gcv,
                        moisture,
                        x.hydrogen
                    );


                const steam =
                    steamPerFuel(
                        calculatedNCV,
                        x.efficiency,
                        x.steamEnthalpy,
                        x.feedEnthalpy
                    );


                return {

                    moisture:
                        moisture,

                    ncv:
                        calculatedNCV,

                    steam:
                        steam

                };

            }
        );


    const maxSteam =
        Math.max.apply(
            null,
            values.map(
                function (item) {
                    return item.steam;
                }
            )
        );


    const fuelName =
        fuels[currentFuel]?.name ||
        "Custom Fuel";


    grid.innerHTML = `

        <div class="moisture-box">

            <div class="moisture-name">

                ${fuelName}

            </div>


            ${values.map(
                function (item) {

                    const width =
                        maxSteam > 0
                            ? Math.max(
                                2,
                                item.steam /
                                maxSteam *
                                100
                              )
                            : 2;


                    return `

                        <div class="bar-row">

                            <div class="bar-label">

                                <span>
                                    ${item.moisture}%
                                    moisture
                                </span>

                                <span>
                                    ${item.steam.toFixed(2)}
                                    T/T
                                </span>

                            </div>


                            <div class="bar-bg">

                                <div

                                    class="bar"

                                    style="
                                        width:${width}%
                                    "

                                ></div>

                            </div>

                        </div>

                    `;

                }
            ).join("")}

        </div>

    `;

}


// -----------------------------
// PAGE INITIALIZATION
// -----------------------------

document.addEventListener(
    "DOMContentLoaded",
    function () {

        // Open the page requested via ?page=... if valid, otherwise Home
        const requestedPage = new URLSearchParams(window.location.search).get("page");
        const validPages = ["home", "about", "analysis"];
        showPage(validPages.includes(requestedPage) ? requestedPage : "home");

        // Initialize simulation
        updateSimulation();

    }
);