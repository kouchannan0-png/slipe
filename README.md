# ミニゲーム (Kivy版)

## セットアップ

```bash
pip install -r requirements.txt
```

## 起動

```bash
python main.py
```

## ファイル構成

- `game_logic.py` — ゲームロジック本体(盤面・移動・勝利判定)。Kivyに依存しないので単体でテスト可能。
- `main.py` — Kivyによる画面(UI)。ローカル2人対戦(同じ端末で交互にプレイ)に対応。
- `RULES.md` — ルール説明(オリジナルの文章)。
- `fonts/NotoSansJP-Variable.ttf` — 日本語表示用フォント(同梱)。

## 遊び方

1. 自分の駒(青=プレイヤーA、赤=プレイヤーB)をタップして選択
2. 下の矢印ボタンで方向を選ぶと、壁か他の駒にぶつかるまで一直線に滑る
3. 自分の親コマ(★)を中央マスに止めたら勝利

## 次のステップ(未実装)

- CPU対戦(ミニマックス探索) — `game_logic.py` の `all_legal_moves()` を使って実装可能
- オンライン対戦 — WebSocket等でこの `Game` オブジェクトの状態を同期
- スマホ向けビルド — 下記参照

## Web版(iPhone/Androidどちらでも遊べる)

`web/` フォルダに、ブラウザだけで遊べる版があります。Pyodideという仕組みでブラウザ内にPython実行環境を作り、`game_logic.py` をそのまま読み込んで動かしているので、ゲームロジックはKivy版と共通です。

### 手元で試す

ブラウザは `file://` からのモジュール読み込みを制限していることが多いので、簡易サーバーを立てて開いてください。

```bash
cd web
python -m http.server 8000
```

その後、ブラウザで `http://localhost:8000` を開きます。

### GitHub Pagesで公開する

1. GitHubリポジトリの Settings → Pages を開く
2. Source を「Deploy from a branch」、branchを `main`、フォルダを `/web` に設定
3. 数分後に `https://ユーザー名.github.io/リポジトリ名/` でアクセスできるようになります

公開後は、iPhoneでもAndroidでもブラウザでそのURLを開くだけで遊べます。Safariの場合は共有ボタンから「ホーム画面に追加」すると、アプリのようなアイコンから起動できます。



### 方法A: GitHub Actionsで自動ビルド(推奨)

このリポジトリには `.github/workflows/build.yml` を同梱しています。GitHubにpushすると自動でAPKがビルドされ、Actionsタブの実行結果から `minigame-apk` というアーティファクトとしてダウンロードできます。

1. このプロジェクトをGitHubリポジトリにpush
2. リポジトリの「Actions」タブを開き、ビルドが完了するのを待つ(初回は20〜40分程度かかることがあります)
3. 完了したワークフローの「Artifacts」から `minigame-apk` をダウンロード
4. スマホに転送してインストール(提供元不明のアプリのインストールを許可する必要があります)

### 方法B: 自分のPC(Linux/WSL)でビルド

```bash
pip install buildozer
buildozer android debug
```

初回はAndroid SDK/NDKが自動でダウンロードされるため時間がかかります。成功すると `bin/` フォルダにAPKが生成されます。

### iOSについて

`kivy-ios` を使えばiOSアプリ化も可能ですが、Mac + Xcode環境が必須です。個人でのGitHub公開が目的であれば、まずはAndroidから試すことをおすすめします。

