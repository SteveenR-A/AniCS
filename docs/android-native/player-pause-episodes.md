# Pantalla en pausa y selector de episodios

Cambios preparados el 9 de octubre de 2026 para el reproductor Kotlin de Android.

## Comportamiento

- Se eliminan el flag permanente de la ventana y el `keepScreenOn = true` del
  `PlayerView`. La vista Compose mantiene la pantalla encendida mientras se
  reproduce o se está cargando con intención de reproducir. Pausar, incluso
  durante buffering, permite que Android aplique su tiempo de apagado normal.
- Al pasar a segundo plano se libera la petición; al salir se restaura el estado
  anterior de la vista. Los paneles modales siguen la misma política.
- En horizontal, Episodios abre un panel lateral derecho de hasta 360 dp,
  ajustado al alto disponible y a los márgenes seguros de la pantalla. En vertical
  usa una hoja inferior. Ambos conservan una lista desplazable y un cierre explícito.
- Filas compactas, título opcional en una segunda línea, indicador del episodio
  actual y marca de visto. Al abrir se muestra el actual junto al episodio anterior.
  Una lista vacía informa que no hay episodios disponibles.

No se modifica el reproductor Tauri, el escritorio, las descargas ni la versión
de la aplicación. Rama local: `fix/android-player-pause-episodes`.

## Validación

- `npm run build`: correcto, con los avisos existentes de tamaño de chunks e
  imports estáticos/dinámicos. Comprueba el frontend Tauri, no compila Kotlin.
- `git diff --check`: correcto.
- Nuevas pruebas Android: política de pantalla durante pausa/buffering/error/final,
  actualización de la vista al pausar, segundo plano y desmontaje; selector vertical
  con episodio actual y cierre. Se amplía la prueba horizontal existente para
  comprobar el indicador actual y ancho del panel, además de seleccionar el último episodio.
- Las pruebas Android **no se ejecutaron**: Gradle no pudo descargar su distribución
  (`Network is unreachable`). Este entorno solo dispone de JDK 17 y no tiene SDK
  Android; el proyecto requiere JDK 21. No se genera APK ni captura verificada.
- `cargo check` y `cargo test` no pudieron ejecutarse: falta `cargo`. No hay cambios
  en Rust.

Con SDK Android y JDK 21, ejecutar desde `android-native`:

```bash
bash gradlew :app:testDebugUnitTest --tests com.anics.nativeapp.PlayerScreenAwakeTest --tests com.anics.nativeapp.NativeUiRegressionTest
bash gradlew :app:assembleDebug
```

## Comprobación en teléfono pendiente

1. Configurar un tiempo corto de apagado. Reproducir y esperar: la pantalla debe
   seguir encendida. Pausar y esperar: debe apagarse según ese tiempo, sin apagado forzado.
2. Repetir pausando durante buffering, con controles bloqueados y con Episodios
   abierto. Reanudar debe recuperar la petición de pantalla encendida.
3. Probar archivos locales y streaming; comprobar final, error, salida y segundo plano.
4. Abrir Episodios en ambas orientaciones, girar con el panel abierto y usar texto
   ampliado. El episodio actual y la última fila deben quedar accesibles; probar
   selección, cierre, botón Atrás y toque fuera del panel.

Los cambios no se han subido a GitHub ni instalado en el teléfono.
