using System;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using WandEnhancer.Core;
using WandEnhancer.Models;

namespace WandEnhancer.Utils
{
    public static class DiagnosticsHelper
    {
        public static void RunSystemDiagnostics(WeModConfig config, Action<string, ELogType> log)
        {
            if (log == null) return;

            log("=== [DIAGNOSTICS] Starting System Health & Environment Check ===", ELogType.Info);

            // 1. WeMod Installation Check
            if (config == null || string.IsNullOrEmpty(config.RootDirectory))
            {
                log("[-] Installation: WeMod installation folder was not detected.", ELogType.Error);
                log("    Please select your WeMod folder using the top directory picker.", ELogType.Warn);
            }
            else
            {
                log($"[+] Installation: Found at '{config.RootDirectory}' (Brand: {config.BrandName})", ELogType.Success);

                string exePath = config.ExecutablePath;
                if (File.Exists(exePath))
                {
                    var fileInfo = new FileInfo(exePath);
                    log($"[+] Executable: {config.ExecutableName} ({fileInfo.Length / 1024 / 1024} MB)", ELogType.Success);
                }
                else
                {
                    log($"[-] Executable: Missing at '{exePath}'", ELogType.Error);
                }

                // Check app.asar
                string asarPath = Path.Combine(config.RootDirectory, "resources", "app.asar");
                if (File.Exists(asarPath))
                {
                    var asarInfo = new FileInfo(asarPath);
                    log($"[+] ASAR Archive: app.asar found ({asarInfo.Length / 1024 / 1024} MB)", ELogType.Success);

                    // Check write permissions on app.asar
                    try
                    {
                        using (var fs = new FileStream(asarPath, FileMode.Open, FileAccess.ReadWrite, FileShare.ReadWrite))
                        {
                            log("[+] Permissions: app.asar is writable (not locked by any process)", ELogType.Success);
                        }
                    }
                    catch (Exception ex)
                    {
                        log($"[!] Warning: app.asar is locked or not writable ({ex.Message}). Close WeMod if running.", ELogType.Warn);
                    }
                }
                else
                {
                    log($"[-] ASAR Archive: app.asar is missing at '{asarPath}'", ELogType.Error);
                }

                // Check backup status
                bool isPatched = Enhancer.IsPatched(config.RootDirectory);
                bool hasBackup = Enhancer.HasBackup(config.RootDirectory);
                log($"[*] Patch Status: Patched = {isPatched}, Backup Available = {hasBackup}", ELogType.Info);
            }

            // 2. Active Processes Check
            try
            {
                bool weModRunning = System.Diagnostics.Process.GetProcessesByName("WeMod").Any() ||
                                    System.Diagnostics.Process.GetProcessesByName("Wand").Any();
                if (weModRunning)
                {
                    log("[!] WeMod Process: Currently RUNNING in the background. It must be closed before applying patches.", ELogType.Warn);
                }
                else
                {
                    log("[+] WeMod Process: Not running (safe to patch)", ELogType.Success);
                }
            }
            catch { }

            // 3. Network & Remote Panel Port Check
            int remotePort = FirewallHelper.DefaultPort;
            try
            {
                var ipGlobal = IPGlobalProperties.GetIPGlobalProperties();
                var listeners = ipGlobal.GetActiveTcpListeners();
                bool portInUse = listeners.Any(ep => ep.Port == remotePort);

                if (portInUse)
                {
                    log($"[*] Port {remotePort}: Currently in use (an existing bridge or service is listening).", ELogType.Info);
                }
                else
                {
                    log($"[+] Port {remotePort}: Available for Remote Web Panel.", ELogType.Success);
                }
            }
            catch (Exception ex)
            {
                log($"[!] Could not verify port {remotePort} status: {ex.Message}", ELogType.Warn);
            }

            // 4. List Candidate Local IPs
            try
            {
                var interfaces = NetworkInterface.GetAllNetworkInterfaces()
                    .Where(ni => ni.OperationalStatus == OperationalStatus.Up &&
                                 ni.NetworkInterfaceType != NetworkInterfaceType.Loopback)
                    .ToList();

                log("[*] Detected Network Interfaces for Phone Remote Connection:", ELogType.Info);
                foreach (var iface in interfaces)
                {
                    var props = iface.GetIPProperties();
                    foreach (var addr in props.UnicastAddresses)
                    {
                        if (addr.Address.AddressFamily == AddressFamily.InterNetwork)
                        {
                            log($"    - {iface.Name} ({iface.Description}): http://{addr.Address}:{remotePort}/remote/", ELogType.Info);
                        }
                    }
                }
            }
            catch { }

            // 5. Firewall Rule Check
            bool fwRule = FirewallHelper.IsRulePresent();
            if (fwRule)
            {
                log("[+] Windows Firewall: Rule for port 3223 is ACTIVE.", ELogType.Success);
            }
            else
            {
                log("[!] Windows Firewall: Inbound rule for port 3223 is NOT configured.", ELogType.Warn);
                log("    Tip: Use Settings -> Configure Firewall to allow phone connection.", ELogType.Info);
            }

            log("=== [DIAGNOSTICS] Diagnostic Check Finished ===", ELogType.Info);
        }
    }
}

