---
title: "2023年に読んだ本"
date: 2023-12-30
description: "2023年に読んだ技術書・論文の振り返り"
tags: ["books", "reading"]
---

読んだ本をざっと振り返ってみる。きっちり読んだものもあれば、流し読み程度のものもある。

## コミュニティデザインの時代　自分たちで「まち」をつくる

https://www.amazon.co.jp/dp/B07XRH4S66

以下のブログ記事で紹介されており、年始なので普段読まない種類の本にチャレンジ。

https://yamotty.tokyo/post/20221231

## ［改訂3版］内部構造から学ぶPostgreSQL

https://gihyo.jp/book/2022/978-4-297-13206-4

PostgreSQL 使うにあたり、ざっとでも目を通しておいた方が良い内容詰まっていた。

## Readings in Database Systems, 5th Edition

http://www.redbook.io/index.html

自作 (R)DBMSの世界で定番？なコンテンツとして通称redbook（赤本）と呼ばれる 『Readings in Database Systems』

https://ryogrid.github.io/dbms-jisaku/

というのを見かけて読んでみた(Web上ですべて読める)。
最新の話ではないものの、DB周りの歴史など含めて知識の幅が広がった。

## 並行プログラミング入門

https://www.oreilly.co.jp//books/9784873119595/

趣味の DB 自作で並行性制御周りが良く分からなかったので読んでみた。
並行プログラミングに関わる知識が幅広く解説されている。

## ［試して理解］Linuxのしくみ

https://gihyo.jp/book/2022/978-4-297-13148-7

数年続けている輪読会の課題図書として読んだ。
Linuxの主要な仕組みの全体感が掴めた。

## データ指向アプリケーションデザイン

https://www.oreilly.co.jp/books/9784873118703/

今年読んだ本の中で一番良かった。

https://x.com/hmarui66/status/1697819479529623885

内容古いところもある、という指摘を見かけて次の版まで待とうかと思ったりしてたが、読んで損は無かった。以前、詳説データベースを読んでいたので内容が頭に入りやすかった、というのもあるかも。

## リーダーの作法

https://www.oreilly.co.jp/books/9784873119892/

EM に進められて読んだが良かった。

## ソフトウェアアーキテクチャ・ハードパーツ

https://www.oreilly.co.jp/books/9784814400065/

悪くない内容だとは思うものの、『モノリスからマイクロサービスへ』『ソフトウェアアーキテクチャの基礎』を読んでいたこともあり、学びは少なかった印象。

## 達人が教えるWebパフォーマンスチューニング

https://gihyo.jp/book/2022/978-4-297-12846-3

ISUCON 初参加につき読んだ。高速道路整備されていてありがたかった。
(が、本番では...)

## エッセンシャル思考 最少の時間で成果を最大にする

https://kanki-pub.co.jp/pub/book/9784761270438/

同僚に勧められて読んだが、良かった。

## ゼロから学ぶRust

https://www.kspub.co.jp/book/detail/5301951.html

こちらも、数年続けている輪読会の課題図書として読んだ。
Rust と CS 要素を学べた。

## ポートスキャナ自作ではじめるペネトレーションテスト

https://www.oreilly.co.jp/books/9784814400423/

こちらも、数年続けている輪読会の課題図書として読んだ。
ペンテスターという用語を初めて知るレベルだったので、勉強になった。

## Datadog Cloud Monitoring Quick Start Guide

https://learning.oreilly.com/library/view/datadog-cloud-monitoring/9781800568730/

会社で使っている監視基盤なので読んだ。Datadog の機能の説明が主で、もともと期待していた実践的な話は少なかった。(タイトル通りなので、期待がズレていたやつ)

## DB 関連論文

ここ一年近く「データベース論文朝輪」というものに参加していて、DB 関連論文をそこそこ読んだ。

<iframe class="speakerdeck-iframe" frameborder="0" src="https://speakerdeck.com/player/6759e3b7ea0749579b9df08d6e0cce9b" title="データベース論文朝輪のススメ" allowfullscreen="true" style="border: 0px; background: padding-box padding-box rgba(0, 0, 0, 0.1); margin: 0px; padding: 0px; border-radius: 6px; box-shadow: rgba(0, 0, 0, 0.2) 0px 5px 40px; width: 100%; height: auto; aspect-ratio: 560 / 315;" data-ratio="1.7777777777777777"></iframe>

読んだと言っても朝輪の限られた時間で目を通してその後の議論を聞く、というくらいのライトな読み。

ただ、継続的に参加しているおかげか、朝輪以外でも気軽に論文にチャレンジできるようになった。
個人的にそれなりにちゃんと読んだものとしては以下。

* [Amazon Aurora: Design considerations for high throughput cloud-native relational databases](https://www.amazon.science/publications/amazon-aurora-design-considerations-for-high-throughput-cloud-native-relational-databases)
* [Amazon Aurora: On avoiding distributed consensus for I/Os, commits, and membership changes](https://www.amazon.science/publications/amazon-aurora-on-avoiding-distributed-consensus-for-i-os-commits-and-membership-changes)
* [Efficient Locking for Concurrent Operations on B-Trees](https://dl.acm.org/doi/10.1145/319628.319663)
* [A symmetric concurrent B-tree algorithm](https://dl.acm.org/doi/10.5555/324493.324589)
* [Concurrency control and recovery for balanced Blink trees](https://www.researchgate.net/publication/243134528_Concurrency_control_and_recovery_for_balanced_Blink_trees)
* [Zanzibar: Google's Consistent, Global Authorization System](https://research.google/pubs/zanzibar-googles-consistent-global-authorization-system/)
* [The Evolution of LeanStore](https://dl.gi.de/server/api/core/bitstreams/edd344ab-d765-4454-9dbe-fcfa25c8059c/content)
