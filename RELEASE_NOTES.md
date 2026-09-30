# AniCS v0.2.10 — Reproductor, portadas y transmisión en Android

**Fecha de lanzamiento:** 2026-09-29

### Novedades y correcciones

- Botón central de reproducir y pausar con un solo clic o toque, manteniendo el ocultamiento automático de controles.
- Selector de servidores de video personalizados en PC y Android, con cambio de fuente conservando la posición exacta y el estado de reproducción.
- Catálogos personalizados visibles y actualizados en los menús de navegación después de guardarlos.
- Portadas verticales en el historial de PC y Android para mostrar mejor las imágenes de cada anime.
- Soporte inicial de Google Cast en Android con selector nativo y controles de reproducción en televisores compatibles.
- Transmisión DLNA/UPnP en Android, con soporte para videos locales mediante servidor de red con solicitudes HTTP Range.
- Icono de transmisión oculto en PC, incluido el diseño de ventana pequeña.
- Publicación en GitHub Actions con validación previa de versiones y limpieza automática de artefactos temporales después del release.

### Compatibilidad de transmisión

- La opción de transmitir a TV está disponible en Android.
- Google Cast requiere un enlace de video compatible y accesible desde el televisor. Los enlaces que necesitan cookies o cabeceras del sitio pueden fallar.
- Los videos descargados se pueden enviar a televisores que ofrezcan DLNA/UPnP. El envío de archivos locales mediante Google Cast queda pendiente.

---
*Para ver el historial acumulativo completo de todas las versiones, consulta [CHANGELOG.md](./CHANGELOG.md).*
