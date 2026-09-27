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
  SHOW_SUBSCRIPTION: false,

  /**
   * Controla el sistema de cuentas en la nube (Firebase Auth, login con Google y registro de usuarios).
   * - true: Muestra login con Google, registro de cuentas, multicuentas y barra de demostración.
   * - false: Oculta por completo el sistema de login y cuentas de Firebase en la interfaz.
   */
  ENABLE_FIREBASE_AUTH: false,

  /**
   * Controla el enmascaramiento de nombres de servidores de video.
   * - true: Muestra nombres corporativos/enmascarados ("Servidor Dedicado VIP", "Servidor Alta Velocidad", etc.)
   * - false: Muestra los nombres reales de los servidores ("Magi", "Desu", "Mediafire", "Streamwish", "Vidhide", etc.)
   */
  MASK_SERVERS: false,

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
