# PDF-Reader-For-TAIYO

TAIYO工業向けのPDF図面情報抽出システムのベース実装です。

## 追加済み内容

- 要件定義書: `docs/requirements-ja.md`
- 設計書: `docs/design-ja.md`
- 型定義: `types/pdfAnalysis.ts`
- 整形ロジック: `lib/formatDrawingItems.ts`
- PDF解析エンジン: `lib/pdfAnalysisEngine.ts`
- UI実装: `app/page.tsx`, `components/DrawingExtractorClient.tsx`

## ローカル起動

```bash
npm install
npm run dev
```

ブラウザで `http://localhost:3000` を開き、PDFをアップロードしてください。

不整合が出る場合は以下でキャッシュを再生成します。

```bash
npm run dev:reset
```

## 現在の主要ルール

- `No.` 未検出時は `無`
- `☆` / `⭐` を含む項目のみ抽出し、`TH` など星なし項目は対象外
- `抽出文字列` は `☆` 以降を対象とし、`※` 以降は除外
- 複数項目（例: `☆PH1`, `☆PH2`, `☆PH3`）は項目ごとに分割
- `数量` は数値のみ表示（`1コ` -> `1`）
- `結合結果` は `No－抽出文字列(数量前まで)` で、`（本）` と `L=` を除去
- リストは「全件」と「※工場取付近傍なし」の2種類を表示
