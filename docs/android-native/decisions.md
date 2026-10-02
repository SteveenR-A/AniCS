# Android nativo — registro inicial de decisiones

Fecha: 2026-10-02. Registro iniciado en P0 y actualizado durante P1. Las propuestas no habilitan código dependiente hasta cerrar su decisión y actualizar las reglas aplicables.

## Referencia y límites

Referencia de ejecución: `.agents/tasks/plan-android-native.md`. Se avanza por partes según indicación del usuario. La arquitectura prevista sigue siendo Kotlin/Compose + Media3 con extractores Rust compartidos; Java instalado se utiliza como JDK de las herramientas Android. La implementación nativa aún no ha comenzado.

## D01 — Proveedor de sincronización

Estado: decisión cerrada en P1; `AGENTS.md` y `.agents/rules/multiplatform-guidelines.md` actualizados al contrato Firestore existente.

Las reglas mencionaban GitHub Gist. El contrato ejecutable de `src/services/syncService.ts` utiliza Firestore, esquema 2 y documento `users/{userId}/sync/data`. `GistSyncModal` es un alias de `CloudSyncModal`, por lo que su nombre no demuestra transporte Gist.

Dirección para el módulo nativo: interoperar con Firestore y sus payloads actuales. Contratos/fixtures en `sync-contracts.md`; las limitaciones existentes se revisarán mediante cambios compatibles independientes antes de P6. Las reglas ya se reconciliaron con ese contrato. No se han conectado cuentas ni realizado escrituras remotas.

## D02 — Reproducción local

Estado: propuesta de excepción nativa pendiente de registro en reglas antes de P4.

Propuesta: Media3 recibe URI/descriptor Android autorizados para archivos de la app o seleccionados mediante SAF. La excepción deberá delimitarse a `android-native/`. La implementación HTTP local actual de Windows y Android Tauri permanece como contrato existente. Si se mantiene HTTP también en nativo, deberá diseñarse y probarse Range antes del reproductor local.

## D03 — Secretos nativos

Estado: dirección propuesta; actualización de reglas y diseño pendientes antes de implementar secretos.

Propuesta: claves Android Keystore y cifrado de nuevos secretos nativos, fuera de Room y preferencias en claro. No migrar credenciales privadas de Tauri implícitamente. La inspección encontró fallback a `sync_config` en `src-tauri/src/storage/secure_store.rs`; esto difiere de la descripción de EncryptedSharedPreferences en AGENTS y requiere revisión independiente del módulo nativo.

## D04 — SDK y matriz de herramientas

Estado: pendiente de evaluación y primera compilación Android.

Instalaciones verificadas: JDK 21.0.12.1 y CLI Kotlin 2.4.20. No se ha detectado SDK/NDK Android. La CI de Android Tauri actual declara JDK 17, NDK 26.1.10909125, build-tools 34.0.0 y plataforma 34; esos valores describen el flujo existente y no se adoptan automáticamente para el nuevo módulo.

`minSdk 26` sigue siendo una propuesta: falta conocer el dispositivo mínimo y evaluar las dependencias elegidas. `compileSdk`, `targetSdk`, Gradle, AGP, Kotlin de Gradle, Compose, Media3, Room, KSP, NDK, UniFFI y cargo-ndk se fijarán como conjunto verificable en P3.

Referencias oficiales consultadas para la futura matriz: [compatibilidad Kotlin/AGP](https://developer.android.com/build/kotlin-support), [AGP 8.13](https://developer.android.com/build/releases/agp-8-13-0-release-notes), [plugin del compilador Compose](https://developer.android.com/develop/ui/compose/setup-compose-dependencies-and-compiler). Esta consulta no equivale a una compilación aprobada.

## D05 — Identidad preview

Estado: decidido para la evaluación, conforme al plan autorizado; implementación pendiente en P3.

Usar `com.anics.app.preview`, nombre `AniCS Native` e icono distinguible. No promover la preview cambiando su applicationId a producción dentro de una actualización. Las authorities deberán derivarse de `${applicationId}`.

## D06 — Assets de distribución

Estado: decidido como dirección de coexistencia; implementación pendiente en P8.

Conservar `AniCS.apk` para Android Tauri y reservar `AniCS-native.apk` para preview nativa. No publicar ambos hasta distinguir variantes en los actualizadores y superar la aceptación del plan. `MobileSettingsPage.tsx` actualmente filtra por extensión `.apk`, de modo que esa selección debe corregirse antes de distribución conjunta.

No se fija todavía firma, versionCode ni publicación. No se ha realizado commit, tag o push en este bloque.
