/* Seeded deterministic random stream.
 *
 * Every source of chance in a run — AI decisions, scenery scatter, challenge
 * setup — draws from one of these. Math.random() must never be used inside the
 * simulation, because a ghost replay and a server re-simulation have to produce
 * exactly the same run from the same seed.
 *
 * sfc32 with a splitmix32 seeding step: small, fast, and it passes well beyond
 * what a browser game needs. Same seed in, same sequence out, on every engine.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else (root.Racing = root.Racing || {}).Random = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // Mixes an arbitrary integer into four well-distributed 32-bit words, so
  // seeds 1 and 2 produce unrelated streams rather than near-identical ones.
  function splitmix32(seed) {
    var s = seed >>> 0, out = [];
    for (var i = 0; i < 4; i++) {
      s = (s + 0x9e3779b9) >>> 0;
      var z = s;
      z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0;
      z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
      out.push((z ^ (z >>> 15)) >>> 0);
    }
    return out;
  }

  // A string seed (a daily challenge date, a track id) hashes to an integer.
  function hashSeed(value) {
    if (typeof value === "number" && isFinite(value)) return Math.floor(value) >>> 0;
    var str = String(value == null ? "" : value), h = 2166136261 >>> 0;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  function Stream(seed) {
    var w = splitmix32(hashSeed(seed));
    this.seed = seed;
    this.a = w[0]; this.b = w[1]; this.c = w[2]; this.d = w[3];
    this.count = 0;
  }

  // sfc32. Returns a float in [0, 1).
  Stream.prototype.next = function () {
    var a = this.a, b = this.b, c = this.c, d = this.d;
    var t = (a + b) >>> 0;
    this.a = (b ^ (b >>> 9)) >>> 0;
    this.b = (c + (c << 3)) >>> 0;
    this.c = ((c << 21) | (c >>> 11)) >>> 0;
    this.c = (this.c + t) >>> 0;
    this.d = (d + 1) >>> 0;
    t = (t + this.d) >>> 0;
    this.count++;
    return t / 4294967296;
  };

  Stream.prototype.float = function (min, max) { return min + this.next() * (max - min); };
  Stream.prototype.int = function (min, max) { return Math.floor(this.float(min, max + 1)); };
  Stream.prototype.pick = function (list) { return list[Math.floor(this.next() * list.length)]; };
  Stream.prototype.chance = function (p) { return this.next() < p; };

  // Fisher-Yates using this stream, so shuffles replay identically.
  Stream.prototype.shuffle = function (list) {
    var out = list.slice();
    for (var i = out.length - 1; i > 0; i--) {
      var j = Math.floor(this.next() * (i + 1));
      var t = out[i]; out[i] = out[j]; out[j] = t;
    }
    return out;
  };

  // Exact position capture and restore, so a replay can jump to a checkpoint
  // without replaying every draw that led there.
  Stream.prototype.state = function () { return { a: this.a, b: this.b, c: this.c, d: this.d, count: this.count }; };
  Stream.prototype.restore = function (s) {
    this.a = s.a >>> 0; this.b = s.b >>> 0; this.c = s.c >>> 0; this.d = s.d >>> 0;
    this.count = s.count | 0;
    return this;
  };
  // An independent stream derived from this one, for a subsystem that must not
  // disturb the main sequence (scenery scatter must not shift AI decisions).
  Stream.prototype.fork = function (label) {
    return new Stream((hashSeed(label) ^ this.a ^ Math.imul(this.count + 1, 0x9e3779b9)) >>> 0);
  };

  return {
    Stream: Stream,
    create: function (seed) { return new Stream(seed); },
    hashSeed: hashSeed,
    // Daily challenges are seeded by calendar date so every player gets the
    // same setup without the server having to hand one out.
    dailySeed: function (date) {
      var d = date instanceof Date ? date : new Date(date || Date.now());
      return hashSeed("funsat-daily-" + d.getUTCFullYear() + "-" + (d.getUTCMonth() + 1) + "-" + d.getUTCDate());
    }
  };
});
