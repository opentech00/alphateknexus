import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { getFinancePrivacy, hiddenMoneyLabel, setFinancePrivacy } from '../lib/sensitive';

type FinancePrivacyContextValue = {
  privacy: boolean;
  setPrivacy: (next: boolean) => void;
  money: (n: number, formatted?: string) => string;
};

const FinancePrivacyContext = createContext<FinancePrivacyContextValue | null>(null);

function formatSle(n: number) {
  const sign = n < 0 ? '-' : '';
  return `${sign}SLE ${Math.abs(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function FinancePrivacyProvider({ children }: { children: ReactNode }) {
  const [privacy, setPrivacyState] = useState(getFinancePrivacy);
  const value = useMemo<FinancePrivacyContextValue>(() => ({
    privacy,
    setPrivacy: (next: boolean) => {
      setFinancePrivacy(next);
      setPrivacyState(next);
    },
    money: (n: number, formatted?: string) => (privacy ? hiddenMoneyLabel() : (formatted ?? formatSle(n))),
  }), [privacy]);

  return (
    <FinancePrivacyContext.Provider value={value}>
      {children}
    </FinancePrivacyContext.Provider>
  );
}

export function useFinancePrivacy(): FinancePrivacyContextValue {
  const ctx = useContext(FinancePrivacyContext);
  const [local, setLocal] = useState(getFinancePrivacy);
  if (ctx) return ctx;
  return {
    privacy: local,
    setPrivacy: (next: boolean) => {
      setFinancePrivacy(next);
      setLocal(next);
    },
    money: (n: number, formatted?: string) => (local ? hiddenMoneyLabel() : (formatted ?? formatSle(n))),
  };
}
