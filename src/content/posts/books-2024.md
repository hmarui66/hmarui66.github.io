---
title: "2024年に読んだ本"
date: 2024-12-29
description: "2024年に読んだ技術書・論文の振り返り"
tags: ["reading"]
---

去年に引き続き今年もざっと振り返ってみる。

去年の記事: [2023年に読んだ本](/posts/books-2023)

## 基礎からの新しいストレージ入門

https://www.socym.co.jp/book/post-17463

ストレージの全体感掴める。わりと専門用語がポンポン出てくるので、真の入門者である自分にとっては結構難しかった。

## 次世代高速オープンソースRDB Tsurugi

https://info.nikkeibp.co.jp/media/LIN/atcl/books/091300039/

輪読会も企画されていて、自分も ROM で半分くらい参加した。第三部の MVCC の解説章が特に勉強になった。

## 単体テストの考え方/使い方

https://book.mynavi.jp/ec/products/detail/id=134252

会社のチームメンバー+αの読書会で読んだ。プロジェクトのコードで実践できてる/できてないを話せて良かった。

自分が携わっているような Web 系業務アプリ開発においては、この本と『関数型ドメインモデリング』をベースにチームでの開発方針の認識合わせすれば良い気がしている。(関数型〜の方はまだ読み途中)

https://asciidwango.jp/post/754242099814268928/%E9%96%A2%E6%95%B0%E5%9E%8B%E3%83%89%E3%83%A1%E3%82%A4%E3%83%B3%E3%83%A2%E3%83%87%E3%83%AA%E3%83%B3%E3%82%B0

## データモデリングでドメインを駆動する

https://gihyo.jp/book/2024/978-4-297-14010-6

この本も良かった。会計系のシステム開発してたことがあり、当時あれこれ悩んだことがこう整理できるのかー、と思うなどした。

## 脳に収まるコードの書き方

https://www.oreilly.co.jp/books/9784814400799/

単体テスト本と同じくサンプルコードが C# だったり、一部領域も被っていて並べて読むと面白かった。

## ドメイン駆動設計をはじめよう

https://www.oreilly.co.jp/books/9784814400737/

訳語について、自分は読みづらかった。(既に他の本を読んでいたからというのはあると思う)

「ドメイン駆動設計」というワードが気になっている人にとって、全体感を掴める内容にはなっているようには感じた。

## プロダクションレディマイクロサービス

https://www.oreilly.co.jp/books/9784873118154/

翻訳は読みづらかった。原著を Google 翻訳した方が読みやすい箇所も...。特に本文では「プロダクションレディ」に「本番対応」という用語を当てており、これが最初分かりづらさを上げていた。

クラウドではない環境を想定した記述もそこそこあり、自分が携わる領域とは少しズレを感じつつも、ただ学びも多かった。(筆者は書いた当時? User の SRE の人なので、そもそも扱っているシステムの規模が違う)

## Go言語で作って理解する Raftベース Redis互換KVS

https://techbookfest.org/product/nvCYxrw1szsgJThN9HQTyd

分散システム、Redis、一貫性モデル、Raftの基礎の解説の後、Redis 互換 KVS を実装。

Redis Serialization Protocol(RESP) の実装や Raft などは公開されているライブラリを活用。特に Raft は1から実装するとなるとそれだけでかなりの分量になりそうなので、まずは全体感掴むための割り切りとして、良いと思った。

## ヒルビリー・エレジー

https://www.kobunsha.com/shelf/book/isbn/9784334039790

アメリカの大統領選を受けて読んでみた。バンスの今後が気になる。

## ストーリーとしての競争戦略

https://str.toyokeizai.net/books/9784492532706/

社内で定期的に競争戦略のストーリーが共有されるので読んだ。

## DB 関連論文

昨年から継続して「データベース論文朝輪」というものに参加していて、DB 関連論文をそこそこ読んだ。

読書会は discord で実施されていて、以下の connpass に論文リストや招待リンクが載っている。

https://database-paper-reading-2.connpass.com/

「継続して」と書いたものの、取り上げられた論文リストを見返すと、実は結構不参加の回も多かった。

https://docs.google.com/spreadsheets/d/1gvE_6qIJWB3NaTUuK0oOPKTVd7cyfFEbYmLSBEEgmzk/edit

開始時間がちょうど子どもの登園タイミングで、子どもの機嫌(と自分の気合い)の兼ね合いで参加が不安定になりがち。

朝輪に継続的に参加しているおかげで、論文を参照することに抵抗が無くなってきていて、プライベートでも論文を眺める機会が増えた。DB 関連技術に関する情報を仕入れたら、まずググったり ChatGPT に聞いて、論文あるかを探すようになっている。

ただ、その場合でも大体がさらっと見るだけで終わることが多い。

それなりにちゃんと読んだものは以下。

### FASTER: A Concurrent Key-Value Store with In-Place Updates.

https://www.microsoft.com/en-us/research/uploads/prod/2018/03/faster-sigmod18.pdf

RESP wire protocol を実装している remote cache-store の [Garnet](https://github.com/microsoft/garnet) の先行研究の1つ。

[スクラップに書いた論文メモ](https://zenn.dev/link/comments/b964bc443f4657)

### The adaptive radix tree: ARTful indexing for main-memory databases

https://db.in.tum.de/~leis/papers/ART.pdf

その名の通り、基数木のノードのサイズを adaptive に選択することで読み取り効率とスペース効率どちらも高められる in-memory データ構造。

PostgreSQL 17 では、Vacuum 時に対象の TID を保持するデータ構造にも採用されている。

参考: [sawada さんの PGConf.dev 2024 の発表資料](https://speakerdeck.com/masahiko/postgresql-meets-art-using-adaptive-radix-tree-to-speed-up-vacuuming)

### MultiPaxos Made Complete

https://arxiv.org/abs/2405.11183

MultiPaxos の包括的な実装ガイドライン。

[スクラップに書いた論文メモ](https://zenn.dev/link/comments/6b79e3de4f4d17)

### Efficient Processing of Window Functions in Analytical SQL Queries

https://www.vldb.org/pvldb/vol8/p1058-leis.pdf

Window Function の解説と、ハイパフォーマンスな in-memory DB における最適化を扱っている。

序盤の解説の部分は[こちらの記事](https://zenn.dev/hmarui66/articles/44d474a55b06d1)で触れている。

## 書き出してみての感想

読了したと思ってた本で実は読み切れてなかったものが結構あって、リストアップしてみると意外と少なかった。

もちろん、手つかずの完全積読のものも多数。
