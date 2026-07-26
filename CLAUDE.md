# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## リポジトリ構成

Raycast extension を複数ぶら下げただけの薄いリポジトリ。ルートに package.json はなく、**workspace でもない**。`extensions/<name>/` の各ディレクトリが独立した npm プロジェクトで、依存も lockfile も個別に持つ。

- `extensions/ghq` — ghq 管理下のリポジトリ検索・clone・エディタ/ブラウザで開く・`gh` 経由の PR 一覧
- `extensions/obsidian-reminder` — obsidian-reminder-plugin の `data.json` を読んでリマインダ一覧を表示
- `extensions/slack-operator` — AppleScript で Slack にキーストロークを送る（未読・スレッド・チャンネル切替）

## コマンド

workspace ではないので横断コマンドはループするしかない。そのループを `scripts/each-extension.sh` が持ち、`mise.toml` のタスクがそれを呼ぶ。ルートから:

```bash
mise run install     # 全 extension の npm install + git hooks の有効化
mise run check       # CI と同じ: lint + typecheck + build-dist
mise run lint        # ray lint
mise run fix         # ray lint --fix
mise run typecheck   # tsc --noEmit
mise run build       # ray build = ローカル Raycast へデプロイ
mise run build-dist  # 配布ビルド。型検査あり、Raycast アプリには触らない
```

`EXTENSIONS="ghq slack-operator" mise run lint` で対象を絞れる。extension 単体を触るときは従来どおり `cd` して `npm run dev` / `npm run build` / `npm run lint` / `npm run typecheck`。

**ビルド = ローカル Raycast へのデプロイ**。`ray build` は既定で `-e dev` として動き、出力先が `~/.config/raycast/extensions/<name>/` なので、ビルドした時点で Raycast アプリにインストールされる。「ビルドはしたがデプロイはしていない」という状態は存在しない。反映されないときは Raycast の再起動を試す。Raycast を汚さずにビルドを検証したいときは `-e dist`（= `mise run build-dist`、出力先は各 extension の `.dist/`）を使う。

`raycast-env.d.ts` は package.json の manifest から `ray` が自動生成する。手で編集しない。gitignore 済みだが ghq には commit 済みのものが残っている。

## 品質チェック

テストは存在しない（テストランナーも設定されていない）。`npm run publish` は Raycast Store への公開なので、明示的に依頼されない限り実行しない。

`ray lint` は manifest 検証・icon 検証・ESLint・Prettier の 4 つを束ねたもの。このうち manifest 検証は `author` を Raycast Store の API (`/api/v1/users/<author>`) に問い合わせて実在確認するため **ネットワークが必要**で、Store に無い author 名だと必ず exit 2 になる（`--relaxed` でも `--no-exit-on-error` でも回避できない）。author は Store の実アカウントである `uphy` に揃えてある。ここを変えると全 extension の lint が落ちる。

型検査は environment 依存で、`-e dev` は esbuild で束ねるだけで型を見ない。`-e dist` は型検査する。日常的な確認には `mise run typecheck`（= `tsc --noEmit`）を使う。

自動チェックは 3 段構え:

- **pre-commit hook** (`.githooks/pre-commit`) — staged な変更のある extension だけ Prettier・ESLint・tsc を実行する。3 つとも最後まで走らせて結果をまとめて報告する。`ray lint` はネットワーク必須でオフライン時に commit を止めてしまうため、ここには入れず CI に任せている。`git config core.hooksPath .githooks` で有効になり、`mise run install` がその設定をする
- **Stop hook** (`.claude/hooks/build-changed.sh`) — 応答終了時に `extensions/` 配下に未コミットの変更がある extension を自動でビルドする。手動でビルドしなくてもデプロイ済みの状態は保たれるが、ビルドが失敗した場合は exit 2 でエラーが差し戻される
- **CI** (`.github/workflows/ci.yml`) — push / PR で shellcheck と `mise run check`。shellcheck は SC2016（メッセージ中のバッククォート）を避けるため `--severity=warning` で回している。action は pinact で commit SHA に固定してあるので、バージョンを上げたら `pinact run` を掛け直す

## 依存

`npm audit` は 3 extension とも 11 件（high 10・low 1）を報告するが、すべて `@raycast/api` の依存ツリー内（oclif / ejs / jake / esbuild）で、`@raycast/api` を最新にしても消えない。`npm audit fix --force` は `@raycast/api` を 1.104.9 に **ダウングレード** して「解消」するので実行しない。上流の更新を待つ。

`@raycast/api` の peerDependencies が `@types/react` と `@types/node` のバージョンを厳密に指定している（1.104 系では 19.0.10 / 22.19.17）。ここがずれると Raycast のコンポーネントが軒並み TS2786「cannot be used as a JSX component」で落ちるので、`@raycast/api` を上げるときは peer の指定に合わせる。

## API の調べ方

`@raycast/api` は記憶で書くと存在しない prop や hook を捏造しやすい。**書く前に必ず裏を取る**。優先順位は次の 3 段。

1. **型定義が一次情報** — `extensions/<name>/node_modules/@raycast/api/types/index.d.ts` の 1 ファイル（8000 行超）に全 API が TSDoc の用例つきで入っている。インストール済みバージョンと完全に一致するので Web ドキュメントより信頼できる。大きいので読み込まず `grep -n "namespace Tool" <path>` のように引く。`@raycast/utils` は `node_modules/@raycast/utils/dist/*.d.ts` が hook ごとに分かれている
2. **概念・手順は公式ドキュメント** — manifest のスキーマ、lifecycle、Store 審査など「型からは読めない why」はこちら。全ページが `.md` を返すので必要な 1 ページだけ取れる（例: <https://developers.raycast.com/api-reference/user-interface/list.md>）。索引は <https://developers.raycast.com/llms.txt>（11KB、丸ごと読める）。全文は <https://developers.raycast.com/llms-full.txt> だが 916KB・約 23 万トークンあるので**文脈には載せない**。横断検索したいときだけ落として grep する
3. **質問もできる** — ページ URL に `?ask=<自然言語の質問>` を付けると GitBook が回答を返す（例: `curl "https://developers.raycast.com/api-reference/tool.md?ask=How+do+I+..."`）。ただし生成された回答なので、出てきた識別子は 1 の型定義で裏を取る

バージョンが動くもの、特に `AI.Model` の enum 値（型定義に `__DeprecatedModelUnion` が残っているほど入れ替わりが激しい）は記憶から書かない。

### 使わない API

Raycast Pro の契約がないため **AI 系 API は動かない**。`AI.ask` / `useAI` と AI Extension の一式（`tools/` ディレクトリ、manifest の `ai` / `tools` セクション、`ray evals`）は実装も提案もしない。LLM に投げたくなる処理が出てきたら、通常のコマンドと外部 CLI の組み合わせで設計する。

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

`@raycast/eslint-config`（2 系。flat config なので設定は `eslint.config.js`）と prettier（`printWidth: 120`, double quote）に従う。TypeScript は `strict: true`。`eslint.config.js` / `.prettierrc` / `tsconfig.json` は各 extension で複製されているので、規約を変えるなら 3 箇所すべてを揃える。

VSCode は保存時フォーマット＋ESLint の自動修正が有効で、フォーマッタは `esbenp.prettier-vscode` を指定してある（`.vscode/settings.json`）。この拡張が入っていないと保存時に TypeScript 既定のフォーマッタが動いて `.prettierrc` を無視するので、推奨拡張は入れておく。エディタ非依存の最低限（インデント・改行・文字コード）はルートの `.editorconfig` が持つ。

`ray lint` の Prettier は `CHANGELOG.md` と `package.json` を対象にしていない。この 2 つは実際 Prettier 非準拠なので、`npx prettier --write .` をリポジトリ全体に掛けると差分が出る。`package.json` は Raycast の manifest 形式が優先なので掛けないこと。
