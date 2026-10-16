import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { distanceMeters, speedKmh } from "./geo";

describe("geo", () => {
  it("returns zero for the same point", () => {
    assert.equal(distanceMeters({ latitude: 19.076, longitude: 72.877 }, { latitude: 19.076, longitude: 72.877 }), 0);
  });

  it("measures a short northward move in meters", () => {
    const distance = distanceMeters({ latitude: 19, longitude: 72.877 }, { latitude: 19.001, longitude: 72.877 });
    assert.ok(distance > 100 && distance < 120);
  });

  it("converts distance and time into kilometers per hour", () => {
    assert.equal(speedKmh(1000, 10), 360);
  });
});
