import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import useAutoTheme from "./useTheme";

afterEach(() => {
  vi.useRealTimers();
});

it("should follow daytime, evening and early-morning themes and clean up the interval", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 26, 12));
  const { result, unmount } = renderHook(useAutoTheme);
  expect(result.current.isDarkMode).toBe(false);
  expect(result.current.theme.palette.mode).toBe("light");
  vi.setSystemTime(new Date(2026, 9, 26, 18));
  act(() => vi.advanceTimersByTime(60_000));
  expect(result.current.theme.palette.mode).toBe("dark");
  vi.setSystemTime(new Date(2026, 9, 27, 3));
  act(() => vi.advanceTimersByTime(60_000));
  expect(result.current.isDarkMode).toBe(true);
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});
