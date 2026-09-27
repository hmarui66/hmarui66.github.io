import { getCollection } from 'astro:content';

// 本番ビルドでは draft: true の記事を除外する（dev サーバーではプレビュー用に表示する）
export async function getPublishedPosts() {
  return getCollection('posts', ({ data }) => import.meta.env.DEV || !data.draft);
}
