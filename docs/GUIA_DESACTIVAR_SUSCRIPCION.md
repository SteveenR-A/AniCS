# Guía: Cómo Desactivar la Suscripción VIP tras la Presentación

Este documento explica de forma rápida y sencilla cómo desactivar por completo el sistema de suscripción simulado de **Yumework VIP / AniCS Pro** una vez concluida la presentación académica, devolviendo la aplicación a su estado **100% personal, gratuito y sin fines comerciales**.

---

## 🚀 Método Inmediato (1 Solo Paso)

Abre el archivo de configuración:
📁 [`src/config/features.ts`](file:///c:/Documentos/AniCS/src/config/features.ts)

Cambia el valor de `SHOW_SUBSCRIPTION` a `false`:

```typescript
export const FEATURE_FLAGS = {
  /**
   * Cambiado a false para uso personal y 100% gratuito
   */
  SHOW_SUBSCRIPTION: false, // <-- Cambiar aquí
  
  COMPANY_NAME: 'Yumework',
  VIP_MONTHLY_PRICE: 3.50,
  VIP_ANNUAL_PRICE: 35.00,
};
```

---

## 🔍 ¿Qué Ocurre al Establecer `SHOW_SUBSCRIPTION: false`?

1. **Barra Lateral y Navegación:** El botón y banner promocional de "AniCS VIP" desaparecen inmediatamente de la interfaz de escritorio y móvil.
2. **Ajustes y Configuración:** Se oculta la tarjeta de "Gestión de Suscripción" y la mención de facturación.
3. **Modales de Pago:** Quedan completamente deshabilitados y no se pueden invocar.
4. **Perfiles:** Todos los perfiles operan en modo estándar completo sin restricciones ni avisos de actualización de plan.
5. **Rendimiento:** No hay impacto en la base de datos local SQLite ni en las descargas; la app funciona como reproductor y catálogo libre y fluido.

---

## 🔄 Para Volver a Activar (si necesitas presentar nuevamente)

Simplemente vuelve a cambiar el valor:
```typescript
SHOW_SUBSCRIPTION: true,
```
Y guarda el archivo.
