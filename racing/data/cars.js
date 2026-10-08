/* The ten launch cars.
 *
 * Every car is fictional. Names, figures and silhouettes are invented for this
 * game; nothing here describes a real vehicle, and no manufacturer data was
 * used. The numbers exist to make the cars feel different from each other, not
 * to be accurate.
 *
 * `legacyIds` maps the old app.js fleet onto these records so an existing
 * garage keeps everything it unlocked.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else (root.Racing = root.Racing || {}).Cars = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // Shared defaults keep each record to the handful of figures that actually
  // distinguish it.
  var BASE = {
    wheelRadius: 0.32,
    drivetrainEfficiency: 0.86,
    steerFalloff: 0.018,
    // Lateral g the steering limiter aims for, and how far past it the driver is
    // allowed to overdrive the front wheels.
    steerAuthority: 1.05,
    steerMargin: 1.45,
    steerRate: 4.2,
    maxSteer: 0.62,
    slipFalloff: 0.30,
    peakSlip: 0.17,
    yawDamping: 0.45,
    dragCoeff: 0.42,
    rollResist: 5.8,
    brakeForce: 11000,
    handbrakeForce: 5200,
    handbrakeRelease: 0.70,
    idleRpm: 850,
    redline: 7200,
    shiftDelay: 0.18,
    boostThreshold: 2600,
    maxBoost: 0,
    spoolRate: 2.2,
    finalDrive: 3.9,
    gearRatios: [3.30, 2.10, 1.48, 1.12, 0.89, 0.72],
    torqueCurve: [[850, 140], [2500, 210], [4200, 245], [5800, 230], [7200, 180]],
    cgHeight: 0.52,
    yawInertia: 1.0,
    tireGrip: 1.0
  };

  function car(id, spec) {
    var out = {};
    for (var k in BASE) out[k] = BASE[k];
    for (var j in spec) out[j] = spec[j];
    out.id = id;
    out.wheelbase = out.frontAxle + out.rearAxle;
    return out;
  }

  var CARS = {
    sport: car("sport", {
      name: "Horizon Coupe", category: "starter", launchOrder: 1, unlockPrice: 0, starter: true,
      legacyIds: ["sport"],
      drive: "rwd", mass: 1280, frontMassFraction: 0.53, frontAxle: 1.28, rearAxle: 1.32,
      gripFront: 1.00, gripRear: 1.00,
      beginnerRating: 8, driftStability: 7, gripRating: 6,
      strengths: "Balanced and predictable. The easiest car to learn a drift in.",
      weaknesses: "Nothing stands out: it is out-accelerated and out-gripped by most of the fleet.",
      body: "coupe", paintRegions: ["body", "mirrors"], wheelStyle: "sport"
    }),
    hatch: car("hatch", {
      name: "Pebble Hatch", category: "light", launchOrder: 2, unlockPrice: 800,
      legacyIds: ["hatch", "gti", "panda"],
      drive: "fwd", mass: 980, frontMassFraction: 0.62, frontAxle: 1.08, rearAxle: 1.32,
      gripFront: 0.96, gripRear: 1.06, redline: 7600, yawInertia: 0.86, cgHeight: 0.56,
      torqueCurve: [[850, 105], [2800, 165], [4600, 190], [6200, 178], [7600, 140]],
      beginnerRating: 9, driftStability: 4, gripRating: 6,
      strengths: "Light, nimble and very hard to spin. Forgiving on a tight course.",
      weaknesses: "Front-wheel drive: it understeers at the limit and resists drifting.",
      body: "hatch", paintRegions: ["body"], wheelStyle: "steel"
    }),
    coupe90: car("coupe90", {
      name: "Meridian Six", category: "classic", launchOrder: 3, unlockPrice: 2200,
      legacyIds: ["coupe90", "popup"],
      drive: "rwd", mass: 1340, frontMassFraction: 0.51, frontAxle: 1.32, rearAxle: 1.34,
      gripFront: 0.98, gripRear: 0.95, handbrakeRelease: 0.78,
      torqueCurve: [[850, 150], [2600, 235], [4400, 268], [6000, 250], [7200, 190]],
      beginnerRating: 6, driftStability: 9, gripRating: 5,
      strengths: "Near-perfect balance and a long handbrake slide. The drift favourite.",
      weaknesses: "Modest outright grip; it loses time to the track cars on a clean lap.",
      body: "coupe", paintRegions: ["body", "stripe"], wheelStyle: "mesh"
    }),
    muscle: car("muscle", {
      name: "Boulevard V8", category: "muscle", launchOrder: 4, unlockPrice: 1500,
      legacyIds: ["muscle", "square"],
      drive: "rwd", mass: 1620, frontMassFraction: 0.56, frontAxle: 1.42, rearAxle: 1.46,
      gripFront: 0.90, gripRear: 0.96, redline: 6200, cgHeight: 0.58, yawInertia: 1.28,
      torqueCurve: [[850, 290], [2200, 420], [3800, 460], [5200, 410], [6200, 320]],
      beginnerRating: 4, driftStability: 6, gripRating: 4,
      strengths: "Enormous low-end torque. It will light up the rears at any speed.",
      weaknesses: "Heavy, slow to change direction, and it runs wide under braking.",
      body: "muscle", paintRegions: ["body", "stripe", "hood"], wheelStyle: "deep"
    }),
    rotary: car("rotary", {
      name: "Vellum RX", category: "tuner", launchOrder: 5, unlockPrice: 5200,
      legacyIds: ["rotary"],
      drive: "rwd", mass: 1180, frontMassFraction: 0.50, frontAxle: 1.24, rearAxle: 1.26,
      gripFront: 1.05, gripRear: 1.02, redline: 9000, yawInertia: 0.88,
      torqueCurve: [[1200, 120], [3600, 205], [6200, 240], [8000, 232], [9000, 195]],
      beginnerRating: 6, driftStability: 8, gripRating: 7,
      strengths: "Light, revvy and perfectly balanced. Rewards keeping the revs up.",
      weaknesses: "Almost no torque below 3,500 rpm; bog it down and it is slow.",
      body: "coupe", paintRegions: ["body", "stripe"], wheelStyle: "mesh"
    }),
    rally: car("rally", {
      name: "Tundra AWD", category: "rally", launchOrder: 6, unlockPrice: 4200,
      legacyIds: ["rally"],
      drive: "awd", mass: 1420, frontMassFraction: 0.57, frontAxle: 1.30, rearAxle: 1.32,
      gripFront: 1.12, gripRear: 1.12, maxBoost: 0.42, boostThreshold: 3000, spoolRate: 1.6,
      torqueCurve: [[850, 165], [2800, 290], [4600, 330], [6200, 300], [7200, 240]],
      beginnerRating: 8, driftStability: 5, gripRating: 9,
      strengths: "All-wheel drive traction. Barely notices rain and launches hardest.",
      weaknesses: "Resists big drift angles, and the turbo punishes clumsy throttle.",
      body: "sedan", paintRegions: ["body", "wing"], wheelStyle: "sport"
    }),
    track: car("track", {
      name: "Apex RS", category: "track", launchOrder: 7, unlockPrice: 6200,
      legacyIds: ["track"],
      drive: "rwd", mass: 1190, frontMassFraction: 0.47, frontAxle: 1.22, rearAxle: 1.30,
      gripFront: 1.20, gripRear: 1.18, cgHeight: 0.44, peakSlip: 0.15, yawDamping: 0.70,
      torqueCurve: [[850, 175], [3200, 300], [5400, 355], [7000, 330], [7800, 270]],
      redline: 7800,
      beginnerRating: 5, driftStability: 6, gripRating: 10,
      strengths: "The most grip in the fleet and a very sharp front end.",
      weaknesses: "Stiff and unforgiving: once the rear goes it goes quickly.",
      body: "super", paintRegions: ["body", "splitter", "wing"], wheelStyle: "sport"
    }),
    straight: car("straight", {
      name: "Longline Turbo", category: "tuner", launchOrder: 8, unlockPrice: 7200,
      legacyIds: ["straight"],
      drive: "rwd", mass: 1450, frontMassFraction: 0.54, frontAxle: 1.36, rearAxle: 1.38,
      gripFront: 1.04, gripRear: 1.06, maxBoost: 0.46, boostThreshold: 2800, spoolRate: 1.3,
      torqueCurve: [[850, 180], [3000, 330], [5000, 395], [6600, 370], [7400, 300]],
      redline: 7400,
      beginnerRating: 4, driftStability: 7, gripRating: 7,
      strengths: "Huge turbo punch once it spools. Holds long, fast drifts.",
      weaknesses: "Laggy: the boost arrives late and can arrive mid-corner.",
      body: "coupe", paintRegions: ["body", "wing"], wheelStyle: "deep"
    }),
    hyper: car("hyper", {
      name: "Zenith One", category: "hyper", launchOrder: 9, unlockPrice: 9000,
      legacyIds: ["hyper"],
      drive: "awd", mass: 1340, frontMassFraction: 0.44, frontAxle: 1.26, rearAxle: 1.38,
      gripFront: 1.24, gripRear: 1.26, cgHeight: 0.40, redline: 8600, peakSlip: 0.15,
      torqueCurve: [[850, 240], [3400, 450], [6000, 540], [7800, 500], [8600, 420]],
      beginnerRating: 3, driftStability: 5, gripRating: 10,
      strengths: "Fastest car in the fleet by a wide margin, in any weather.",
      weaknesses: "Needs real precision. Its speed arrives faster than most reactions.",
      body: "super", paintRegions: ["body", "splitter", "diffuser"], wheelStyle: "sport"
    }),
    ev: car("ev", {
      name: "Current Sedan", category: "ev", launchOrder: 10, unlockPrice: 8000,
      legacyIds: ["ev", "wedge"],
      drive: "awd", mass: 1890, frontMassFraction: 0.50, frontAxle: 1.44, rearAxle: 1.46,
      gripFront: 1.14, gripRear: 1.14, cgHeight: 0.36, yawInertia: 1.32,
      // One ratio: an EV has no gearbox, so torque is instant and flat.
      gearRatios: [8.2], finalDrive: 1.0, redline: 16000, idleRpm: 0, shiftDelay: 0,
      torqueCurve: [[0, 310], [4000, 300], [9000, 210], [16000, 110]],
      beginnerRating: 7, driftStability: 4, gripRating: 8,
      strengths: "Instant torque from a standstill and a very low centre of gravity.",
      weaknesses: "The heaviest car here. It carries that weight into every corner.",
      body: "ev", paintRegions: ["body", "lightbar"], wheelStyle: "sport"
    })
  };

  var ORDER = Object.keys(CARS).sort(function (a, b) { return CARS[a].launchOrder - CARS[b].launchOrder; });

  // Old garage ids map onto the nearest launch record. Several legacy cars can
  // map to one launch car; the unlock is granted once, not once per legacy id.
  var LEGACY = {};
  ORDER.forEach(function (id) {
    (CARS[id].legacyIds || []).forEach(function (old) { LEGACY[old] = id; });
  });

  function migrateUnlocks(legacyUnlocked) {
    var out = [];
    (legacyUnlocked || []).forEach(function (old) {
      var id = LEGACY[old] || (CARS[old] ? old : null);
      if (id && out.indexOf(id) < 0) out.push(id);
    });
    if (out.indexOf("sport") < 0) out.unshift("sport");
    return out;
  }
  function migrateSelection(legacyId) { return LEGACY[legacyId] || (CARS[legacyId] ? legacyId : "sport"); }

  return {
    BASE: BASE,
    CARS: CARS,
    ORDER: ORDER,
    LEGACY: LEGACY,
    get: function (id) { return CARS[id] || CARS.sport; },
    migrateUnlocks: migrateUnlocks,
    migrateSelection: migrateSelection
  };
});
