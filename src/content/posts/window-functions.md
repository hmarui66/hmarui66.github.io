---
title: "初見殺しな Window 関数を読み解く"
date: 2024-12-17
description: "SQL Window関数の3つの重要概念（partitioning, ordering, framing）を解説"
tags: ["sql", "database"]
---

"SQL緊急救命室" のロバート部長によると Window 関数は、

> 「そうだ。これが SQL 最強の武器ウィンドウ関数だ。よく覚えておけ。SQL:2003 からフルレベルで標準に入ったから、今ではどの DBMS でも使える優れモノだ。」

https://gihyo.jp/book/2024/978-4-297-14405-0

とのことで、使えるようになっておいて損はない存在。
SQL の記述が簡単になるだけでなく、パフォーマンスも向上するのがポイント。

ただ、"SQL緊急救命室" で初めて Window 関数に触れた自分にとって、初見ではどんな動きとなるのか掴みづらかった。

"SQL緊急救命室" では以下の論文が参照されており、論文内の "2. WINDOW FUNCTIONS IN SQL" を眺めたら理解が捗ったので、紹介する。

Viktor Leis, Alfons Kemper, Kan Kundhikanjana, Thomas Neumann,
"Efficient Processing of Window Functions in Analytical SQL Queries"

https://www.vldb.org/pvldb/vol8/p1058-leis.pdf

## 初見殺しの SQL の例

論文の内容に触れる前に、初見ではどういう動作になるか想像できなかった SQL の例を挙げる。

以下は [PostgreSQL のドキュメントに書かれている SQL](https://www.postgresql.jp/document/16/html/tutorial-window.html)を少し改変したものだが、

```sql
SELECT
  empno,
  depname,
  salary,
  sum(salary) OVER (PARTITION BY depname ORDER BY salary)
FROM empsalary;
```

これを見て、結果が以下のようになることが予想できるだろうか？

| empno | depname | salary | sum |
|-------|---------|--------|-----|
| 7 | develop | 4200 | 4200 |
| 9 | develop | 4500 | 8700 |
| 10 | develop | 5200 | 19100 |
| 11 | develop | 5200 | 19100 |
| 8 | develop | 6000 | 25100 |
| 5 | personnel | 3500 | 3500 |
| 2 | personnel | 3900 | 7400 |
| 4 | sales | 4800 | 9600 |
| 3 | sales | 4800 | 9600 |
| 1 | sales | 5000 | 14600 |

自分が初見の状態だったとしたら、

- `sum` の結果がなぜか累積和となっている?
  - 例えば、empno=9 の結果は1, 2行の `salary` の合算値
- empno=10, 11 など同値の salary が連続している箇所はなぜか `sum` の結果が同じ値になっている?
- `depname` が変わると累積和がリセットされてる?
  - empno=5 は `salary` と `sum` が同値
  - `PARTITION BY depname` が効いていそう?
- `ORDER BY salary` の指定は必要?

といった疑問が湧いてくると思う。

### 手元で試したい人向けのセットアップ用スクリプト

```sql
CREATE TABLE empsalary (
    depname VARCHAR NOT NULL,
    empno INTEGER NOT NULL,
    salary INTEGER NOT NULL,
    PRIMARY KEY (depname, empno)
);
INSERT INTO empsalary VALUES('develop', 8, 6000);
INSERT INTO empsalary VALUES('develop', 10, 5200);
INSERT INTO empsalary VALUES('develop', 11, 5200);
INSERT INTO empsalary VALUES('develop', 9, 4500);
INSERT INTO empsalary VALUES('develop', 7, 4200);
INSERT INTO empsalary VALUES('personnel', 2, 3900);
INSERT INTO empsalary VALUES('personnel', 5, 3500);
INSERT INTO empsalary VALUES('sales', 1, 5000);
INSERT INTO empsalary VALUES('sales', 4, 4800);
INSERT INTO empsalary VALUES('sales', 3, 4800);
```

## 論文の "2. WINDOW FUNCTIONS IN SQL" を片手に「初見殺しの SQL」を読み解く

論文の Figure 1. Window function concepts を見ると、

![](/images/posts/window-functions/4f4700b32b65-20241217.png)

partitioning, ordering, framing の3つがポイントだと書かれている。

### partitioning

その名の通り入力となる行をパーティション(グループ)に分ける。SQL の `group by` を用いた場合と異なり、集約はせずに単にグループ分けをするだけの動作となる。(行数は減らない)。

`PARTITION BY depname` とした場合、行は `depname` に基づいてグループ分けがされる。

`PARTITION BY` は省略可能で、省略した場合はすべての行が1つのグループに属することになる。

### ordering

partition 内での行を並び替える。ただし、ここでの並び替えはあくまで Window 関数の評価時に用いられ、SQL の出力順には必ずしも影響しない(影響することもある。後述の「`ORDER BY` を省略するとどうなるか」参照)。

```sql
sum(salary) OVER (PARTITION BY depname ORDER BY salary)
```

とした場合、partition 内は `salary` によって並び替えられた上で後続の Window 関数の処理に用いられるが、SQL 全体の出力結果は `salary` で並ぶわけではない。

`ORDER BY` も省略可能だが、並び順が影響する Window 関数と組み合わせると結果は非決定的になる(単純に行の出力順が変わりうるというだけでなく Window 関数の結果の値も変わりうる)。

### framing

framing によって、グループ分けされた行を更に制限した上で Window 関数に渡すことができる。コンセプトの図では、partition 内で現在の行(灰色)を起点に前後の行を制限した frame が描かれている。

framing には `rows`, `range` の2種類のモードがある。

![](/images/posts/window-functions/1f69a666c967-20241217.png)

`rows` モードでは現在の行に対して前後の行数を直接指定できる。

```sql
rows between 3 preceding and 3 following
```

とした場合、現在の行(7.5)に加えて、前の3行(4, 5, 6)と後ろの3行(8.5, 10, 12)の行を含む frame となる。

`range` モードはやや複雑で、`order by` に指定された列(など式)の値を用いて、現在の行の列の値をデクリメント/インクリメントして frame の範囲を計算する。

```sql
range between 3 preceding and 3 following
```

とした場合、現在の行(7.5)に加えて、前の行のうち 4.5 以上(`7.5 - 3` で算出)となる2行(5, 6)と、後ろの行のうち 10.5 以下(`7.5 + 3` で算出)となる2行(8.5, 10)を含む frame となる。

また frame の境界は `preceding` や `following` 以外にも指定方法がある。

- `current row`
  - 現在行を示す
  - `range` モードの場合は現在行と同一の値の行を含む
    - 例を元にした説明を後述
- `unbounded preceding`
  - frame の開始行を partition 内の最初の行とする
- `unbounded following`
  - frame の終了行を partition 内の最後の行とする

## 再訪: 「初見殺しの SQL」

「初見殺しの SQL」では明示的に framing 指定はしていないが、実はデフォルトで暗黙的に framing がされている。明示的に書いた場合は以下のようになる[^1]。

```sql
SELECT
  empno,
  depname,
  salary,
  sum(salary) OVER (
    PARTITION BY depname ORDER BY salary
    RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  )
FROM empsalary;
```

framing を指定している箇所 `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW` を読み解くと、

- `range` モードである
- 開始行は `UNBOUNDED PRECEDING` という指定で、partition における最初の行を意味する
- 終了行は `CURRENT ROW` であるが、framing は `range` モードであるため `ORDER BY` に指定されている `salary` が現在の行と同一である partition 内の行も含む

となる。

SQL の結果を再掲するが、

| empno | depname | salary | sum |
|-------|---------|--------|-----|
| 7 | develop | 4200 | 4200 |
| 9 | develop | 4500 | 8700 |
| 10 | develop | 5200 | 19100 |
| 11 | develop | 5200 | 19100 |
| 8 | develop | 6000 | 25100 |
| 5 | personnel | 3500 | 3500 |
| 2 | personnel | 3900 | 7400 |
| 4 | sales | 4800 | 9600 |
| 3 | sales | 4800 | 9600 |
| 1 | sales | 5000 | 14600 |

empno=10, 11 や empno=4, 3 の `sum` の結果が同一なのは、「終了行は `CURRENT ROW` であるが...`salary` が現在の行と同一である partition 内の行も含む」という処理によるものということが分かる。

## まとめ

振り返ってみると「初見殺しの SQL」が分かりづらいのは、

- 暗黙的な framing
- framing の `range` モードの複雑さ

によるものだと分かった。歴史的経緯でこのようになっているのだとは思うものの、正直言ってかなり分かりづらい。

ちなみに論文には他にも(というかメイントピックとして) partitioning/sorting/framing や aggregate を効率よく処理するための工夫が書かれていて面白いので、興味ある方はぜひ。

## おまけの練習問題

### framing モードを `rows` に変えるとどうなるか

「初見殺しの SQL」はデフォルトの `range` モードで framing がされる動作となっていたが、では `rows` モードにした場合どんな結果となるか？

```sql
SELECT
  empno,
  depname,
  salary,
  sum(salary) OVER (
    PARTITION BY depname ORDER BY salary
-   RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
+   ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  )
FROM empsalary;
```

#### 答え

| empno | depname | salary | sum |
|-------|---------|--------|-----|
| 7 | develop | 4200 | 4200 |
| 9 | develop | 4500 | 8700 |
| 10 | develop | 5200 | 13900 |
| 11 | develop | 5200 | 19100 |
| 8 | develop | 6000 | 25100 |
| 5 | personnel | 3500 | 3500 |
| 2 | personnel | 3900 | 7400 |
| 4 | sales | 4800 | 4800 |
| 3 | sales | 4800 | 9600 |
| 1 | sales | 5000 | 14600 |

- 開始行は `UNBOUNDED PRECEDING` なのでグループの最初の行となる
- 終了行は `rows` モードにおける `CURRENT ROW` なので、単に現在行となる
  - 結果、3行目の `sum` の結果はあくまで 1, 2, 3行目の合算値となり、4行目とは異なる値となる

### `ORDER BY` を省略するとどうなるか

今度は「初見殺しの SQL」(デフォルト明示版)から `ORDER BY` を消すとどうなるか？

```sql
SELECT
  empno,
  depname,
  salary,
  sum(salary) OVER (
-   PARTITION BY depname ORDER BY salary
+   PARTITION BY depname
    RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  )
FROM empsalary;
```

#### 答え

| empno | depname | salary | sum |
|-------|---------|--------|-----|
| 7 | develop | 4200 | 25100 |
| 8 | develop | 6000 | 25100 |
| 9 | develop | 4500 | 25100 |
| 10 | develop | 5200 | 25100 |
| 11 | develop | 5200 | 25100 |
| 2 | personnel | 3900 | 7400 |
| 5 | personnel | 3500 | 7400 |
| 1 | sales | 5000 | 14600 |
| 3 | sales | 4800 | 14600 |
| 4 | sales | 4800 | 14600 |

- `ORDER BY` が省略されたことで partition 内で行の出力順が変わった
  - partition 内で `salary` による並び替えがされてない
- `ORDER BY` が省略されている場合、`range` モードにおいては partition 内のすべての行が `CURRENT ROW` として扱われるため[^1]、partition 内の全行を `sum` した結果が出力される

つまりは、以下の SQL と同じような結果となる。

```sql
SELECT
  empno,
  depname,
  salary,
  sum(salary) OVER (PARTITION BY depname)
FROM empsalary;
```

### `ORDER BY` を省略した上で framing モードを `rows` に変えるとどうなるか

これが最後の問題。

```sql
SELECT
  empno,
  depname,
  salary,
  sum(salary) OVER (
-   PARTITION BY depname ORDER BY salary
+   PARTITION BY depname
-   RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
+   ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  )
FROM empsalary;
```

#### 答え

| empno | depname | salary | sum |
|-------|---------|--------|-----|
| 7 | develop | 4200 | 4200 |
| 8 | develop | 6000 | 10200 |
| 9 | develop | 4500 | 14700 |
| 10 | develop | 5200 | 19900 |
| 11 | develop | 5200 | 25100 |
| 2 | personnel | 3900 | 3900 |
| 5 | personnel | 3500 | 7400 |
| 1 | sales | 5000 | 5000 |
| 3 | sales | 4800 | 9800 |
| 4 | sales | 4800 | 14600 |

- 終了行は `rows` モードにおける `CURRENT ROW` なので単に現在行となり、partition 内での累積和が算出できている
- 「framing モードを `rows` に変えるとどうなるか」と似た結果だが、順序が異なる
  - 1つ前の結果と同じく、partition 内で `salary` による並び替えがされずに累積和が算出されている

[^1]: https://www.postgresql.jp/document/16/html/sql-expressions.html#SYNTAX-WINDOW-FUNCTIONS には次のように書かれている。「デフォルトのフレーム化オプションはRANGE UNBOUNDED PRECEDINGで、RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROWと同じです。 ORDER BYがあると、フレームはパーティションの開始から現在行の最後のORDER BYピア行までのすべての行になります。 ORDER BYが無い場合は、すべての行が現在行のピアとなるので、パーティションのすべての行がウィンドウフレームに含まれることを意味することになります。」
