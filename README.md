# Personal Blog

個人ブログです。技術的なトピックや日々の学びについて書いています。

## 技術スタック

- **Astro 5**: 静的サイトジェネレーター
- **TypeScript**: 型安全な開発
- **MDX**: Markdownコンテンツ
- **GitHub Pages**: ホスティング
- **GitHub Actions**: CI/CD

## ローカル開発

### 必要な環境

- Node.js 20以上
- npm

### セットアップ

```bash
# 依存関係をインストール
npm install

# 開発サーバーを起動
npm run dev
```

ブラウザで http://localhost:4321 を開いてください。

### ビルド

```bash
# プロダクションビルド
npm run build

# ビルド結果をプレビュー
npm run preview
```

## デプロイ

mainブランチにプッシュすると、GitHub Actionsが自動的にビルドしてGitHub Pagesにデプロイします。

## ライセンス

MIT License - 詳細は [LICENSE](LICENSE) を参照してください。
