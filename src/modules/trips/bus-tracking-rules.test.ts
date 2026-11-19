import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  distanceToRouteMeters,
  etaMinutes,
  isLongStop,
  isOverspeed,
  isRouteDeviation,
  shouldSendApproachAlert,
} from "./bus-tracking-rules";

describe("bus tracking rules", () => {
  it("estimates ETA and alerts within five minutes", () => {
    assert.equal(etaMinutes(1000, 60), 1);
    assert.equal(etaMinutes(5000, 60), 5);
    const near = shouldSendApproachAlert({
      distanceMeters: 1500,
      speedKmh: 30,
      stopRadiusMeters: 80,
      proximityRadiusMeters: 300,
    });
    assert.equal(near.alert, true);
    assert.equal(near.reason, "ETA");
    const far = shouldSendApproachAlert({
      distanceMeters: 8000,
      speedKmh: 40,
      stopRadiusMeters: 80,
      proximityRadiusMeters: 300,
    });
    assert.equal(far.alert, false);
    const geofence = shouldSendApproachAlert({
      distanceMeters: 200,
      speedKmh: 5,
      stopRadiusMeters: 80,
      proximityRadiusMeters: 300,
    });
    assert.equal(geofence.alert, true);
    assert.equal(geofence.reason, "GEOFENCE");
  });

  it("flags overspeed, long stops, and route deviation", () => {
    assert.equal(isOverspeed(61), true);
    assert.equal(isOverspeed(40), false);
    const now = new Date("2026-11-16T10:00:00.000Z");
    assert.equal(
      isLongStop({ speedKmh: 0, stoppedSince: new Date("2026-11-16T09:45:00.000Z"), now, longStopMinutes: 10 }),
      true,
    );
    assert.equal(isLongStop({ speedKmh: 20, stoppedSince: new Date("2026-11-16T09:45:00.000Z"), now }), false);
    const route = [
      { latitude: 19.1, longitude: 72.8 },
      { latitude: 19.2, longitude: 72.9 },
    ];
    assert.ok(distanceToRouteMeters({ latitude: 19.15, longitude: 72.85 }, route) < 5000);
    assert.equal(isRouteDeviation({ latitude: 20, longitude: 74 }, route, 400), true);
    assert.equal(isRouteDeviation({ latitude: 19.15, longitude: 72.85 }, route, 50_000), false);
  });
});
