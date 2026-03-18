# tsk

Developer-first task manager with Git integration, Microsoft Graph sync, and a terminal UI.

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
- Rich add/edit with natural language time parsing, tab completion, and inline syntax
- Microsoft Graph sync — tasks with due dates sync as Outlook Calendar events
- Git-backed sync to a remote repository (`tsk git setup`)
- Self-update via `tsk upgrade`
- Cross-platform: Linux, macOS, Windows

## Usage

```sh
tsk init              # Initialize tsk
tsk add "title"       # Add a task
tsk add -i            # Interactive add with autocomplete
tsk list              # List tasks
tsk done <id>         # Complete a task
tsk ui                # Open terminal UI
tsk upgrade           # Update to latest version
```

### Microsoft Graph Sync

Sync tasks with due dates to your Outlook Calendar as events. Tasks without due dates stay local.

1. Register an app in [Azure Portal](https://portal.azure.com) → App registrations:
   - Supported account types: "Accounts in any organizational directory and personal Microsoft accounts"
   - Platform: "Mobile and desktop applications" with native client redirect URI
   - Enable "Allow public client flows"
   - API permissions (delegated): `Tasks.ReadWrite`, `Calendars.ReadWrite`, `User.Read`, `offline_access`

2. Configure tsk (`~/.tsk/config.toml`):

```toml
[sync]
enabled = true
clientId = "your-app-client-id"
```

3. Authenticate and sync:

```sh
tsk auth              # Device code login
tsk auth status       # Check auth status
tsk sync              # Sync all tasks with due dates
tsk sync <id>         # Sync a single task
tsk sync --dry        # Preview what would sync
tsk auth logout       # Sign out
```

### Git Sync

```sh
tsk git setup         # Configure remote repository
tsk git status        # Check sync status
tsk git               # Trigger manual sync
```

### Interactive Add

The interactive add mode (`tsk add -i`) supports inline syntax:

| Syntax | Example | Description |
|--------|---------|-------------|
| `!priority` | `!high` | Set priority |
| `#tag` | `#work` | Add tag |
| `@status` | `@next` | Set status |
| `due:time` | `due:tomorrow`, `due:30m` | Set due date |
| `area:name` | `area:home` | Set area |
| `proj:name` | `proj:website` | Set project |
| `dur:time` | `dur:1h` | Set duration |

Relative due times (`due:30m`, `due:2h`) use the actual time without work-hours clamping. Named times (`due:tomorrow`, `due:monday`) snap to work hours (9am).

Run `tsk --help` for all commands.

## Development

Requires [Bun](https://bun.sh).

```sh
bun install           # Install dependencies
bun test              # Run tests
bun run dev           # Run from source (e.g. bun run dev add "task")
bun run build         # Build for current platform
bun run build:all     # Build for all platforms
```

## License

MIT
