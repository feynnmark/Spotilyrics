# Seguridad y privacidad

El instalador descarga la versión fija de Spicetify indicada en el código desde su publicación oficial. Verifica el SHA-256 del ZIP antes de extraerlo o ejecutar la herramienta. La carpeta de trabajo se crea en el perfil de Windows de quien lo ejecuta. El instalador comprueba la versión de Spotify y utiliza la copia de seguridad de la CLI antes de aplicar el complemento.

Letras en pantalla usa la sesión local de Spotify sin solicitar credenciales. El código de la extensión no incluye telemetría propia. Lee las letras que muestra Spotify, los datos de la canción actual y su portada. La consulta opcional para obtener una portada más grande envía a Spotify la dirección pública del álbum sin cookies. Las preferencias y el estado de la bienvenida se guardan en el cliente.

Para reportar una vulnerabilidad, usa la opción **Report a vulnerability** en la pestaña Security del repositorio si está habilitada. Describe las versiones afectadas y cómo reproducirla con datos de prueba. Redacta identificadores, rutas de tu perfil y cualquier información de sesión antes de compartir capturas o registros.
