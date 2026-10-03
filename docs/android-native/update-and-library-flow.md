# Actualizaciones y biblioteca compartida

La app nativa usa el asset `AniCS-native.apk` de GitHub Releases. El aviso conserva la publicación y sus notas completas al abrir Ajustes, y desplaza la lista hasta Actualizar AniCS. La descarga muestra bytes y porcentaje, verifica tamaño, hash cuando GitHub lo proporciona, paquete y certificado, y abre el instalador. Si Android solicita permiso para instalar desde AniCS, vuelve al instalador después de concederlo. Si se cancela o deniega, el APK verificado sigue disponible con el botón Instalar.

La comprobación manual permite descargar nuevamente la misma versión. La comprobación automática también detecta un asset de esa versión actualizado después de la instalación actual. Los APK con código interno igual o superior se aceptan; los anteriores se rechazan. Reinstalar conserva los datos solo cuando coinciden paquete y firma.

## Firma de las compilaciones publicadas

`android-native-ci.yml` reutiliza los secretos existentes de Tauri: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` y `ANDROID_KEY_PASSWORD` (con fallback de contraseña a la del almacén). No publica APK debug desde un tag si falta la clave estable. Las compilaciones de prueba sin secretos siguen usando debug y se mantienen separadas de las publicadas.

Los identificadores se mantienen: Tauri `com.anics.app`, nativa release `com.anics.app.preview`, nativa debug `com.anics.app.preview.debug`. Firmar con la misma clave no permite actualizar entre identificadores diferentes. Un APK antiguo firmado por una clave debug efímera tampoco puede recibir una actualización con otra clave: la transición requiere un respaldo e instalación de la variante publicada. No se desinstala la app automáticamente.

## Metadatos y portadas sin importación manual

En Android, Tauri publica automáticamente un manifiesto `Anime/.anics/library.json` al iniciar y al escanear Descargas. Contiene únicamente título, URL del anime, fuente y portada de los animes descargados. Las portadas existentes en su almacenamiento privado se copian a `.anics/covers`; `.nomedia` evita mostrarlas en la galería. Al guardar una portada, Tauri actualiza también este manifiesto. La base SQLite original, perfiles, progreso y credenciales permanecen en el almacenamiento privado.

La app nativa pide acceso a Anime una vez mediante el selector de carpetas. Al abrir Descargas, cambiar de carpeta o buscar videos, lee el manifiesto, convierte las rutas relativas de portada en URI autorizadas y actualiza las entradas existentes sin duplicar los videos ni borrar archivos. Prioriza las portadas locales y completa campos vacíos con los metadatos compartidos. También detecta una copia antigua `anics.db` situada en la raíz de Anime; el selector manual queda como alternativa para copias guardadas en otro lugar.

La recuperación automática desde el almacenamiento privado de una versión antigua de Tauri requiere instalar esta actualización de Tauri y abrirla al menos una vez. Android no permite que la app nativa lea directamente la base privada o las portadas privadas de otro paquete. Si no hay copia compartida ni portada junto al video, no se inventa una correspondencia con un anime diferente.

Referencias: [firma de Android](https://developer.android.com/studio/publish/app-signing), [versiones](https://developer.android.com/studio/publish/versioning), [almacenamiento privado](https://developer.android.com/training/data-storage/app-specific).
