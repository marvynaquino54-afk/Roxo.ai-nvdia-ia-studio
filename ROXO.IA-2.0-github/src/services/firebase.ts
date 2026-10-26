import { UserProfile, Setup, TradeRecord } from '../types';

// AUTENTICAÇÃO LOCAL (não é Firebase): contas, hashes e sessão ficam apenas no
// localStorage deste navegador. Não há servidor de autenticação nem sincronização
// em nuvem. O hash SHA-256 com salt fixo dificulta leitura casual, mas não protege
// contra acesso ao próprio navegador ou ao código-fonte.
const CRYPTO_SALT = 'roxoia_sec_salt_2026_';

export async function hashPassword(password: string): Promise<string> {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(CRYPTO_SALT + password);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback simple deterministic hash if Web Crypto is unavailable in node testing
  let hash = 0;
  const str = CRYPTO_SALT + password;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return 'fallback_' + Math.abs(hash).toString(16);
}

// Default Admin profile definition (Never contains plaintext password)
export const DEFAULT_ADMIN: UserProfile = {
  uid: 'admin-001',
  email: 'admin@roxo.ia',
  displayName: 'Marvyn (Dono do Sistema)',
  role: 'admin',
  createdAt: '2026-01-01T00:00:00.000Z',
};

export const DEFAULT_USERS: UserProfile[] = [
  DEFAULT_ADMIN,
  {
    uid: 'user-002',
    email: 'trader.pro@gmail.com',
    displayName: 'Trader Pro',
    role: 'trader',
    createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
  },
  {
    uid: 'user-003',
    email: 'lucas.forex@hotmail.com',
    displayName: 'Lucas Forex',
    role: 'trader',
    createdAt: new Date(Date.now() - 86400000 * 7).toISOString(),
  },
];

interface AdminVault {
  email: string;
  passwordHash: string;
  updatedAt: string;
}

class AuthService {
  private currentUser: UserProfile | null = null;
  private users: UserProfile[] = [];
  private listeners: ((user: UserProfile | null) => void)[] = [];
  private adminVault: AdminVault | null = null;
  private initialized = false;

  constructor() {
    this.init();
  }

  private async init() {
    try {
      // 1. Initialize registered users list
      const storedUsers = localStorage.getItem('roxoia_users');
      if (storedUsers) {
        this.users = JSON.parse(storedUsers);
      } else {
        this.users = [...DEFAULT_USERS];
        localStorage.setItem('roxoia_users', JSON.stringify(this.users));
      }

      // 2. Initialize Admin Vault (Contains hashed password)
      const storedVault = localStorage.getItem('roxoia_admin_vault');
      if (storedVault) {
        this.adminVault = JSON.parse(storedVault);
      } else {
        // Initial setup with hashed default password
        const initialHash = await hashPassword('admin123456');
        this.adminVault = {
          email: 'admin@roxo.ia',
          passwordHash: initialHash,
          updatedAt: new Date().toISOString(),
        };
        localStorage.setItem('roxoia_admin_vault', JSON.stringify(this.adminVault));
      }

      // 3. Check for active session with expiration check (7 days)
      const activeSession = localStorage.getItem('roxoia_session');
      if (activeSession) {
        const sessionData = JSON.parse(activeSession);
        const expiresAt = sessionData.expiresAt || 0;
        if (Date.now() < expiresAt) {
          this.currentUser = sessionData.user;
        } else {
          // Session expired
          localStorage.removeItem('roxoia_session');
          this.currentUser = null;
        }
      } else {
        // No auto-login! User begins as guest until explicit authentication
        this.currentUser = null;
      }
    } catch {
      this.currentUser = null;
      this.users = [...DEFAULT_USERS];
    } finally {
      this.initialized = true;
      this.notify();
    }
  }

  public getCurrentUser(): UserProfile | null {
    return this.currentUser;
  }

  public onAuthStateChanged(callback: (user: UserProfile | null) => void) {
    this.listeners.push(callback);
    callback(this.currentUser);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }

  private notify() {
    this.listeners.forEach((l) => l(this.currentUser));
  }

  private saveSession(user: UserProfile) {
    const sessionData = {
      user,
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days token
      token: 'tok_' + Math.random().toString(36).slice(2) + Date.now().toString(36),
    };
    localStorage.setItem('roxoia_session', JSON.stringify(sessionData));
  }

  /**
   * Cria uma conta local. Não existe cadastro em servidor.
   */
  public async register(displayName: string, email: string, password: string): Promise<UserProfile> {
    const cleanEmail = email.trim().toLowerCase();
    if (this.adminVault && cleanEmail === this.adminVault.email.toLowerCase()) {
      throw new Error('Este e-mail é reservado para o administrador.');
    }
    if (this.users.some((u) => u.email.toLowerCase() === cleanEmail)) {
      throw new Error('Este e-mail já está cadastrado. Use a opção de login.');
    }

    const newUser: UserProfile = {
      uid: 'user-' + Math.random().toString(36).slice(2, 9),
      email: cleanEmail,
      displayName: displayName.trim() || cleanEmail.split('@')[0],
      role: 'trader',
      createdAt: new Date().toISOString(),
      passwordHash: await hashPassword(password),
      lastLogin: new Date().toISOString(),
    };
    this.users.push(newUser);
    localStorage.setItem('roxoia_users', JSON.stringify(this.users));
    this.currentUser = newUser;
    this.saveSession(this.currentUser);
    this.notify();
    return newUser;
  }

  /**
   * Login local com verificação SHA-256. Contas sem hash (dados antigos) são recusadas.
   */
  public async login(email: string, password: string): Promise<UserProfile> {
    const cleanEmail = email.trim().toLowerCase();
    const inputHash = await hashPassword(password);

    // Ensure vault is ready
    if (!this.adminVault) {
      const storedVault = localStorage.getItem('roxoia_admin_vault');
      if (storedVault) {
        this.adminVault = JSON.parse(storedVault);
      } else {
        const initialHash = await hashPassword('admin123456');
        this.adminVault = {
          email: 'admin@roxo.ia',
          passwordHash: initialHash,
          updatedAt: new Date().toISOString(),
        };
        localStorage.setItem('roxoia_admin_vault', JSON.stringify(this.adminVault));
      }
    }

    // Check if logging in as Admin
    if (this.adminVault && cleanEmail === this.adminVault.email.toLowerCase()) {
      if (inputHash === this.adminVault.passwordHash) {
        this.currentUser = {
          ...DEFAULT_ADMIN,
          lastLogin: new Date().toISOString(),
        };
        this.saveSession(this.currentUser);
        this.notify();
        return this.currentUser;
      } else {
        throw new Error('Senha de Administrador incorreta.');
      }
    }

    // Check registered standard users
    const found = this.users.find((u) => u.email.toLowerCase() === cleanEmail);
    if (found) {
      if (!found.passwordHash) {
        throw new Error('Esta conta não possui senha definida. Cadastre-se novamente com outro e-mail.');
      }
      if (found.passwordHash !== inputHash) {
        throw new Error('Senha incorreta para este e-mail.');
      }
      this.currentUser = {
        ...found,
        lastLogin: new Date().toISOString(),
      };
      this.saveSession(this.currentUser);
      this.notify();
      return this.currentUser;
    }

    throw new Error('E-mail não cadastrado. Use "Cadastre-se grátis" para criar sua conta local.');
  }

  /**
   * Secure Admin password alteration
   */
  public async changeAdminPassword(
    currentPass: string,
    newPass: string
  ): Promise<{ success: boolean; message: string }> {
    if (!this.currentUser || this.currentUser.role !== 'admin') {
      return { success: false, message: 'Permissão negada. Apenas o Dono pode alterar esta senha.' };
    }

    if (!newPass || newPass.length < 6) {
      return { success: false, message: 'A nova senha deve ter no mínimo 6 caracteres.' };
    }

    const currentHash = await hashPassword(currentPass);
    if (!this.adminVault || currentHash !== this.adminVault.passwordHash) {
      return { success: false, message: 'Senha atual incorreta.' };
    }

    const newHash = await hashPassword(newPass);
    this.adminVault = {
      ...this.adminVault,
      passwordHash: newHash,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem('roxoia_admin_vault', JSON.stringify(this.adminVault));
    return { success: true, message: 'Senha do Administrador alterada com sucesso!' };
  }

  public logout(): void {
    this.currentUser = null;
    localStorage.removeItem('roxoia_session');
    this.notify();
  }

  public getAllUsers(): UserProfile[] {
    return [...this.users];
  }

  public deleteUser(uid: string): void {
    if (uid === DEFAULT_ADMIN.uid) return;
    this.users = this.users.filter((u) => u.uid !== uid);
    localStorage.setItem('roxoia_users', JSON.stringify(this.users));
  }
}

export const authService = new AuthService();

// -------------------------------------------------------------
// Persistência local de Setups e Trades (localStorage, não nuvem)
// -------------------------------------------------------------
export const cloudStorage = {
  saveSetups(setups: Setup[]) {
    try {
      localStorage.setItem('roxoia_cloud_setups', JSON.stringify(setups));
      return true;
    } catch {
      return false;
    }
  },

  getSetups(): Setup[] | null {
    try {
      const data = localStorage.getItem('roxoia_cloud_setups');
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  },

  saveTrades(trades: TradeRecord[]) {
    try {
      localStorage.setItem('roxoia_trades', JSON.stringify(trades));
    } catch {}
  },

  getTrades(): TradeRecord[] {
    try {
      const data = localStorage.getItem('roxoia_trades');
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },
};
