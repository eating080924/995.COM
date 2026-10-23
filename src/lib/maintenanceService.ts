import { useState, useEffect, useCallback } from 'react';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { MaintenanceConfig } from '../types';
import { DEFAULT_ADMIN_EMAILS, isSystemAdminEmail } from '../config/admin';
import { useAuth } from './AuthContext';

export const DEFAULT_MAINTENANCE_CONFIG: MaintenanceConfig = {
  isMaintenance: false,
  title: '系統例行升級維護中',
  message: '為了提供更穩定且流暢的鄰里互助體驗，995 委託板正在進行例行伺服器與資料庫升級，期間暫停公開發布與接單服務，造成不便敬請見諒。',
  estimatedEndTime: '',
  allowedEmails: DEFAULT_ADMIN_EMAILS,
};

export function useMaintenance() {
  const { user } = useAuth();
  const [config, setConfig] = useState<MaintenanceConfig>(DEFAULT_MAINTENANCE_CONFIG);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const docRef = doc(db, 'system_settings', 'maintenance');
    const unsubscribe = onSnapshot(
      docRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setConfig({
            isMaintenance: !!data.isMaintenance,
            title: data.title || DEFAULT_MAINTENANCE_CONFIG.title,
            message: data.message || DEFAULT_MAINTENANCE_CONFIG.message,
            estimatedEndTime: data.estimatedEndTime || '',
            allowedEmails: Array.isArray(data.allowedEmails) ? data.allowedEmails : DEFAULT_ADMIN_EMAILS,
            updatedAt: data.updatedAt,
            updatedBy: data.updatedBy,
          });
        } else {
          // Document does not exist yet; default to not in maintenance
          setConfig(DEFAULT_MAINTENANCE_CONFIG);
        }
        setLoading(false);
      },
      (error) => {
        console.warn('Error reading system maintenance status:', error);
        // Fallback safely to not in maintenance on read failure
        setConfig(DEFAULT_MAINTENANCE_CONFIG);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Determine if the current user is an admin or in whitelist to bypass maintenance
  const userEmail = user?.email?.toLowerCase().trim();
  const isDirectAdmin = isSystemAdminEmail(userEmail);
  const isWhitelisted = !!userEmail && (config.allowedEmails || []).some(
    (email) => email.toLowerCase().trim() === userEmail
  );

  const isBypassed = isDirectAdmin || isWhitelisted;

  // Save new maintenance configuration to Firestore
  const saveMaintenanceConfig = useCallback(async (newConfig: Partial<MaintenanceConfig>) => {
    const docRef = doc(db, 'system_settings', 'maintenance');
    const mergedConfig: MaintenanceConfig = {
      ...config,
      ...newConfig,
      updatedAt: serverTimestamp(),
      updatedBy: user?.email || 'admin',
    };

    await setDoc(docRef, mergedConfig, { merge: true });
  }, [config, user]);

  return {
    config,
    loading,
    isMaintenanceActive: config.isMaintenance,
    isBypassed,
    isDirectAdmin,
    saveMaintenanceConfig,
  };
}
