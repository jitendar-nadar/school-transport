import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LONG_STOP_MS,
  distanceToRouteMeters,
  dayBounds,
  emptyMemory,
  motionStatus,
  nextAlerts,
  offlineDue,
  retentionDays,
  summarizeTrack,
  type Fence,
} from "./tracking-rules";

const depot: Fence = {
  id: "depot",
  name: "Main depot",
  kind: "DEPOT",
  latitude: 19.076,
  longitude: 72.877,
  radiusMeters: 200,
};

describe("truck motion", () => {
  it("marks a fast truck as moving", () => {
    assert.equal(motionStatus({ speedKmh: 42, ignition: true, ageMs: 1_000 }), "MOVING");
  });

  it("marks a slow truck with the engine on as idle", () => {
    assert.equal(motionStatus({ speedKmh: 0, ignition: true, ageMs: 1_000 }), "IDLE");
  });

  it("marks a slow truck with the engine off as stopped", () => {
    assert.equal(motionStatus({ speedKmh: 0, ignition: false, ageMs: 1_000 }), "STOPPED");
  });

  it("marks a truck offline only when the server has not heard from it", () => {
    assert.equal(motionStatus({ speedKmh: 40, ignition: true, ageMs: 4 * 60 * 1000 }), "OFFLINE");
    assert.equal(offlineDue(Date.now() - 60_000, Date.now(), false), false);
    assert.equal(offlineDue(Date.now() - 4 * 60 * 1000, Date.now(), false), true);
    assert.equal(offlineDue(Date.now() - 4 * 60 * 1000, Date.now(), true), false);
  });
});

describe("truck alerts", () => {
  const point = {
    latitude: 19.076,
    longitude: 72.877,
    speedKmh: 0,
    ignition: false as boolean | null,
    unplugged: false,
    recordedAt: 1_000_000,
  };

  it("raises enter and exit once as the truck crosses a geofence", () => {
    const entered = nextAlerts({ point, memory: emptyMemory(), fences: [depot], route: [] });
    assert.deepEqual(entered.alerts.map((alert) => alert.type), ["GEOFENCE_ENTER"]);
    const still = nextAlerts({ point, memory: entered.memory, fences: [depot], route: [] });
    assert.equal(still.alerts.length, 0);
    const left = nextAlerts({
      point: { ...point, latitude: 19.09, recordedAt: point.recordedAt + 60_000 },
      memory: still.memory,
      fences: [depot],
      route: [],
    });
    assert.deepEqual(left.alerts.map((alert) => alert.type), ["GEOFENCE_EXIT"]);
  });

  it("does not treat a depot stop as a long stoppage", () => {
    const result = nextAlerts({
      point: { ...point, recordedAt: point.recordedAt + LONG_STOP_MS },
      memory: { ...emptyMemory(), stopSince: point.recordedAt, insideIds: [depot.id] },
      fences: [depot],
      route: [],
    });
    assert.equal(result.alerts.some((alert) => alert.type === "LONG_STOP"), false);
  });

  it("raises one long-stop alert after 15 minutes outside a depot", () => {
    const waiting = nextAlerts({ point, memory: emptyMemory(), fences: [], route: [] });
    const late = nextAlerts({
      point: { ...point, recordedAt: point.recordedAt + LONG_STOP_MS },
      memory: waiting.memory,
      fences: [],
      route: [],
    });
    assert.equal(late.alerts.filter((alert) => alert.type === "LONG_STOP").length, 1);
    const again = nextAlerts({
      point: { ...point, recordedAt: point.recordedAt + LONG_STOP_MS + 60_000 },
      memory: late.memory,
      fences: [],
      route: [],
    });
    assert.equal(again.alerts.some((alert) => alert.type === "LONG_STOP"), false);
  });

  it("raises overspeed, unplugged, and route deviation once each", () => {
    const route = [
      { latitude: 19.076, longitude: 72.877 },
      { latitude: 19.08, longitude: 72.88 },
    ];
    const first = nextAlerts({
      point: { ...point, latitude: 19.2, longitude: 73.1, speedKmh: 96, ignition: true, unplugged: true },
      memory: emptyMemory(),
      fences: [],
      route,
    });
    const types = first.alerts.map((alert) => alert.type).sort();
    assert.deepEqual(types, ["OVERSPEED", "ROUTE_DEVIATION", "UNPLUGGED"]);
    const second = nextAlerts({
      point: { ...point, latitude: 19.2, longitude: 73.1, speedKmh: 96, ignition: true, unplugged: true, recordedAt: point.recordedAt + 5_000 },
      memory: first.memory,
      fences: [],
      route,
    });
    assert.equal(second.alerts.length, 0);
  });

  it("measures distance from a point to the planned route", () => {
    const near = distanceToRouteMeters(
      { latitude: 19.076, longitude: 72.877 },
      [
        { latitude: 19.076, longitude: 72.877 },
        { latitude: 19.08, longitude: 72.877 },
      ],
    );
    assert.ok(near < 30);
  });
});

describe("trip summary", () => {
  it("adds distance, idle time, and a stoppage from buffered points", () => {
    const start = Date.parse("2026-10-26T04:30:00.000Z");
    const summary = summarizeTrack([
      { latitude: 19, longitude: 72.877, speedKmh: 0, ignition: true, recordedAt: start },
      { latitude: 19, longitude: 72.877, speedKmh: 0, ignition: true, recordedAt: start + 5 * 60_000 },
      { latitude: 19.01, longitude: 72.877, speedKmh: 40, ignition: true, recordedAt: start + 10 * 60_000 },
      { latitude: 19.02, longitude: 72.877, speedKmh: 0, ignition: false, recordedAt: start + 20 * 60_000 },
      { latitude: 19.02, longitude: 72.877, speedKmh: 0, ignition: false, recordedAt: start + 28 * 60_000 },
    ]);
    assert.ok(summary.distanceMeters > 2000);
    assert.equal(summary.idleMinutes, 10);
    assert.equal(summary.stoppages.length, 1);
  });
});

describe("tracker retention", () => {
  it("keeps 90 days unless a real retention setting is present", () => {
    const previous = process.env.FLEET_POINT_RETENTION_DAYS;
    delete process.env.FLEET_POINT_RETENTION_DAYS;
    assert.equal(retentionDays(), 90);
    process.env.FLEET_POINT_RETENTION_DAYS = "0";
    assert.equal(retentionDays(), 90);
    process.env.FLEET_POINT_RETENTION_DAYS = "30";
    assert.equal(retentionDays(), 30);
    if (previous == null) delete process.env.FLEET_POINT_RETENTION_DAYS;
    else process.env.FLEET_POINT_RETENTION_DAYS = previous;
  });

  it("bounds one India calendar day", () => {
    const bounds = dayBounds("2026-10-16");
    assert.ok(bounds);
    assert.equal(bounds.start.toISOString(), "2026-10-15T18:30:00.000Z");
    assert.equal(bounds.end.getTime() - bounds.start.getTime(), 24 * 60 * 60 * 1000);
    assert.equal(dayBounds("not-a-day"), null);
  });
});
