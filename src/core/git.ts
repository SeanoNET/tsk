import { tskDir } from "./paths.js";

const GIT_ENV = {
  GIT_AUTHOR_NAME: "tsk",
  GIT_AUTHOR_EMAIL: "tsk@localhost",
  GIT_COMMITTER_NAME: "tsk",
  GIT_COMMITTER_EMAIL: "tsk@localhost",
};

async function runGit(args: string[], cwd?: string): Promise<{ stdout: string; exitCode: number }> {
  const proc = Bun.spawn(["git", ...args], {
    cwd: cwd ?? tskDir(),
    env: { ...process.env, ...GIT_ENV },
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;
  return { stdout: stdout.trim(), exitCode };
}

export async function isGitRepo(dir?: string): Promise<boolean> {
  const { exitCode } = await runGit(["rev-parse", "--is-inside-work-tree"], dir ?? tskDir());
  return exitCode === 0;
}

export async function gitInit(dir?: string): Promise<void> {
  await runGit(["init"], dir ?? tskDir());
}

export async function gitAdd(paths: string | string[]): Promise<void> {
  const files = Array.isArray(paths) ? paths : [paths];
  await runGit(["add", ...files]);
}

export async function gitCommit(message: string): Promise<void> {
  await runGit(["commit", "-m", message, "--allow-empty"]);
}

export async function autoCommit(action: string, taskTitle: string): Promise<void> {
  await gitAdd(["."]);
  const type = action === "create" ? "feat" : action === "delete" ? "chore" : "update";
  const scope = action;
  const msg = `${type}(${scope}): ${taskTitle}`;
  await gitCommit(msg);
}

export async function ensureGitInstalled(): Promise<boolean> {
  try {
    const proc = Bun.spawn(["git", "--version"], { stdout: "pipe", stderr: "pipe" });
    await proc.exited;
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}
