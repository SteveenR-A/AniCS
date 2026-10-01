# Guía: Cómo Desactivar Suscripciones, Login de Firebase y Enmascaramiento de Servidores

Esta guía explica cómo controlar las características comerciales, el sistema de cuentas en la nube y la visualización de servidores mediante las **Feature Flags** de **AniCS** en [`src/config/features.ts`](file:///c:/dev/AniCS/src/config/features.ts).

---

## ⚡ Configuración Central de Flags (`features.ts`)

Abre el archivo:
📁 **[`src/config/features.ts`](file:///c:/dev/AniCS/src/config/features.ts)**

Allí encontrarás los tres interruptores principales:

```typescript
export const FEATURE_FLAGS = {
  /**
   * 1. SUSCRIPCIÓN VIP / MODO COMERCIAL
   * - false: 100% libre, gratuito y sin limitaciones. Elimina coronas, modales y bloqueos.
   * - true: Activa planes simulados de $3.50/mes, insignia VIP y restricciones académicas.
   */
  SHOW_SUBSCRIPTION: false,

  /**
   * 2. CUENTAS EN LA NUBE Y FIREBASE AUTH
   * - false: Oculta el login de Google, registro de cuenta y barra de cuentas demo en Ajustes.
   * - true: Muestra sincronización con Firebase Auth, login de Google y multicuentas.
   */
  ENABLE_FIREBASE_AUTH: false,

  /**
   * 3. ENMASCARAMIENTO DE SERVIDORES DE VIDEO
   * - false: Muestra el nombre REAL de los servidores (Magi, Desu, Mediafire, Streamwish, Vidhide, etc.).
   * - true: Muestra nombres corporativos/enmascarados ("Servidor Dedicado VIP", "Servidor Alta Velocidad", etc.).
   */
  MASK_SERVERS: false,
};
```

---

## 🎁 Resumen de Comportamiento por Bandera

| Opción | Con `false` (Uso Personal y Libre) | Con `true` (Presentación / Comercial) |
| :--- | :--- | :--- |
| **`SHOW_SUBSCRIPTION`** | **Descargas ilimitadas**, todos los servidores y temas OLED libres, sin insignias de corona en el header o sidebar. | Bloqueo de descargas para usuarios sin VIP simulado, servidores y temas exclusivos con candado. |
| **`ENABLE_FIREBASE_AUTH`** | Oculta crear cuenta, login de Google y cuentas demo. La app funciona de manera 100% privada con perfiles locales. | Habilita autenticación con Firebase, sincronización en Firestore y selector rápido de cuentas demo. |
| **`MASK_SERVERS`** | **Nombres reales**: `Magi`, `Desu`, `Mediafire`, `Streamwish`, `Vidhide`, `Voe`, etc. | **Nombres de infraestructura**: `Servidor Dedicado VIP (1080p Ultra HD)`, `Servidor Alta Velocidad (1080p)`, etc. |

---

## 📱 Novedad Móvil (Android): Selector Desplegable de Fuentes
Para evitar que los botones de **Favoritos** y **Ajustes** queden cortados u ocultos fuera de la pantalla en dispositivos móviles, el selector superior ahora es una lista desplegable compacta:
- Muestra la fuente activa (`[ 📺 Anime ▾ ]`) ocupando únicamente ~85px.
- Al tocarlo, despliega un menú flotante para alternar fluidamente entre **Anime** (JKAnime), **Donghua** (MundoDonghua) y **Respaldo** (OtakusTV).
- Garantiza que todas las acciones del encabezado permanezcan 100% visibles en cualquier resolución.

---

## 🚀 Mejoras de Reproducción Integradas
1. **Pre-consulta paralela de progreso**: Recupera el punto de reanudación desde SQLite mientras se cargan los enlaces del servidor.
2. **Reanudación en `LEVEL_LOADED`**: Salta inmediatamente al segundo guardado al cargar la lista HLS sin esperar fragmentos.
3. **Inicio instantáneo en `FRAG_BUFFERED`**: Comienza la reproducción en cuanto el primer fragmento ingresa al buffer.
4. **Persistencia al cambiar de servidor**: Si cambias de servidor dentro de un capítulo, el video continúa en el mismo segundo exacto.
5. **Fallback automático**: Si un servidor sufre un error de red irrecuperable, conmuta de forma transparente al siguiente servidor.

---

## 🔄 Cómo Volver a Activar Cualquier Función
En cualquier momento puedes reactivar cualquier característica simplemente cambiando su valor a `true` en [`src/config/features.ts`](file:///c:/dev/AniCS/src/config/features.ts). Todo el código subyacente se mantiene intacto.

