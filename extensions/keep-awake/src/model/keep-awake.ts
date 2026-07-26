import { execFile, spawn } from "child_process";
import { basename } from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const CAFFEINATE = "/usr/bin/caffeinate";
const PMSET = "/usr/bin/pmset";
const SUDO = "/usr/bin/sudo";
const PS = "/bin/ps";
const SH = "/bin/sh";

// caffeinate に立てる assertion。-d 画面 / -i アイドル / -s システム。
// 起動時の引数と状態判定の条件を同じ定数から導くことで、両者がずれないようにする。
// -s は man のとおり AC 電源時のみ有効なので、バッテリー駆動中は onACPower で警告する。
const ASSERTIONS = ["-d", "-i", "-s"];

export type Keeper = {
  pid: number;
  /** -t で渡された秒数。無期限なら null */
  durationSeconds: number | null;
  /** 残り秒数。無期限なら null */
  remainingSeconds: number | null;
};

export type KeepAwakeState = {
  /** pmset の SleepDisabled。蓋を閉じてもスリープさせないための半分 */
  sleepDisabled: boolean;
  /** 画面とアイドルスリープを止めるための半分 */
  keeper: Keeper | null;
  onACPower: boolean;
};

/** 2 つの半分が揃っていれば on、両方落ちていれば off、片方だけなら partial */
export type Status = "on" | "off" | "partial";

export function statusOf(state: KeepAwakeState): Status {
  if (state.sleepDisabled && state.keeper !== null) {
    return "on";
  }
  if (!state.sleepDisabled && state.keeper === null) {
    return "off";
  }
  return "partial";
}

export async function readState(): Promise<KeepAwakeState> {
  const [settings, power, procs] = await Promise.all([
    execFileAsync(PMSET, ["-g"]),
    execFileAsync(PMSET, ["-g", "ps"]),
    processes(),
  ]);
  return {
    sleepDisabled: /SleepDisabled\s+1/.test(settings.stdout),
    keeper: findKeeper(procs),
    onACPower: power.stdout.split("\n")[0].includes("AC Power"),
  };
}

export async function turnOn(durationSeconds: number | null): Promise<void> {
  // disablesleep を先に立てる。sudo が未設定ならここで失敗させ、
  // caffeinate だけ動く中途半端な状態を作らない。
  await setSleepDisabled(true);
  await stopKeepers();
  spawnKeeper(durationSeconds);
  await waitForKeeper();
}

export async function turnOff(): Promise<void> {
  await stopKeepers();
  await setSleepDisabled(false);
}

// sudoers で NOPASSWD 指定されているのは `pmset -a disablesleep 0|1` の 2 つだけ。
// 引数の形を変えるとパスワードを要求され、Raycast には tty が無いので無言で失敗する。
async function setSleepDisabled(disabled: boolean): Promise<void> {
  try {
    await execFileAsync(SUDO, ["-n", PMSET, "-a", "disablesleep", disabled ? "1" : "0"]);
  } catch (error) {
    throw new Error(
      "pmset を sudo で実行できません。/etc/sudoers.d/pmset-disablesleep に " +
        "`<user> ALL=(root) NOPASSWD: /usr/bin/pmset -a disablesleep 0, /usr/bin/pmset -a disablesleep 1` " +
        "を追加してください。",
      { cause: error },
    );
  }
}

function spawnKeeper(durationSeconds: number | null): void {
  if (durationSeconds === null) {
    detach(CAFFEINATE, ASSERTIONS);
    return;
  }
  // 期限は caffeinate 自身に守らせる。background refresh は no-view / menu-bar 専用で、
  // しかも公式ドキュメントのとおり実行時刻がバッテリー駆動時にずれるため、期限の管理には使えない。
  // caffeinate が抜けた直後に同じシェルで disablesleep も戻すことで、
  // 「sleep だけ無効のまま」という状態を残さない。
  const script = `${CAFFEINATE} ${ASSERTIONS.join(" ")} -t ${durationSeconds}; exec ${SUDO} -n ${PMSET} -a disablesleep 0`;
  detach(SH, ["-c", script]);
}

// Raycast はコマンドの実行が終わるとプロセスを回収するので、caffeinate は
// detached で切り離して自分のプロセスグループに置く(実測で PPID 1 に付け替わり生き残る)。
function detach(command: string, args: string[]): void {
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  // unref した子の error は誰も拾わないため、未処理例外にしないよう受け止めておく。
  // 起動できていなければ次の readState が partial として見せる。
  child.on("error", () => undefined);
  if (child.pid === undefined) {
    throw new Error(`${command} を起動できませんでした`);
  }
  child.unref();
}

async function stopKeepers(): Promise<void> {
  const procs = await processes();
  for (const proc of procs) {
    if (asKeeper(proc) === null) {
      continue;
    }
    // 期限つきの keeper は `/bin/sh -c 'caffeinate …; sudo pmset … 0'` に包まれている。
    // caffeinate だけ kill するとラッパが後片付けの disablesleep 0 を走らせ、
    // 直後に張り直した新しいセッションを巻き戻してしまうので、ラッパを先に落とす。
    const wrapper = procs.find((candidate) => candidate.pid === proc.pgid && isWrapper(candidate));
    if (wrapper !== undefined) {
      kill(wrapper.pid);
    }
    kill(proc.pid);
  }
}

// spawn 直後は ps にまだ現れないことがあり、そのまま読むと partial に見えてしまう。
async function waitForKeeper(): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt++) {
    if (findKeeper(await processes()) !== null) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

function kill(pid: number): void {
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // 既に終了していれば何もしなくてよい
  }
}

type Process = {
  pid: number;
  pgid: number;
  elapsedSeconds: number;
  command: string;
};

async function processes(): Promise<Process[]> {
  const { stdout } = await execFileAsync(PS, ["-Ao", "pid=,pgid=,etime=,command="]);
  return stdout
    .split("\n")
    .map(parseProcess)
    .filter((proc): proc is Process => proc !== null);
}

function parseProcess(line: string): Process | null {
  const match = /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/.exec(line);
  if (match === null) {
    return null;
  }
  const elapsedSeconds = parseElapsed(match[3]);
  if (elapsedSeconds === null) {
    return null;
  }
  return { pid: Number(match[1]), pgid: Number(match[2]), elapsedSeconds, command: match[4] };
}

// ps の etime は [[DD-]HH:]MM:SS。lstart はロケール依存のパースになるのでこちらを使う。
function parseElapsed(etime: string): number | null {
  const match = /^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)$/.exec(etime);
  if (match === null) {
    return null;
  }
  const days = Number(match[1] ?? "0");
  const hours = Number(match[2] ?? "0");
  return days * 86400 + hours * 3600 + Number(match[3]) * 60 + Number(match[4]);
}

function findKeeper(procs: Process[]): Keeper | null {
  for (const proc of procs) {
    const keeper = asKeeper(proc);
    if (keeper !== null) {
      return keeper;
    }
  }
  return null;
}

// 他のツールも caffeinate を使う(実測で無関係な `caffeinate -i -t 300` が動いていた)ので、
// プロセス名だけでは判定できない。ASSERTIONS が揃っているものだけを常時起動用とみなす。
// 併存する script command 版 (pitchfork 経由で argv[0] が `caffeinate`) も同じ条件で拾える。
// 逆に `-dis` のようにまとめた指定は拾えないが、この extension もスクリプトも分けて渡している。
function asKeeper(proc: Process): Keeper | null {
  const argv = proc.command.split(/\s+/);
  if (basename(argv[0]) !== "caffeinate") {
    return null;
  }
  const flags = new Set(argv.slice(1));
  if (!ASSERTIONS.every((assertion) => flags.has(assertion))) {
    return null;
  }
  const durationSeconds = parseTimeout(argv);
  return {
    pid: proc.pid,
    durationSeconds,
    remainingSeconds: durationSeconds === null ? null : Math.max(0, durationSeconds - proc.elapsedSeconds),
  };
}

function parseTimeout(argv: string[]): number | null {
  const index = argv.indexOf("-t");
  if (index < 0) {
    return null;
  }
  const seconds = Number(argv[index + 1]);
  return Number.isFinite(seconds) ? seconds : null;
}

function isWrapper(proc: Process): boolean {
  return proc.command.startsWith(`${SH} -c ${CAFFEINATE} `);
}
