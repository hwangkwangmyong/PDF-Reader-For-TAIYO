# PDF-Reader-For-TAIYO

TAIYO工業向けのPDF図面情報抽出システムのベース実装です。

## 追加済み内容

- 要件定義書: `docs/requirements-ja.md`
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

## 整形ルール

- `☆` を除去する
- `No.` と整形後文字列を `－`（全角ハイフン）で連結する
- 出力例: `002－SP3 （本） 1枚 ※J1なし`
