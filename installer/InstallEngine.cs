using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Net;
using System.Reflection;
using System.Security.Cryptography;
using System.Text.RegularExpressions;

internal sealed class InstallEngine
{
    internal const string ToolVersion = "2.46.7";
    private const string Extension = "pantalla-letras.js";
    private const string ScriptReference = "extensions/" + Extension;
    private static readonly Version MinSpotify = new Version(1, 2, 14);
    private static readonly Version MaxSpotify = new Version(1, 3, 9);
    private readonly string roaming;
    private readonly string local;
    private readonly string configRoot;
    private readonly string stateRoot;
    private readonly string ini;

    internal InstallEngine(string roaming, string local, string configRoot, string stateRoot)
    {
        this.roaming = roaming;
        this.local = local;
        this.configRoot = Path.GetFullPath(configRoot);
        this.stateRoot = String.IsNullOrWhiteSpace(stateRoot) ? null : Path.GetFullPath(stateRoot);
        ini = Path.Combine(this.configRoot, "config-xpui.ini");
    }

    internal string Run(bool remove, Action<string> status)
    {
        string extensionFile = Path.Combine(configRoot, "Extensions", Extension);
        if (remove && !IsRegistered() && !File.Exists(extensionFile)) return null;

        string spotify = Setting("spotify_path");
        if (String.IsNullOrWhiteSpace(spotify)) spotify = Path.Combine(roaming, "Spotify");
        string executable = Path.Combine(spotify, "Spotify.exe");
        if (!File.Exists(executable))
            throw new InvalidOperationException("Instala y abre Spotify de escritorio desde spotify.com. Este instalador admite la edición de escritorio para Windows.");
        string index = Path.Combine(spotify, "Apps", "xpui", "index.html");
        string liveScript = Path.Combine(spotify, "Apps", "xpui", "extensions", Extension);
        bool patched = File.Exists(index);
        if (!patched && !File.Exists(Path.Combine(spotify, "Apps", "xpui.spa")))
            throw new InvalidOperationException("La instalación de Spotify está incompleta. Abre o repara Spotify antes de volver a intentarlo.");

        string version = FileVersionInfo.GetVersionInfo(executable).ProductVersion;
        Version client = ClientVersion(version);
        if (client == null || client < MinSpotify || client > MaxSpotify)
            throw new InvalidOperationException("Spotify " + (version ?? "sin versión identificable") + " está fuera del rango compatible (1.2.14 a 1.3.9). Espera una versión nueva del instalador.");

        string prefs = Setting("prefs_path");
        if (String.IsNullOrWhiteSpace(prefs)) prefs = Path.Combine(roaming, "Spotify", "prefs");
        string lastVersion = ReadValue(prefs, "app.last-launched-version");
        if (ClientVersion(lastVersion) != client)
            throw new InvalidOperationException("Abre una vez esta instalación de Spotify y vuelve a ejecutar el instalador. La última versión iniciada debe coincidir con la detectada.");
        if (patched && ApiDisabled())
            throw new InvalidOperationException("La instalación de Spicetify no tiene habilitada su interfaz de extensiones. Revisa su configuración antes de continuar.");

        bool refreshOnly = !remove && patched && IsRegistered() && IndexListsExtension(index);
        if (patched && !refreshOnly && Setting("with") != ToolVersion)
            throw new InvalidOperationException("La copia de seguridad pertenece a otra versión de Spicetify. Actualiza y aplica Spicetify antes de ejecutar este instalador.");

        string runtime = PrepareTool(status);
        try
        {
            string tool = Path.Combine(runtime, "spicetify.exe");
            if (!File.Exists(tool)) tool = Directory.GetFiles(runtime, "spicetify.exe", SearchOption.AllDirectories).Single();
            ChangeInstallation(tool, remove, patched, refreshOnly, index, liveScript, extensionFile, status);
        }
        finally
        {
            // This directory was created with a unique name by PrepareTool.
            try { Directory.Delete(runtime, true); } catch (IOException) { } catch (UnauthorizedAccessException) { }
        }
        return executable;
    }

    private void ChangeInstallation(string tool, bool remove, bool patched, bool refreshOnly,
        string index, string liveScript, string extensionFile, Action<string> status)
    {
        byte[] originalConfig = File.Exists(ini) ? File.ReadAllBytes(ini) : null;
        byte[] originalExtension = File.Exists(extensionFile) ? File.ReadAllBytes(extensionFile) : null;
        byte[] script;
        using (var payload = Assembly.GetExecutingAssembly().GetManifestResourceStream("extension.js"))
        using (var bytes = new MemoryStream())
        {
            payload.CopyTo(bytes);
            script = bytes.ToArray();
        }

        bool applying = false;
        bool hasBackup = false;
        try
        {
            if (!patched && !remove)
            {
                status("Preparando la copia de seguridad de Spotify…");
                if (originalConfig == null)
                {
                    RunCli(tool, "config disable_sentry 0 disable_ui_logging 0 remove_rtl_rule 0 " +
                        "home_config 0 experimental_features 0 check_spicetify_update 0 inject_css 0 inject_theme_js 0 replace_colors 0");
                }
                if (ApiDisabled())
                    throw new InvalidOperationException("La configuración actual de Spicetify desactiva su interfaz de extensiones.");
                RunCli(tool, "-n backup");
                hasBackup = true;
            }

            status(remove ? "Quitando Letras en pantalla…" : "Aplicando Letras en pantalla…");
            if (remove)
            {
                if (IsRegistered()) RunCli(tool, "config extensions " + Extension + "-");
                if (patched && IndexListsExtension(index))
                {
                    applying = true;
                    RunCli(tool, "-n apply");
                }
                if (IndexListsExtension(index)) throw new InvalidOperationException("Spotify todavía lista la extensión.");
                if (File.Exists(extensionFile)) File.Delete(extensionFile);
                if (File.Exists(liveScript)) File.Delete(liveScript);
                return;
            }

            Directory.CreateDirectory(Path.GetDirectoryName(extensionFile));
            WriteAtomically(extensionFile, script);
            if (!IsRegistered()) RunCli(tool, "config extensions " + Extension);
            applying = true;
            RunCli(tool, refreshOnly ? "-e -n refresh" : "-n apply");
            string wrapper = Path.Combine(Path.GetDirectoryName(index), "helper", "spicetifyWrapper.js");
            if (!IndexListsExtension(index) || !File.Exists(wrapper) || !File.Exists(liveScript) || !script.SequenceEqual(File.ReadAllBytes(liveScript)))
                throw new InvalidOperationException("No se pudo verificar la extensión en Spotify.");
        }
        catch (Exception original)
        {
            try
            {
                if (applying && hasBackup) RunCli(tool, "-n restore");
                RestoreFile(extensionFile, originalExtension);
                RestoreFile(ini, originalConfig);
                if (applying && patched) RunCli(tool, refreshOnly ? "-e -n refresh" : "-n apply");
            }
            catch (Exception)
            {
                throw new InvalidOperationException(original.Message + " La reversión automática no se completó. Revisa la instalación de Spicetify antes de volver a intentar.");
            }
            throw;
        }
    }

    private string PrepareTool(Action<string> status)
    {
        string cpu = Environment.GetEnvironmentVariable("PROCESSOR_ARCHITEW6432") ?? Environment.GetEnvironmentVariable("PROCESSOR_ARCHITECTURE");
        string platform, digest;
        if (String.Equals(cpu, "ARM64", StringComparison.OrdinalIgnoreCase))
        {
            platform = "arm64";
            digest = "301edfe13f9a6ce7757d36abc975e0dd3b080cd13d24825fae1f8e83c0ccadea";
        }
        else if (Environment.Is64BitOperatingSystem)
        {
            platform = "x64";
            digest = "c5a723d31eae529ba13f6922a7a027124238c7f3da7edd182a73eab03c447e9e";
        }
        else
        {
            platform = "x32";
            digest = "2dc7e44c5e1da5acb2c36c64becba2c5715e4d3e1c790fd5b27fc0926034581e";
        }

        string directory = Path.Combine(local, "LetrasEnPantalla", "Instalador");
        Directory.CreateDirectory(directory);
        string name = "spicetify-" + ToolVersion + "-windows-" + platform + ".zip";
        string archive = Path.Combine(directory, name);
        if (!File.Exists(archive) || !MatchesHash(archive, digest))
        {
            status("Descargando la herramienta oficial de Spicetify…");
            string download = Path.Combine(directory, Guid.NewGuid().ToString("N") + ".download");
            try
            {
                ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
                using (var client = new ReleaseClient())
                    client.DownloadFile("https://github.com/spicetify/cli/releases/download/v" + ToolVersion + "/" + name, download);
                if (!MatchesHash(download, digest)) throw new InvalidOperationException("La descarga de Spicetify no coincide con el SHA-256 de la versión oficial.");
                if (File.Exists(archive)) File.Replace(download, archive, null);
                else File.Move(download, archive);
            }
            catch (WebException)
            {
                throw new InvalidOperationException("No se pudo descargar Spicetify desde GitHub. Comprueba tu conexión y vuelve a intentarlo.");
            }
            finally { File.Delete(download); }
        }

        string runtime = Path.Combine(directory, Guid.NewGuid().ToString("N"));
        using (var stream = File.OpenRead(archive))
        {
            if (!MatchesHash(stream, digest)) throw new InvalidOperationException("El archivo de Spicetify cambió durante la verificación.");
            stream.Position = 0;
            using (var zip = new ZipArchive(stream, ZipArchiveMode.Read)) zip.ExtractToDirectory(runtime);
        }
        return runtime;
    }

    private sealed class ReleaseClient : WebClient
    {
        protected override WebRequest GetWebRequest(Uri address)
        {
            var request = (HttpWebRequest)base.GetWebRequest(address);
            request.Timeout = 35000;
            request.ReadWriteTimeout = 35000;
            request.UserAgent = "LetrasEnPantalla-Setup";
            return request;
        }
    }

    private void RunCli(string tool, string args)
    {
        var start = new ProcessStartInfo(tool, args) {
            WorkingDirectory = Path.GetDirectoryName(tool), UseShellExecute = false, CreateNoWindow = true,
            RedirectStandardOutput = true, RedirectStandardError = true, RedirectStandardInput = true
        };
        start.EnvironmentVariables["APPDATA"] = roaming;
        start.EnvironmentVariables["LOCALAPPDATA"] = local;
        start.EnvironmentVariables["SPICETIFY_CONFIG"] = configRoot;
        if (stateRoot == null) start.EnvironmentVariables.Remove("SPICETIFY_STATE");
        else start.EnvironmentVariables["SPICETIFY_STATE"] = stateRoot;
        using (var process = Process.Start(start))
        {
            process.StandardInput.Close();
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();
            if (!process.WaitForExit(180000))
            {
                process.Kill();
                process.WaitForExit();
                throw new InvalidOperationException("Spicetify tardó más de lo previsto. Cierra Spotify y vuelve a intentar.");
            }
            if (process.ExitCode != 0)
                throw new InvalidOperationException("Spicetify no pudo completar «" + args + "» (código " + process.ExitCode + "). Cierra Spotify y revisa que la versión coincida con la copia de seguridad.");
        }
    }

    private bool IsRegistered()
    {
        return Setting("extensions").Split('|').Any(value => String.Equals(value.Trim(), Extension, StringComparison.OrdinalIgnoreCase));
    }

    private bool ApiDisabled()
    {
        string value = Setting("expose_apis").ToLowerInvariant();
        return value == "0" || value == "false" || value == "no" || value == "off";
    }

    private string Setting(string key) { return ReadValue(ini, key); }

    private static string ReadValue(string file, string key)
    {
        if (!File.Exists(file)) return "";
        foreach (string line in File.ReadLines(file))
        {
            int equals = line.IndexOf('=');
            if (equals >= 0 && String.Equals(line.Substring(0, equals).Trim(), key, StringComparison.OrdinalIgnoreCase))
                return line.Substring(equals + 1).Trim().Trim('"');
        }
        return "";
    }

    private static Version ClientVersion(string value)
    {
        var match = Regex.Match(value ?? "", @"^\d+\.\d+\.\d+");
        Version version;
        return match.Success && Version.TryParse(match.Value, out version) ? version : null;
    }

    private static bool IndexListsExtension(string index)
    {
        return File.Exists(index) && File.ReadAllText(index).Contains(ScriptReference);
    }

    private static void RestoreFile(string path, byte[] content)
    {
        if (content == null) { if (File.Exists(path)) File.Delete(path); }
        else WriteAtomically(path, content);
    }

    private static void WriteAtomically(string path, byte[] content)
    {
        string temporary = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try
        {
            File.WriteAllBytes(temporary, content);
            if (File.Exists(path)) File.Replace(temporary, path, null);
            else File.Move(temporary, path);
        }
        finally { File.Delete(temporary); }
    }

    private static bool MatchesHash(string path, string expected)
    {
        using (var stream = File.OpenRead(path)) return MatchesHash(stream, expected);
    }

    private static bool MatchesHash(Stream stream, string expected)
    {
        using (var hash = SHA256.Create())
            return String.Equals(BitConverter.ToString(hash.ComputeHash(stream)).Replace("-", ""), expected, StringComparison.OrdinalIgnoreCase);
    }
}
