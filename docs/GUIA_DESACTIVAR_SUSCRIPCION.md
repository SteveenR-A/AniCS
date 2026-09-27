# Guía: Cómo Desactivar Suscripción VIP, Cuentas en la Nube y Enmascaramiento

Este documento explica de forma rápida y sencilla cómo desactivar por completo el sistema de suscripción simulado de **Yumework VIP / AniCS Pro**, las cuentas de Firebase y el enmascaramiento de servidores, devolviendo la aplicación a su estado **100% personal, gratuito, privado y sin intermediarios comerciales**.

---

## 🚀 Método Inmediato (Flags de Configuración)

Abre el archivo de configuración:
📁 [`src/config/features.ts`](file:///c:/Documentos/AniCS/src/config/features.ts)

Ajusta los valores según tu preferencia:

```typescript
export const FEATURE_FLAGS = {
  // 1. Suscripción VIP (false = app 100% libre, sin coronas, sin bloqueos de descarga ni temas)
  SHOW_SUBSCRIPTION: false,

  // 2. Cuentas Firebase (false = oculta login de Google, registro y cuentas demo)
  ENABLE_FIREBASE_AUTH: false,

  // 3. Servidores (false = muestra nombres reales: Magi, Desu, Mediafire, Streamwish, etc.)
  MASK_SERVERS: false,

  COMPANY_NAME: 'Yumework',
  VIP_MONTHLY_PRICE: 3.50,
  VIP_ANNUAL_PRICE: 35.00,
};
```

---

## 🔍 ¿Qué Ocurre al Establecer los Valores en `false`?

1. **Barra Lateral y Encabezado:** El botón y la insignia de corona VIP desaparecen inmediatamente de la interfaz de escritorio y móvil.
2. **Descargas y Temas:** Las descargas por lotes y todos los temas visuales (OLED, Kanagawa, Tokyo, etc.) quedan desbloqueados y accesibles para todos los usuarios.
3. **Cuentas en la Nube:** Se ocultan las opciones de inicio de sesión con Google y creación de cuentas, permitiendo usar AniCS de forma 100% privada con perfiles locales.
4. **Nombres de Servidores:** El reproductor muestra los nombres auténticos de los servidores de video (`Magi`, `Desu`, `Mediafire`, `Streamwish`, `Vidhide`, `Filemoon`, `Voe`), facilitando saber qué fuente estás reproduciendo.
5. **Rendimiento:** No hay impacto en la base de datos local SQLite ni en las descargas; la app funciona como reproductor y catálogo libre y fluido.

---

## 🔄 Para Volver a Activar Cualquier Función

Si en el futuro deseas realizar una nueva presentación o reactivar las cuentas en la nube:
```typescript
SHOW_SUBSCRIPTION: true, // Reactiva flujo de suscripción simulado
ENABLE_FIREBASE_AUTH: true, // Reactiva login con Google y cuentas Firebase
MASK_SERVERS: true, // Reactiva enmascaramiento de servidores a nombres CDN
```
Todo el código y la arquitectura backend continúan intactos en el repositorio y se activan al instante.

