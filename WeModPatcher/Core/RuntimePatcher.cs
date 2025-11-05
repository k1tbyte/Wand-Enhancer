using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using WeModPatcher.Models;
using WeModPatcher.Utils;
using WeModPatcher.Utils.Win32;
using WeModPatcher.View.MainWindow;

namespace WeModPatcher.Core
{

    public class RuntimePatcher
    {
        private readonly WeModConfig _config;

        public RuntimePatcher(WeModConfig config)
        {
            _config = config;
        }
        
        
        public void StartProcess()
        {
            if(string.IsNullOrEmpty(_config?.ExecutablePath))
            {
                throw new Exception("Path is not specified");
            }
            
            Common.TryKillProcess(_config.BrandName);
            var startupInfo = new Imports.StartupInfo { cb = Marshal.SizeOf(typeof(Imports.StartupInfo)) };
            if(!Imports.CreateProcessA(_config.ExecutablePath, 
                   null, 
                   IntPtr.Zero, 
                   IntPtr.Zero, 
                   false, Imports.DEBUG_PROCESS, IntPtr.Zero, 
                   null, ref startupInfo, out var processInfo))
            {
                throw new Exception("Failed to create process, error code: " + Marshal.GetLastWin32Error());
            }
            
            var debugEvent = new Imports.DEBUG_EVENT();
            var processIds = new Dictionary<uint, bool>();
            while (Imports.WaitForDebugEvent(ref debugEvent, uint.MaxValue))
            {
                uint continueStatus = Imports.DBG_CONTINUE;
                var code = debugEvent.dwDebugEventCode;
                //  Console.WriteLine("Debug event code: " + code);
                if (code == Imports.CREATE_PROCESS_DEBUG_EVENT)
                {
                    // Console.WriteLine("Spawning process: " + debugEvent.dwProcessId);
                    processIds.Add(debugEvent.dwProcessId, false);
                }
                else if (code == Imports.EXIT_PROCESS_DEBUG_EVENT)
                {
                    processIds.Remove(debugEvent.dwProcessId);
                    
                    if(processIds.Count == 0)
                    {
                        break;
                    }
                }
                else if (code == Imports.EXCEPTION_DEBUG_EVENT)
                {
                    // pass the exception to the process
                    continueStatus = Imports.DBG_EXCEPTION_NOT_HANDLED;
                    
                    var exceptionInfo = Imports.MapUnmanagedStructure<Imports.EXCEPTION_DEBUG_INFO>(debugEvent.Union);
                    //  Console.WriteLine("Exception code: " + exceptionInfo.ExceptionRecord.ExceptionCode);
                    
                    if (exceptionInfo.ExceptionRecord.ExceptionCode == Imports.EXCEPTION_BREAKPOINT && 
                        processIds.TryGetValue(debugEvent.dwProcessId, out var wasPatched) && !wasPatched)
                    {
                        var process = Process.GetProcessById((int)debugEvent.dwProcessId);
                        //    Console.WriteLine("Scanning process: " + process.ProcessName + " " + process.Id);
                        var address = MemoryUtils.ScanVirtualMemory(
                            process.Handle,
                            process.Modules[0].BaseAddress, 
                            process.Modules[0].ModuleMemorySize, 
                            Constants.ExePatchSignature.Sequence, Constants.ExePatchSignature.Mask
                        );
                        
                        if (address != IntPtr.Zero)
                        {
                            processIds[debugEvent.dwProcessId] =  MemoryUtils.SafeWriteVirtualMemory(
                                process.Handle, 
                                address + Constants.ExePatchSignature.Offset,
                                Constants.ExePatchSignature.PatchBytes
                            );
                            
                            /*byte[] patchedBytes = new byte[32];
                            if (Imports.ReadProcessMemory(process.Handle, address, patchedBytes, patchedBytes.Length, out int bytesRead))
                            {
                                Console.WriteLine("Bytes after patching: ");
                                for (int i = 0; i < bytesRead; i++)
                                {
                                    Console.Write($"{patchedBytes[i]:X2} ");
                                }
                                Console.WriteLine();
                            }*/
                        }
                    }
                }
                
                Imports.ContinueDebugEvent(debugEvent.dwProcessId, debugEvent.dwThreadId, continueStatus);
            }

            foreach (var entry in processIds)
            {
                Imports.DebugActiveProcessStop(entry.Key);
            }
            
            Imports.CloseHandle(processInfo.hProcess);
        }
                
        public static void Patch(PatchConfig config, Action<string, ELogType> logger)
        {
            if (config.AppProps == null)
            {
                throw new Exception("Path is not specified");
            }
            
            var parent = Directory.GetParent(config.AppProps.RootDirectory)?.FullName ?? config.AppProps.RootDirectory;
            var latestWeModConfig = config.AutoApplyPatches ? Extensions.FindLatestWeMod(parent) ?? config.AppProps : config.AppProps;

            if (Extensions.CheckWeModPath(latestWeModConfig.RootDirectory) == null)
            {
                throw new Exception("Invalid WeMod path");
            }
            
            if(!File.Exists(Path.Combine(latestWeModConfig.RootDirectory, "resources", "app.asar.backup")))
            {
                config.PatchMethod = EPatchProcessMethod.None;
                new StaticPatcher(latestWeModConfig, logger, config).Patch();
            }
            
            new RuntimePatcher(latestWeModConfig)
                .StartProcess();
        }
        
        
    }
}