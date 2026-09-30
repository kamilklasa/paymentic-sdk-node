'use client';

import { useState } from 'react';
import { ArrowUpRight, CreditCard, Landmark, Smartphone } from 'lucide-react';

interface Bank {
  id: string;
  name: string;
  imageUrl: string | null;
}

interface PaymentPickerProps {
  blikRedirect: boolean;
  blikCode: boolean;
  blikImageUrl: string | null;
  card: boolean;
  banks: Bank[];
}

type Method = 'gateway' | 'blik' | 'blik-code' | 'card' | 'bank';

export default function PaymentPicker({ blikRedirect, blikCode, blikImageUrl, card, banks }: PaymentPickerProps) {
  const [method, setMethod] = useState<Method>('gateway');
  const [bank, setBank] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const methods: { id: Method; title: string; description: string; icon: React.ReactNode }[] = [];

  if (blikCode || blikRedirect)
    methods.push({
      id: blikCode ? 'blik-code' : 'blik',
      title: 'BLIK',
      description: blikCode ? 'Zapłać kodem z aplikacji banku' : 'Potwierdź płatność w aplikacji banku',
      icon: blikImageUrl ? <PaymentImage src={blikImageUrl} fallback="BLIK" /> : <Smartphone size={22} />,
    });
  if (banks.length)
    methods.push({
      id: 'bank',
      title: 'Przelew bankowy',
      description: 'Wybierz bank i zapłać online',
      icon: <Landmark size={22} />,
    });
  if (card)
    methods.push({
      id: 'card',
      title: 'Karta płatnicza',
      description: 'Visa lub Mastercard',
      icon: <CreditCard size={22} />,
    });
  methods.push({
    id: 'gateway',
    title: 'Pozostałe metody',
    description: 'Wybierz na stronie Paymentic',
    icon: <ArrowUpRight size={22} />,
  });

  return (
    <div className="payment-methods">
      {methods.map((item) => {
        const selected = method === item.id;
        return (
          <div className="payment-method" data-selected={selected} key={item.id}>
            <label className="payment-method-row">
              <span className="payment-method-icon" aria-hidden="true">
                {item.icon}
              </span>
              <span className="payment-method-copy">
                <strong id={`method-title-${item.id}`}>{item.title}</strong>
                <small>{item.description}</small>
              </span>
              <input
                type="radio"
                name="payment"
                value={item.id}
                checked={selected}
                onChange={() => setMethod(item.id)}
                aria-labelledby={`method-title-${item.id}`}
                aria-controls={selected ? `method-details-${item.id}` : undefined}
              />
            </label>
            {selected && (
              <div className="payment-method-details" id={`method-details-${item.id}`}>
                {item.id === 'bank' && (
                  <fieldset className="payment-bank-fieldset">
                    <legend>Wybierz swój bank</legend>
                    <div className="payment-bank-grid">
                      {banks.map((item) => (
                        <label className="payment-bank" data-selected={bank === item.id} key={item.id}>
                          <span className="payment-bank-brand" aria-hidden="true">
                            {item.id === 'other' ? (
                              <Landmark size={25} aria-hidden="true" />
                            ) : (
                              <PaymentImage src={item.imageUrl} fallback={item.name} />
                            )}
                          </span>
                          <span className="payment-bank-name">{item.name}</span>
                          <input
                            type="radio"
                            name="bank"
                            value={item.id}
                            checked={bank === item.id}
                            onChange={() => setBank(item.id)}
                            required
                          />
                        </label>
                      ))}
                    </div>
                  </fieldset>
                )}
                {item.id === 'blik-code' && (
                  <div className="payment-field">
                    <label htmlFor="checkout-name">Imię i nazwisko</label>
                    <input
                      id="checkout-name"
                      name="customerName"
                      autoComplete="name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      minLength={2}
                      maxLength={120}
                      required
                    />
                  </div>
                )}
                {item.id !== 'gateway' && (
                  <div className="payment-field">
                    <label htmlFor="checkout-email">Adres e-mail</label>
                    <input
                      id="checkout-email"
                      type="email"
                      name="customerEmail"
                      autoComplete="email"
                      placeholder="twoj@email.pl"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      maxLength={254}
                      required
                    />
                  </div>
                )}
                {item.id === 'blik-code' && (
                  <div className="payment-field">
                    <label htmlFor="checkout-blik-code">Kod BLIK</label>
                    <input
                      id="checkout-blik-code"
                      name="blikCode"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      placeholder="000 000"
                      required
                    />
                    <p className="payment-detail-note">
                      Wygeneruj 6-cyfrowy kod w aplikacji banku. Po wysłaniu potwierdź w niej płatność.
                    </p>
                  </div>
                )}
                {item.id === 'card' && (
                  <label className="payment-capture">
                    <input type="checkbox" name="manualCapture" value="yes" />
                    <span>
                      <strong>Pobierz środki później</strong>
                      <small>Autoryzuj kartę, a potem pobierz środki w panelu transakcji.</small>
                    </span>
                  </label>
                )}
                {item.id === 'gateway' && (
                  <p className="payment-detail-note">Dostępne sposoby płatności zobaczysz w następnym kroku.</p>
                )}
                {item.id === 'blik' && <p className="payment-detail-note">Kod BLIK wpiszesz na stronie Paymentic.</p>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PaymentImage({ src, fallback }: { src: string | null; fallback: string }) {
  const [failed, setFailed] = useState(false);
  return src && !failed ? (
    <img src={src} alt="" width="120" height="56" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
  ) : (
    <span className="payment-image-placeholder">{fallback}</span>
  );
}
