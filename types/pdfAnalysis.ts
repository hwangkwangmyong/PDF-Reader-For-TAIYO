/**
 * Bounding box in normalized coordinates (0.0 - 1.0).
 * This allows UI preview overlays to be rendered regardless of page size.
 */
export interface NormalizedBBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Raw OCR hit that contains a star mark in the source drawing.
 */
export interface StarTextHit {
  rawText: string;
  bbox?: NormalizedBBox;
  quantityText?: string;
  hasNearbyFactoryInstallNote: boolean;
}

/**
 * Per-page OCR analysis result.
 */
export interface PageAnalysis {
  pageNumber: number;
  managementNo: string; // Example: "001"
  managementNoBbox?: NormalizedBBox;
  extractedStarItems: StarTextHit[];
}

/**
 * Formatted list output row.
 */
export interface FormattedDrawingItem {
  id: string;
  pageNumber: number;
  managementNo: string;
  originalText: string;
  normalizedText: string;
  quantity: string;
  hasNearbyFactoryInstallNote: boolean;
  combinedText: string; // Example: "001－SP1 （本） 1枚"
}
