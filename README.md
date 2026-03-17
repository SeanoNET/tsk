# tsk

Developer-first task manager with Git integration and a terminal UI.

## Install

**Linux / macOS:**

```sh
curl -fsSL https://raw.githubusercontent.com/SeanoNET/tsk/main/install.sh | sh
```

**Windows (PowerShell):**

```powershell
iex (irm https://raw.githubusercontent.com/SeanoNET/tsk/main/install.ps1)
```

**From source:**

```sh
bun install
bun run build
```

## Features

- Markdown-backed tasks stored in `~/.tsk/tasks/`
- SQLite index for fast querying
- Terminal UI with board view (`tsk ui`)
- Rich add/edit with natural language time parsing
- Git-aware task linking
- Self-update via `tsk upgrade`

## Usage

```sh
tsk init          # Initialize tsk
tsk add "title"   # Add a task
tsk list          # List tasks
tsk done <id>     # Complete a task
tsk ui            # Open terminal UI
tsk upgrade       # Update to latest version
```

Run `tsk --help` for all commands.

## Development

Requires [Bun](https://bun.sh).

```sh
bun install       # Install dependencies
bun test          # Run tests
bun run dev       # Run from source (e.g. bun run dev add "task")
bun link          # Link globally as 'tsk' (needs ~/.bun/bin in PATH)
```

## License

MIT
