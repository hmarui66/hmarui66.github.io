---
title: "PostgreSQL の jsonb におけるインデックス"
date: 2025-01-27
description: "PostgreSQLのjsonb型で使えるインデックスの種類と使い分けについて"
tags: ["postgresql", "database", "json"]
---

PostgreSQL には JSON を格納する方法として [json 型や jsonb 型](https://www.postgresql.jp/document/16/html/datatype-json.html)があり、また JSON 操作のための[様々な関数や演算子](https://www.postgresql.jp/document/16/html/functions-json.html)が用意されている。

そして jsonb 型ではインデックスがサポートされるため、効率的に検索できる。

[PostgreSLQ のドキュメント](https://www.postgresql.jp/document/16/html/datatype-json.html#JSON-INDEXING)を見ると、まず[GINインデックス](https://www.postgresql.jp/document/16/html/gin-intro.html)について説明があり、節の最後の方に[B-treeインデックス](https://www.postgresql.jp/document/16/html/btree-intro.html)と[Hashインデックス](https://www.postgresql.jp/document/16/html/hash-intro.html)もサポートすることが以下のように記載されているのだが、

> jsonb型は、btree と hash インデックスもサポートします。 これらは通常、JSONドキュメントの完全性をチェックすることが重要な場合のみ有用です。

「JSONドキュメントの完全性をチェックする」というのはどういう意味なのか分からなかったので、jsonb に関わる基本的なところから少し調べてみた。

## そもそも json 型、jsonb 型とは

json 型と jsonb 型はどちらも JSON を扱うための型であるが、前者は入力値の JSON テキストをそのまま保持するため key value の途中にある空白(例: `{"foo": "foo value", (任意の数の空白) "bar": "bar value"}`)や重複した key などもそのまま残るのに対して、後者はバイナリ形式に変換する過程で key の重複は排除され記載順序の情報も残らない形で保持される。

またデータ格納後に処理をする際、 json 型は解析を挟む必要がありインデックスがサポートされないのに対して、jsonb 型は解析済のために高速に処理できる上にインデックスもサポートされる。

## インデックスを効かせたい jsonb 演算子

インデックスを効かせたいであろう演算子をざっと挙げる。
演算子の網羅的な一覧は[こちら](https://www.postgresql.jp/document/16/html/functions-json.html#FUNCTIONS-JSONB-OP-TABLE)。

### `@>`

「包含演算子」と呼ばれるもの。

`jsonb @> jsonb` と書くと、左側の JSON に右側の JSON が含まれる場合は true が返される。

```sql
SELECT '{"foo": "foo value", "bar": "bar value"}'::jsonb @> '{"bar": "bar value"}'::jsonb;
-- true

SELECT '{"foo": {"bar": "baz"}}'::jsonb @> '{"bar": "baz"}'::jsonb;
-- false (ネストしており階層が一致しないため)
```

`jsonb <@ jsonb` と書くと包含関係は逆に評価される。

### `?`

「存在演算子」と呼ばれるもの。

`jsonb ? text` と書くと、text値が左側の JSON のオブジェクトの key または配列のトップレベルに存在する場合は true が返される。

```sql
SELECT '{"foo": "bar"}'::jsonb ? 'foo';
-- true

SELECT '{"foo": {"bar": "baz"}}'::jsonb ? 'bar';
-- false (ネストしており階層が一致しないため)
```

### `@?`

`jsonb @? jsonpath` と書くと、JSON パスによって JSON から要素を抽出できる場合に true が返される。

```sql
select '{"a":[1,2,3,4,5]}'::jsonb @? '$.a[*]';
-- true

select '{"a":[1,2,3,4,5]}'::jsonb @? '$.a[*] ? (@ > 2)';
-- true (抽出した結果をさらに `> 2` の条件でフィルタリングして要素が残っている)

select '{"a":[1,2,3,4,5]}'::jsonb @? '$.a[*] ? (@ > 5)';
-- false (抽出した結果をさらに `> 5` の条件でフィルタリングして要素が残らない)
```

### `@@`

`jsonb @@ jsonpath` と書くと、JSON パス述語チェックの結果を返す。

`@?` を使いつつフィルタ式 `?` を使うのと似ている。

```sql
select '{"a":[1,2,3,4,5]}'::jsonb @@ '$.a[*] > 2';
-- true

select '{"a":[1,2,3,4,5]}'::jsonb @@ '$.a[*] > 5';
-- false
```

## jsonb 型に対する GIN インデックスとは

まずは jsonb 型に対して良く使われるGINインデックスについて。

GINインデックスには「GIN演算子クラス」という特定のデータ型に対するインデックスの挙動を定義する仕組みがある。

組み込みで用意されているGIN演算子クラスは[ドキュメントに記載されている通り](https://www.postgresql.jp/document/16/html/gin-builtin-opclasses.html)。

![](/images/posts/postgresql-jsonb-index/999a3a570258-20250127.png)

上記の表を見ると、jsonb 型に対しては jsonb_ops と jsonb_path_ops という2種類のGIN演算子クラスがあり、後者はインデックス可能な演算子のサポートが少ないことが分かる。そして、インデックス作成時にはデフォルトで jsonb_ops が選択される。

以降、PostgreSQL のドキュメントにあった例を元にGINインデックスの動作を見てみる。

```sql
CREATE TABLE api (
    id SERIAL PRIMARY KEY,
    jdoc JSONB
);
INSERT INTO api (jdoc) VALUES ('{
    "guid": "9c36adc1-7fb5-4d5b-83b4-90356a46061a",
    "name": "Angela Barton",
    "is_active": true,
    "company": "Magnafone",
    "address": "178 Howard Place, Gulf, Washington, 702",
    "registered": "2009-11-07T08:53:22 +08:00",
    "latitude": 19.793713,
    "longitude": 86.513373,
    "tags": [
        "enim",
        "aliquip",
        "qui"
    ]
}');

SET enable_seqscan = OFF; -- レコードは 1 件なので seqscan を避けるようにしておく
```

### jsonb_ops

jsonb 型に対してGINインデックスを作成するとデフォルトで jsonb_ops 演算子クラスが選択されるので、以下のように書けばよい。

```sql
CREATE INDEX idxgin ON api USING GIN (jdoc);
```

#### 包含演算子

```sql
EXPLAIN SELECT * FROM api
WHERE jdoc @> '{"tags": ["enim"]}';
```

```
Bitmap Heap Scan on api  (cost=12.00..16.01 rows=1 width=36)
  Recheck Cond: (jdoc @> '{""tags"": [""enim""]}'::jsonb)
  ->  Bitmap Index Scan on idxgin  (cost=0.00..12.00 rows=1 width=0)
        Index Cond: (jdoc @> '{""tags"": [""enim""]}'::jsonb)
```

→ インデックスが使われる

#### 存在演算子

```sql
EXPLAIN SELECT * FROM api
WHERE jdoc ? 'tags';
```

```
Bitmap Heap Scan on api  (cost=8.00..12.01 rows=1 width=36)
  Recheck Cond: (jdoc ? 'tags'::text)
  ->  Bitmap Index Scan on idxgin  (cost=0.00..8.00 rows=1 width=0)
        Index Cond: (jdoc ? 'tags'::text)
```

→ インデックスが使われる

### jsonb_path_ops

jsonb_path_ops 演算子クラスを明示的に指定してインデックスを作成。

```sql
CREATE INDEX idxgin ON api USING GIN (jdoc jsonb_path_ops);
```

#### 包含演算子

```sql
EXPLAIN SELECT * FROM api
WHERE jdoc @> '{"tags": ["enim"]}';
```

```
Bitmap Heap Scan on api  (cost=12.00..16.01 rows=1 width=36)
  Recheck Cond: (jdoc @> '{""tags"": [""enim""]}'::jsonb)
  ->  Bitmap Index Scan on idxgin  (cost=0.00..12.00 rows=1 width=0)
        Index Cond: (jdoc @> '{""tags"": [""enim""]}'::jsonb)
```

→ インデックスが使われる

#### 存在演算子

```sql
EXPLAIN SELECT * FROM api
WHERE jdoc ? 'tags';
```

```
Seq Scan on api  (cost=10000000000.00..10000000001.01 rows=1 width=36)
  Filter: (jdoc ? 'tags'::text)
JIT:
  Functions: 2
  Options: Inlining true, Optimization true, Expressions true, Deforming true
```

→ インデックスは使われない(上記のGIN演算子クラスの説明通り)

### jsonb_ops に対する jsonb_path_ops の利点

上記の結果を見るとサポートする演算子の多い jsonb_ops でGINインデックスを作っておけば良いように思えるものの、そう単純ではない。

ドキュメントには、

> jsonb_path_ops演算子クラスは、@>、@?、@@演算子をサポートしているだけですが、デフォルト演算子クラスのjsonb_opsよりも顕著なパフォーマンス上の利点があります。 jsonb_path_opsインデックスは、通常同じデータのjsonb_opsインデックスよりもはるかに小さく、データの中で頻繁に現れるキーを含む場合のような特別な検索には、より良くなります。 そのため、デフォルトの演算子クラスよりも検索性能が良くなります。

とあり、上記に続いて、インデックスサイズが小さくなる理由も書いてある。

> jsonb_opsとjsonb_path_opsのGINインデックスの技術的差異は、前者はデータのキーと値のための独立したインデックスを作成しますが、後者は、データの値に対してのみインデックスを作成します。

> 基本的に、jsonb_path_opsインデックス項目は、値とキーのハッシュです。例えば、{"foo": {"bar": "baz"}}のインデックスはハッシュ値にfoo、bar、 bazすべてを組み込んで作成されます。 したがって、包含問い合わせのためのインデックス検索は、非常に特定の構造を返すようになっています。 しかしfooがキーとして表示されるかどうかを調べるには全く方法はありません。

jsonb_path_ops が `?` をサポートできない理由がこれで、上記の例だと "foo" の存在チェックに利用できる情報をインデックス上に管理していないから、ということになる。

> 一方、jsonb_opsインデックスは個別にはfoo、bar、bazを表す3つのインデックス項目を作成します。 その後、包含問い合わせをおこなうには、これらの項目の3つすべてを含む行を探します。 GINインデックスは、かなり効率的に検索することができますが、特に3つの索引項目のいずれかで、非常に多数の行が単一の場合に、同等のjsonb_path_ops検索よりも遅くなります。

jsonb_ops はネストした JSON の各階層の key 毎の情報をインデックス上に保持しているので、柔軟に検索をサポートできるものの、管理するデータが膨れて検索時に参照するコストがかさむ。

ちなみに、インデックスサイズを抑えるために[式インデックス](https://www.postgresql.jp/document/16/html/indexes-expressional.html)を活用するのも有効で、例えば以下のようにインデックスを作成すると jsonb 型のカラム全体ではなくパスを絞ってインデックスを作成することができる。

```sql
CREATE INDEX idxgintags ON api USING GIN ((jdoc -> 'tags'));
```

この場合は WHERE 句もインデックス定義に合わせて `jdoc -> 'tags'` で書く必要がある。

```sql
EXPLAIN SELECT * FROM api
WHERE jdoc -> 'tags' ? 'qui';
```

```
Bitmap Heap Scan on api  (cost=8.00..12.02 rows=1 width=64)
  Recheck Cond: ((jdoc -> 'tags'::text) ? 'qui'::text)
  ->  Bitmap Index Scan on idxgintags  (cost=0.00..8.00 rows=1 width=0)
        Index Cond: ((jdoc -> 'tags'::text) ? 'qui'::text)
```

## jsonb 型に対するB-treeインデックス

では jsonb 型のカラムに対してB-treeインデックスを貼るとどうなるのか。

```sql
CREATE INDEX idxbtree ON api (jdoc);
```

```sql
EXPLAIN SELECT * FROM api
WHERE jdoc @> '{"tags": ["enim"]}';
```

```
Seq Scan on api  (cost=10000000000.00..10000000001.01 rows=1 width=36)
"  Filter: (jdoc @> '{""tags"": [""enim""]}'::jsonb)"
JIT:
  Functions: 2
  Options: Inlining true, Optimization true, Expressions true, Deforming true
```

→ インデックスは使われない

```sql
EXPLAIN SELECT * FROM api
WHERE jdoc ? 'tags';
```

```
Seq Scan on api  (cost=10000000000.00..10000000001.01 rows=1 width=36)
  Filter: (jdoc ? 'tags'::text)
JIT:
  Functions: 2
  Options: Inlining true, Optimization true, Expressions true, Deforming true
```

→ インデックスは使われない

包含演算子、存在演算子ともにインデックスは使われない。

では、インデックスを使うにはどういう SQL を書けばよいかと言うと、例えば以下のようなものとなる。

```sql
EXPLAIN SELECT * FROM api
WHERE jdoc = '{
    "guid": "9c36adc1-7fb5-4d5b-83b4-90356a46061a",
    "name": "Angela Barton",
    "is_active": true,
    "company": "Magnafone",
    "address": "178 Howard Place, Gulf, Washington, 702",
    "registered": "2009-11-07T08:53:22 +08:00",
    "latitude": 19.793713,
    "longitude": 86.513373,
    "tags": [
        "enim",
        "aliquip",
        "qui"
    ]
}';
```

```
Index Scan using idxbtree on api  (cost=0.12..8.14 rows=1 width=36)
  Index Cond: (jdoc = '{"guid": "9c36adc1-7fb5-4d5b-83b4-90356a46061a", "name": "Angela Barton", "tags": ["enim", "aliquip", "qui"], "address": "178 Howard Place, Gulf, Washington, 702", "company": "Magnafone", "latitude": 19.793713, "is_active": true, "longitude": 86.513373, "registered": "2009-11-07T08:53:22 +08:00"}'::jsonb)
```

また式インデックスを使うと、ネストした箇所に対してインデックスを作成して、利用することもできる。

```sql
CREATE INDEX idxbtreetags ON api ((jdoc -> 'tags'));
```

```sql
EXPLAIN SELECT * FROM api
WHERE jdoc -> 'tags' = '[
    "enim",
    "aliquip",
    "qui"
]';
```

```
Index Scan using idxbtreetags on api  (cost=0.12..8.14 rows=1 width=36)
  Index Cond: ((jdoc -> 'tags'::text) = '["enim", "aliquip", "qui"]'::jsonb)
```

## まとめ: 「JSONドキュメントの完全性をチェックする」の意味

つまり、jsonb 型に対してB-treeインデックスを作成すると、カラム全体のバイナリ全体(式インデックスの場合はその評価結果の値)に対するシンプルなインデックスが作成されることになる。

そのため jsonb 型に対する検索で使いたくなる包含演算子や存在演算子にはインデックスは効かせられず、単に JSON の文字列(内部的にはバイナリ表現)の一致による検索しかサポートできない。

ドキュメントでは、このことを指して「JSONドキュメントの完全性をチェックする」と表現していると思われる。

(もし違ってたらコメントで教えて下さい)

JSON のような複雑な構造を持つ情報の検索をサポートするには GIN が適しているわけだが、GIN は Generalized Inverted Index であり、転置インデックスはデータによってはサイズが膨れ上がり、更新時・検索時ともにパフォーマンス問題を引き起こす可能性がある。

オンデマンドな分析用途ではなく OLTP 向けに使う場合は、狙いすました式インデックスのみ作成するなど運用上の工夫が重要そうだと感じた。

## 補足: GINインデックスについての参考資料

本当はGINインデックスについてもまとめたかったが、力尽きた。
参考資料だけ載せておく。

- [PostgreSQL ドキュメントの GINインデックスの章](https://www.postgresql.jp/document/16/html/gin-intro.html)
    - GIN: Generalized Inverted Index の Generalized とついている理由なども分かる
- [PostgreSQL ドキュメントの GINインデックスの実装](https://www.postgresql.jp/document/16/html/gin-implementation.html)
    - 上記のドキュメントの一節だが、内部構造の概要が説明されているため抜き出して紹介
- [PostgreSQL の GitHub リポジトリの GIN の README](https://github.com/postgres/postgres/blob/master/src/backend/access/gin/README)
    - 内部構造をもう少し詳しく説明してくれている
    - あと "Gin stands for Generalized Inverted Index and should be considered as a genie, not a drink." というちょっとした(?)ネタも披露されている

## 追記: jsonb データ型についての参考資料

PGCon2014の「JSONB データ型を使ってみよう」という資料、非常に分かりやすかったので紹介。

https://www.postgresql.jp/sites/default/files/2016-12/B5_PGCon2014-JSONB-datatype-20141205.pdf

(記事書く前に見つけていたら、この記事は書かなかったかも...)
