import { defineCommand } from "citty";

const ZSH_COMPLETION = `#compdef tsk

_tsk() {
  local -a commands
  commands=(
    'init:Initialize tsk in current directory'
    'add:Create a new task'
    'list:List tasks'
    'show:Show task details'
    'done:Mark a task as complete'
    'edit:Edit a task'
    'delete:Delete a task'
    'process:Process inbox tasks'
    'ui:Open TUI dashboard'
    'upgrade:Upgrade tsk to latest version'
    'git:Git sync commands'
    'auth:Authentication (login/logout)'
    'sync:Microsoft Graph sync'
  )

  _arguments -C \\
    '1:command:->command' \\
    '*::arg:->args'

  case $state in
    command)
      _describe -t commands 'tsk command' commands
      ;;
    args)
      case $words[1] in
        add)
          _arguments \\
            '(-p --priority)'{-p,--priority}'[Priority: high, medium, low, none]:priority:(high medium low none)' \\
            '(-a --area)'{-a,--area}'[Area of responsibility]:area:' \\
            '--project[Project name]:project:' \\
            '(-t --tags)'{-t,--tags}'[Comma-separated tags]:tags:' \\
            '(-d --due)'{-d,--due}'[Due date]:due:(today tomorrow "next week")' \\
            '--duration[Duration (e.g. 30m, 1h)]:duration:' \\
            '(-s --status)'{-s,--status}'[Initial status]:status:(inbox next waiting someday)' \\
            '(-i --interactive)'{-i,--interactive}'[Interactive mode]' \\
            '--json[Output JSON]' \\
            ':title:'
          ;;
        list)
          _arguments \\
            '(-s --status)'{-s,--status}'[Filter by status]:status:(inbox next waiting someday done cancelled)' \\
            '(-a --area)'{-a,--area}'[Filter by area]:area:' \\
            '--project[Filter by project]:project:' \\
            '(-t --tag)'{-t,--tag}'[Filter by tag]:tag:' \\
            '(-p --priority)'{-p,--priority}'[Filter by priority]:priority:(high medium low none)' \\
            '--due-before[Due before date (ISO)]:date:' \\
            '--due-after[Due after date (ISO)]:date:' \\
            '--done[Include done tasks]' \\
            '--json[Output JSON]'
          ;;
        show)
          _arguments \\
            '--json[Output JSON]' \\
            ':id:'
          ;;
        done)
          _arguments \\
            '--json[Output JSON]' \\
            ':id:'
          ;;
        edit)
          _arguments \\
            '--title[New title]:title:' \\
            '(-s --status)'{-s,--status}'[Status]:status:(inbox next waiting someday done cancelled)' \\
            '(-p --priority)'{-p,--priority}'[Priority]:priority:(high medium low none)' \\
            '(-a --area)'{-a,--area}'[Area]:area:' \\
            '--project[Project]:project:' \\
            '(-t --tags)'{-t,--tags}'[Tags]:tags:' \\
            '(-d --due)'{-d,--due}'[Due date]:due:' \\
            '--duration[Duration]:duration:' \\
            '(-i --interactive)'{-i,--interactive}'[Interactive mode]' \\
            '--editor[Open in editor]:editor:' \\
            '--json[Output JSON]' \\
            ':id:'
          ;;
        delete)
          _arguments \\
            '(-f --force)'{-f,--force}'[Skip confirmation]' \\
            '--json[Output JSON]' \\
            ':id:'
          ;;
        process)
          _arguments \\
            '--json[Output JSON]'
          ;;
        init)
          _arguments \\
            '--force[Overwrite existing config]' \\
            '--json[Output JSON]'
          ;;
        auth)
          _arguments \\
            ':action:(login logout)'
          ;;
        sync)
          _arguments \\
            '--dry[Dry run]' \\
            '--json[Output JSON]' \\
            ':id:'
          ;;
        git)
          local -a git_commands
          git_commands=(
            'setup:Configure git sync'
            'status:Show sync status'
            'disconnect:Remove git sync'
          )
          _arguments -C \\
            '1:git command:->gitcmd' \\
            '--json[Output JSON]'
          case $state in
            gitcmd)
              _describe -t git_commands 'git subcommand' git_commands
              ;;
          esac
          ;;
      esac
      ;;
  esac
}

_tsk "$@"`;

const BASH_COMPLETION = `# bash completion for tsk
_tsk() {
  local cur prev commands
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"
  commands="init add list show done edit delete process ui upgrade git auth sync"

  if [[ \${COMP_CWORD} -eq 1 ]]; then
    COMPREPLY=( $(compgen -W "\${commands}" -- "\${cur}") )
    return 0
  fi

  case "\${COMP_WORDS[1]}" in
    list)
      COMPREPLY=( $(compgen -W "--status -s --area -a --project --tag -t --priority -p --due-before --due-after --done --json" -- "\${cur}") )
      ;;
    add)
      COMPREPLY=( $(compgen -W "--priority -p --area -a --project --tags -t --due -d --duration --status -s --interactive -i --json" -- "\${cur}") )
      ;;
    edit)
      COMPREPLY=( $(compgen -W "--title --status -s --priority -p --area -a --project --tags -t --due -d --duration --interactive -i --editor --json" -- "\${cur}") )
      ;;
    delete)
      COMPREPLY=( $(compgen -W "--force -f --json" -- "\${cur}") )
      ;;
    show|done|sync)
      COMPREPLY=( $(compgen -W "--json" -- "\${cur}") )
      ;;
    init)
      COMPREPLY=( $(compgen -W "--force --json" -- "\${cur}") )
      ;;
    process)
      COMPREPLY=( $(compgen -W "--json" -- "\${cur}") )
      ;;
    auth)
      COMPREPLY=( $(compgen -W "login logout" -- "\${cur}") )
      ;;
    git)
      if [[ \${COMP_CWORD} -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "setup status disconnect" -- "\${cur}") )
      else
        COMPREPLY=( $(compgen -W "--json" -- "\${cur}") )
      fi
      ;;
  esac
  return 0
}
complete -F _tsk tsk`;

const ZSHRC_BLOCK = `
# tsk shell completions
fpath=(~/.zsh/completions $fpath)
autoload -Uz compinit && compinit
`;

const BASHRC_BLOCK_PREFIX = `
# tsk shell completions
`;

export const completionsCommand = defineCommand({
  meta: { name: "completions", description: "Install shell completions" },
  args: {
    shell: {
      type: "positional",
      description: "Shell type: zsh, bash",
      required: false,
    },
    print: {
      type: "boolean",
      description: "Print completion script instead of installing",
      default: false,
    },
  },
  async run({ args }) {
    const shell = detectShell(args.shell as string | undefined);

    if (!shell) {
      console.error(
        "Could not detect shell. Specify one: tsk completions zsh"
      );
      process.exit(1);
    }

    const script = shell === "zsh" ? ZSH_COMPLETION : BASH_COMPLETION;

    if (args.print) {
      console.log(script);
      return;
    }

    await installCompletion(shell, script);
  },
});

function detectShell(explicit?: string): "zsh" | "bash" | null {
  if (explicit) {
    const s = explicit.toLowerCase();
    if (s === "zsh" || s === "bash") return s;
    console.error(`Unsupported shell: ${explicit}. Use zsh or bash.`);
    process.exit(1);
  }

  const shellEnv = process.env.SHELL || "";
  if (shellEnv.includes("zsh")) return "zsh";
  if (shellEnv.includes("bash")) return "bash";
  return null;
}

async function installCompletion(
  shell: "zsh" | "bash",
  script: string
): Promise<void> {
  const fs = await import("fs");
  const path = await import("path");
  const os = await import("os");
  const home = os.default.homedir();

  if (shell === "zsh") {
    // Write completion function
    const dir = path.default.join(home, ".zsh", "completions");
    const file = path.default.join(dir, "_tsk");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, script, "utf-8");

    // Add fpath + compinit to .zshrc if not already there
    const zshrc = path.default.join(home, ".zshrc");
    const existing = fs.existsSync(zshrc)
      ? fs.readFileSync(zshrc, "utf-8")
      : "";

    if (!existing.includes("# tsk shell completions")) {
      fs.appendFileSync(zshrc, ZSHRC_BLOCK, "utf-8");
      console.log(`Installed zsh completions to ${file}`);
      console.log(`Added completion setup to ~/.zshrc`);
    } else {
      console.log(`Installed zsh completions to ${file}`);
      console.log(`~/.zshrc already configured`);
    }

    console.log();
    console.log("Restart your shell or run: source ~/.zshrc");
  } else {
    // Write completion script
    const dir = path.default.join(
      home,
      ".local",
      "share",
      "bash-completion",
      "completions"
    );
    const file = path.default.join(dir, "tsk");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, script, "utf-8");

    // Source from .bashrc if not already there
    const bashrc = path.default.join(home, ".bashrc");
    const existing = fs.existsSync(bashrc)
      ? fs.readFileSync(bashrc, "utf-8")
      : "";

    if (!existing.includes("# tsk shell completions")) {
      const sourceBlock = `${BASHRC_BLOCK_PREFIX}[ -f "${file}" ] && source "${file}"\n`;
      fs.appendFileSync(bashrc, sourceBlock, "utf-8");
      console.log(`Installed bash completions to ${file}`);
      console.log(`Added source line to ~/.bashrc`);
    } else {
      console.log(`Installed bash completions to ${file}`);
      console.log(`~/.bashrc already configured`);
    }

    console.log();
    console.log("Restart your shell or run: source ~/.bashrc");
  }
}
