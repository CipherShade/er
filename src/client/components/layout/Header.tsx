import { ChevronDown, Languages, LogOut, Palette } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/AuthContext';
import { Avatar, notify } from '../ui/kit';
import { THEMES, getStoredTheme, storeTheme, type Theme } from '../ui/theme';

const CENTER_NAME = import.meta.env.VITE_CENTER_NAME || '';

export function Header({ activeLabel }: { activeLabel: string }) {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();
  const isArabic = i18n.language === 'ar';
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(getStoredTheme);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointer = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, []);

  const switchTheme = (next: Theme) => {
    setTheme(next);
    storeTheme(next);
  };

  const handleLogout = () => { void logout(); notify(t('actions.signOut') + ' ✓', 'success'); };

  return (
    <header className="header">
      <div className="header-group">
        <div className="brand">
          <span className="brand-logo">م</span>
          <div style={{ minWidth: 0 }}>
            <div className="brand-name">{t('appName')}</div>
            <div className="brand-sub">{CENTER_NAME || t('center')}</div>
          </div>
        </div>
        <div className="center-chip" aria-hidden={isArabic ? undefined : 'true'} style={{ marginInlineStart: 8 }}>
          <span className="dot" />
          {t('desk.connected')}
        </div>
      </div>

      <div className="breadcrumb" style={{ marginInlineStart: 12 }}>
        <span>{t('appName')}</span>
        <span aria-hidden="true">/</span>
        <b>{activeLabel}</b>
      </div>

      <div className="header-actions">
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => i18n.changeLanguage(isArabic ? 'en' : 'ar')}
          aria-label={t('actions.switchLanguage')}
        >
          <Languages className="h-4 w-4" />{isArabic ? t('languages.en') : t('languages.ar')}
        </button>
        <div className="theme-dots" role="group" aria-label={t('theme.toggle')} title={t('theme.toggle')}>
          <Palette className="h-4 w-4" style={{ color: 'var(--text-muted)' }} aria-hidden="true" />
          {THEMES.map((name) => (
            <button
              key={name}
              type="button"
              className={`theme-dot theme-dot--${name} ${theme === name ? 'theme-dot--active' : ''}`}
              onClick={() => switchTheme(name)}
              aria-label={t(`theme.${name}`)}
              title={t(`theme.${name}`)}
            />
          ))}
        </div>
        <div className="user-menu" ref={menuRef}>
          <button type="button" className="user-trigger" onClick={() => setMenuOpen((value) => !value)} aria-expanded={menuOpen} aria-haspopup="menu">
            <div className="meta" style={{ marginInlineEnd: 4 }}>
              <div className="name">{user?.fullName || user?.username}</div>
              <div className="role">{t(`roleName.${user?.role.toLowerCase()}`)}</div>
            </div>
            <Avatar name={user?.fullName || '•'} size={32} />
            <ChevronDown className="h-3.5 w-3.5" style={{ color: 'var(--text-muted)' }} aria-hidden="true" />
          </button>
          {menuOpen && (
            <div className="user-dropdown" role="menu">
              <div className="dd-header">
                <div className="name">{user?.fullName}</div>
                <div className="role">{t(`roleName.${user?.role.toLowerCase()}`)} · @{user?.username}</div>
              </div>
              <button type="button" className="dd-item dd-item--danger" role="menuitem" onClick={handleLogout}>
                <LogOut className="h-4 w-4" aria-hidden="true" />{t('actions.signOut')}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}