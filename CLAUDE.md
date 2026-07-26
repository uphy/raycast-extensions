# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## リポジトリ構成

Raycast extension を複数ぶら下げただけの薄いリポジトリ。ルートに package.json はなく、**workspace でもない**。`extensions/<name>/` の各ディレクトリが独立した npm プロジェクトで、依存も lockfile も個別に持つ。

- `extensions/ghq` — ghq 管理下のリポジトリ検索・clone・エディタ/ブラウザで開く・`gh` 経由の PR 一覧
- `extensions/obsidian-reminder` — obsidian-reminder-plugin の `data.json` を読んでリマインダ一覧を表示
- `extensions/slack-operator` — AppleScript で Slack にキーストロークを送る（未読・スレッド・チャンネル切替）

## コマンド

必ず対象 extension のディレクトリに `cd` してから実行する。ルートで叩いても何も起きない。

```bash
cd extensions/ghq
npm install       # 初回のみ（現状 node_modules があるのは ghq だけ）
npm run dev       # ray develop: Raycast に開発版を注入してホットリロード
npm run build     # ray build
npm run lint      # ray lint
npm run fix-lint  # ray lint --fix
```

**ビルド = ローカル Raycast へのデプロイ**。`ray build` は既定で `-e dev` として動き、出力先が `~/.config/raycast/extensions/<name>/` なので、ビルドした時点で Raycast アプリにインストールされる。「ビルドはしたがデプロイはしていない」という状態は存在しない。反映されないときは Raycast の再起動を試す。

テストは存在しない（テストランナーも設定されていない）。`ray build` は esbuild で束ねるだけで型検査をしないので、型の確認には別途 `npx tsc --noEmit` を走らせる。`npm run publish` は Raycast Store への公開なので、明示的に依頼されない限り実行しない。

`.claude/hooks/build-changed.sh` が Stop hook として登録してあり、応答終了時に `extensions/` 配下に未コミットの変更がある extension を自動でビルドする。手動でビルドしなくてもデプロイ済みの状態は保たれるが、ビルドが失敗した場合は exit 2 でエラーが差し戻される。

`raycast-env.d.ts` は package.json の manifest から `ray` が自動生成する。手で編集しない。gitignore 済みだが ghq には commit 済みのものが残っている。

## アーキテクチャ

### コマンド定義と実装の対応

`package.json` の `commands[].name` が `src/<name>.tsx`（または `.ts`）の default export と 1:1 で対応する。コマンドを追加するときは両方を同時に変更する必要がある。`mode: "view"` は React コンポーネントを返し、`mode: "no-view"` は副作用だけの async 関数を返す（slack-operator が後者）。

引数の受け渡しには 2 系統あり、混同しやすい。manifest の `arguments` は `LaunchProps<{ arguments: T }>` から読み、`preferences` は `getPreferenceValues<T>()` から読む。`createDeeplink({ command, arguments })` で渡せるのは前者だけなので、deeplink / Quicklink で外から値を渡すコマンド（`open-repository` がこれ）は必ず `arguments` で宣言する。宣言を変えたら `npm run build` を実行して `raycast-env.d.ts` を再生成する。

### ghq: 外部コマンドの実行と PATH

Raycast のプロセスは通常のログインシェルの PATH を継承しないため、`ghq` / `gh` / `git` / エディタの CLI が素では見つからない。`src/model/command.ts` の `CommandRunner` がこの問題を一手に引き受けている:

- ユーザ設定 `pathEnv`（manifest の extension 共通 preference）を `process.env.PATH` に連結して `execFile` に渡す
- `NODE_PATH` / `NODE_ENV` を明示的に `undefined` にしている。Raycast が注入するこれらの値が子プロセスの Node ツールチェインを壊すため、消さないと動かない

外部コマンドを新しく呼ぶときは `execFile` を直に使わず、必ず `CommandRunner` にメソッドを足す。

`clone()` は `ghq get` の **stderr** を正規表現でパースして clone 先パスを取り出している（`ghq` は成功パスを stdout に出さない）。「新規 clone」と「既存につき skip」の 2 パターンを見ている。

### ghq: 状態の持ち方

`src/model/storage.ts` の `storage` シングルトンが `LocalStorage` を包む唯一の入口。キーは `"r:" + リポジトリの絶対パス` で、値は `RepositoryData`（PR 検索クエリの履歴＋保存済みクエリ）の JSON。リポジトリ単位で分かれているので、横断的な列挙はできない構造になっている。

`src/hooks/index.ts` は `usePreferences` → `useCommandRunner` → `useRepositories` の順で使う前提。`CommandRunner` は `useMemo` で 1 コマンド 1 インスタンスに保たれ、以降 props で下のコンポーネントに手渡しされる（context は使っていない）。

### obsidian-reminder: 読み取り専用のファイル解析

Obsidian の設定ファイル 2 段を読むだけで、書き込みは一切しない。

1. `~/Library/Application Support/obsidian/obsidian.json` → vault id とパスの一覧
2. 各 vault の `.obsidian/plugins/obsidian-reminder-plugin/data.json` → リマインダ本体

日付は `YYYY-MM-DD( HH:MM)` 形式の自前パース（時刻省略時は plugin 設定の `reminderTime` にフォールバック）。`groupReminder()` が Overdue / Today / Tomorrow / In a week / In a month / Over 1 month の 6 グループに振り分け、グループごとに違う日付フォーマッタを持たせている。

### slack-operator: AppleScript のキーストローク

3 コマンドすべてが `src/slack.ts` の `openSlackAndSendKeys()` の薄いラッパーで、違いは送るキーだけ（`⌘⇧A` = 未読、`⌘⇧T` = スレッド、`⌘K` = チャンネル切替）。`clearSearchBar()` → `closeMainWindow()` → Slack を activate → `slackLaunchWait` 秒待つ → `System Events` で keystroke、という順序に依存している。この delay はユーザ設定（既定 0.1 秒）で、Slack が起動しきる前にキーを送ると取りこぼす。

このコマンド群は macOS のアクセシビリティ権限（Raycast に「システムイベントの制御」許可）がないと無言で失敗する。

## コーディング規約

`@raycast/eslint-config` と prettier（`printWidth: 120`, double quote）に従う。VSCode は保存時フォーマットが有効。TypeScript は `strict: true`。各 extension で設定ファイルは複製されているので、規約を変えるなら 3 箇所すべてを揃える。
