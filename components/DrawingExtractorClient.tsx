"use client";

import { useMemo, useState } from "react";
import { formatDrawingItems } from "@/lib/formatDrawingItems";
import { analyzePdfFile } from "@/lib/pdfAnalysisEngine";
import type { FormattedDrawingItem, PageAnalysis } from "@/types/pdfAnalysis";

interface ViewState {
  pages: PageAnalysis[];
  items: FormattedDrawingItem[];
  previews: Array<{ pageNumber: number; dataUrl: string }>;
}

function getRowClassName(targetId: string, activeId: string | null): string {
  return targetId === activeId
    ? "cursor-pointer border-b bg-blue-50"
    : "cursor-pointer border-b hover:bg-slate-50";
}

export default function DrawingExtractorClient() {
  const [state, setState] = useState<ViewState>({
    pages: [],
    items: [],
    previews: [],
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);

  const hasResult = state.items.length > 0 || state.pages.length > 0;
  const filteredWithoutFactoryInstall = useMemo(
    () => state.items.filter((item) => !item.hasNearbyFactoryInstallNote),
    [state.items],
  );
  const pageToManagementNo = useMemo(
    () =>
      new Map(
        state.pages.map((x) => [x.pageNumber, `No.${x.managementNo}`]),
      ),
    [state.pages],
  );

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    if (file.type !== "application/pdf") {
      setError("PDFファイルのみ対応しています。");
      setState({ pages: [], items: [], previews: [] });
      return;
    }

    setBusy(true);
    setError(null);
    setActiveItemId(null);

    try {
      const result = await analyzePdfFile(file);
      const items = formatDrawingItems(result.pages);
      setState({
        pages: result.pages,
        items,
        previews: result.previews,
      });
    } catch (unknownError) {
      console.error(unknownError);
      setError("PDF解析でエラーが発生しました。別ファイルで再試行してください。");
      setState({ pages: [], items: [], previews: [] });
    } finally {
      setBusy(false);
    }
  }

  function jumpToPage(pageNumber: number, itemId: string) {
    setActiveItemId(itemId);
    const target = document.getElementById(`page-preview-${pageNumber}`);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  return (
    <div className="min-h-screen p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <header className="rounded-lg border bg-white p-4 shadow-sm">
          <h1 className="text-xl font-semibold text-slate-900">PDF図面情報抽出システム</h1>
          <p className="mt-1 text-sm text-slate-600">
            PDFをアップロードすると、ページ右上No.と☆文字列を抽出して整形します。
          </p>
          <div className="mt-3">
            <input
              type="file"
              accept="application/pdf"
              onChange={handleFileChange}
              className="block w-full rounded-md border border-slate-300 p-2 text-sm"
            />
          </div>
          {busy ? (
            <p className="mt-3 text-sm text-blue-700">解析中です。ページ数によって数秒かかります。</p>
          ) : null}
          {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
        </header>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-lg border bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-base font-semibold text-slate-900">PDFプレビュー / 抽出範囲</h2>
            <div className="max-h-[70vh] space-y-4 overflow-auto pr-1">
              {!hasResult ? (
                <p className="text-sm text-slate-500">まだ解析結果はありません。</p>
              ) : null}
              {state.previews.map((preview) => {
                const pageData = state.pages.find((x) => x.pageNumber === preview.pageNumber);
                if (!pageData) {
                  return null;
                }

                return (
                  <article
                    key={preview.pageNumber}
                    id={`page-preview-${preview.pageNumber}`}
                    className="rounded-md border p-2"
                  >
                    <p className="mb-2 text-sm font-medium text-slate-700">
                      ページ {preview.pageNumber} / {pageToManagementNo.get(preview.pageNumber)}
                    </p>
                    <div className="relative">
                      <img
                        src={preview.dataUrl}
                        alt={`page-${preview.pageNumber}`}
                        className="w-full rounded border"
                      />

                      {pageData.managementNoBbox ? (
                        <div
                          className="absolute border-2 border-blue-500"
                          style={{
                            left: `${pageData.managementNoBbox.x * 100}%`,
                            top: `${pageData.managementNoBbox.y * 100}%`,
                            width: `${pageData.managementNoBbox.width * 100}%`,
                            height: `${pageData.managementNoBbox.height * 100}%`,
                          }}
                          title={`No.${pageData.managementNo}`}
                        />
                      ) : null}

                      {pageData.extractedStarItems.map((hit, index) =>
                        hit.bbox ? (
                          <div
                            key={`${preview.pageNumber}-${index}`}
                            className="absolute border-2 border-red-500"
                            style={{
                              left: `${hit.bbox.x * 100}%`,
                              top: `${hit.bbox.y * 100}%`,
                              width: `${hit.bbox.width * 100}%`,
                              height: `${hit.bbox.height * 100}%`,
                            }}
                            title={hit.rawText}
                          />
                        ) : null,
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="rounded-lg border bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-base font-semibold text-slate-900">抽出・整形リスト</h2>
            <div className="max-h-[70vh] overflow-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-100 text-left">
                    <th className="border-b p-2">ページ</th>
                    <th className="border-b p-2">No.</th>
                    <th className="border-b p-2">抽出文字列</th>
                    <th className="border-b p-2">結合結果</th>
                    <th className="border-b p-2">数量</th>
                  </tr>
                </thead>
                <tbody>
                  {state.items.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-4 text-center text-slate-500">
                        抽出データはありません。
                      </td>
                    </tr>
                  ) : (
                    state.items.map((item) => (
                      <tr
                        key={item.id}
                        className={getRowClassName(item.id, activeItemId)}
                        onClick={() => jumpToPage(item.pageNumber, item.id)}
                      >
                        <td className="p-2">{item.pageNumber}</td>
                        <td className="p-2">{item.managementNo}</td>
                        <td className="p-2">{item.normalizedText}</td>
                        <td className="p-2 font-medium">{item.combinedText}</td>
                        <td className="p-2">{item.quantity || "-"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <h3 className="mb-3 mt-6 text-base font-semibold text-slate-900">
              抽出・整形リスト（※工場取付の近傍記載なし）
            </h3>
            <div className="max-h-[40vh] overflow-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-100 text-left">
                    <th className="border-b p-2">ページ</th>
                    <th className="border-b p-2">No.</th>
                    <th className="border-b p-2">抽出文字列</th>
                    <th className="border-b p-2">結合結果</th>
                    <th className="border-b p-2">数量</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredWithoutFactoryInstall.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-4 text-center text-slate-500">
                        対象データはありません。
                      </td>
                    </tr>
                  ) : (
                    filteredWithoutFactoryInstall.map((item) => (
                      <tr
                        key={`non-factory-${item.id}`}
                        className={getRowClassName(item.id, activeItemId)}
                        onClick={() => jumpToPage(item.pageNumber, item.id)}
                      >
                        <td className="p-2">{item.pageNumber}</td>
                        <td className="p-2">{item.managementNo}</td>
                        <td className="p-2">{item.normalizedText}</td>
                        <td className="p-2 font-medium">{item.combinedText}</td>
                        <td className="p-2">{item.quantity || "-"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
