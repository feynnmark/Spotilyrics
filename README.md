# Letras en pantalla

Extensión para Spicetify que amplía las letras de Spotify y añade una vista a pantalla completa con una barra de reproducción translúcida. Elige **Portada**, **Ambas** o **Letra**. El fondo toma sus colores de la carátula y cambia cuando cambia el álbum.

## Instalar en Windows

1. Comprueba que tu versión de Spotify está dentro del rango que admite tu versión de [Spicetify](https://github.com/spicetify/cli/releases).
2. Extrae el ZIP y abre **Instalar.cmd**. El instalador registra la extensión y aplica los cambios con Spicetify sin reiniciar la aplicación. Cuando puedas interrumpir la música, cierra Spotify y ábrelo de nuevo.
3. Reproduce una canción. Pulsa el botón **Letras en pantalla** cerca de la barra de reproducción o el botón de pantalla completa de Spotify.

El instalador también se puede ejecutar desde una terminal. Ejecuta `.\Instalar.cmd /s` para omitir la pausa final. La extensión funciona con tu sesión habitual de Spotify.

### Instalar manualmente

Copia `pantalla-letras.js` a la carpeta `Extensions` de Spicetify. Ejecuta estos comandos y vuelve a abrir Spotify cuando quieras.

```powershell
spicetify config extensions pantalla-letras.js
spicetify backup apply --no-restart
```

## Usar la extensión

- El verso activo se destaca y se desplaza con la sincronización que Spotify trae para esa pista. Haz clic en un verso cuando Spotify permita buscar su posición. Una letra sin marcas de tiempo se muestra para lectura estática.
- Desactiva **Seguir letra** para leer a tu ritmo. Girar la rueda sobre los versos también detiene el seguimiento.
- La carátula conserva sus proporciones. La extensión intenta cargar la variante de 640 píxeles del CDN. Si el cliente solo entrega una miniatura, busca la portada del álbum en el oEmbed público de Spotify y conserva la miniatura si falla la consulta.
- En **Ajustes**, elige el fondo y el tamaño de letra. También puedes desactivar el efecto vidrio y el desplazamiento suave, conservar la vista normal de letras de Spotify y devolver el botón nativo de pantalla completa a su función original. **Letras en pantalla** sigue disponible como botón independiente.
- Pulsa **Esc** o el botón de salida para volver a Spotify. Si el cliente rechaza el modo de pantalla completa del sistema, la vista ocupa su ventana.
- La disponibilidad y los tiempos de las letras dependen de la pista, la cuenta y la interfaz de Spotify. Si una actualización de Spotify cambia esa interfaz, puede aparecer la portada con un aviso de que falta la letra. El reproductor sigue disponible.

## Rendimiento y privacidad

La extensión usa un archivo JavaScript sin dependencias de ejecución. Fuera de la pantalla completa, se limita al botón, los estilos de la vista normal y un controlador de clics. Al cerrar o pasar a un anuncio, desmonta la vista y desconecta sus observadores y eventos de reproducción. **Portada** deja de observar las letras. La ventana oculta suspende sus observadores. El fondo usa una muestra de 16 × 16 píxeles por portada y la transición respeta la preferencia de movimiento reducido del sistema.

Solo lee las letras que Spotify ya dibuja y mantiene su atribución cuando el cliente la muestra. La portada usa el CDN de Spotify y la búsqueda opcional de una imagen mayor envía únicamente la dirección pública del álbum a Spotify. Guarda las preferencias de apariencia en el cliente. Las letras y portadas pertenecen a sus titulares.

## Quitar la extensión

```powershell
spicetify config extensions pantalla-letras.js-
spicetify apply --no-restart
```

Vuelve a abrir Spotify al terminar. Si quieres eliminar el archivo, bórralo de Extensions. Las otras extensiones se conservan.

Este proyecto es independiente de Spotify y Apple. Consulta la documentación de [extensiones de Spicetify](https://spicetify.app/docs/development/extensions) antes de usarlo con una versión diferente del cliente.
