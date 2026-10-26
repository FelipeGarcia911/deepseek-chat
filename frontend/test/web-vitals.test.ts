import { expect, it, vi } from "vitest";
import { onCLS, onFID, onLCP, onFCP, onTTFB } from "web-vitals";
import { reportWebVitals } from "../src/utils/WebVitals";

vi.mock("web-vitals", () => ({ onCLS: vi.fn(), onFID: vi.fn(), onLCP: vi.fn(), onFCP: vi.fn(), onTTFB: vi.fn() }));

it("should register the supplied reporting callback for each supported metric", () => {
  const report = vi.fn();
  reportWebVitals(report);
  for (const register of [onCLS, onFID, onLCP, onFCP, onTTFB]) expect(register).toHaveBeenCalledExactlyOnceWith(report);
});

it.each([undefined, {}])("should leave metric reporting disconnected for an invalid callback %j", (callback) => {
  reportWebVitals(callback as Parameters<typeof reportWebVitals>[0]);
  for (const register of [onCLS, onFID, onLCP, onFCP, onTTFB]) expect(register).not.toHaveBeenCalled();
});
