using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

[assembly: AssemblyTitle("Letras en pantalla")]
[assembly: AssemblyDescription("Instalador de Letras en pantalla para Spotify")]
[assembly: AssemblyCompany("Letras en pantalla contributors")]
[assembly: AssemblyProduct("Letras en pantalla")]

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        bool first;
        using (var mutex = new Mutex(true, @"Local\LetrasEnPantallaSetup", out first))
        {
            if (first) Application.Run(new InstallerWindow());
            else MessageBox.Show("El instalador ya está abierto.", "Letras en pantalla", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
    }
}

internal sealed class InstallerWindow : Form
{
    private readonly InstallEngine engine;
    private readonly Label message;
    private readonly Button install;
    private readonly Button remove;
    private readonly Button launch;
    private readonly ProgressBar progress;
    private bool busy;
    private string spotify;

    internal InstallerWindow()
    {
        string roaming = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        string defaultSpicetify = Path.Combine(roaming, "spicetify");
        engine = new InstallEngine(roaming, local,
            ConfigFolder("SPICETIFY_CONFIG", defaultSpicetify), Environment.GetEnvironmentVariable("SPICETIFY_STATE"));

        Text = "Letras en pantalla";
        ClientSize = new Size(510, 294);
        MinimumSize = Size;
        MaximizeBox = false;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        StartPosition = FormStartPosition.CenterScreen;
        AutoScaleMode = AutoScaleMode.Dpi;
        BackColor = Color.FromArgb(29, 24, 37);
        ForeColor = Color.FromArgb(251, 245, 255);
        Font = new Font("Segoe UI", 10F);

        var layout = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(26, 24, 26, 18), ColumnCount = 1, RowCount = 4 };
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 49F));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 20F));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 50F));
        var title = new Label { Text = "Letras en pantalla", Font = new Font("Segoe UI", 21F, FontStyle.Bold), Dock = DockStyle.Fill, Margin = Padding.Empty };
        message = new Label {
            Text = "Personaliza la vista a pantalla completa de Spotify.\n\nEl instalador verifica la versión y aplica el cambio con Spicetify. Si tienes Spotify abierto, ciérralo y vuelve a abrirlo al terminar.",
            ForeColor = Color.FromArgb(223, 213, 232), Dock = DockStyle.Fill, Margin = Padding.Empty
        };
        progress = new ProgressBar { Dock = DockStyle.Fill, Style = ProgressBarStyle.Marquee, Visible = false, Margin = new Padding(1, 4, 1, 5) };

        var actions = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.RightToLeft, WrapContents = false, Margin = Padding.Empty };
        install = ActionButton("Instalar / actualizar", true);
        remove = ActionButton("Quitar", false);
        launch = ActionButton("Abrir Spotify", true);
        launch.Visible = false;
        install.Click += async (sender, args) => await Change(false);
        remove.Click += async (sender, args) => await Change(true);
        launch.Click += (sender, args) => {
            try { Process.Start(new ProcessStartInfo(spotify) { UseShellExecute = true }); Close(); }
            catch (Exception) { message.Text = "Abre Spotify desde tu acceso habitual para cargar los cambios."; }
        };
        actions.Controls.AddRange(new Control[] { launch, install, remove });
        layout.Controls.Add(title, 0, 0);
        layout.Controls.Add(message, 0, 1);
        layout.Controls.Add(progress, 0, 2);
        layout.Controls.Add(actions, 0, 3);
        Controls.Add(layout);
        AcceptButton = install;
        FormClosing += (sender, args) => { if (busy) args.Cancel = true; };
    }

    private async Task Change(bool uninstall)
    {
        busy = true;
        install.Enabled = remove.Enabled = false;
        progress.Visible = true;
        message.Text = "Comprobando tu instalación de Spotify…";
        var status = new Progress<string>(text => { if (busy) message.Text = text; });
        try
        {
            spotify = await Task.Run(() => engine.Run(uninstall, text => ((IProgress<string>)status).Report(text)));
            if (spotify == null)
            {
                message.Text = "Letras en pantalla ya está desinstalado.";
                return;
            }
            message.Text = uninstall
                ? "Letras en pantalla se quitó de Spotify."
                : "Instalación completada. Abre Spotify y reproduce una canción. Pulsa Pantalla completa en la esquina inferior derecha para ver Letras en pantalla.";
            if (IsSpotifyRunning(spotify)) message.Text += "\n\nCierra Spotify y vuelve a abrirlo cuando puedas.";
            else launch.Visible = true;
            install.Visible = remove.Visible = false;
            AcceptButton = launch.Visible ? launch : null;
        }
        catch (InvalidOperationException error) { message.Text = error.Message; }
        catch (UnauthorizedAccessException) { message.Text = "Windows no dio acceso a la instalación. Cierra Spotify y ejecuta el instalador con la misma cuenta de Windows."; }
        catch (IOException) { message.Text = "No se pudieron actualizar los archivos. Cierra Spotify y comprueba que hay espacio disponible."; }
        finally
        {
            busy = false;
            progress.Visible = false;
            install.Enabled = remove.Enabled = true;
        }
    }

    private static bool IsSpotifyRunning(string executable)
    {
        foreach (Process process in Process.GetProcessesByName("Spotify"))
        {
            using (process)
            {
                try { if (String.Equals(process.MainModule.FileName, executable, StringComparison.OrdinalIgnoreCase)) return true; }
                catch (System.ComponentModel.Win32Exception) { }
                catch (InvalidOperationException) { }
            }
        }
        return false;
    }

    private static string ConfigFolder(string variable, string fallback)
    {
        string value = Environment.GetEnvironmentVariable(variable);
        return String.IsNullOrWhiteSpace(value) ? fallback : value;
    }

    private static Button ActionButton(string text, bool primary)
    {
        var button = new Button { Text = text, AutoSize = true, MinimumSize = new Size(86, 36), FlatStyle = FlatStyle.Flat,
            Padding = new Padding(13, 0, 13, 0), Margin = new Padding(7, 6, 0, 0), UseVisualStyleBackColor = false,
            BackColor = primary ? Color.FromArgb(236, 217, 249) : Color.FromArgb(49, 40, 59),
            ForeColor = primary ? Color.FromArgb(33, 22, 44) : Color.FromArgb(249, 240, 253) };
        button.FlatAppearance.BorderSize = 0;
        return button;
    }
}
