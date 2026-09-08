/**
 * AniCS Feature Flags
 * 
 * Permite alternar funcionalidades entre la versión de presentación académica (Yumework)
 * y la versión personal y 100% gratuita.
 */
export const FEATURE_FLAGS = {
  /**
   * Controla la visualización del módulo y flujo de suscripción VIP / AniCS Pro.
   * - true: Muestra botones "AniCS VIP", planes de $3.50/mes y modal de pago simulado.
   * - false: Oculta por completo cualquier rastro comercial, dejando la app 100% gratuita y personal.
   */
  SHOW_SUBSCRIPTION: true,

  /**
   * Nombre de la marca corporativa para la presentación académica.
   */
  COMPANY_NAME: 'Yumework',
  
  /**
   * Precio de referencia mensual de la suscripción VIP (en USD).
   */
  VIP_MONTHLY_PRICE: 3.50,
  
  /**
   * Precio de referencia anual de la suscripción VIP (en USD).
   */
  VIP_ANNUAL_PRICE: 35.00,
};
