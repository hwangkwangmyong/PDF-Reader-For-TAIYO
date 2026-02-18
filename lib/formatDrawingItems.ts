import type { FormattedDrawingItem, PageAnalysis } from "../types/pdfAnalysis";

const STAR_MARK = "☆";
const ALT_STAR_MARK = "⭐";
const FULL_WIDTH_HYPHEN = "－";
const QUANTITY_REGEX = /(\d+\s*(?:枚|こ|コ|個|本|組|台|式|箇所|ヶ所))/;

function normalizeQuantitySource(rawText: string): string {
  return rawText
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replaceAll("ｺ", "コ");
}

function trimEntryToTargetRange(rawText: string): string {
  const normalized = normalizeQuantitySource(rawText);
  const quantityMatch = QUANTITY_REGEX.exec(normalized);
  const noteIndex = normalized.indexOf("※");

  let endIndex = normalized.length;
  if (quantityMatch && quantityMatch.index >= 0) {
    endIndex = quantityMatch.index + quantityMatch[0].length;
  }
  if (noteIndex >= 0) {
    endIndex = Math.min(endIndex, noteIndex);
  }
  return normalized.slice(0, endIndex).trim();
}

function splitStarEntries(rawText: string): string[] {
  const starSegments = rawText.match(/[☆⭐][^☆⭐]*/g) ?? [];
  if (starSegments.length === 0) {
    return [trimEntryToTargetRange(rawText)];
  }
  return starSegments
    .map((segment) => trimEntryToTargetRange(segment))
    .filter((segment) => segment.length > 0);
}

/**
 * Removes star marks and collapses extra spaces.
 */
export function normalizeStarText(rawText: string): string {
  const starIndex = rawText.search(/[☆⭐]/);
  const textAfterStar = starIndex >= 0 ? rawText.slice(starIndex + 1) : rawText;
  const withoutStar = textAfterStar.replaceAll(STAR_MARK, "").replaceAll(ALT_STAR_MARK, "");
  const rangeTrimmed = trimEntryToTargetRange(withoutStar);
  return rangeTrimmed.replace(/\s+/g, " ").trim();
}

export function extractQuantity(rawText: string): string {
  const matched = normalizeQuantitySource(rawText).match(QUANTITY_REGEX);
  if (!matched?.[1]) {
    return "";
  }
  const numberPart = matched[1].match(/\d+/);
  return numberPart?.[0] ?? "";
}

function removeQuantityAndAfter(rawText: string): string {
  const normalized = normalizeQuantitySource(rawText);
  const matched = QUANTITY_REGEX.exec(normalized);
  const beforeQuantity =
    !matched || matched.index < 0 ? normalized : normalized.slice(0, matched.index);
  return beforeQuantity
    .replace(/L\s*[=＝]\s*[0-9０-９]+(?:\.[0-9０-９]+)?/gi, "")
    .replace(/[（(]\s*本\s*[)）]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Joins management number and normalized text with full-width hyphen.
 */
export function combineManagementNoAndText(
  managementNo: string,
  normalizedText: string,
): string {
  return `${managementNo}${FULL_WIDTH_HYPHEN}${normalizedText}`;
}

/**
 * Converts page-level analysis data to list output rows.
 */
export function formatDrawingItems(pages: PageAnalysis[]): FormattedDrawingItem[] {
  return pages.flatMap((page) =>
    page.extractedStarItems
      .flatMap((hit, index) => {
        const splitEntries = splitStarEntries(hit.rawText);
        return splitEntries
          .map((entry, splitIndex): FormattedDrawingItem | null => {
            const normalizedText = normalizeStarText(entry);
            if (!normalizedText) {
              return null;
            }

            return {
              id: `${page.pageNumber}-${index + 1}-${splitIndex + 1}`,
              pageNumber: page.pageNumber,
              managementNo: page.managementNo,
              originalText: entry,
              normalizedText,
              quantity: extractQuantity(normalizedText) || extractQuantity(hit.quantityText || ""),
              hasNearbyFactoryInstallNote: hit.hasNearbyFactoryInstallNote,
              combinedText: combineManagementNoAndText(
                page.managementNo,
                removeQuantityAndAfter(normalizedText),
              ),
            };
          })
          .filter((item): item is FormattedDrawingItem => item !== null);
      }),
  );
}
