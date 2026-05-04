using System;
using System.Globalization;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;
using System.Threading.Tasks;
using System.Net.Http;
using Newtonsoft.Json;

namespace WandEnhancer.Utils
{
    public class UpdateReleaseInfo
    {
        public string Version { get; set; }

        public string LatestNotes { get; set; }
    }

    public class GitHubRelease
    {
        public class AssetsType
        {
            public string Name { get; set; }
            
            [JsonProperty("browser_download_url")]
            public string Url { get; set; }
        }
        
        [JsonProperty("tag_name")]
        public string TagName { get; set; }
        
        [JsonProperty("assets")]
        public AssetsType[] Assets { get; set; }

        [JsonProperty("body")]
        public string Body { get; set; }

        [JsonProperty("published_at")]
        public DateTimeOffset PublishedAt { get; set; }

    }
    
    public class Updater
    {
        private GitHubRelease _release = null;
        private UpdateReleaseInfo _updateInfo = null;
        private string _fullChangelog = null;
        private static readonly HttpClient _httpClient = new HttpClient()
        {
            DefaultRequestHeaders =
            {
                { "User-Agent", "GitHub-Updater" }
            }
        };
        
        private static readonly string ApiUrl = $"https://api.github.com/repos/{Constants.Owner}/{Constants.RepoName}/releases/latest";
        private static readonly string ReleasesApiUrl = $"https://api.github.com/repos/{Constants.Owner}/{Constants.RepoName}/releases?per_page=20";
        public async Task<bool> CheckForUpdates()
        {
            try
            {
                var currentVersion = Assembly.GetExecutingAssembly().GetName().Version;
                var response = await _httpClient.GetAsync(ApiUrl);
                response.EnsureSuccessStatusCode();
                _release = JsonConvert.DeserializeObject<GitHubRelease>(await response.Content.ReadAsStringAsync());
                _updateInfo = null;
                _fullChangelog = null;

                if (_release == null)
                {
                    return false;
                }
            
                var latestVersion = ParseVersion(_release.TagName);

                if (latestVersion <= currentVersion)
                {
                    return false;
                }

                _updateInfo = new UpdateReleaseInfo
                {
                    Version = NormalizeVersion(_release.TagName),
                    LatestNotes = NormalizeText(_release.Body)
                };
            
                return true;
            }
            catch (Exception)
            {
                return false;
            }
        }

        public async Task<UpdateReleaseInfo> GetUpdateInfoAsync()
        {
            if (_updateInfo != null)
            {
                return _updateInfo;
            }

            return await CheckForUpdates()
                ? _updateInfo
                : null;
        }

        public async Task<string> GetFullChangelogAsync()
        {
            if (!string.IsNullOrWhiteSpace(_fullChangelog))
            {
                return NormalizeText(_fullChangelog);
            }

            _fullChangelog = await TryLoadFullChangelogAsync();

            return NormalizeText(_fullChangelog);
        }

        public async Task Update()
        {
            if (_release == null)
            {
                throw new Exception("No release found");
            }
            
            var asset = _release.Assets.FirstOrDefault(o => o.Name.EndsWith(".exe"));
            if(asset == null)
            {
                throw new Exception("No asset found");
            }
            
            // download to temp
            var downloadPath = Path.Combine(Path.GetTempPath(), asset.Name);
            
            using(var response = await _httpClient.GetAsync(asset.Url))
            using(var fileStream = File.Create(downloadPath))
            {
                response.EnsureSuccessStatusCode();
                await response.Content.CopyToAsync(fileStream);
            }
            
            ApplyUpdate(downloadPath);
        }
        
        
        
        private static void ApplyUpdate(string filePath)
        {
            try
            {
                var currentExecutable = Assembly.GetExecutingAssembly().Location;
                
                var psCommand = $"Start-Sleep -Seconds 2; " +
                                $"Copy-Item -Path '{filePath}' -Destination '{currentExecutable}' -Force; " +
                                $"Remove-Item -Path '{filePath}' -Force; " +
                                $"Start-Sleep -Seconds 1; " +
                                $"Start-Process -FilePath '{currentExecutable}';";
                
                var startInfo = new ProcessStartInfo
                {
                    FileName = "powershell.exe",
                    Arguments = $"-WindowStyle Hidden -ExecutionPolicy Bypass -Command \"{psCommand}\"",
                    UseShellExecute = true,
                    CreateNoWindow = true,
                    WindowStyle = ProcessWindowStyle.Hidden
                };

                Process.Start(startInfo);
                
                Task.Delay(500).ContinueWith(_ => 
                {
                    App.Shutdown();
                });
            }
            catch (Exception ex)
            {
                throw new Exception($"Update failed: {ex.Message}");
            }
        }

        private static Version ParseVersion(string versionTag)
        {
            return new Version(NormalizeVersion(versionTag));
        }

        private static string NormalizeVersion(string versionTag)
        {
            if (string.IsNullOrWhiteSpace(versionTag))
            {
                throw new ArgumentException("Version tag cannot be empty.", nameof(versionTag));
            }

            return versionTag.Trim().TrimStart('v', 'V');
        }

        private static string NormalizeText(string text)
        {
            if (string.IsNullOrWhiteSpace(text))
            {
                return null;
            }

            return NormalizeLineEndings(text).Trim();
        }

        private static string NormalizeLineEndings(string text)
        {
            return text
                .Replace("\r\n", "\n")
                .Replace('\r', '\n');
        }

        private static async Task<string> TryLoadFullChangelogAsync()
        {
            return await TryBuildReleaseHistoryAsync();
        }

        private static async Task<string> TryBuildReleaseHistoryAsync()
        {
            try
            {
                var response = await _httpClient.GetAsync(ReleasesApiUrl);
                if (!response.IsSuccessStatusCode)
                {
                    return null;
                }

                var releases = JsonConvert.DeserializeObject<GitHubRelease[]>(await response.Content.ReadAsStringAsync());
                if (releases == null || releases.Length == 0)
                {
                    return null;
                }

                return BuildReleaseHistory(releases);
            }
            catch
            {
                return null;
            }
        }

        private static string BuildReleaseHistory(GitHubRelease[] releases)
        {
            var builder = new StringBuilder();

            foreach (var release in releases.Where(item => !string.IsNullOrWhiteSpace(item?.TagName)))
            {
                if (builder.Length > 0)
                {
                    builder.AppendLine();
                    builder.AppendLine();
                }

                builder.Append("## [")
                    .Append(NormalizeVersion(release.TagName))
                    .Append("]");

                if (release.PublishedAt != default(DateTimeOffset))
                {
                    builder.Append(" - ")
                        .Append(release.PublishedAt.UtcDateTime.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture));
                }

                var notes = NormalizeText(release.Body);
                if (string.IsNullOrWhiteSpace(notes))
                {
                    continue;
                }

                builder.AppendLine();
                builder.AppendLine();
                builder.Append(notes);
            }

            return NormalizeText(builder.ToString());
        }
        
    }
}