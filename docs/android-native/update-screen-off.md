# Descarga de actualizaciones con la pantalla apagada

La transferencia del APK nativo desde Ajustes no iniciaba un servicio de primer
plano ni adquiría un bloqueo parcial de CPU. Al apagar la pantalla, el sistema
podía suspender el trabajo y cortar la conexión HTTP.

`UpdateRepository.download` ahora inicia `UpdateDownloadService` antes de la
transferencia y lo libera en `finally`, tanto al completar como al fallar o
pausar. El servicio `dataSync` muestra el progreso, usa un `PARTIAL_WAKE_LOCK`
con límite de 30 minutos y nunca mantiene la pantalla encendida. Las sesiones
se identifican por token para que cerrar una transferencia anterior no detenga
la protección de su reemplazo. Al detener o destruir el servicio se libera el
bloqueo inmediatamente.

Se conservan los controles de pausa/reanudación y la verificación de tamaño,
SHA-256, paquete, versión y firma. Este cambio afecta únicamente a Android
nativo; no cambia el reproductor, los episodios descargados ni Tauri.

Pruebas: pantalla apagada con progreso activo, declaración `dataSync`, liberación
al terminar/destruir el servicio, sesiones solapadas y limpieza de la protección
cuando la descarga falla o se pausa. La validación real en un teléfono sigue
pendiente; las políticas adicionales de ahorro de batería del fabricante y el
cierre forzado de la app no se simulan con Robolectric.

Referencias: [servicios de primer plano de Android 14](https://developer.android.com/about/versions/14/changes/fgs-types-required)
y [bloqueos parciales de CPU](https://developer.android.com/develop/background-work/background-tasks/awake/wakelock).
