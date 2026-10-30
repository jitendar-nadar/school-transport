import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { distanceMeters, fromPoint, isValidCoordinate, speedKmh, toPoint } from "./geo";

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
    assert.equal(speedKmh(10, 0), Number.POSITIVE_INFINITY);
  });

  it("stores longitude first and rejects a coordinate outside the map", () => {
    assert.deepEqual(toPoint(19.076, 72.877).coordinates, [72.877, 19.076]);
    assert.deepEqual(fromPoint({ coordinates: [72.877, 19.076] }), { latitude: 19.076, longitude: 72.877 });
    assert.equal(fromPoint(null), null);
    assert.equal(isValidCoordinate(19.076, 72.877), true);
    assert.equal(isValidCoordinate(91, 72.877), false);
    assert.equal(isValidCoordinate(19.076, 181), false);
  });
});
