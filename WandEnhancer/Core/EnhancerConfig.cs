using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;
using WandEnhancer.Models;

namespace WandEnhancer.Core
{
    public static class EnhancerConfig
    {
        public class ResolveContext
        {
            public string Placeholder { get; set; }
            public Func<string, string> Handler { get; set; }
        }

        public class PatchEntry
        {
            public Regex Target { get; set; }
            public string Patch { get; set; }
            public Func<Match, string> PatchFactory { get; set; }
            public string Name { get; set; }
            public bool Applied { get; set; }
            public bool SingleMatch { get; set; } = true;
            public string[] CandidateFileNames { get; set; }
            public string[] SearchHints { get; set; }
            public ResolveContext Resolver { get; set; }
        }

        private static string RequireGroup(Match match, string groupName, string patchName)
        {
            var group = match.Groups[groupName];
            if (!group.Success || string.IsNullOrEmpty(group.Value))
            {
                throw new Exception($"{patchName} failed to resolve {groupName}");
            }

            return group.Value;
        }

        private static string RequirePattern(string source, string pattern, string groupName, string patchName)
        {
            var match = Regex.Match(source, pattern, RegexOptions.Singleline);
            return RequireGroup(match, groupName, patchName);
        }

        private static string BuildSetAccountLanguagePatch(Match match)
        {
            var parameters = RequireGroup(match, "params", "setAccountLanguage");
            var expr = RequireGroup(match, "expr", "setAccountLanguage");
            return $"setAccountLanguage({parameters}){{return ({expr}).then(response=>{{response&&\"object\"==typeof response&&(response.subscription={{period:\"yearly\",state:\"active\"}});return response;}})}}";
        }

        private static string BuildSetAccountReducerPatch(Match match)
        {
            var decl = RequireGroup(match, "decl", "setAccountReducer");
            var fn = RequireGroup(match, "fn", "setAccountReducer");
            var parameters = RequireGroup(match, "params", "setAccountReducer");
            var state = RequireGroup(match, "state", "setAccountReducer");
            var account = RequireGroup(match, "account", "setAccountReducer");
            return
                $"const {decl}=\"ACTION_SET_ACCOUNT\";function {fn}({parameters}){{const a={account}&&\"object\"==typeof {account}?{{...{account},subscription:{{period:\"yearly\",state:\"active\"}}}}:{account};return{{...{state},account:a}}}}";
        }

        private static string BuildRemoteBridgeResetPatch(Match match)
        {
            var source = match.Value;
            var method = RequireGroup(match, "method", "remoteBridgeReset");
            var disposableField = RequirePattern(source, @"this\.(?<disposable>#[\w$]+)\s*&&\s*\(\s*this\.\k<disposable>\.dispose\(\)", "disposable", "remoteBridgeReset");
            var instanceField = RequirePattern(source, @"this\.(?<instance>#[\w$]+)\s*=\s*Date\.now\(\)\.toString\(\)", "instance", "remoteBridgeReset");
            var trainerIdField = RequirePattern(source, @"Date\.now\(\)\.toString\(\)\s*\)?\s*,\s*\(?\s*this\.(?<trainerId>#[\w$]+)\s*=\s*null", "trainerId", "remoteBridgeReset");
            var supportedVersionsField = RequirePattern(source, @"this\.(?<versions>#[\w$]+)\s*=\s*\[\]", "versions", "remoteBridgeReset");
            var trainerField = RequirePattern(source, @"this\.(?<versions>#[\w$]+)\s*=\s*\[\]\s*\)?\s*,\s*\(?\s*this\.(?<trainer>#[\w$]+)\s*=\s*null", "trainer", "remoteBridgeReset");

            return $"{method}(){{this.{disposableField}&&(this.{disposableField}.dispose(),this.{disposableField}=null),this.{instanceField}=Date.now().toString(),this.{trainerIdField}=null,this.{supportedVersionsField}=[],this.{trainerField}=null,this.__wandRemoteTrainerInfo=null,this.__wandRemoteBridge?.sync(null)}}";
        }

        private static string BuildRemoteBridgeSyncSnapshotPatch(Match match)
        {
            var source = match.Value;
            var method = RequireGroup(match, "method", "remoteBridgeSyncSnapshot");
            var statusAlias = RequirePattern(source, @"this\.status\s*===\s*(?<value>[\w$]+)\.Connected", "value", "remoteBridgeSyncSnapshot");
            var trainerField = RequirePattern(source, @"this\.(?<trainer>#[\w$]+)\?\.\s*getMetadata\s*\(\s*(?<metadata>[\w$]+\.[\w$]+)\s*\)\?\.\s*gameVersion", "trainer", "remoteBridgeSyncSnapshot");
            var metadataExport = RequirePattern(source, @"this\.(?<trainer>#[\w$]+)\?\.\s*getMetadata\s*\(\s*(?<metadata>[\w$]+\.[\w$]+)\s*\)\?\.\s*gameVersion", "metadata", "remoteBridgeSyncSnapshot");
            var notesField = RequirePattern(source, @"this\.(?<notes>#[\w$]+)\s*\[\s*this\.(?<trainerId>#[\w$]+)\s*\?\?\s*""""\s*\]", "notes", "remoteBridgeSyncSnapshot");
            var trainerIdField = RequirePattern(source, @"this\.(?<notes>#[\w$]+)\s*\[\s*this\.(?<trainerId>#[\w$]+)\s*\?\?\s*""""\s*\]", "trainerId", "remoteBridgeSyncSnapshot");
            var gameField = RequirePattern(source, @"this\.(?<game>#[\w$]+)\s*&&.*?getPreferredInstallationInfo\s*\(\s*this\.\k<game>\s*\)", "game", "remoteBridgeSyncSnapshot");
            var installationField = RequirePattern(source, @"this\.(?<game>#[\w$]+)\s*&&.*?this\.(?<installation>#[\w$]+)\.getPreferredInstallationInfo\s*\(\s*this\.\k<game>\s*\)", "installation", "remoteBridgeSyncSnapshot");
            var supportedVersionsField = RequirePattern(source, @"!\s*this\.(?<versions>#[\w$]+)\.includes\s*\(\s*[\w$]+\.version\s*\)", "versions", "remoteBridgeSyncSnapshot");
            var remoteChannelField = RequirePattern(source, @"this\.(?<remote>#[\w$]+)\?\.\s*send\s*\(\s*""client-state""", "remote", "remoteBridgeSyncSnapshot");
            var valuesMethod = RequirePattern(source, @"values\s*:\s*this\.(?<values>#[\w$]+)\s*\(\s*\)", "values", "remoteBridgeSyncSnapshot");
            var instanceField = RequirePattern(source, @"instanceId\s*:\s*this\.(?<instance>#[\w$]+)", "instance", "remoteBridgeSyncSnapshot");
            var themeField = RequirePattern(source, @"themeId\s*:\s*this\.(?<theme>#[\w$]+)", "theme", "remoteBridgeSyncSnapshot");
            var settingsHelper = RequirePattern(source, @"settings\s*:\s*(?<settings>[\w$]+)\s*\(\s*this\.settings\s*\)", "settings", "remoteBridgeSyncSnapshot");
            var languageField = RequirePattern(source, @"language\s*:\s*this\.(?<language>#[\w$]+)", "language", "remoteBridgeSyncSnapshot");
            var timerField = RequirePattern(source, @"isTimeLimitExpired\s*:\s*""expired""\s*===\s*this\.(?<timer>#[\w$]+)\.timerState", "timer", "remoteBridgeSyncSnapshot");

            return $"{method}(){{let e,t=!1,s=this.{trainerField}?.getMetadata({metadataExport})?.gameVersion??null,o=!1;const n=this.{notesField}[this.{trainerIdField}??\"\"]||null;this.{gameField}&&(e=this.{installationField}.getPreferredInstallationInfo(this.{gameField}),e.app&&(t=!0,s??=e.version??null,o=\"number\"==typeof e.version&&!this.{supportedVersionsField}.includes(e.version)));this.status==={statusAlias}.Connected&&this.{remoteChannelField}?.send(\"client-state\",{{instanceId:this.{instanceField},trainerId:this.{trainerIdField},trainerLoading:this.{trainerField}?.isLoading(),gameInstalled:t,gameVersion:s,needsCompatibilityWarning:o,values:this.{valuesMethod}(),themeId:this.{themeField},settings:{settingsHelper}(this.settings),language:this.{languageField},accountUuid:this.account.uuid,notesReadHash:n,isTimeLimitExpired:\"expired\"===this.{timerField}.timerState}});this.__wandRemoteBridge?.sync({{instanceId:this.{instanceField},trainerId:this.{trainerIdField},trainerInfo:this.__wandRemoteTrainerInfo??null,metadata:this.{trainerField}?.getMetadata({metadataExport})??null,trainerLoading:this.{trainerField}?.isLoading()??false,gameInstalled:t,gameVersion:s,needsCompatibilityWarning:o,language:this.{languageField},themeId:this.{themeField},notesReadHash:n,isTimeLimitExpired:\"expired\"===this.{timerField}.timerState,values:this.{valuesMethod}()}})}}";
        }

        public static Dictionary<EPatchType, PatchEntry[]> GetInstance()
        {
            return new Dictionary<EPatchType, PatchEntry[]>()
            {
                {
                    EPatchType.ActivatePro,
                    new[]
                    {
                        new PatchEntry
                        {
                            SearchHints = new[] { "getUserAccount()", "/v3/account" },
                            Resolver = new ResolveContext
                            {
                                Handler = (targetFunction) =>
                                {
                                    var fetchMatch = Regex.Match(targetFunction, @"return\s+this\.#(\w+)\.fetch");
                                    return fetchMatch.Success ? fetchMatch.Groups[1].Value : null;
                                },
                                Placeholder = "<service_name>"
                            },
                            Name = "getUserAccount",
                            Target = new Regex(@"getUserAccount\(\)\{.*?return\s+this\.#\w+\.fetch\(\{.*?\}\)\}",
                                RegexOptions.Singleline),
                            Patch =
                                "getUserAccount(){return this.#<service_name>.fetch({endpoint:\"/v3/account\",method:\"GET\",name:\"/v3/account\",collectMetrics:0}).then(response=>{response.subscription={period:\"yearly\",state:\"active\"};return response;})}"
                        },
                        new PatchEntry
                        {
                            SearchHints = new[] { "setAccountWandBrandExperience()", "/v3/account/brand_experience_wand" },
                            Resolver = new ResolveContext
                            {
                                Handler = (targetFunction) =>
                                {
                                    var match = Regex.Match(targetFunction, @"return\s+this\.#(\w+)\.post");
                                    return match.Success ? match.Groups[1].Value : null;
                                },
                                Placeholder = "<service_name>"
                            },
                            Name = "setAccountWandBrandExperience",
                            Target = new Regex(
                                @"setAccountWandBrandExperience\(\)\{.*?return\s+this\.#\w+\.post\(""/v3/account/brand_experience_wand""\)\}",
                                RegexOptions.Singleline),
                            Patch =
                                "setAccountWandBrandExperience(){return this.#<service_name>.post(\"/v3/account/brand_experience_wand\").then(response=>{response.subscription={period:\"yearly\",state:\"active\"};return response;})}"
                        },
                        new PatchEntry
                        {
                            // Account-returning endpoint the original patches missed: changing
                            // language dispatches its (non-Pro) response into the store and
                            // wiped Pro. Wrap the result the same way. Param names are captured
                            // so the rewritten body keeps the real argument identifiers.
                            Name = "setAccountLanguage",
                            SearchHints = new[] { "setAccountLanguage(", "/v3/account/language" },
                            Target = new Regex(
                                @"setAccountLanguage\((?<params>[^)]*)\)\{\s*return\s+(?<expr>this\.#\w+\.post\(""/v3/account/language"",\{[^}]*\}\))\s*;?\s*\}",
                                RegexOptions.Singleline),
                            PatchFactory = BuildSetAccountLanguagePatch
                        },
                        new PatchEntry
                        {
                            // Last-resort guard: any code path that dispatches ACTION_SET_ACCOUNT
                            // (periodic refreshAccount, push updates, profile edits, etc.) must keep
                            // subscription on the store object even when it bypasses the account API
                            // service methods patched above.
                            Name = "setAccountReducer",
                            SearchHints = new[] { "ACTION_SET_ACCOUNT" },
                            Target = new Regex(
                                @"const (?<decl>\w+)=""ACTION_SET_ACCOUNT"";function (?<fn>\w+)\((?<params>[^)]*)\)\{return\{\.\.\.(?<state>\w+),account:(?<account>\w+)\}\}",
                                RegexOptions.Singleline),
                            PatchFactory = BuildSetAccountReducerPatch
                        },
                        new PatchEntry
                        {
                            // Wand's native "connect phone" pairing (POST /v3/auth/remote_code)
                            // triggers a server-side device handoff that deauthorizes this desktop
                            // session - the reported "entered the mobile activation key and got
                            // signed out" bug. Neutralize the code issuer so native pairing can
                            // never start. The injected remote panel is independent of this flow
                            // (IPC bridge, not Wand's Pusher pairing) and keeps working. The
                            // rejection is swallowed by the caller's try/catch (renders no code).
                            Name = "disableNativeRemotePairing",
                            SearchHints = new[] { "requestRemoteAuthCode", "/v3/auth/remote_code" },
                            Target = new Regex(@"requestRemoteAuthCode\(\)\{return this\.#[\w$]+\.post\(""/v3/auth/remote_code""\)\}"),
                            Patch = "requestRemoteAuthCode(){return Promise.reject(new Error(\"wand-enhancer: native mobile pairing disabled\"))}"
                        }
                    }
                },
                {
                    EPatchType.DisableUpdates,
                    new[]
                    {
                        // Regex consumes 4 closing parens (`)))) `); the 5th (registerHandler's own close)
                        // remains in the original file after replacement. Patch must end with 3 parens — NOT 4.
                        new PatchEntry
                        {
                            CandidateFileNames = new[] { "index.js" },
                            SearchHints = new[] { "ACTION_CHECK_FOR_UPDATE" },
                            Target = new Regex(@"registerHandler\(""ACTION_CHECK_FOR_UPDATE"".*?\)\)\)\)",
                                RegexOptions.Singleline),
                            Patch = "registerHandler(\"ACTION_CHECK_FOR_UPDATE\",(e=>expectUpdateFeedUrl(e,(e=>null)))"
                        }
                    }
                },
                {
                    EPatchType.DevToolsOnF12,
                    new[]
                    {
                        new PatchEntry
                        {
                            Name = "devToolsBeforeInputEvent",
                            CandidateFileNames = new[] { "index.js" },
                            SearchHints = new[] { "whenReady().then(" },
                            // Anchor on the Electron main-process `<app>.whenReady().then(`
                            // call. This site is far more stable than the minified renderer
                            // keydown listener that previously held the F12 -> ACTION_OPEN_DEV_TOOLS
                            // dispatch (its identifiers and shape change on every Wand release).
                            // We attach a `before-input-event` hook to every BrowserWindow's
                            // webContents which toggles DevTools on F12 directly from the main
                            // process, bypassing the renderer dispatcher entirely.
                            Target = new Regex(@"(?<app>\w+)\.whenReady\(\)\.then\("),
                            Patch = "${app}.on(\"browser-window-created\",((_,w)=>{try{w.webContents.on(\"before-input-event\",((_,i)=>{if(\"F12\"===i.key&&\"keyDown\"===i.type){w.webContents.isDevToolsOpened()?w.webContents.closeDevTools():w.webContents.openDevTools({mode:\"detach\"})}}))}catch(e){}})),${app}.whenReady().then("
                        }
                    }
                },
                {
                    EPatchType.RemoteWebPanelPreview,
                    new[]
                    {
                        new PatchEntry
                        {
                            Name = "remoteBridgeMainBoot",
                            CandidateFileNames = new[] { "index.js" },
                            SearchHints = new[] { "whenReady().then(run)" },
                            Target = new Regex(@"(?<app>\w+)\.whenReady\(\)\.then\(run\)"),
                            Patch = "${app}.whenReady().then(()=>{try{const p=require(\"node:path\");require(p.join(__dirname,\"remote-panel\",\"bridge.cjs\")).installWandRuntime(require(\"electron\"));}catch(e){try{const fs=require(\"node:fs\"),os=require(\"node:os\"),p=require(\"node:path\");fs.appendFileSync(p.join(os.tmpdir(),\"wand-remote-bridge.log\"),\"[\"+new Date().toISOString()+\"] [boot-error] \"+(e&&e.stack||e)+\"\\n\");}catch(_){}}return run()})"
                        },
                        new PatchEntry
                        {
                            Name = "remoteBridgeReset",
                            SearchHints = new[] { "client-state" },
                            Target = new Regex(@"(?<method>#[\w$]+)\(\)\s*\{\s*(?<body>(?:(?!__wandRemoteBridge|}\s*#[\w$]+\(\)).)*?Date\.now\(\)\.toString\(\)(?:(?!__wandRemoteBridge|}\s*#[\w$]+\(\)).)*?\[\](?:(?!__wandRemoteBridge|}\s*#[\w$]+\(\)).)*?)\s*\}\s*(?=#[\w$]+\(\)\s*\{\s*if\s*\(\s*this\.status\s*===\s*[\w$]+\.Connected\s*\).*?""client-state"")",
                                RegexOptions.Singleline),
                            PatchFactory = BuildRemoteBridgeResetPatch
                        },
                        new PatchEntry
                        {
                            Name = "remoteBridgeSyncSnapshot",
                            SearchHints = new[] { "client-state" },
                            Target = new Regex(@"(?<method>#[\w$]+)\(\)\s*\{\s*if\s*\(\s*this\.status\s*===\s*[\w$]+\.Connected\s*\)\s*\{(?<body>.*?""client-state"".*?isTimeLimitExpired\s*:\s*""expired""\s*===\s*this\.\#[\w$]+\.timerState.*?\)\s*;?\s*\)?\s*;?)\s*\}\s*\}(?=\s*#[\w$]+\(\)\s*\{\s*if\s*\(\s*!this\.\#[\w$]+\?\.\s*isActive\(\)\s*\)\s*return\s*null)",
                                RegexOptions.Singleline),
                            PatchFactory = BuildRemoteBridgeSyncSnapshotPatch
                        },
                        new PatchEntry
                        {
                            // Inject the bridge init + setHandler right after the method's opening
                            // brace; the rest of setCurrentTrainer is left untouched. Only `${trainer}`
                            // (active-trainer field) and `${remoteSource}` (value-source enum, taken
                            // via lookahead from the sole `e.source!==` site) vary between builds and
                            // are resolved from the match — nothing is hardcoded.
                            Name = "remoteBridgeBindHandler",
                            SearchHints = new[] { "client-state" },
                            Target = new Regex(@"(?<head>setCurrentTrainer\(e,t=null\)\{)(?=const s=e\?\.trainerId\|\|null,i=\(s\?e\?\.gameId:null\)\|\|null,n=\(s\?e\?\.supportedVersions:null\)\|\|\[\];if\(s===this\.#[\w$]+&&t===this\.(?<trainer>#[\w$]+)\)return;)(?=.*?e\.source!==(?<remoteSource>[\w$]+\.[\w$]+\.Remote))",
                                RegexOptions.Singleline),
                            Patch = "${head}this.__wandRemoteBridge||(this.__wandRemoteBridge=(()=>{try{const r=globalThis.require||require;const{ipcRenderer:c}=r(\"electron\");try{c.invoke(\"wand-remote-url\").then((u=>{u&&(globalThis.__wandRemoteBridgeUrl=u)}))}catch(e){}const send=(ch,p)=>{try{return c.invoke(ch,p&&JSON.parse(JSON.stringify(p)))}catch(e){}};return{sync:(s)=>send(\"wand-remote-sync\",s),valueChanged:(s)=>send(\"wand-remote-value-changed\",s),setHandler:(h)=>{if(this.__wandRemoteBridgeBound)return;this.__wandRemoteBridgeBound=true;try{c.invoke(\"wand-remote-set-handler-bind\")}catch(e){}c.on(\"wand-remote-set-value\",(_e,req)=>{try{h(req)}catch(e){}})}}}catch(e){try{const r=globalThis.require||require,fs=r(\"node:fs\"),os=r(\"node:os\"),p=r(\"node:path\");fs.appendFileSync(p.join(os.tmpdir(),\"wand-remote-bridge.log\"),\"[\"+new Date().toISOString()+\"] [renderer-bind-error] \"+(e&&e.stack||e)+\"\\n\");}catch(_){}return null}})());this.__wandRemoteBridge?.setHandler((e=>{if(!this.${trainer}||!e?.target)return!1;return this.${trainer}.isActive()?this.${trainer}.setValue(e.target,e.value,${remoteSource},e.cheatId):!1}));this.__wandRemoteTrainerInfo=e??null;"
                        },
                        new PatchEntry
                        {
                            // Pure insertion: splice one `valueChanged` bridge call in after the
                            // existing `client-value-changed` send, before the onValueSet callback
                            // closes. Resolves no private names — `${head}`/`${tail}` carry the
                            // original text verbatim. trainerId is omitted from the payload;
                            // bridge-state falls back to the active snapshot trainer.
                            Name = "remoteBridgeValueDelta",
                            SearchHints = new[] { "client-value-changed" },
                            Target = new Regex(@"(?<head>#[\w$]+\(e,t\)\{t\.push\(e\.onValueSet\(e=>\{this\.status===[\w$]+\.Connected&&e\.source!==[\w$]+\.[\w$]+\.Remote&&this\.#[\w$]+\?\.send\(""client-value-changed"",\{instanceId:this\.#[\w$]+,name:e\.name,value:e\.value,cheatId:e\.cheatId\}\))(?<tail>\}\)\),this\.#[\w$]+\(\)\})"),
                            Patch = "${head},this.__wandRemoteBridge?.valueChanged({target:e.name,value:e.value,oldValue:e.oldValue,source:String(e.source??\"desktop\"),cheatId:e.cheatId})${tail}"
                        }
                    }
                }
            };
        }
    }
}
