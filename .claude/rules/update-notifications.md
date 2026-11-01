---
paths:
  - 'WandEnhancer/Core/UpdateNotifier.cs'
  - 'WandEnhancer/WandEnhancer.csproj'
  - '.github/workflows/build.yml'
---

# Update notifications

- Opt-in at compile time through the `EnableUpdateNotifications` MSBuild property and the `ENABLE_UPDATE_NOTIFICATIONS` symbol. Default and official builds exclude `UpdateNotifier` and its network code entirely.
- The opt-in variant checks only GitHub's latest public release. The check is on by default (`AppSettings.CheckUpdates`); `CheckPrereleases` also reads the releases list. It shows a native Windows notification and a header badge. Clicking either opens the `UpdatePopup` notes modal on the UI thread (the release page when only the launcher runs). It never downloads or installs anything.
