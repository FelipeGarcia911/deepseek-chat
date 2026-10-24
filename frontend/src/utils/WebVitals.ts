import { onCLS, onFID, onLCP, onFCP, onTTFB } from "web-vitals";

type ReportHandler = (metric: any) => void;

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
