using System;
using System.Diagnostics;
using WandEnhancer.Core;

namespace WandEnhancer.Utils
{
    public static class FirewallHelper
    {
        public const string DefaultRuleName = "Wand Remote Panel";
        public const int DefaultPort = 3223;

        /// <summary>
        /// Checks whether an inbound Windows Firewall rule exists for the specified rule name.
        /// </summary>
        public static bool IsRulePresent(string ruleName = DefaultRuleName)
        {
            try
            {
                var psi = new ProcessStartInfo("netsh", $"advfirewall firewall show rule name=\"{ruleName}\"")
                {
                    CreateNoWindow = true,
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true
                };

                using (var process = Process.Start(psi))
                {
                    if (process == null) return false;
                    string output = process.StandardOutput.ReadToEnd();
                    if (!process.WaitForExit(3000))
                    {
                        try { process.Kill(); } catch { }
                        return false;
                    }
                    return process.ExitCode == 0 && output.IndexOf(ruleName, StringComparison.OrdinalIgnoreCase) >= 0;
                }
            }
            catch
            {
                return false;
            }
        }

        /// <summary>
        /// Adds an inbound Windows Firewall rule allowing TCP traffic on the remote panel port.
        /// Uses UAC elevation when necessary.
        /// </summary>
        public static bool AddFirewallRule(int port = DefaultPort, string ruleName = DefaultRuleName, Action<string, ELogType> logger = null)
        {
            try
            {
                if (IsRulePresent(ruleName))
                {
                    logger?.Invoke($"Windows Firewall rule '{ruleName}' is already active for port {port}.", ELogType.Success);
                    return true;
                }

                logger?.Invoke($"Configuring Windows Firewall to allow inbound TCP on port {port}...", ELogType.Info);

                var psi = new ProcessStartInfo
                {
                    FileName = "netsh",
                    Arguments = $"advfirewall firewall add rule name=\"{ruleName}\" dir=in action=allow protocol=TCP localport={port}",
                    Verb = "runas",
                    UseShellExecute = true,
                    CreateNoWindow = true,
                    WindowStyle = ProcessWindowStyle.Hidden
                };

                using (var process = Process.Start(psi))
                {
                    if (process == null)
                    {
                        logger?.Invoke("Failed to launch firewall configuration process.", ELogType.Error);
                        return false;
                    }

                    if (!process.WaitForExit(10000))
                    {
                        logger?.Invoke("Firewall configuration process timed out.", ELogType.Warn);
                        return IsRulePresent(ruleName);
                    }

                    if (process.ExitCode == 0 || IsRulePresent(ruleName))
                    {
                        logger?.Invoke($"Firewall rule '{ruleName}' created successfully. Remote panel port {port} is now accessible.", ELogType.Success);
                        return true;
                    }

                    logger?.Invoke($"Firewall command exited with code {process.ExitCode}.", ELogType.Warn);
                    return false;
                }
            }
            catch (System.ComponentModel.Win32Exception)
            {
                logger?.Invoke("Firewall rule configuration was cancelled (administrator privileges required).", ELogType.Warn);
                return false;
            }
            catch (Exception ex)
            {
                logger?.Invoke($"Failed to configure firewall: {ex.Message}", ELogType.Error);
                return false;
            }
        }

        /// <summary>
        /// Removes the inbound Windows Firewall rule if present.
        /// </summary>
        public static bool RemoveFirewallRule(string ruleName = DefaultRuleName, Action<string, ELogType> logger = null)
        {
            try
            {
                if (!IsRulePresent(ruleName))
                {
                    return true;
                }

                var psi = new ProcessStartInfo
                {
                    FileName = "netsh",
                    Arguments = $"advfirewall firewall delete rule name=\"{ruleName}\"",
                    Verb = "runas",
                    UseShellExecute = true,
                    CreateNoWindow = true,
                    WindowStyle = ProcessWindowStyle.Hidden
                };

                using (var process = Process.Start(psi))
                {
                    if (process == null) return false;
                    process.WaitForExit(10000);
                    logger?.Invoke($"Firewall rule '{ruleName}' removed.", ELogType.Info);
                    return true;
                }
            }
            catch (Exception ex)
            {
                logger?.Invoke($"Failed to remove firewall rule: {ex.Message}", ELogType.Warn);
                return false;
            }
        }
    }
}

