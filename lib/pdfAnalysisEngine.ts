import type { PageAnalysis, StarTextHit } from "@/types/pdfAnalysis";

export interface PagePreview {
  pageNumber: number;
  dataUrl: string;
  width: number;
  height: number;
}

export interface PdfAnalysisResult {
  pages: PageAnalysis[];
  previews: PagePreview[];
}

interface PdfTextItem {
  str?: string;
  width?: number;
  height?: number;
  transform?: number[];
}

interface PositionedToken {
  text: string;
  bbox: { x: number; y: number; width: number; height: number };
}

const QUANTITY_REGEX = /(\d+\s*(?:枚|こ|コ|個|本|組|台|式|箇所|ヶ所))/;

function normalizeBBox(
  x: number,
  y: number,
  width: number,
  height: number,
  pageWidth: number,
  pageHeight: number,
) {
  const nx = Math.max(0, Math.min(1, x / pageWidth));
  const ny = Math.max(0, Math.min(1, y / pageHeight));
  const nw = Math.max(0, Math.min(1, width / pageWidth));
  const nh = Math.max(0, Math.min(1, height / pageHeight));
  return { x: nx, y: ny, width: nw, height: nh };
}

function extractManagementNo(tokens: string[]): string {
  for (const token of tokens) {
    const matched = token.match(/(?:No\.?\s*[:：]?\s*)?(\d{3})/i);
    if (matched?.[1]) {
      return matched[1];
    }
  }
  return "無";
}

function includesStarMark(text: string): boolean {
  return /[☆⭐]/.test(text);
}

function extractQuantity(text: string): string {
  const normalizedText = text
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replaceAll("ｺ", "コ");
  const matched = normalizedText.match(QUANTITY_REGEX);
  return matched?.[1]?.trim() ?? "";
}

function getCenterY(token: PositionedToken): number {
  return token.bbox.y + token.bbox.height / 2;
}

function getCenterX(token: PositionedToken): number {
  return token.bbox.x + token.bbox.width / 2;
}

function hasVerticalOverlap(a: PositionedToken, b: PositionedToken): boolean {
  const aTop = a.bbox.y;
  const aBottom = a.bbox.y + a.bbox.height;
  const bTop = b.bbox.y;
  const bBottom = b.bbox.y + b.bbox.height;
  const overlap = Math.min(aBottom, bBottom) - Math.max(aTop, bTop);
  const minHeight = Math.max(0.0001, Math.min(a.bbox.height, b.bbox.height));
  return overlap / minHeight > 0.35;
}

function findLineTokens(star: PositionedToken, tokens: PositionedToken[]): PositionedToken[] {
  const starCenterY = getCenterY(star);
  const yTolerance = Math.max(0.012, star.bbox.height * 0.9);
  const sameLine = tokens.filter((token) => {
    const centerYDiff = Math.abs(getCenterY(token) - starCenterY);
    const xDelta = token.bbox.x - star.bbox.x;
    const yAligned = hasVerticalOverlap(star, token) || centerYDiff < yTolerance;
    return yAligned && xDelta > -0.05 && xDelta < 1.5;
  });

  return sameLine.sort((a, b) => a.bbox.x - b.bbox.x);
}

function hasNearbyFactoryInstallNote(star: PositionedToken, tokens: PositionedToken[]): boolean {
  const starY = getCenterY(star);
  const starX = getCenterX(star);
  return tokens.some((token) => {
    if (!token.text.includes("工場取付")) {
      return false;
    }
    const noteY = getCenterY(token);
    if (noteY >= starY) {
      return false;
    }
    const yDiff = starY - noteY;
    const xDiff = Math.abs(getCenterX(token) - starX);
    return yDiff < 0.16 && xDiff < 0.45;
  });
}

function getInlineStarSegments(text: string): string[] {
  const segments = text.match(/[☆⭐][^☆⭐]*/g) ?? [];
  return segments.map((segment) => segment.trim()).filter((segment) => segment.length > 0);
}

function buildRightSideFallbackSegment(star: PositionedToken, tokens: PositionedToken[]): string {
  const starCenterY = getCenterY(star);
  const yTolerance = Math.max(0.02, star.bbox.height * 1.6);
  const candidates = tokens
    .filter((token) => {
      if (token === star) {
        return false;
      }
      if (includesStarMark(token.text)) {
        return false;
      }
      const centerYDiff = Math.abs(getCenterY(token) - starCenterY);
      const xDelta = token.bbox.x - star.bbox.x;
      return centerYDiff < yTolerance && xDelta >= 0 && xDelta < 1.2;
    })
    .sort((a, b) => a.bbox.x - b.bbox.x);

  const parts = [star.text];
  for (const candidate of candidates) {
    parts.push(candidate.text);
    const joined = parts.join(" ");
    if (joined.includes("※") || extractQuantity(joined)) {
      break;
    }
  }
  return parts.join(" ").trim();
}

export async function analyzePdfFile(file: File): Promise<PdfAnalysisResult> {
  const pdfjs = await import("pdfjs-dist/build/pdf");
  const workerUrl = new URL("pdfjs-dist/build/pdf.worker.min.js", import.meta.url);
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl.toString();

  const bytes = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: bytes });
  const pdf = await loadingTask.promise;

  const pages: PageAnalysis[] = [];
  const previews: PagePreview[] = [];

  for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
    const page = await pdf.getPage(pageIndex);
    const viewport = page.getViewport({ scale: 1.4 });
    const textContent = await page.getTextContent();
    const items = textContent.items as PdfTextItem[];

    const starHits: StarTextHit[] = [];
    const topRightTokens: string[] = [];
    const positionedTokens: PositionedToken[] = [];
    let managementNoBbox: PageAnalysis["managementNoBbox"];

    for (const item of items) {
      if (!item.str || !item.transform) {
        continue;
      }

      const [a, b, c, d, e, f] = item.transform;
      const x = e;
      const yFromBottom = f;
      const width = item.width ?? Math.abs(a) * item.str.length;
      const height = item.height ?? Math.max(8, Math.abs(d));
      const yFromTop = viewport.height - yFromBottom - height;

      const bbox = normalizeBBox(
        x,
        yFromTop,
        width,
        height,
        viewport.width,
        viewport.height,
      );
      const normalizedText = item.str.trim();
      if (!normalizedText) {
        continue;
      }
      positionedTokens.push({
        text: normalizedText,
        bbox,
      });

      const inTopRight = bbox.x > 0.58 && bbox.y < 0.26;
      if (inTopRight) {
        topRightTokens.push(normalizedText);
      }
    }

    for (const token of positionedTokens) {
      if (!includesStarMark(token.text)) {
        continue;
      }

      const inlineSegments = getInlineStarSegments(token.text);
      if (inlineSegments.length > 1) {
        for (const segment of inlineSegments) {
          starHits.push({
            rawText: segment,
            bbox: token.bbox,
            quantityText: extractQuantity(segment),
            hasNearbyFactoryInstallNote: hasNearbyFactoryInstallNote(token, positionedTokens),
          });
        }
        continue;
      }

      const lineTokens = findLineTokens(token, positionedTokens);
      const starIndex = lineTokens.findIndex((lineToken) => lineToken === token);
      const segmentTokens: string[] = [];
      const startIndex = starIndex >= 0 ? starIndex : 0;
      for (let index = startIndex; index < lineTokens.length; index += 1) {
        const lineToken = lineTokens[index];
        if (index > startIndex && includesStarMark(lineToken.text)) {
          break;
        }
        segmentTokens.push(lineToken.text);
        const joined = segmentTokens.join(" ");
        if (joined.includes("※") || extractQuantity(joined)) {
          break;
        }
      }

      const mergedText = segmentTokens.join(" ").trim() || token.text;
      const fallbackText = buildRightSideFallbackSegment(token, positionedTokens);
      const mergedWithFallback =
        extractQuantity(mergedText) || mergedText.includes("※") ? mergedText : fallbackText;
      const quantityText =
        extractQuantity(mergedWithFallback) ||
        segmentTokens.map((x) => extractQuantity(x)).find((x) => Boolean(x)) ||
        "";

      starHits.push({
        rawText: mergedWithFallback,
        bbox: token.bbox,
        quantityText,
        hasNearbyFactoryInstallNote: hasNearbyFactoryInstallNote(token, positionedTokens),
      });
    }

    const managementNo = extractManagementNo(topRightTokens);
    if (managementNo !== "無") {
      const managementToken = topRightTokens.find((t) => t.includes(managementNo));
      if (managementToken) {
        const refItem = items.find(
          (x) => typeof x.str === "string" && x.str.trim() === managementToken && x.transform,
        );
        if (refItem?.transform) {
          const width = refItem.width ?? 40;
          const height = refItem.height ?? 12;
          const yFromTop = viewport.height - refItem.transform[5] - height;
          managementNoBbox = normalizeBBox(
            refItem.transform[4],
            yFromTop,
            width,
            height,
            viewport.width,
            viewport.height,
          );
        }
      }
    }

    const renderViewport = page.getViewport({ scale: 0.75 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(renderViewport.width);
    canvas.height = Math.ceil(renderViewport.height);
    const context = canvas.getContext("2d");

    if (context) {
      await page.render({
        canvasContext: context,
        viewport: renderViewport,
      }).promise;
    }

    previews.push({
      pageNumber: pageIndex,
      dataUrl: canvas.toDataURL("image/png"),
      width: canvas.width,
      height: canvas.height,
    });

    pages.push({
      pageNumber: pageIndex,
      managementNo,
      managementNoBbox,
      extractedStarItems: starHits,
    });
  }

  return { pages, previews };
}
