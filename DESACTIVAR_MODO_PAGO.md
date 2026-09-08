# Guía: Cómo Desactivar el Modo de Pago y Suscripción (Uso Libre y Gratuito)

Esta guía explica cómo desactivar completamente todas las restricciones comerciales y pantallas de suscripción una vez finalizada la presentación académica de **Yumework**, dejando **AniCS 100% libre, gratuito y sin limitaciones**.

---

## ⚡ Desactivación en 1 Solo Paso

Abre el archivo de configuración de flags de la aplicación:

📁 **Ruta del archivo:**
[`src/config/features.ts`](file:///c:/Documentos/AniCS/src/config/features.ts)

Localiza la variable `SHOW_SUBSCRIPTION` y cámbiala a `false`:

```typescript
export const FEATURE_FLAGS = {
  /**
   * Controla la visualización del módulo y flujo de suscripción VIP / AniCS Pro.
   * - true: Muestra botones "Yumework VIP", planes de pago simulados y restricciones.
   * - false: Desbloquea TODO inmediatamente y elimina cualquier rastro comercial.
   */
  SHOW_SUBSCRIPTION: false, // <-- Cambiar aquí a false
```

Guarda el archivo. ¡Listo! La aplicación se recargará automáticamente y desbloqueará todas las funciones.

---

## 🎁 ¿Qué ocurre al poner `SHOW_SUBSCRIPTION: false`?

| Característica | Con `SHOW_SUBSCRIPTION: true` (Presentación) | Con `SHOW_SUBSCRIPTION: false` (Uso Personal) |
| :--- | :--- | :--- |
| **Descargas Offline** | Bloqueadas para usuarios sin VIP simulado | **100% Habilitadas e ilimitadas** para todos los capítulos |
| **Servidores de Video** | Magi y Desu exclusivos con etiqueta VIP | **Todos los servidores disponibles** libremente (Magi, Desu, etc.) |
| **Sincronización en la Nube** | Requiere suscripción VIP activa | **100% Habilitada** con Google Auth o correo electrónico |
| **Temas Visuales** | Temas OLED, Kanagawa, Cyberpunk y Tokyo bloqueados | **Todos los temas desbloqueados** con 1 clic |
| **Tarjetas y Botones VIP** | Visibles en Ajustes, Sidebar, Header y Reproductor | **Completamente ocultos**, interfaz limpia y minimalista |

---

## 👥 Cuentas de Demostración para la Presentación (Multicuentas)

Para la defensa académica y demostración en vivo, se han creado y configurado dos cuentas reales en **Firebase Auth y Firestore** (`anics-20677`):

| Tipo de Cuenta | Correo Electrónico | Contraseña | Estado en Firestore | Comportamiento |
| :--- | :--- | :--- | :--- | :--- |
| 👑 **Cuenta VIP / Pro** | `vip@anics.app` | `AniCSVip2026!` | `isVip: true` (`annual`) | Acceso a todos los temas exclusivos, descargas en lote/individuales, servidores premium (Magi, Desu) y sincronización en la nube. |
| 👤 **Cuenta Estándar / Gratis** | `gratis@anics.app` | `AniCSFree2026!` | `isVip: false` | Solo temas **Oscuro** y **Claro**; servidores premium y descargas bloqueados; solicita suscripción para sincronización. |

### ⚡ Barra de Prueba Rápida en Ajustes
Tanto en **Escritorio** como en **Móvil** (Ajustes -> Cuentas), encontrarás la barra:
- **[👑 Probar Cuenta VIP]**: Inicia sesión automáticamente con `vip@anics.app` y desbloquea todas las funciones Pro en tiempo real.
- **[👤 Probar Cuenta Gratis]**: Cambia al instante a `gratis@anics.app`, **bloquea inmediatamente todos los accesos Pro** y, si el usuario tenía activo un tema exclusivo, revierte automáticamente al tema **Oscuro** predeterminado.
- **[Gestionar...]**: Abre el modal de cuentas vinculadas para agregar cuentas con Google Auth o correo electrónico propio.

---

## 🔄 Cómo volver a activarlo para otra demostración

Si en algún momento necesitas volver a presentar el proyecto a profesores, evaluadores o inversionistas:

1. Vuelve a cambiar `SHOW_SUBSCRIPTION: true` en [`src/config/features.ts`](file:///c:/Documentos/AniCS/src/config/features.ts).
2. Para probar el flujo de compra, haz clic en "Suscribirme" en cualquier tarjeta; el sistema simulará el cobro y activará la cuenta inmediatamente con almacenamiento local persistente.
3. Utiliza la barra de multicuentas para alternar entre la cuenta gratuita y la cuenta VIP y demostrar la reactividad de la arquitectura.
