import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Crown,
  Check,
  Zap,
  CreditCard,
  ShieldCheck,
  X,
  Sparkles,
  RefreshCw,
  AlertCircle,
  Clock,
  ArrowRight,
  XCircle,
} from 'lucide-react';
import { useSubscriptionStore, SUBSCRIPTION_PLANS } from '@/stores/useSubscriptionStore';
import { useSyncStore } from '@/stores/useSyncStore';
import { FEATURE_FLAGS } from '@/config/features';

export const SubscriptionModal: React.FC = () => {
  const {
    isVip,
    activePlan,
    expiresAt,
    isModalOpen,
    closeModal,
    activateSubscription,
    cancelSubscription,
  } = useSubscriptionStore();

  const userId = useSyncStore((s) => s.config.userId);

  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'annual'>('annual');
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'paypal'>('card');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  const [cardHolder, setCardHolder] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  if (!FEATURE_FLAGS.SHOW_SUBSCRIPTION || !isModalOpen) return null;

  const currentPlan = SUBSCRIPTION_PLANS.find((p) => p.id === selectedPlan)!;

  const handleSubmitPayment = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (paymentMethod === 'card') {
      if (cardNumber.replace(/\s/g, '').length < 15) {
        setErrorMsg('Por favor ingresa un número de tarjeta válido (16 dígitos).');
        return;
      }
      if (!cardExpiry.includes('/')) {
        setErrorMsg('Fecha de expiración inválida (formato MM/AA).');
        return;
      }
      if (cardCvc.length < 3) {
        setErrorMsg('Código CVC inválido (3 dígitos).');
        return;
      }
    }

    setIsProcessing(true);
    setTimeout(async () => {
      await activateSubscription(selectedPlan, userId);
      setIsProcessing(false);
      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        closeModal();
      }, 2500);
    }, 1400);
  };

  const handleCardNumberChange = (val: string) => {
    const raw = val.replace(/\D/g, '').slice(0, 16);
    const formatted = raw.replace(/(\d{4})/g, '$1 ').trim();
    setCardNumber(formatted);
  };

  const handleExpiryChange = (val: string) => {
    const raw = val.replace(/\D/g, '').slice(0, 4);
    if (raw.length >= 3) {
      setCardExpiry(`${raw.slice(0, 2)}/${raw.slice(2)}`);
    } else {
      setCardExpiry(raw);
    }
  };

  return (
    <AnimatePresence>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 10000,
          background: 'rgba(0, 0, 0, 0.85)',
          backdropFilter: 'blur(12px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
        }}
        onClick={closeModal}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 16 }}
          transition={{ duration: 0.22 }}
          onClick={(e) => e.stopPropagation()}
          style={{
            width: '100%',
            maxWidth: '680px',
            maxHeight: '92vh',
            background: 'var(--bg-surface, #111318)',
            border: '1px solid rgba(245, 158, 11, 0.35)',
            borderRadius: '24px',
            boxShadow: '0 30px 70px -15px rgba(245, 158, 11, 0.25), 0 25px 60px -15px rgba(0,0,0,0.9)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Header con gradiente VIP */}
          <div
            style={{
              padding: '24px 28px',
              background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.18), rgba(217, 119, 6, 0.08), rgba(17, 19, 24, 0.9))',
              borderBottom: '1px solid rgba(245, 158, 11, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div
                style={{
                  width: '46px',
                  height: '46px',
                  borderRadius: '14px',
                  background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 6px 18px rgba(245, 158, 11, 0.4)',
                  flexShrink: 0,
                }}
              >
                <Crown size={26} color="#ffffff" />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h3 style={{ margin: 0, fontSize: '19px', fontWeight: 800, color: '#fff', letterSpacing: '-0.01em' }}>
                    Yumework VIP
                  </h3>
                  <span
                    style={{
                      background: 'linear-gradient(135deg, #f59e0b, #fbbf24)',
                      color: '#000',
                      fontSize: '11px',
                      fontWeight: 800,
                      padding: '2px 8px',
                      borderRadius: '9999px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    AniCS Pro
                  </span>
                </div>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#fbbf24' }}>
                  Servidores dedicados de alta velocidad y descargas sin límite
                </p>
              </div>
            </div>

            <button
              onClick={closeModal}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-secondary, #94a3b8)',
                cursor: 'pointer',
                padding: '8px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={20} />
            </button>
          </div>

          {/* Modal Body */}
          <div style={{ padding: '24px 28px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '22px' }}>
            {isSuccess ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                style={{
                  textAlign: 'center',
                  padding: '40px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '16px',
                }}
              >
                <div
                  style={{
                    width: '72px',
                    height: '72px',
                    borderRadius: '50%',
                    background: 'rgba(245, 158, 11, 0.2)',
                    border: '2px solid #f59e0b',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#f59e0b',
                  }}
                >
                  <Sparkles size={36} />
                </div>
                <h4 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#fff' }}>
                  ¡Bienvenido a Yumework VIP!
                </h4>
                <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary, #94a3b8)', maxWidth: '420px' }}>
                  Tu cuenta ha sido mejorada exitosamente. Ahora disfrutas de streaming y descargas en máxima velocidad y prioridad en la nube.
                </p>
              </motion.div>
            ) : isVip ? (
              /* Ya es VIP */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div
                  style={{
                    padding: '20px',
                    borderRadius: '16px',
                    background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(0,0,0,0.3))',
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <Crown size={32} color="#fbbf24" />
                    <div>
                      <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#fff' }}>
                        Membresía VIP Activa
                      </h4>
                      <p style={{ margin: '3px 0 0', fontSize: '13px', color: '#fbbf24' }}>
                        Plan {activePlan === 'annual' ? 'Anual' : 'Mensual'} (Renovación: {expiresAt ? new Date(expiresAt).toLocaleDateString() : 'Activa'})
                      </p>
                    </div>
                  </div>

                  <span
                    style={{
                      background: 'rgba(16, 185, 129, 0.2)',
                      color: '#34d399',
                      fontSize: '12px',
                      fontWeight: 700,
                      padding: '4px 10px',
                      borderRadius: '8px',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                    }}
                  >
                    Activo
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <h5 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary, #94a3b8)', textTransform: 'uppercase' }}>
                    Beneficios Activos
                  </h5>
                  {SUBSCRIPTION_PLANS[0].features.map((feat, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: '#fff' }}>
                      <Check size={16} color="#fbbf24" style={{ flexShrink: 0 }} />
                      <span>{feat}</span>
                    </div>
                  ))}
                </div>

                {/* Botón y Diálogo de Cancelación de Suscripción */}
                {!showCancelConfirm ? (
                  <button
                    type="button"
                    onClick={() => setShowCancelConfirm(true)}
                    style={{
                      marginTop: '10px',
                      padding: '12px',
                      borderRadius: '12px',
                      background: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.25)',
                      color: '#f87171',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                    }}
                  >
                    <XCircle size={16} />
                    Cancelar Membresía VIP
                  </button>
                ) : (
                  <div
                    style={{
                      marginTop: '10px',
                      padding: '14px 16px',
                      borderRadius: '12px',
                      background: 'rgba(239, 68, 68, 0.12)',
                      border: '1px solid rgba(239, 68, 68, 0.35)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                    }}
                  >
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#fca5a5' }}>
                      ¿Estás seguro de que deseas cancelar tu suscripción?
                    </div>
                    <p style={{ margin: 0, fontSize: '12px', color: '#e2e8f0', lineHeight: 1.4 }}>
                      Al cancelar, perderás el acceso a los servidores exclusivos de alta velocidad (Magi, Desu), las descargas en lote y la sincronización en la nube.
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px' }}>
                      <button
                        type="button"
                        disabled={isCancelling}
                        onClick={async () => {
                          setIsCancelling(true);
                          try {
                            await cancelSubscription(userId);
                            setShowCancelConfirm(false);
                            closeModal();
                          } finally {
                            setIsCancelling(false);
                          }
                        }}
                        style={{
                          padding: '8px 14px',
                          borderRadius: '8px',
                          background: '#dc2626',
                          border: 'none',
                          color: '#fff',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: isCancelling ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {isCancelling ? 'Cancelando...' : 'Sí, confirmar cancelación'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowCancelConfirm(false)}
                        style={{
                          padding: '8px 14px',
                          borderRadius: '8px',
                          background: 'rgba(255, 255, 255, 0.08)',
                          border: '1px solid rgba(255, 255, 255, 0.15)',
                          color: '#cbd5e1',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Mantener suscripción
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Flujo de Suscripción */
              <>
                {/* Selector de Planes */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  {SUBSCRIPTION_PLANS.map((plan) => {
                    const isSelected = selectedPlan === plan.id;
                    return (
                      <div
                        key={plan.id}
                        onClick={() => setSelectedPlan(plan.id)}
                        style={{
                          padding: '18px',
                          borderRadius: '16px',
                          background: isSelected
                            ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(245, 158, 11, 0.05))'
                            : 'var(--bg-surface-2, #181b22)',
                          border: isSelected
                            ? '2px solid #f59e0b'
                            : '1px solid var(--border-moderate, rgba(255, 255, 255, 0.1))',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '10px',
                          position: 'relative',
                          transition: 'all 0.2s',
                          boxShadow: isSelected ? '0 4px 16px rgba(245, 158, 11, 0.2)' : 'none',
                        }}
                      >
                        {plan.popular && (
                          <span
                            style={{
                              position: 'absolute',
                              top: '-10px',
                              right: '14px',
                              background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                              color: '#000',
                              fontSize: '10px',
                              fontWeight: 800,
                              padding: '2px 8px',
                              borderRadius: '9999px',
                              textTransform: 'uppercase',
                              letterSpacing: '0.04em',
                            }}
                          >
                            Recomendado (Ahorra 17%)
                          </span>
                        )}

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#fff' }}>
                            {plan.id === 'monthly' ? 'Mensual' : 'Anual'}
                          </h4>
                          <div
                            style={{
                              width: '18px',
                              height: '18px',
                              borderRadius: '50%',
                              border: isSelected ? '5px solid #f59e0b' : '2px solid rgba(255, 255, 255, 0.3)',
                              background: '#fff',
                            }}
                          />
                        </div>

                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                          <span style={{ fontSize: '26px', fontWeight: 800, color: isSelected ? '#fbbf24' : '#fff' }}>
                            {plan.price}
                          </span>
                          <span style={{ fontSize: '12px', color: 'var(--text-secondary, #94a3b8)' }}>
                            {plan.period}
                          </span>
                        </div>

                        <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted, #94a3b8)', lineHeight: 1.3 }}>
                          {plan.description}
                        </p>
                      </div>
                    );
                  })}
                </div>

                {/* Lista de beneficios del plan seleccionado */}
                <div
                  style={{
                    padding: '16px',
                    borderRadius: '14px',
                    background: 'rgba(245, 158, 11, 0.05)',
                    border: '1px solid rgba(245, 158, 11, 0.15)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Beneficios del Plan
                  </span>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    {currentPlan.features.map((feat, idx) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#f1f5f9' }}>
                        <Check size={14} color="#f59e0b" style={{ flexShrink: 0 }} />
                        <span>{feat}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Formulario de Pago */}
                <form onSubmit={handleSubmitPayment} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>
                      Método de Pago (Simulación de Checkout)
                    </span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('card')}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '8px',
                          background: paymentMethod === 'card' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255,255,255,0.05)',
                          border: paymentMethod === 'card' ? '1px solid #f59e0b' : '1px solid rgba(255,255,255,0.1)',
                          color: paymentMethod === 'card' ? '#fbbf24' : 'var(--text-secondary, #94a3b8)',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <CreditCard size={14} /> Tarjeta
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('paypal')}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '8px',
                          background: paymentMethod === 'paypal' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255,255,255,0.05)',
                          border: paymentMethod === 'paypal' ? '1px solid #3b82f6' : '1px solid rgba(255,255,255,0.1)',
                          color: paymentMethod === 'paypal' ? '#60a5fa' : 'var(--text-secondary, #94a3b8)',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        PayPal
                      </button>
                    </div>
                  </div>

                  {errorMsg && (
                    <div
                      style={{
                        padding: '10px 14px',
                        borderRadius: '10px',
                        background: 'rgba(239, 68, 68, 0.12)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        color: '#f87171',
                        fontSize: '12px',
                      }}
                    >
                      <AlertCircle size={16} />
                      <span>{errorMsg}</span>
                    </div>
                  )}

                  {paymentMethod === 'card' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <input
                        type="text"
                        value={cardNumber}
                        onChange={(e) => handleCardNumberChange(e.target.value)}
                        placeholder="Número de Tarjeta (ej. 4532 0123 4567 8901)"
                        required
                        style={{
                          width: '100%',
                          height: '42px',
                          padding: '0 14px',
                          borderRadius: '10px',
                          background: 'var(--bg-surface-2, #181b22)',
                          border: '1px solid var(--border-moderate, rgba(255, 255, 255, 0.12))',
                          color: '#fff',
                          fontSize: '13px',
                          outline: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                        <input
                          type="text"
                          value={cardHolder}
                          onChange={(e) => setCardHolder(e.target.value)}
                          placeholder="Titular de la tarjeta"
                          required
                          style={{
                            height: '42px',
                            padding: '0 14px',
                            borderRadius: '10px',
                            background: 'var(--bg-surface-2, #181b22)',
                            border: '1px solid var(--border-moderate, rgba(255, 255, 255, 0.12))',
                            color: '#fff',
                            fontSize: '13px',
                            outline: 'none',
                            boxSizing: 'border-box',
                          }}
                        />
                        <input
                          type="text"
                          value={cardExpiry}
                          onChange={(e) => handleExpiryChange(e.target.value)}
                          placeholder="MM / AA"
                          required
                          style={{
                            height: '42px',
                            padding: '0 14px',
                            borderRadius: '10px',
                            background: 'var(--bg-surface-2, #181b22)',
                            border: '1px solid var(--border-moderate, rgba(255, 255, 255, 0.12))',
                            color: '#fff',
                            fontSize: '13px',
                            outline: 'none',
                            boxSizing: 'border-box',
                          }}
                        />
                        <input
                          type="text"
                          value={cardCvc}
                          onChange={(e) => setCardCvc(e.target.value.replace(/\D/g, '').slice(0, 4))}
                          placeholder="CVC"
                          required
                          style={{
                            height: '42px',
                            padding: '0 14px',
                            borderRadius: '10px',
                            background: 'var(--bg-surface-2, #181b22)',
                            border: '1px solid var(--border-moderate, rgba(255, 255, 255, 0.12))',
                            color: '#fff',
                            fontSize: '13px',
                            outline: 'none',
                            boxSizing: 'border-box',
                          }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{
                        padding: '20px',
                        borderRadius: '12px',
                        background: 'rgba(59, 130, 246, 0.08)',
                        border: '1px solid rgba(59, 130, 246, 0.2)',
                        textAlign: 'center',
                        fontSize: '13px',
                        color: '#93c5fd',
                      }}
                    >
                      Al hacer clic en Activar, se simulará la autorización rápida con tu cuenta de PayPal.
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--text-muted, #64748b)' }}>
                    <ShieldCheck size={14} color="#34d399" />
                    <span>Pago simulado con cifrado SSL de 256 bits para demostración de proyecto.</span>
                  </div>

                  <button
                    type="submit"
                    disabled={isProcessing}
                    style={{
                      height: '48px',
                      width: '100%',
                      borderRadius: '12px',
                      background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                      border: 'none',
                      color: '#ffffff',
                      fontSize: '15px',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '10px',
                      cursor: isProcessing ? 'not-allowed' : 'pointer',
                      boxShadow: '0 4px 16px rgba(245, 158, 11, 0.4)',
                      transition: 'all 0.2s',
                      opacity: isProcessing ? 0.7 : 1,
                    }}
                  >
                    {isProcessing ? (
                      <>
                        <RefreshCw size={18} className="animate-spin" />
                        <span>Procesando pago...</span>
                      </>
                    ) : (
                      <>
                        <Crown size={18} />
                        <span>Activar {currentPlan.name} ({currentPlan.price})</span>
                      </>
                    )}
                  </button>
                </form>
              </>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
