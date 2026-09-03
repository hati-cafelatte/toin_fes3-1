# 食販システム セットアップ手順

## 1. ファイル構成(全部同じ階層でOK)

```
/(リポジトリ直下)
├── index.html          … メイン(6ボタン)
├── uketsuke.html        … ① 受付
├── yuso.html             … ② 輸送
├── watashi.html          … ③ 受け渡し
├── admin.html            … ④ admin
├── settings.html         … ⑤ 設定
├── saisoku.html          … ⑥ 催促
├── Db.js                 … Firestore読み書き
├── Auth.js               … Googleドメイン認証ゲート
├── AdminAuth.js           … adminパスワードのSHA-256照合
├── Style.css
├── firebase-config.js     … ★自分で作成(下記手順3)
└── firestore.rules        … Firebaseコンソールに貼る用(リポジトリに置くのは任意)
```

`firebase-config.example.js` は見本です。中身を書き換えて **`firebase-config.js`** という名前で同じ階層に置いてください(このファイル名は `Db.js` から直接importされています)。

## 2. Firebaseプロジェクトを作る

1. https://console.firebase.google.com で新規プロジェクト作成(無料のSparkプランでOK)。
2. 「Authentication」→「Sign-in method」→ **Google** を有効化。
3. 「Firestore Database」→ 本番モードで作成(リージョンは asia-northeast1 などお好みで)。
4. 「プロジェクトの設定」→「マイアプリ」→ ウェブアプリを追加 → 表示された `firebaseConfig` の値を `firebase-config.js` に貼り付け。

## 3. Firestoreルールを設定する(★ここが本当のアクセス制御)

Firestore Database →「ルール」タブに `firestore.rules` の中身を貼り付けて公開してください。
Auth.js/AdminAuth.jsのチェックはあくまで見た目のゲートで、devtoolsで無効化されてもここで弾かれます。

## 4. GitHub Pagesにデプロイ

1. これらのファイルをリポジトリ直下(または `/docs` フォルダ)にpush。
2. リポジトリの Settings → Pages → Source をそのブランチ/フォルダに設定。
3. `https://<ユーザー名>.github.io/<リポジトリ名>/` でアクセス可能に。
4. Firebase Authenticationの「Settings」→「承認済みドメイン」に、そのGitHub PagesのドメインとlocalhostでのテストURLを追加しておく(忘れると「auth/unauthorized-domain」エラーになります)。

Node.js・ビルドステップは一切不要です。すべて `<script type="module">` からCDN上のFirebase SDKを直接importしているので、ファイルを置くだけで動きます。

## 5. 動作確認の順番(おすすめ)

1. `index.html` を開いて自分の `@sgh-tsukuba.org` アカウントでサインインできるか確認。
2. `settings.html` で最大注文番号などを希望の値に設定。
3. `uketsuke.html` で注文 → `yuso.html`(2分後に赤が消えるか)→ `watashi.html` で完了 → `yuso.html` から消えるか確認。
4. `saisoku.html` で催促 → `yuso.html` にバナーが出るか確認。
5. `admin.html` でパスワード `Fes31` を入力し、履歴とリセット(CSV)を確認。

---

## 詰めが甘かった点・補足しておいた仕様

- **新規注文の「未確定タイムスタンプ」対策**: `serverTimestamp()`はサーバ確定まで一瞬 `null` になります(オフライン書き込み中)。この間は輸送ページで「受付中...」と表示し、新規(赤)として扱うようにしました。
- **adminのパスワードは"見た目のゲート"止まり**: SHA-256にしても、ハッシュ自体はJSファイルに埋め込まれているため理論上はオフライン総当たりが可能です。「今日の履歴を見られる/リセットできる」権限そのものをFirestoreルールで絞ることはできません(誰が入力したかをルールは判別できないため)。本当に守りたいデータがあるなら、admin操作だけ別のFirebase Authロール(カスタムクレーム)にするなど強化の余地があります。今回は「身内の運用ツール」という前提で、現状の簡易ゲートに留めています。
- **最大注文番号(⑤設定)を稼働中に減らす**: 進行中の注文と新しい番号体系が衝突する可能性があるため、設定ページに注意書きを入れました。減らす場合は受付を止めて注文を捌き切ってから変更してください。
- **CSVはExcelでの文字化け対策としてBOM付きUTF-8**で出力しています。
- **admin.htmlも①〜⑥同様、まずGoogleドメイン認証→その後にパスワード入力**という二段構えにしています(要件の「①~⑥すべてドメイン制限」を満たすため)。
- **催促バナー**は `meta/reminder` の `triggeredAt` を輸送ページ側で毎秒チェックし、設定の秒数を過ぎたら自動で消える方式にしました(誰かが手動で消す必要はありません)。
- **同時操作の同期**: すべて`onSnapshot`によるリアルタイム購読、注文番号の払い出し/解放は`runTransaction`で行っているため、複数端末が同時に操作しても注文番号が重複したり数え間違えたりしません。
- Googleサインインは**ポップアップ方式**です。モバイルのアプリ内ブラウザ等でポップアップがブロックされる場合は`signInWithRedirect`への切り替えが必要になるかもしれません(通常のブラウザなら問題ありません)。
