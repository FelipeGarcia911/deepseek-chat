import { onCLS, onFID, onLCP, onFCP, onTTFB } from "web-vitals";

import type { Metric } from "web-vitals";

type ReportHandler = (metric: Metric) => void;

/**
 * Sends Core Web Vitals metrics to the console or an analytics service.
 */
export function reportWebVitals(onPerfEntry?: ReportHandler) {
  if (onPerfEntry && onPerfEntry instanceof Function) {
    onCLS(onPerfEntry);
    onFID(onPerfEntry);
    onLCP(onPerfEntry);
    onFCP(onPerfEntry);
    onTTFB(onPerfEntry);
  }
}
