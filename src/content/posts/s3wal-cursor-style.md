---
title: "Cursor Origin スタイルで S3 に WAL のストレージ層を構築する"
date: 2026-08-26
description: "S3 の条件付き書き込みを活用して WAL のストレージ層を構築し、キャッシュや Request coalescing を足していく過程で踏んだ並行バグを記録する"
tags: ["s3", "wal", "database"]
---

最近データベースなどの文脈で S3 活用の話題をよく目にする。多少興味を惹かれつつも、レイテンシの大きさからあまり実用的な用途は思い浮かばず、特に試すこともなく過ごしていた。

先日 Cursor が公開した[S3 を用いた Git ホスティングサービスについての技術ブログ](https://cursor.com/ja/blog/git-at-any-scale)を読んで、個人的なツールボックスとして S3 の使い方を学んでおいても損はないなと思い直し、紹介されていた S3 を用いた WAL の実装を試してみることにした。

ちなみにこの記事にタイトルは「Cursor Origin スタイル」としているが、実際には 「Origin という Git ホスティングサービスのストレージシステムである Continuity スタイル」が正確な表現である。

また、Cursor のブログに刺激を受けた OSS プロジェクトが既にいくつか存在し、かつ[分散バグを抱えていたりもする](https://x.com/kellabyte/status/2091977658888245316)ようで、S3 使えば簡単にスケーラブルなシステムが作れるわけでもないことに注意。

## 利用する S3 の機能: 条件付き書き込み

今回試す WAL の実装では [S3 の条件付き書き込み](https://docs.aws.amazon.com/ja_jp/AmazonS3/latest/userguide/conditional-writes.html#conditional-error-response)を利用する。S3 では ETag を用いた条件付き書き込みが可能で、オブジェクトの ETag が PUT 時に指定した値と一致する場合にのみ書き込みを行うことができる。

例えば、オブジェクトの ETag が "abc" の場合にのみ書き込みを行う場合、以下のように `--if-match "abc"` オプションを付けることで、条件付き書き込みが実行される。

```bash
aws s3api put-object --bucket my-bucket --key my-object --body my-file --if-match "abc"
```

もし、先行して同じオブジェクトに書き込みが行われていた場合、ETag が書き換わっていることで書き込みは失敗し `412 Precondition Failed` が返される。これにより書き込みプロセスが複数存在する場合でも、競合を検知して適切に処理することが可能になる。

条件にはもう一種類あり、ETag ではなくオブジェクトの存在有無を見ることもできる。`--if-none-match "*"` を指定すると、同じキー名のオブジェクトが存在しない場合にのみ書き込みが行われる。

```bash
aws s3api put-object --bucket my-bucket --key my-object --body my-file --if-none-match "*"
```

既に同じキーのオブジェクトが存在していた場合は書き込みが失敗し `412 Precondition Failed` が返される。

## WAL のストレージ層の構築

サーバーがクラッシュした場合に状態を復元するためには、WAL の書き込みに耐久性を持たせつつ、WAL の適用順序を制御する必要がある。

通常、耐久性を持たせるためにはディスク書き込み時に fsync をおこなったり、分散構成であればレプリケーション完了を待つ必要があるが、S3 を用いる場合は S3 への書き込みが完了した時点で耐久性が保証される(とみなされることが多い)。

また、WAL の適用順序を制御するには、一般的には単調増加する LSN(Log Sequence Number) を WAL に付与するような手法が用いられるが、今回は WAL の適用順を保持するインデックスファイルを S3 上で管理する Cursor Origin スタイルを採用する。インデックスファイルの更新に S3 の条件付き書き込みを利用することで、複数の書き込みプロセスからの同時更新が発生する場合でも競合を検知できる。

ついでに、サーバーには書き込みと読み取りを受け付ける primary と、読み取りのみの replica という2種類の役割を持たせる。primary は複数台立ててもよく、複数プロセス間の安全性は S3 の条件付き書き込みだけで担保する。replica は S3 からの読み取りだけで水平にスケールできる。

### 書き込みの流れ

具体的な書き込みの流れは以下のようになる。

1. 永続化したいデータを受け取る
2. データのハッシュ値を計算し、オブジェクトのキー名とする
3. S3 に対してデータを PUT する
4. WAL のインデックスファイルを S3 から GET する
    - 存在すれば内容と ETag が得られる
    - 未作成なら 404 で、ETag は得られない
5. インデックスに新しいエントリ(オブジェクトのキー)を追加する
6. S3 に対してインデックスファイルを PUT する
    - 4 で ETag が得られていれば `--if-match "<その ETag>"`
    - 未作成だったなら `--if-none-match "*"`

### Go での実装例

上記の流れをそのまま実装すると `Append` の中心部分は以下のようになる(完全な実装は [simple/wal.go](https://github.com/hmarui66/s3wal-cursor-style/blob/main/simple/wal.go) を参照)。

```go
func (w *WAL) Append(ctx context.Context, data []byte) (string, error) {
	hash := contentHash(data)

	// 1〜3. 本体を先に書く。インデックスから参照される前に存在させるため。
	_, err := w.Client.PutObject(ctx, &s3.PutObjectInput{
		Bucket: aws.String(w.Bucket),
		Key:    aws.String(w.entryKey(hash)),
		Body:   bytes.NewReader(data),
	})
	if err != nil {
		return "", err
	}

	for {
		// 4. インデックスと ETag を取る。未作成なら etag は空文字。
		idx, etag, err := w.getIndex(ctx)
		if err != nil {
			return "", err
		}

		// 5. 自分のハッシュを足す。
		idx.Entries = append(idx.Entries, hash)
		body, err := json.Marshal(idx)
		if err != nil {
			return "", err
		}

		// 6. 条件付きで書き戻す。
		put := &s3.PutObjectInput{
			Bucket: aws.String(w.Bucket),
			Key:    aws.String(w.indexKey()),
			Body:   bytes.NewReader(body),
		}
		if etag == "" {
			put.IfNoneMatch = aws.String("*") // まだ無いので作る
		} else {
			put.IfMatch = aws.String(etag) // 4 で読んだときのままなら書く
		}

		_, err = w.Client.PutObject(ctx, put)
		if err == nil {
			return hash, nil
		}
		if !isPreconditionFailed(err) {
			return "", err
		}
		// 412。誰かが先に作った、あるいは先に更新した。4 からやり直す。
	}
}
```

状態を持たずに毎回 S3 にフルでアクセスすることで、並行性の担保を S3 の条件付き書き込みのみで実現している。


## 改善

さすがにリクエストの度に S3 上の全てのリソースにフルアクセスするのは非効率。Cursor のブログを読むと WAL のインデックスや本体をキャッシュして S3 へのアクセスを減らしているようなので、同様の改善を行う。

1. WAL のインデックスファイルのデータと ETag をキャッシュしておき、ETag を用いて条件付き GET を行うことで、304 Not Modified が返ればキャッシュを使い回す
2. WAL の本体もキャッシュしておき、インデックスに記録されているハッシュがキャッシュにあれば S3 への GET を省略する
3. 起動時に WAL のインデックスと ETag、そしてインデックスに記録されているハッシュの WAL 本体を取得してキャッシュしておく
4. 同一キーに対する GET リクエストが同時に複数発生した場合、束ねる

3, 4 は Cursor のブログに直接書かれているわけではないが、せっかくなので実装してみる。

### インデックスファイルのキャッシュ

インデックスファイルの取得時にそのデータと ETag を保持しておいて、次のリクエスト時に If-None-Match ヘッダを付けて条件付き GET を行い、`304 Not Modified` が返ればキャッシュを使い回せば良い。

実装イメージとしては以下のようになる。

```diff
type WAL struct {
	Client *s3.Client
	Bucket string
	Prefix string

+	// wal-index のキャッシュ。If-None-Match で再検証し、ETag が動いていない
+	// 間は本体を読み直さない。
+	cacheMu    sync.RWMutex
+	cacheIndex index
+	cacheETag  string
}
```

排他制御のための `sync.RWMutex` とキャッシュを保持するフィールドを追加し、`getIndex` でキャッシュを使い回すようにする。


```go
res, err := w.Client.GetObject(ctx, input) // input.IfNoneMatch にキャッシュのETagを指定済み
if err != nil {
	if isNotModified(err) {
		// bugfix(後述): cachedIdx をそのまま返すと、複数の呼び出し元が
		// 同じキャッシュのバッキング配列を受け取ることになる。
		return index{Entries: slices.Clone(cachedIdx.Entries)}, cachedETag, nil
	}
	// ...(NoSuchKey などのハンドリングは省略)
}
// ...(GET成功時のJSONパースは省略)
w.setCache(idx, etag)
return idx, etag, nil
```

```go
func (w *WAL) setCache(idx index, etag string) {
	w.cacheMu.Lock()
	// bugfix(後述): 引数の idx.Entries をそのまま保持すると、呼び出し元が
	// 後で slice を変更したときにキャッシュ側が壊れる。
	w.cacheIndex, w.cacheETag = index{Entries: slices.Clone(idx.Entries)}, etag
	w.cacheMu.Unlock()
}
```

キャッシュの読み取りや更新が並行して行われる可能性があるため、`sync.RWMutex` を用いて安全にアクセスするようにする必要がある。

ここには slice の所有権の境界が2箇所あり、どちらも clone しないとキャッシュが壊れる。1つは `setCache` で、渡された `idx.Entries` をそのまま保持すると、呼び出し元がその後 slice を変更したときにキャッシュ側が壊れる。もう1つは 304 で `cachedIdx` を返す側で、こちらを clone せずに返すと、複数の呼び出し元が同じキャッシュのバッキング配列を受け取ることになり、これを書き換えた瞬間に他の呼び出し元の内容まで壊れる。このあたりは AI にレビューしてもらって見つけたバグ。

### WAL の本体のキャッシュ

こちらはハッシュ値をキーにして本体のデータをキャッシュし、キャッシュがあれば S3 への GET を省略する。

```diff
type WAL struct {
	Client *s3.Client
	Bucket string
	Prefix string

	// wal-index のキャッシュ。If-None-Match で再検証し、ETag が動いていない
	// 間は本体を読み直さない。
	cacheMu    sync.RWMutex
	cacheIndex index
	cacheETag  string

+	// エントリ本体のキャッシュ。キーはコンテンツハッシュ
+	entries sync.Map // hash (string) -> body ([]byte)
}
```

WAL 本体のデータは `sync.Map` で保持する。ただし `sync.Map` が安全にするのは Load/Store という map 操作だけで、値である `[]byte` 自体の可変性までは面倒をみない。今回は `getEntry` で返す `[]byte` は不変であることを前提としているため、気にしないで済む。

```go
// getEntry はエントリ本体を返す。内容不変なので S3 から取るのは初回だけ。
func (w *WAL) getEntry(ctx context.Context, hash string) ([]byte, error) {
	if body, ok := w.entries.Load(hash); ok {
		return body.([]byte), nil
	}
	// ...(キャッシュに無ければ GetObject して Store するだけ)
}
```

`sync.Map` のおかげであまり複雑な排他制御を書かずに済んでいる。

### 起動時のキャッシュの Preload

こちらは単に起動時に WAL のインデックスとその ETag、そしてインデックスに記録されているハッシュの本体を S3 から取得してキャッシュするだけなのでコード例は省略する。

### 同一キーの GET リクエストを束ねる

リクエストを束ねるのは一般的には Request Coalescing などと呼ばれており Go では `golang.org/x/sync/singleflight` パッケージを使うことで、実装自体は簡単にできる。

[Request coalescing with Go singleflight](https://rednafi.com/go/request-coalescing/) という記事が参考になる。

以下、記事に載っているサンプルコードを一部改変して転載。同一 key の処理が同時に複数走った場合、最初の1回だけ `g.Do` のブロックが実行され、残りは結果を待つだけになる。

```go
var g singleflight.Group

v, err, _ := g.Do(key, func() (any, error) {
	return s.fetch(ctx, key)
})
```

今回進めている WAL の実装においては、`getIndex` では key=`wal-index`、`getEntry` では key=`[コンテンツハッシュ]` を指定して `g.Do` を呼ぶことで、S3 への GET リクエストの同時実行を束ねることができる。

## 改善をおこなった結果

元々スループットやレイテンシを測定はしていなかったので性能評価はスコープ外とする。それよりも、改善をおこなったことで多々バグが埋め込まれたので、紹介。

コードベースの全体は [hmarui66/s3wal-cursor-style](https://github.com/hmarui66/s3wal-cursor-style) に置いてある(一部この記事に記載しているコードとは異なる箇所あり)。

### slice で保持しているキャッシュが意図せず破壊されうるバグ

これは上述のコード内にも "bugfix" としてコメントを入れているもの。キャッシュしている slice を更新する際に、外部から渡された slice をそのまま保持してしまうと、外部からその slice の内容が変更されてキャッシュが壊れてしまう可能性があった。

```diff
func (w *WAL) setCache(idx index, etag string) {
	// キャッシュを更新する際は Lock する
	w.cacheMu.Lock()
-	// 引数で渡された `idx.Entries` をそのままキャッシュに保持してしまうと、外部からその slice の内容が変更される可能性がある。
-	w.cacheIndex, w.cacheETag = index{Entries: idx.Entries}, etag
+	// slices.Clone を使ってスライスのコピーを作ることで、キャッシュのスライスが外部から変更されないようにする
+	w.cacheIndex, w.cacheETag = index{Entries: slices.Clone(idx.Entries)}, etag
	w.cacheMu.Unlock()
}
```

### WAL インデックスに関する read-after-write 問題

Request coalescing を導入したことで、WAL のインデックスファイルの書き込み直後の読み取りが、書き込み直前に動いていたリクエストに合流してしまい、古いインデックスを返してしまうことが発生した。

```
  W: WAL インデックスを GET する
  A: WAL インデックスの GET を開始する
  W: WAL インデックスを更新する PUT を行う
  W: 処理が完了し、クライアントにレスポンスが返る
  B: W の完了後に開始したリクエストが WAL インデックスを GET しようとして A の GET に合流する
  A: WAL インデックスの GET が完了する(内容は W が更新する前のもの)
  B: A が GET した古いインデックスに基づいて、クライアントにレスポンスを返す
```

W が書き込みプロセス、A が書き込み前に始まっていた読み取り、B が書き込み完了後に始まった読み取り。

安全に Request coalescing ができるのは S3 がリクエストを評価する前に合流する場合であり、評価後に合流すると read-after-write 問題が起きうる。

対処法として、書き込み成功時に進行中の共有フェッチを `singleflight.Group.Forget` で捨てる案と、キャッシュの世代をキーに含めて別世代同士は合流させない案を検討したが、どちらも primary の中でしか効かない。書き込みが起きるのは primary だけで、replica はその書き込みを直接観測できないため、replica 自身のキャッシュ世代は動かない。つまり replica 上では2つの読み取りが常に同じキーに合流してしまい、上の2案では防げない。この構造上の理由から、WAL インデックスの GET の Request coalescing はやめた。

### その他 Request coalescing 周辺に埋め込んだバグ

`singleflight` の共有処理が最初に到達した呼び出し元の `context` を使って S3 への GET を行っていたため、最初の呼び出し元がキャンセルされると、他の呼び出し元もキャンセルされてしまうというバグがあった。`context.WithoutCancel` を使って、共有処理の context をキャンセルされないようにすることで対処した。

また `context.WithoutCancel` の指定時にdeadlineも消してしまい、S3 が応答しない場合に無限待ちになる可能性があった。そこで `context.WithTimeout` でラップして、共有処理の context には timeout を設定するようにした。加えて `singleflight` の `Do` ではなく `DoChan` と `select` を使うことで、呼び出し元の context がキャンセルされた場合に待機中の処理を離脱できるようにした。

```go
// 待ち側は DoChan と select で自分の context を尊重する。Do だと待機中に離脱できず、共有フェッチが詰まると全員がそこに残る。
func (w *WAL) coalesce(ctx context.Context, key string, fn func(context.Context) (any, error)) (any, error) {
	ch := w.fetchGroup.DoChan(key, func() (any, error) {
		shared, cancel := context.WithTimeout(context.WithoutCancel(ctx), fetchTimeout)
		defer cancel()
		return fn(shared)
	})

	select {
	case r := <-ch:
		return r.Val, r.Err
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}
```

### ただのバグ・考慮漏れ

- 書き込み時に WAL インデックス内にコンテンツハッシュに一致するエントリがあったら書き込みスキップするような処理が入っていたため、同一内容のエントリが消えてしまう
- S3 呼び出し時のエラー判定で文字列マッチを使っていたため、SDK のエラー文に含まれるリクエストIDの "412" に反応して PreconditionFailed と誤判定
- `encoding/json/v2` はv1と違い不正なUTF-8をU+FFFDに置換せず、エラーにして0バイトしか書かない。GET ハンドラは200のヘッダを書いた後にJSON生成が失敗するため、1つでも不正な UTF-8 のエントリを受け付けてしまうと以降のGETは200のまま本文が0バイトで返ってくるようになる
- 不要かつ無駄に広い範囲に適用される `RWMutex` があった

この記事で挙げたものも含めたバグ一覧は[hmarui66/s3wal-cursor-style#参考: 見つけたバグ](https://github.com/hmarui66/s3wal-cursor-style#%E5%8F%82%E8%80%83-%E8%A6%8B%E3%81%A4%E3%81%91%E3%81%9F%E3%83%90%E3%82%B0)にまとめてある。

## まとめ

S3 の条件付き書き込みを用いると複数の書き込みプロセスにも耐えられる WAL を実装できるが、実用性を上げるためにキャッシュや Request coalescing を導入したところ、この記事の最初にリンクを載せた X 上のコメント

> truly embarrassing distsys 101 bugs

に向き合うことになった。

ちなみに [hmarui66/s3wal-cursor-style](https://github.com/hmarui66/s3wal-cursor-style) には TLA+ や fuzzing を使った検証コードも置いてある(AI 頼み)。実装後にモデル化したこともあり、最初のモデルは fetch を1遷移にまとめてしまい、応答が遅延するケースを探索できていなかった。3段階に分けた後も、合流した側が自分より前に評価された結果を受け取る経路を見落としていて、レビュー指摘を元にモデルに反映した。バグを新規発見したのは主にレビューで、fuzzing でも一部のバグが見つかったが、TLA+ で見つけたバグは0件だった。
