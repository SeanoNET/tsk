import { tskDir } from "./paths.js";

const GIT_ENV = {
  GIT_AUTHOR_NAME: "tsk",
  GIT_AUTHOR_EMAIL: "tsk@localhost",
  GIT_COMMITTER_NAME: "tsk",
  GIT_COMMITTER_EMAIL: "tsk@localhost",
};

async function runGit(args: string[], cwd?: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(["git", ...args], {
    cwd: cwd ?? tskDir(),
    env: { ...process.env, ...GIT_ENV },
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode };
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

// --- Remote operations ---

export async function gitRemoteAdd(name: string, url: string): Promise<void> {
  const { exitCode, stderr } = await runGit(["remote", "add", name, url]);
  if (exitCode !== 0) throw new Error(`Failed to add remote '${name}': ${stderr}`);
}

export async function gitRemoteRemove(name: string): Promise<void> {
  const { exitCode, stderr } = await runGit(["remote", "remove", name]);
  if (exitCode !== 0) throw new Error(`Failed to remove remote '${name}': ${stderr}`);
}

export async function gitRemoteGetUrl(name: string): Promise<string | null> {
  const { stdout, exitCode } = await runGit(["remote", "get-url", name]);
  return exitCode === 0 ? stdout : null;
}

export async function gitLsRemote(url: string): Promise<{ ok: boolean; error?: string }> {
  const { exitCode, stderr } = await runGit(["ls-remote", "--exit-code", url]);
  // exit code 2 means remote exists but is empty — that's fine
  if (exitCode === 0 || exitCode === 2) return { ok: true };
  return { ok: false, error: stderr };
}

export async function gitFetch(remote: string): Promise<{ ok: boolean; error?: string }> {
  const { exitCode, stderr } = await runGit(["fetch", remote]);
  if (exitCode !== 0) return { ok: false, error: stderr };
  return { ok: true };
}

export async function gitPullRebase(remote: string, branch: string): Promise<{ ok: boolean; conflicts: boolean; error?: string }> {
  const { exitCode, stderr } = await runGit(["pull", "--rebase", remote, branch]);
  if (exitCode === 0) return { ok: true, conflicts: false };
  // Check if it's a conflict
  const conflicted = await gitConflictedFiles();
  if (conflicted.length > 0) return { ok: false, conflicts: true, error: stderr };
  return { ok: false, conflicts: false, error: stderr };
}

export async function gitPush(remote: string, branch: string, setUpstream = false): Promise<{ ok: boolean; error?: string }> {
  const args = setUpstream ? ["push", "-u", remote, branch] : ["push", remote, branch];
  const { exitCode, stderr } = await runGit(args);
  if (exitCode !== 0) return { ok: false, error: stderr };
  return { ok: true };
}

export async function gitRevParse(ref: string): Promise<string | null> {
  const { stdout, exitCode } = await runGit(["rev-parse", ref]);
  return exitCode === 0 ? stdout : null;
}

export async function gitBranchName(): Promise<string> {
  const { stdout, exitCode } = await runGit(["rev-parse", "--abbrev-ref", "HEAD"]);
  if (exitCode !== 0) return "main";
  return stdout;
}

export async function gitConflictedFiles(): Promise<string[]> {
  const { stdout } = await runGit(["diff", "--name-only", "--diff-filter=U"]);
  return stdout ? stdout.split("\n").filter(Boolean) : [];
}

export async function gitRebaseContinue(): Promise<{ ok: boolean; error?: string }> {
  const { exitCode, stderr } = await runGit(["rebase", "--continue"]);
  if (exitCode !== 0) return { ok: false, error: stderr };
  return { ok: true };
}

export async function gitRebaseAbort(): Promise<void> {
  await runGit(["rebase", "--abort"]);
}

export async function gitShowRef(ref: string, path: string): Promise<string | null> {
  const { stdout, exitCode } = await runGit(["show", `${ref}:${path}`]);
  return exitCode === 0 ? stdout : null;
}

export async function gitLocalAheadCount(remote: string, branch: string): Promise<number> {
  const { stdout, exitCode } = await runGit(["rev-list", "--count", `${remote}/${branch}..HEAD`]);
  if (exitCode !== 0) return 0;
  return parseInt(stdout, 10) || 0;
}

export async function gitRemoteAheadCount(remote: string, branch: string): Promise<number> {
  const { stdout, exitCode } = await runGit(["rev-list", "--count", `HEAD..${remote}/${branch}`]);
  if (exitCode !== 0) return 0;
  return parseInt(stdout, 10) || 0;
}

export async function gitHasUnpushedCommits(remote: string, branch: string): Promise<boolean> {
  return (await gitLocalAheadCount(remote, branch)) > 0;
}
