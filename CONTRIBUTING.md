# Contributing to WandEnhancer

Thank you for your interest in the WandEnhancer project! This document provides guidelines for contributing to the project.

## Table of Contents

- [Development Environment Setup](#development-environment-setup)
- [Bug Reports](#bug-reports)
- [Feature Suggestions](#feature-suggestions)
- [Creating a Pull Request](#creating-a-pull-request)
- [Release Process](#release-process)
- [Code Style](#code-style)
- [Testing](#testing)
- [License](#license)

## Code of Conduct

By participating in this project, you commit to maintaining respectful interactions with all community members. Any form of insults, harassment, or other unacceptable behavior will not be tolerated.

## Project Structure

The project consists of the following main components:

- **WandEnhancer** - Main project containing the enhancement logic and user interface
- **AsarSharp** - Library for working with ASAR archives (used for unpacking and modifying WeMod files)
- **Core** - Core of the enhancement flow, including static and dynamic modifications
- **Models** - Data models used in the project
- **View** - User interface components

## Development Environment Setup

1. Clone the repository:
   ```
   git clone https://github.com/k1tbyte/Wand-Enhancer.git
   ```

2. Open the solution `Wand-Enhancer.sln` in Visual Studio or JetBrains Rider.

3. Install Node.js, pnpm and the .NET Framework 4.8 desktop targeting pack.

4. Run `build.cmd`. It restores dependencies, builds the web panel and WPF app, and runs regression checks.

## Bug Reports

If you've found a bug, please create an Issue with a detailed description:

- WandEnhancer version
- WeMod version where the problem occurred
- Detailed steps to reproduce the bug
- Expected and actual behavior
- Screenshots or error logs (if available)

## Feature Suggestions

Suggestions for new features or improvements are welcome! Create an Issue describing your idea, explaining:

- What problem the proposed improvement solves
- How you envision implementing this feature
- Potential alternatives you've considered

## Creating a Pull Request

1. Fork the repository.
2. Create a branch with a descriptive name:
   ```
   git checkout -b feature/feature-name
   ```
   or
   ```
   git checkout -b fix/fix-name
   ```

3. Make the necessary changes and commit with clear, descriptive messages.

4. Ensure your code follows the project's style.

5. Push the branch to your fork:
   ```
   git push origin your-branch-name
   ```

6. Create a Pull Request to the main repository.

7. In the Pull Request description, explain the changes made and why they're necessary.

## Release Process

1. Update `WandEnhancer/Properties/AssemblyInfo.cs`.
2. Add a new top section with the same version to `CHANGELOG.md`.
3. Configure local hooks once:
   ```
   git config core.hooksPath .githooks
   ```
4. Commit and push the version/changelog changes.
5. Create and push a tag matching the same version exactly, for example:
   ```
   git tag 1.0.8.0
   git push origin 1.0.8.0
   ```
6. GitHub Actions will validate the version, build the project, extract the matching changelog section, and publish a notes-only release automatically. Official releases do not attach compiled binaries.

## Code Style

- Use C# naming conventions:
  - PascalCase for class, method, and property names
  - camelCase for local variables and parameters
  - _camelCase for private fields

- Add comments for complex code sections or patching methods

- Follow SOLID and DRY principles

## Testing

`build.cmd` runs web lint, type checks, production validation, Vitest, desktop state/interop checks and structural patch fixtures. It does not launch or patch Wand.

Run a focused web test from `web-panel` with `pnpm exec vitest run <test-file>`.

After building, validate against an original extracted Wand bundle directory:

```powershell
.\scripts\test-patch-locators.ps1 -AssemblyPath .\WandEnhancer\bin\Release\WandEnhancer.exe -BundleDirectory .\.source\11.6.0-clean
```

The locator harness applies patches only to temporary copies and runs `node --check`. Its default synthetic fixtures cover prettified and reminified identifiers separately. Do not commit proprietary extracted bundles.

Before releasing an RC, record the exact commit, Wand version/channel and enabled patches, then manually check:

- Fresh patch, upgrade from the previous Enhancer, failed patch followed by retry, and Restore.
- Repeated Wand startup and an overlay opened after a game starts later in the session.
- Wand update followed by automatic re-patching, including a failed re-patch.
- Remote desktop-to-panel and panel-to-desktop values, trainer switching, reconnect, mobile scrolling and exact slider input.
- Drawer search with a keyboard and mobile keyboard, Escape and focus restoration.

Use `launcher.log` and `launcher.prev.log` for startup diagnostics. Remove private paths and never share tokens or account storage.

## License

By contributing, you agree that your contributions will be licensed under the [Apache License 2.0](LICENSE.md).

---

Thank you for contributing to the WandEnhancer project!
